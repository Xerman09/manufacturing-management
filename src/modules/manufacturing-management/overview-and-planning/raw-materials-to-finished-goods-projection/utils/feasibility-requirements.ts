export interface RequirementCalculationResult {
    ok: boolean;
    netFgOutputPerBatch?: number;
    requiredPerNetFgUnit?: number;
    diagnostic?: string;
}

export const PRODUCTION_DECIMAL_SCALE = 4;
const SCALE = 6;

function roundToScale(value: number, scale = SCALE): number {
    const factor = 10 ** scale;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Calculates the required component input per net unit of finished product.
 * In Directus manufacturing_routes_bom, quantities are normalized to one finished output unit.
 *
 * @param baseQuantity Gross recipe batch size produced by one run.
 * @param expectedYieldPercentage Net yield percentage of the recipe (e.g. 95% = 95).
 * @param quantityRequired Quantity of component required.
 * @param wastageFactorPercentage Component-specific handling/filling wastage factor % (e.g. 2% = 2).
 * @param isAlreadyPerUnit If true (default in Directus), quantityRequired is already per 1 finished unit.
 */
export function calculateComponentPerUnitRequirement(
    baseQuantity: number,
    expectedYieldPercentage: number,
    quantityRequired: number,
    wastageFactorPercentage = 0,
    isAlreadyPerUnit = false
): RequirementCalculationResult {
    const grossBase = Number(baseQuantity);
    if (!Number.isFinite(grossBase) || grossBase <= 0) {
        return {
            ok: false,
            diagnostic: `Invalid BOM base quantity: ${baseQuantity}. Base quantity must be greater than zero.`
        };
    }

    const yieldPct = Number(expectedYieldPercentage);
    if (!Number.isFinite(yieldPct) || yieldPct <= 0) {
        return {
            ok: false,
            diagnostic: `Invalid recipe expected yield percentage: ${expectedYieldPercentage}. Expected yield must be greater than zero.`
        };
    }

    const qtyReq = Number(quantityRequired);
    if (!Number.isFinite(qtyReq) || qtyReq < 0) {
        return {
            ok: false,
            diagnostic: `Invalid component required quantity: ${quantityRequired}. Quantity required must be non-negative.`
        };
    }

    const wastage = Number.isFinite(wastageFactorPercentage) && wastageFactorPercentage >= 0
        ? Number(wastageFactorPercentage)
        : 0;

    try {
        const yieldFactor = yieldPct / 100;

        // 1. Net FG output per gross batch
        const netFgOutput = grossBase * yieldFactor;
        if (netFgOutput <= 0) {
            return {
                ok: false,
                diagnostic: "Net FG output per batch derived to zero due to invalid yield or base quantity."
            };
        }

        // 2. Base requirement per net FG unit:
        // In Directus, BOM item quantityRequired is already per 1 finished unit.
        // If isAlreadyPerUnit is false (gross batch mode), divide by netFgOutput.
        const baseReqPerNetUnit = isAlreadyPerUnit
            ? (qtyReq / yieldFactor)
            : (qtyReq / netFgOutput);

        // 3. Apply component wastage factor exactly once: baseReq * (1 + wastage / 100)
        const wastageMultiplier = 1 + (wastage / 100);
        const effectiveReqPerNetUnit = baseReqPerNetUnit * wastageMultiplier;

        return {
            ok: true,
            netFgOutputPerBatch: roundToScale(netFgOutput, PRODUCTION_DECIMAL_SCALE),
            requiredPerNetFgUnit: roundToScale(effectiveReqPerNetUnit, SCALE)
        };
    } catch (error) {
        return {
            ok: false,
            diagnostic: `Failed to compute per-unit requirement: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
