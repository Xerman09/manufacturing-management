import type { ConversionContext, DensityFactorItem } from "../types";

export interface ConversionResult {
    ok: boolean;
    convertedValue?: number;
    diagnostic?: string;
}

// Canonical unit normalization
function normalizeUnit(unit: string): string {
    return unit.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Mass conversions normalized to kilograms (kg)
const MASS_TO_KG: Record<string, number> = {
    kg: 1,
    kilogram: 1,
    kilograms: 1,
    kilo: 1,
    kilos: 1,
    g: 0.001,
    gram: 0.001,
    grams: 0.001,
    mg: 0.000001,
    milligram: 0.000001,
    milligrams: 0.000001,
    ton: 1000,
    tons: 1000,
    tonne: 1000,
    tonnes: 1000,
    mt: 1000,
    lb: 0.45359237,
    lbs: 0.45359237,
    pound: 0.45359237,
    pounds: 0.45359237,
    oz: 0.0283495,
    ounce: 0.0283495,
    ounces: 0.0283495
};

// Volume conversions normalized to liters (L)
const VOLUME_TO_L: Record<string, number> = {
    l: 1,
    liter: 1,
    liters: 1,
    litre: 1,
    litres: 1,
    ml: 0.001,
    milliliter: 0.001,
    milliliters: 0.001,
    millilitre: 0.001,
    millilitres: 0.001,
    cc: 0.001,
    cbm: 1000,
    m3: 1000,
    gal: 3.78541,
    gallon: 3.78541,
    gallons: 3.78541
};

// Count / discrete equivalences
const COUNT_UNITS = new Set([
    "pc", "pcs", "piece", "pieces",
    "unit", "units",
    "box", "boxes",
    "btl", "bottle", "bottles",
    "can", "cans",
    "drum", "drums",
    "pack", "packs",
    "roll", "rolls",
    "bag", "bags",
    "sheet", "sheets"
]);

/**
 * Finds the density in kg/L for a given component or product name.
 */
function resolveDensityKgPerL(
    componentName?: string,
    densityFactors: DensityFactorItem[] = []
): number | null {
    if (!componentName || densityFactors.length === 0) return null;
    const normalizedTarget = componentName.trim().toLowerCase();

    // 1. Exact match on density factor name
    const exact = densityFactors.find((df) => df.name.trim().toLowerCase() === normalizedTarget);
    if (exact && Number.isFinite(exact.density) && exact.density > 0) {
        return exact.density;
    }

    // 2. Partial containment match (e.g. "Soybean Oil" in "Pure Soybean Oil USP")
    const partial = densityFactors.find((df) => {
        const factorName = df.name.trim().toLowerCase();
        return normalizedTarget.includes(factorName) || factorName.includes(normalizedTarget);
    });
    if (partial && Number.isFinite(partial.density) && partial.density > 0) {
        return partial.density;
    }

    return null;
}

/**
 * Pure UOM Conversion Function
 * Converts a quantity from `fromUom` into `toUom`.
 * Supports mass-to-mass, volume-to-volume, discrete count matching,
 * and density-based liquid-to-mass cross-dimensional conversions.
 */
export function convertUomQuantity(
    quantity: number,
    fromUom: string,
    toUom: string,
    componentName?: string,
    context: ConversionContext = {}
): ConversionResult {
    if (!Number.isFinite(quantity)) {
        return { ok: false, diagnostic: `Invalid numerical quantity: ${quantity}` };
    }

    const normFrom = normalizeUnit(fromUom);
    const normTo = normalizeUnit(toUom);

    // Identity conversion
    if (normFrom === normTo) {
        return { ok: true, convertedValue: quantity };
    }

    // 1. Check custom scale conversions from database
    if (context.customScales && context.customScales.length > 0) {
        const direct = context.customScales.find(
            (scale) => normalizeUnit(scale.fromUnit) === normFrom && normalizeUnit(scale.toUnit) === normTo
        );
        if (direct && direct.multiplier > 0) {
            return { ok: true, convertedValue: quantity * direct.multiplier };
        }

        const inverse = context.customScales.find(
            (scale) => normalizeUnit(scale.fromUnit) === normTo && normalizeUnit(scale.toUnit) === normFrom
        );
        if (inverse && inverse.multiplier > 0) {
            return { ok: true, convertedValue: quantity / inverse.multiplier };
        }
    }

    // 2. Mass-to-Mass
    const fromMassFactor = MASS_TO_KG[normFrom];
    const toMassFactor = MASS_TO_KG[normTo];
    if (fromMassFactor !== undefined && toMassFactor !== undefined) {
        const inKg = quantity * fromMassFactor;
        const converted = inKg / toMassFactor;
        return { ok: true, convertedValue: converted };
    }

    // 3. Volume-to-Volume
    const fromVolFactor = VOLUME_TO_L[normFrom];
    const toVolFactor = VOLUME_TO_L[normTo];
    if (fromVolFactor !== undefined && toVolFactor !== undefined) {
        const inL = quantity * fromVolFactor;
        const converted = inL / toVolFactor;
        return { ok: true, convertedValue: converted };
    }

    // 4. Volume <-> Mass using Density Factor (kg/L)
    const isFromVol = fromVolFactor !== undefined;
    const isToMass = toMassFactor !== undefined;
    const isFromMass = fromMassFactor !== undefined;
    const isToVol = toVolFactor !== undefined;

    if ((isFromVol && isToMass) || (isFromMass && isToVol)) {
        const density = resolveDensityKgPerL(componentName, context.densityFactors);
        if (!density || density <= 0) {
            return {
                ok: false,
                diagnostic: `Missing density factor to convert ${fromUom} to ${toUom} for "${componentName || "liquid component"}". Volumetric-to-mass conversions require a valid density factor.`
            };
        }

        if (isFromVol && isToMass) {
            // Volume -> Liters -> Kilograms (kg = L * density) -> Target Mass
            const liters = quantity * fromVolFactor;
            const kg = liters * density;
            const converted = kg / toMassFactor;
            return { ok: true, convertedValue: converted };
        }

        if (isFromMass && isToVol) {
            // Mass -> Kilograms -> Liters (L = kg / density) -> Target Volume
            const kg = quantity * fromMassFactor;
            const liters = kg / density;
            const converted = liters / toVolFactor;
            return { ok: true, convertedValue: converted };
        }
    }

    // 5. Discrete Count Equivalences (e.g. pc <-> pcs, unit <-> units)
    if (COUNT_UNITS.has(normFrom) && COUNT_UNITS.has(normTo)) {
        const areSingularPluralPair =
            normFrom.startsWith(normTo) ||
            normTo.startsWith(normFrom) ||
            (normFrom === "pc" && normTo === "pcs") ||
            (normFrom === "pcs" && normTo === "pc") ||
            (normFrom === "unit" && normTo === "units") ||
            (normFrom === "units" && normTo === "unit");

        if (areSingularPluralPair) {
            return { ok: true, convertedValue: quantity };
        }
    }

    return {
        ok: false,
        diagnostic: `No valid conversion pathway from "${fromUom}" to "${toUom}" for component "${componentName || "Unknown"}".`
    };
}
