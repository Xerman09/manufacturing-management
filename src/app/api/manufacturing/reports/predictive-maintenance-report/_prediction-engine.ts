/**
 * Mathematical Prediction & Reliability Engine
 * Computes MTBF, MTTR, degradation risks, and failure probability based on:
 * - Operating run-hours from manufacturing_job_order_routes
 * - Historical breakdown intervals from manufacturing_asset_maintenance_history
 * - Equipment age & condition from assets_and_equipment
 */

import type { PredictionHorizonOption, RiskSeverity } from "@/modules/manufacturing-management/predictive-maintenance-report/types";

export function getHorizonDays(horizon: PredictionHorizonOption): number {
    switch (horizon) {
        case "7d":
            return 7;
        case "14d":
            return 14;
        case "30d":
            return 30;
        case "60d":
            return 60;
        case "90d":
            return 90;
        default:
            return 30;
    }
}

export interface RawAssetData {
    id: number;
    name: string;
    serial: string;
    barcode: string;
    workCenterId: number | null;
    workCenterName: string;
    condition: string;
    assetType: string;
    lifeSpanYears: number | null;
    dateAcquired: string | null;
}

export interface RawBreakdownEpisode {
    id: number;
    assetId: number;
    startedAt: string | null;
    endedAt: string | null;
    startReason: string;
    rootCause: string;
    correctiveAction: string;
    breakdownCategory: string;
    technicianName: string;
    restoredCondition: string;
    recordedAt: string;
}

export interface RawRouteRunHour {
    workCenterId: number;
    actualRunHours: number;
    plannedRunHours: number;
    completedAt: string | null;
}

/**
 * Calculates Breakdown Risk within a stated horizon using exponential failure distribution:
 * P(Fail within H) = 1 - exp(- (RunHoursPerDay / MTBF) * H) * CriticalityAdjustment
 */
export function calculateAssetRisk(params: {
    asset: RawAssetData;
    breakdowns: RawBreakdownEpisode[];
    totalRunHours: number;
    horizonDays: number;
}): {
    mtbfHours: number | null;
    mttrHours: number | null;
    predictedRiskPct: number;
    riskLevel: RiskSeverity;
    criticality: "Tier 1 (Bottleneck)" | "Tier 2 (Medium)" | "Tier 3 (Standard)";
    primaryFailureMode: string;
    suggestedAction: string;
    dataGapWarning: string | null;
} {
    const { asset, breakdowns, totalRunHours, horizonDays } = params;

    const breakdownCount = breakdowns.length;
    let totalDowntimeHours = 0;

    for (const b of breakdowns) {
        if (b.startedAt && b.endedAt) {
            const start = new Date(b.startedAt).getTime();
            const end = new Date(b.endedAt).getTime();
            if (!isNaN(start) && !isNaN(end) && end > start) {
                totalDowntimeHours += (end - start) / (1000 * 3600);
            }
        } else {
            // Default 2.5 hours if unclosed/unspecified
            totalDowntimeHours += 2.5;
        }
    }

    // MTTR = Total Downtime / Breakdowns
    const mttrHours = breakdownCount > 0 ? totalDowntimeHours / breakdownCount : null;

    // MTBF = Operating Hours / Breakdowns
    const mtbfHours = breakdownCount > 0 ? Math.max(1, totalRunHours) / breakdownCount : null;

    // Criticality assignment
    let criticality: "Tier 1 (Bottleneck)" | "Tier 2 (Medium)" | "Tier 3 (Standard)" = "Tier 3 (Standard)";
    if (asset.assetType === "Production") {
        criticality = asset.condition === "Bad" || asset.condition === "Under Maintenance" ? "Tier 1 (Bottleneck)" : "Tier 2 (Medium)";
    }

    const critMultiplier = criticality === "Tier 1 (Bottleneck)" ? 1.35 : criticality === "Tier 2 (Medium)" ? 1.15 : 1.0;

    // Condition penalty
    let conditionPenalty = 0;
    if (asset.condition === "Bad") conditionPenalty = 30;
    else if (asset.condition === "Under Maintenance") conditionPenalty = 20;

    let predictedRiskPct = 10; // baseline 10%
    let dataGapWarning: string | null = null;

    if (breakdownCount === 0 && totalRunHours === 0) {
        dataGapWarning = "No run-hours or breakdown records logged for this period (Rule-based condition evaluation applied).";
        predictedRiskPct = conditionPenalty > 0 ? conditionPenalty : 12;
    } else if (mtbfHours !== null) {
        // Average operational run-hours per day = totalRunHours / 30 (or nominal 8 hrs/day)
        const dailyRunHours = Math.max(4, Math.min(24, totalRunHours / 30));
        const lambdaDaily = dailyRunHours / mtbfHours;
        const prob = 1 - Math.exp(-lambdaDaily * horizonDays);
        predictedRiskPct = Math.min(99.5, Math.max(5, prob * 100 * critMultiplier + conditionPenalty));
    } else {
        // Breakdowns == 0, but machine has run hours
        const wearFactor = Math.min(45, (totalRunHours / 1000) * 8);
        predictedRiskPct = Math.min(90, Math.max(8, wearFactor * critMultiplier + conditionPenalty));
    }

    // Determine Risk Level
    let riskLevel: RiskSeverity = "Low";
    if (predictedRiskPct >= 75) riskLevel = "Critical";
    else if (predictedRiskPct >= 50) riskLevel = "High";
    else if (predictedRiskPct >= 25) riskLevel = "Medium";

    // Primary failure mode resolution
    const categoryCounts = new Map<string, number>();
    for (const b of breakdowns) {
        const cat = b.breakdownCategory || b.rootCause || "Mechanical Wear";
        categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }
    let primaryFailureMode = "General Wear / Calibration Check";
    let maxCount = 0;
    for (const [cat, count] of categoryCounts.entries()) {
        if (count > maxCount) {
            maxCount = count;
            primaryFailureMode = cat;
        }
    }

    // Suggested preventive action
    let suggestedAction = "Routine lubrication, operational inspection, and sensor zero-point audit.";
    if (riskLevel === "Critical") {
        suggestedAction = `Immediate overhaul & diagnostic inspection of ${primaryFailureMode}; schedule work order prior to next production cycle.`;
    } else if (riskLevel === "High") {
        suggestedAction = `Schedule preventive maintenance clearance and check for recurring issues related to ${primaryFailureMode}.`;
    } else if (riskLevel === "Medium") {
        suggestedAction = `Monitor operational vibration/load during upcoming production shifts.`;
    }

    return {
        mtbfHours: mtbfHours !== null ? Math.round(mtbfHours * 10) / 10 : null,
        mttrHours: mttrHours !== null ? Math.round(mttrHours * 10) / 10 : null,
        predictedRiskPct: Math.round(predictedRiskPct * 10) / 10,
        riskLevel,
        criticality,
        primaryFailureMode,
        suggestedAction,
        dataGapWarning
    };
}
