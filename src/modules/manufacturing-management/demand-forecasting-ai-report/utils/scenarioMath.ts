import type {
    AdjustedPlanningRow,
    ConfidenceLevel,
    PlanningQuantityRow,
    ProductRegionMatrixRow,
    ScenarioAssumptions,
    TimeSeriesBucketPoint
} from "../types";

export const DEFAULT_SCENARIO_ASSUMPTIONS: ScenarioAssumptions = {
    demandAdjustmentPct: 0,
    confidenceLevel: 90,
    safetyStockDays: 7,
    leadTimeBufferDays: 2,
    plannerNote: ""
};

export function getZScoreForConfidence(level: ConfidenceLevel): number {
    if (level === 80) return 1.2816;
    if (level === 95) return 1.96;
    return 1.6449; // 90%
}

export function getManilaDateString(now = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(now);
}

export function getBucketPredictionBounds(
    point: TimeSeriesBucketPoint,
    confidenceLevel: ConfidenceLevel
): { lower: number | null; upper: number | null } {
    if (confidenceLevel === 80) {
        return { lower: point.piLower80, upper: point.piUpper80 };
    }
    if (confidenceLevel === 95) {
        return { lower: point.piLower95, upper: point.piUpper95 };
    }
    return { lower: point.piLower90, upper: point.piUpper90 };
}

export function getMatrixPredictionBounds(
    row: ProductRegionMatrixRow,
    confidenceLevel: ConfidenceLevel
): { lower: number | null; upper: number | null } {
    if (confidenceLevel === 80) {
        return { lower: row.piLower80, upper: row.piUpper80 };
    }
    if (confidenceLevel === 95) {
        return { lower: row.piLower95, upper: row.piUpper95 };
    }
    return { lower: row.piLower90, upper: row.piUpper90 };
}

export function applyScenarioToTimeSeries(
    series: TimeSeriesBucketPoint[],
    assumptions: ScenarioAssumptions
): Array<
    TimeSeriesBucketPoint & {
        activePiLower: number | null;
        activePiUpper: number | null;
        piBandRange: [number, number] | null;
        scenarioForecastUnits: number | null;
    }
> {
    const multiplier = Math.max(0, 1 + assumptions.demandAdjustmentPct / 100);

    return series.map((point) => {
        const bounds = getBucketPredictionBounds(point, assumptions.confidenceLevel);
        const scaledForecast =
            point.isForecast && point.forecastUnits !== null
                ? Math.max(0, Math.round(point.forecastUnits * multiplier))
                : null;
        const activeLower =
            point.isForecast && bounds.lower !== null
                ? Math.max(0, Math.round(bounds.lower * multiplier))
                : null;
        const activeUpper =
            point.isForecast && bounds.upper !== null
                ? Math.max(0, Math.round(bounds.upper * multiplier))
                : null;

        return {
            ...point,
            activePiLower: activeLower,
            activePiUpper: activeUpper,
            piBandRange:
                activeLower !== null && activeUpper !== null
                    ? [activeLower, activeUpper]
                    : null,
            scenarioForecastUnits: scaledForecast
        };
    });
}

export function computeAdjustedPlanningRows(
    rows: PlanningQuantityRow[],
    assumptions: ScenarioAssumptions
): AdjustedPlanningRow[] {
    const multiplier = Math.max(0, 1 + assumptions.demandAdjustmentPct / 100);
    const z = getZScoreForConfidence(assumptions.confidenceLevel);

    return rows.map((row) => {
        // Handle INSUFFICIENT or NULL baseline forecast
        if (row.baseForecastUnits === null) {
            return {
                ...row,
                scenarioForecastUnits: null,
                safetyStockUnits: row.maintainingQty,
                leadTimeDemandUnits: 0,
                targetInventoryUnits: row.maintainingQty,
                effectiveUsableOnhandUnits:
                    row.liveOnhandUnits !== null ? Math.max(0, row.liveOnhandUnits) : null,
                atRiskExpiringUnits: 0,
                effectiveSupplyUnits:
                    row.liveOnhandUnits !== null
                        ? Math.max(0, row.liveOnhandUnits) + row.openJobOrderUnits
                        : null,
                netSupplyGapUnits: null,
                suggestedProductionUnits: null,
                recommendedBatches: null,
                suggestedLaborHours: null,
                suggestedShifts: null,
                laborAuditStatus: "Missing Routing",
                unitStandardLaborHours: null,
                rawLaborHours: null,
                planningRisk: "Data Pending"
            };
        }

        const scenarioForecastUnits = Math.max(0, Math.round(row.baseForecastUnits * multiplier));
        const adjustedDailyDemand = row.dailyDemandRate * multiplier;
        // Scale daily demand variability proportionally with scenario uplift/downside
        const adjustedDailyStd = row.demandStdDevDaily * multiplier;
        const effectiveLeadDays = Math.max(1, row.manufacturingLeadDays + assumptions.leadTimeBufferDays);

        const leadTimeDemandUnits = Math.round(adjustedDailyDemand * effectiveLeadDays);

        const statSafetyStock = z * adjustedDailyStd * Math.sqrt(effectiveLeadDays);
        const daysSafetyStock = adjustedDailyDemand * assumptions.safetyStockDays;
        const safetyStockUnits = Math.max(
            row.maintainingQty,
            Math.round(Math.max(statSafetyStock, daysSafetyStock))
        );

        const targetInventoryUnits = leadTimeDemandUnits + safetyStockUnits;

        // Strictly no silent fallback when live inventory failed (liveOnhandUnits === null)
        if (row.liveOnhandUnits === null) {
            return {
                ...row,
                scenarioForecastUnits,
                safetyStockUnits,
                leadTimeDemandUnits,
                targetInventoryUnits,
                effectiveUsableOnhandUnits: null,
                atRiskExpiringUnits: 0,
                effectiveSupplyUnits: null,
                netSupplyGapUnits: null,
                suggestedProductionUnits: null,
                recommendedBatches: null,
                suggestedLaborHours: null,
                suggestedShifts: null,
                laborAuditStatus: "Missing Routing",
                unitStandardLaborHours: null,
                rawLaborHours: null,
                planningRisk: "Data Pending"
            };
        }

        // For FEFO items, stock expiring within 30 days beyond what can be consumed in 30 days cannot cover future demand.
        // For FIFO and UNKNOWN items, conservative handling: do NOT deduct atRiskExpiringUnits (set to 0).
        const burnableWithin30d = Math.round(adjustedDailyDemand * 30);
        const atRiskExpiringUnits =
            row.inventoryPolicy === "FEFO" && row.expiringSoonUnits > 0
                ? Math.max(0, Math.round(row.expiringSoonUnits - burnableWithin30d))
                : 0;

        const effectiveUsableOnhandUnits = Math.max(0, row.liveOnhandUnits - atRiskExpiringUnits);

        // Unified supply balance: both Net Supply Gap and Suggested Production account for usable stock + open Job Orders
        const effectiveSupplyUnits = effectiveUsableOnhandUnits + row.openJobOrderUnits;
        const netSupplyGapUnits = Math.round(targetInventoryUnits - effectiveSupplyUnits);

        const rawProductionNeed = Math.max(
            0,
            scenarioForecastUnits + safetyStockUnits - effectiveSupplyUnits
        );

        const yieldFactor =
            row.bomYieldPct !== null && row.bomYieldPct > 0 && row.bomYieldPct <= 100
                ? row.bomYieldPct / 100
                : 1;

        const suggestedProductionUnits = Math.ceil(rawProductionNeed / yieldFactor);

        const recommendedBatches =
            row.bomBaseQty !== null && row.bomBaseQty > 0
                ? suggestedProductionUnits > 0
                    ? Math.ceil(suggestedProductionUnits / row.bomBaseQty)
                    : 0
                : null;

        // Standard time in hours per individual base unit
        const unitStandardLaborHours =
            row.laborHoursPerBatch !== null && row.bomBaseQty !== null && row.bomBaseQty > 0
                ? row.laborHoursPerBatch / row.bomBaseQty
                : null;

        // Routing audit check:
        // Food / CPG manufacturing: standard unit time is typically 0.001 - 0.20 hrs/unit.
        // If unitStandardLaborHours > 1.0 (e.g. 16.0 hrs per individual piece), it is a standard-time defect (batch size misconfigured as 1).
        // If null or 0, routing is missing.
        let laborAuditStatus: AdjustedPlanningRow["laborAuditStatus"] = "Verified";
        let suggestedLaborHours: number | null = null;
        let rawLaborHours: number | null = null;

        if (unitStandardLaborHours === null || unitStandardLaborHours === 0) {
            laborAuditStatus = "Missing Routing";
        } else if (unitStandardLaborHours > 1.0) {
            laborAuditStatus = "Standard Time Outlier";
            rawLaborHours = Number((suggestedProductionUnits * unitStandardLaborHours).toFixed(1));
            // Do not propagate extreme outliers (e.g. 16 hrs/pc = 95,000 shifts) into operational labor totals
            suggestedLaborHours = null;
        } else {
            laborAuditStatus = "Verified";
            suggestedLaborHours = Number((suggestedProductionUnits * unitStandardLaborHours).toFixed(1));
        }

        const suggestedShifts =
            suggestedLaborHours !== null ? Number((suggestedLaborHours / 8).toFixed(1)) : null;

        let planningRisk: AdjustedPlanningRow["planningRisk"] = "Balanced";
        if (effectiveSupplyUnits < scenarioForecastUnits + safetyStockUnits * 0.5) {
            planningRisk = "Stockout Risk";
        } else if (
            effectiveUsableOnhandUnits > scenarioForecastUnits * 1.6 + safetyStockUnits &&
            scenarioForecastUnits > 0
        ) {
            planningRisk = "Excess Buffer";
        }

        return {
            ...row,
            scenarioForecastUnits,
            safetyStockUnits,
            leadTimeDemandUnits,
            targetInventoryUnits,
            effectiveUsableOnhandUnits,
            atRiskExpiringUnits,
            effectiveSupplyUnits,
            netSupplyGapUnits,
            suggestedProductionUnits,
            recommendedBatches,
            suggestedLaborHours,
            suggestedShifts,
            laborAuditStatus,
            unitStandardLaborHours,
            rawLaborHours,
            planningRisk
        };
    });
}

export function formatNumberOrDash(
    value: number | null | undefined,
    maximumFractionDigits = 0
): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    return value.toLocaleString("en-US", { maximumFractionDigits });
}

export function formatPercentOrDash(
    value: number | null | undefined,
    digits = 1,
    includePlus = false
): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "-";
    const prefix = includePlus && value > 0 ? "+" : "";
    return `${prefix}${value.toFixed(digits)}%`;
}
