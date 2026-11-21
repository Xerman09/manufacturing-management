import { VersionPosition } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the number if it is finite and > 0, otherwise the fallback. */
function positiveOr(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Returns the number if it is finite and > 0, otherwise 0. */
function nonNegative(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostingMaterialInput {
    quantity: number;
    unitCost: number;
    wastagePercent?: number | null;
    isByProduct?: boolean;
}

export interface CostingRouteInput {
    machineHourlyRate: number;
    stepBatchSize?: number | null;
    /** Setup hours for ONE step batch (or once per base batch if setupPerRun is false). */
    setupTimeHours: number;
    /** Run hours for ONE step batch. */
    runTimeHours: number;
    baseQuantity: number;
    /**
     * true (default): setup repeats on every step batch (matches the bottleneck rate formula
     * stepBatchSize / (setup + run)). false: setup happens once for the whole base batch.
     */
    setupPerRun?: boolean;
    /**
     * Work center rated capacity (units/hour). It applies to RUN time only: a machine
     * produces nothing during setup, so one step batch can never exceed capacity x run hours.
     */
    capacityPerHour?: number | null;
    materials?: CostingMaterialInput[];
}

export interface CostingRouteBreakdown {
    /** Materials cost per base-quantity unit (before yield). */
    materialsCost: number;
    /** Number of step batches needed to produce the base quantity. */
    runs: number;
    /** Total machine hours for the WHOLE base batch. */
    machineHours: number;
    /** Total machine cost for the WHOLE base batch. */
    totalMachineCost: number;
    machineOverheadCost: number;
    machineCostPerUnit: number;
    stepBatchSize: number;
    /** Step batch actually used for costing: min(stepBatchSize, capacity x run hours). */
    effectiveStepBatchSize: number;
    /** true when the entered step batch exceeds what the work center can run in one batch. */
    isCapacityLimited: boolean;
    /** Machine cost per unit only (materials are NOT included). */
    totalCost: number;
}

export interface CostingBreakdown {
    baseQuantity: number;
    /** Yield-adjusted cost for one good finished unit. */
    unitCost: number;
    /** Actual spend to run the configured base batch (pre-yield cost x base quantity). */
    batchCost: number;
    /** Good units produced by the base batch after yield loss. */
    goodUnits: number;
    materialsCost: number;
    directLaborCost: number;
    machineOverheadCost: number;
    machineHours: number;
    lineElapsedHours: number;
    totalMachineCost: number;
    customOverheadCost: number;
    preYieldDirectCost: number;
    yieldAdjustedUnitCost: number;
    yieldPercentage: number;
    yieldFactor: number;
    totalBaseCost: number;
}

export interface OverheadSummary {
    customOverhead: number;
    additionalOperatingOverhead: number;
    totalOverheadExpenses: number;
    includedInCogs: number;
    excludedFromCogs: number;
}

export interface MarginSummary {
    grossProfit: number;
    grossMarginPercent: number;
    netProfit: number;
    netMarginPercent: number;
    marginBasis: "sales";
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/**
 * Canonical material cost. Wastage is a gross-up: cost / (1 - wastage%).
 * Use this everywhere (screen, PDF, CSV) so every output matches.
 * By-products are returned as a negative (credit).
 */
export function calculateMaterialCost(input: CostingMaterialInput): number {
    const quantity = Number(input.quantity) || 0;
    const unitCost = Number(input.unitCost) || 0;
    const wastagePercent = Number(input.wastagePercent) || 0;
    const usableFactor = 1 - wastagePercent / 100;
    const cost = (quantity * unitCost) / (usableFactor > 0 ? usableFactor : 1);

    return input.isByProduct ? -Math.abs(cost) : cost;
}

// ---------------------------------------------------------------------------
// Routing / machine cost
// ---------------------------------------------------------------------------

export function calculateRouteBreakdown(input: CostingRouteInput): CostingRouteBreakdown {
    const baseQuantity = positiveOr(input.baseQuantity, 1);
    const stepBatchSize = positiveOr(input.stepBatchSize, 1);
    const setupHours = nonNegative(input.setupTimeHours);
    const runHours = nonNegative(input.runTimeHours);
    const machineHourlyRate = nonNegative(input.machineHourlyRate);
    const setupPerRun = input.setupPerRun !== false;

    // Setup/run hours describe ONE step batch, so scale by the number of runs.
    // A batch larger than capacity x run hours is impossible, so cost it at the capacity limit.
    const capacityPerHour = nonNegative(input.capacityPerHour);
    const maxStepBatch = capacityPerHour > 0 && runHours > 0 ? capacityPerHour * runHours : Infinity;
    const effectiveStepBatchSize = Math.min(stepBatchSize, maxStepBatch);
    const isCapacityLimited = effectiveStepBatchSize < stepBatchSize - 1e-9;
    const runs = baseQuantity / effectiveStepBatchSize;
    const machineHours = setupPerRun
        ? (setupHours + runHours) * runs
        : setupHours + runHours * runs;
    const totalMachineCost = machineHours * machineHourlyRate;
    const machineCostPerUnit = totalMachineCost / baseQuantity;

    const totalMaterialCostSum = (input.materials || []).reduce(
        (total, material) => total + calculateMaterialCost(material),
        0
    );
    // Material quantities are assumed to be for the whole base batch.
    const materialsCost = totalMaterialCostSum / baseQuantity;
    const machineOverheadCost = machineCostPerUnit;

    return {
        materialsCost,
        runs,
        machineHours,
        totalMachineCost,
        machineOverheadCost,
        machineCostPerUnit,
        stepBatchSize,
        effectiveStepBatchSize,
        isCapacityLimited,
        totalCost: machineCostPerUnit
    };
}

/** Minimal shape of a routing step + its BOM items; matches the editedRoutes rows. */
export interface CostingRouteStepInput {
    step_batch_size?: number | null;
    setup_time_hours?: number | null;
    run_time_hours?: number | null;
    work_center_id?: number | null;
    bom_items?: Array<{
        id: number | string;
        quantity_required?: number | null;
        cost_per_unit?: number | null;
        wastage_factor_percentage?: number | null;
    }> | null;
}

export interface RoutesRollup {
    /** Per base-quantity unit, before yield. */
    materialsCost: number;
    /** Per base-quantity unit, before yield. */
    machineOverheadCost: number;
    /** Sum of machine hours across all steps for the whole base batch. */
    machineHours: number;
    totalMachineCost: number;
    /** Longest single step for the whole base batch (steps assumed to overlap as a flow line). */
    lineElapsedHours: number;
    steps: CostingRouteBreakdown[];
}

/**
 * THE one place that loops over routing steps. Screens, PDF/CSV exports and API
 * routes should call this instead of looping over routes themselves.
 * priceOverrides is keyed by String(bom item id) (used by the simulator).
 */
export function calculateRoutesRollup(input: {
    routes: CostingRouteStepInput[] | null | undefined;
    workCenters?: Array<{
        work_center_id: number;
        overhead_cost_per_hour?: number | null;
        capacity_per_hour?: number | null;
    }> | null;
    baseQuantity: number;
    priceOverrides?: Record<string, number>;
    setupPerRun?: boolean;
}): RoutesRollup {
    const baseQuantity = positiveOr(input.baseQuantity, 1);
    const rateByWorkCenter = new Map<number, number>();
    const capacityByWorkCenter = new Map<number, number>();
    (input.workCenters || []).forEach(wc => {
        rateByWorkCenter.set(Number(wc.work_center_id), nonNegative(wc.overhead_cost_per_hour));
        capacityByWorkCenter.set(Number(wc.work_center_id), nonNegative(wc.capacity_per_hour));
    });

    const steps = (input.routes || []).map(route =>
        calculateRouteBreakdown({
            stepBatchSize: route.step_batch_size,
            machineHourlyRate: rateByWorkCenter.get(Number(route.work_center_id)) ?? 0,
            capacityPerHour: capacityByWorkCenter.get(Number(route.work_center_id)) ?? 0,
            setupTimeHours: Number(route.setup_time_hours) || 0,
            runTimeHours: Number(route.run_time_hours) || 0,
            baseQuantity,
            setupPerRun: input.setupPerRun,
            materials: (route.bom_items || []).map(item => ({
                quantity: Number(item.quantity_required) || 0,
                unitCost: input.priceOverrides?.[String(item.id)] ?? (Number(item.cost_per_unit) || 0),
                wastagePercent: item.wastage_factor_percentage
            }))
        })
    );

    return {
        materialsCost: steps.reduce((sum, s) => sum + s.materialsCost, 0),
        machineOverheadCost: steps.reduce((sum, s) => sum + s.machineOverheadCost, 0),
        machineHours: steps.reduce((sum, s) => sum + s.machineHours, 0),
        totalMachineCost: steps.reduce((sum, s) => sum + s.totalMachineCost, 0),
        lineElapsedHours: steps.reduce((max, s) => Math.max(max, s.machineHours), 0),
        steps
    };
}

// ---------------------------------------------------------------------------
// Labor
// ---------------------------------------------------------------------------

const HOURS_PER_DAY = 8;
const OT_MULTIPLIER = 1.25; // ordinary working day; rest days / holidays differ
const WORKING_DAYS_PER_MONTH = 26;

/**
 * Employer-share statutory rates (Philippines). VERIFY against the official
 * SSS, PhilHealth and Pag-IBIG schedules before relying on these.
 */
export const STATUTORY_CONFIG = {
    sss: { employerRate: 0.10, minMsc: 5000, maxMsc: 35000, ecLow: 10, ecHigh: 30, ecHighFromMsc: 15000 },
    phic: { employerRate: 0.025, minBasic: 10000, maxBasic: 100000 },
    hdmf: { employerRate: 0.02, maxFundSalary: 10000 }
} as const;

/** Per-person, per-day employer contributions estimated from the daily rate. */
function estimateEmployerContributionsPerDay(dailyRate: number): { sss: number; phic: number; hdmf: number } {
    if (dailyRate <= 0) return { sss: 0, phic: 0, hdmf: 0 };
    const { sss, phic, hdmf } = STATUTORY_CONFIG;
    const monthlyPay = dailyRate * WORKING_DAYS_PER_MONTH;

    const msc = clamp(monthlyPay, sss.minMsc, sss.maxMsc);
    const sssMonthly = msc * sss.employerRate + (msc >= sss.ecHighFromMsc ? sss.ecHigh : sss.ecLow);
    const phicMonthly = clamp(monthlyPay, phic.minBasic, phic.maxBasic) * phic.employerRate;
    const hdmfMonthly = Math.min(monthlyPay, hdmf.maxFundSalary) * hdmf.employerRate;

    return {
        sss: sssMonthly / WORKING_DAYS_PER_MONTH,
        phic: phicMonthly / WORKING_DAYS_PER_MONTH,
        hdmf: hdmfMonthly / WORKING_DAYS_PER_MONTH
    };
}

export interface PositionCostBreakdown {
    regularWage: number;
    otWage: number;
    /** Employer statutory contributions for the whole headcount. */
    sss: number;
    phic: number;
    hdmf: number;
    benefits: number;
    total: number;
}

/**
 * Single source of truth for labor cost. Screens (position badge, statutory card,
 * position cost) must display these numbers instead of recomputing them.
 */
export function calculatePositionCostBreakdown(pos: VersionPosition): PositionCostBreakdown {
    const headcount = nonNegative(pos.manpower_count);
    const hourlyRate = nonNegative(pos.hourly_rate);
    const dailyRate = nonNegative(pos.daily_rate) || hourlyRate * HOURS_PER_DAY;
    const otHours = nonNegative(pos.ot_hours);
    const hoursRequired = nonNegative(pos.hours_required);

    const effectiveHourlyRate = dailyRate / HOURS_PER_DAY;

    // If hours_required is set, pay for those hours; otherwise one full day.
    // (Decide whether hours_required should already exclude ot_hours to avoid double counting.)
    const regularWage = (hoursRequired > 0 ? effectiveHourlyRate * hoursRequired : dailyRate) * headcount;
    const otWage = otHours * effectiveHourlyRate * OT_MULTIPLIER * headcount;

    let sss = 0;
    let phic = 0;
    let hdmf = 0;
    // Maintenance positions carry no statutory benefits (existing behavior; confirm with payroll).
    if (pos.category !== "maintenance" && pos.include_mandates !== false) {
        const est = estimateEmployerContributionsPerDay(dailyRate);
        const configuredSss = Number(pos.sss_amount);
        const configuredPhic = Number(pos.phic_amount);
        const configuredHdmf = Number(pos.hdmf_amount);
        sss = (Number.isFinite(configuredSss) && configuredSss > 0 ? configuredSss : est.sss) * headcount;
        phic = (Number.isFinite(configuredPhic) && configuredPhic > 0 ? configuredPhic : est.phic) * headcount;
        hdmf = (Number.isFinite(configuredHdmf) && configuredHdmf > 0 ? configuredHdmf : est.hdmf) * headcount;
    }
    const benefits = sss + phic + hdmf;

    return { regularWage, otWage, sss, phic, hdmf, benefits, total: regularWage + otWage + benefits };
}

export function calculatePositionBatchCost(pos: VersionPosition): number {
    return calculatePositionCostBreakdown(pos).total;
}

/** Direct labor cost per base-quantity unit (before yield). */
export function calculateDirectLaborCost(
    laborPositions?: VersionPosition[] | null,
    baseQuantity: number = 1
): number {
    if (!laborPositions || laborPositions.length === 0) return 0;
    const baseQty = positiveOr(baseQuantity, 1);
    const totalLabor = laborPositions.reduce((total, pos) => total + calculatePositionBatchCost(pos), 0);
    return totalLabor / baseQty;
}

// ---------------------------------------------------------------------------
// Cost rollup
// ---------------------------------------------------------------------------

export function calculateCostBreakdown(input: {
    materialsCost: number;
    directLaborCost?: number | null;
    machineOverheadCost: number;
    customOverheadCost?: number | null;
    expectedYieldPercentage?: number | null;
    baseQuantity?: number | null;
    machineHours?: number | null;
    lineElapsedHours?: number | null;
    totalMachineCost?: number | null;
    laborPositions?: VersionPosition[] | null;
}): CostingBreakdown {
    const baseQuantity = positiveOr(input.baseQuantity, 1);
    const materialsCost = Number(input.materialsCost) || 0;
    const directLaborCost = input.laborPositions && input.laborPositions.length > 0
        ? calculateDirectLaborCost(input.laborPositions, baseQuantity)
        : Number(input.directLaborCost) || 0;
    const machineOverheadCost = Number(input.machineOverheadCost) || 0;
    const customOverheadCost = nonNegative(input.customOverheadCost);
    const yieldPercentage = positiveOr(input.expectedYieldPercentage, 100);
    const yieldFactor = yieldPercentage / 100;

    // All per-unit components are per GROSS unit (baseQuantity is the gross batch).
    const preYieldDirectCost = materialsCost + directLaborCost + machineOverheadCost + customOverheadCost;
    const yieldAdjustedUnitCost = preYieldDirectCost / yieldFactor;

    // Actual spend for the batch, and the good units it yields.
    const batchCost = preYieldDirectCost * baseQuantity;
    const goodUnits = baseQuantity * yieldFactor;

    return {
        baseQuantity,
        unitCost: yieldAdjustedUnitCost,
        batchCost,
        goodUnits,
        materialsCost,
        directLaborCost,
        machineOverheadCost,
        machineHours: nonNegative(input.machineHours),
        lineElapsedHours: nonNegative(input.lineElapsedHours),
        totalMachineCost: nonNegative(input.totalMachineCost),
        customOverheadCost,
        preYieldDirectCost,
        yieldAdjustedUnitCost,
        yieldPercentage,
        yieldFactor,
        totalBaseCost: batchCost
    };
}

export function calculateOverheadSummary(
    customOverheadCost: number,
    additionalOverheadAmounts: number[] = []
): OverheadSummary {
    const customOverhead = nonNegative(customOverheadCost);
    const additionalOperatingOverhead = additionalOverheadAmounts.reduce(
        (total, amount) => total + nonNegative(amount),
        0
    );

    return {
        customOverhead,
        additionalOperatingOverhead,
        totalOverheadExpenses: customOverhead + additionalOperatingOverhead,
        includedInCogs: customOverhead,
        excludedFromCogs: additionalOperatingOverhead
    };
}

/** cogs and excludedOperatingOverhead must both be PER UNIT. */
export function calculateMarginSummary(
    sellingPrice: number,
    cogs: number,
    excludedOperatingOverhead: number = 0
): MarginSummary {
    const price = Number(sellingPrice) || 0;
    const cost = Number(cogs) || 0;
    const operatingOverhead = nonNegative(excludedOperatingOverhead);
    const grossProfit = price - cost;
    const netProfit = grossProfit - operatingOverhead;
    const marginPercent = (profit: number) => (price > 0 ? (profit / price) * 100 : 0);

    return {
        grossProfit,
        grossMarginPercent: marginPercent(grossProfit),
        netProfit,
        netMarginPercent: marginPercent(netProfit),
        marginBasis: "sales"
    };
}

// ---------------------------------------------------------------------------
// Bottleneck / base quantity
// ---------------------------------------------------------------------------

export interface BottleneckStepCapacity {
    stepIndex: number;
    stepNum: number;
    operationName?: string;
    workCenterName?: string;
    stepBatchSize: number;
    /** Setup + run hours for one step batch. */
    totalHours: number;
    /** Run hours only (the capacity cap applies to this, not to setup). */
    runHours: number;
    calculatedRate: number;
    workCenterCapacity?: number | null;
    maxStepBatchCapacity?: number | null;
    hourlyRate: number;
    isCapped: boolean;
    /** false when the step has no setup/run time and is ignored by the bottleneck. */
    isConfigured?: boolean;
}

export interface BottleneckCalculationResult {
    bottleneckRate: number;
    bottleneckStepIndex: number;
    averageRate: number;
    stepCapacities: BottleneckStepCapacity[];
    netProductionHours: number;
    grossOutput: number;
    computedBaseQuantity: number;
    netBaseQuantity: number;
    cappedSteps: BottleneckStepCapacity[];
}

export function calculateNetRunTime(
    shiftHours: number = 8,
    shiftMinutes: number = 0,
    downtimeMinutes: number = 0,
    downtimeSeconds: number = 0
): {
    shiftDecimalHours: number;
    downtimeDecimalHours: number;
    netProductionHours: number;
} {
    const shiftDecimalHours = nonNegative(shiftHours) + nonNegative(shiftMinutes) / 60;
    const downtimeDecimalHours = nonNegative(downtimeMinutes) / 60 + nonNegative(downtimeSeconds) / 3600;
    const netProductionHours = Math.max(0, shiftDecimalHours - downtimeDecimalHours);
    return {
        shiftDecimalHours,
        downtimeDecimalHours,
        netProductionHours
    };
}

export function calculateBottleneckBaseQuantity(input: {
    routes: Array<{
        work_center_id?: number | null;
        operation_id?: number | null;
        step_batch_size?: number | null;
        setup_time_hours?: number | null;
        run_time_hours?: number | null;
        operation?: { operation_name?: string } | null;
        work_center?: { work_center_name?: string; capacity_per_hour?: number | null } | null;
    }>;
    workCenters?: Array<{ work_center_id: number; work_center_name?: string; capacity_per_hour?: number | null }>;
    operationTypes?: Array<{ id: number; operation_name: string }>;
    shiftHours?: number;
    shiftMinutes?: number;
    downtimeMinutes?: number;
    downtimeSeconds?: number;
    expectedYieldPercentage?: number | null;
}): BottleneckCalculationResult {
    const routes = input.routes || [];
    const stepCapacities: BottleneckStepCapacity[] = routes.map((r, index) => {
        const stepBatchSize = positiveOr(r.step_batch_size, 1);
        const rawHours = nonNegative(r.setup_time_hours) + nonNegative(r.run_time_hours);
        const isConfigured = rawHours > 0;
        // Steps with no time configured cannot constrain output and get no rate.
        const calculatedRate = isConfigured ? stepBatchSize / rawHours : 0;

        const matchedWc = (r.work_center_id != null
            ? input.workCenters?.find(wc => Number(wc.work_center_id) === Number(r.work_center_id))
            : undefined) || r.work_center;
        const matchedOp = r.operation_id != null
            ? input.operationTypes?.find(op => Number(op.id) === Number(r.operation_id))
            : undefined;
        const wcCap = Number(matchedWc?.capacity_per_hour);
        const hasWcCap = Number.isFinite(wcCap) && wcCap > 0;
        // Capacity applies to RUN time only: setup time produces nothing.
        const runHours = nonNegative(r.run_time_hours);
        const maxStepBatchCapacity = hasWcCap && runHours > 0 ? parseFloat((wcCap * runHours).toFixed(4)) : null;
        const effectiveBatch = maxStepBatchCapacity !== null
            ? Math.min(stepBatchSize, maxStepBatchCapacity)
            : stepBatchSize;
        const isCapped = maxStepBatchCapacity !== null && stepBatchSize > maxStepBatchCapacity + 1e-6;
        // Sustained rate over the full cycle (setup + run).
        const hourlyRate = isConfigured ? effectiveBatch / rawHours : 0;

        return {
            stepIndex: index,
            stepNum: index + 1,
            operationName: matchedOp?.operation_name || r.operation?.operation_name || `Step #${index + 1}`,
            workCenterName: matchedWc?.work_center_name || r.work_center?.work_center_name || "Work Center",
            stepBatchSize,
            totalHours: rawHours,
            runHours,
            calculatedRate,
            workCenterCapacity: hasWcCap ? wcCap : null,
            maxStepBatchCapacity,
            hourlyRate,
            isCapped,
            isConfigured
        };
    });

    let bottleneckRate = 0;
    let bottleneckStepIndex = -1;
    for (const step of stepCapacities) {
        if (!step.isConfigured) continue;
        if (bottleneckStepIndex === -1 || step.hourlyRate < bottleneckRate) {
            bottleneckRate = step.hourlyRate;
            bottleneckStepIndex = step.stepIndex;
        }
    }

    const configuredSteps = stepCapacities.filter(s => s.isConfigured);
    const averageRate = configuredSteps.length > 0
        ? configuredSteps.reduce((sum, s) => sum + s.hourlyRate, 0) / configuredSteps.length
        : 0;

    const { netProductionHours } = calculateNetRunTime(
        input.shiftHours ?? 8,
        input.shiftMinutes ?? 0,
        input.downtimeMinutes ?? 0,
        input.downtimeSeconds ?? 0
    );

    const grossOutput = bottleneckRate * netProductionHours;
    const yieldPct = positiveOr(input.expectedYieldPercentage, 100);
    // In Finished Goods, base quantity is the gross output (batch gross capacity) rather than net output.
    const computedBaseQuantity = grossOutput;
    const netBaseQuantity = grossOutput * (yieldPct / 100);
    const cappedSteps = stepCapacities.filter(s => s.isCapped);

    return {
        bottleneckRate,
        bottleneckStepIndex,
        averageRate,
        stepCapacities,
        netProductionHours,
        grossOutput,
        computedBaseQuantity,
        netBaseQuantity,
        cappedSteps
    };
}