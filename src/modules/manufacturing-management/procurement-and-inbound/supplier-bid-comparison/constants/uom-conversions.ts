/**
 * Converts length dimensions (length, width, height) to cubic meters (m³ / CBM).
 */
export function calculateCbm(
    length: number,
    width: number,
    height: number,
    unitCodeOrName?: string | null
): number {
    if (!length || !width || !height) return 0;
    const unit = (unitCodeOrName || "cm").toLowerCase().trim();

    let factorToMeters = 0.01; // default cm -> m
    if (unit === "mm" || unit.includes("milli")) {
        factorToMeters = 0.001;
    } else if (unit === "cm" || unit.includes("centi")) {
        factorToMeters = 0.01;
    } else if (unit === "m" || unit === "meter" || unit === "meters") {
        factorToMeters = 1.0;
    } else if (unit === "in" || unit === "inch" || unit.includes("inch")) {
        factorToMeters = 0.0254;
    } else if (unit === "ft" || unit === "feet" || unit.includes("foot")) {
        factorToMeters = 0.3048;
    }

    const cbm = (length * factorToMeters) * (width * factorToMeters) * (height * factorToMeters);
    return Number(cbm.toFixed(6));
}

/**
 * Converts weight to kilograms (kg).
 */
export function convertToKg(weight: number, unitCodeOrName?: string | null): number {
    if (!weight) return 0;
    const unit = (unitCodeOrName || "kg").toLowerCase().trim();

    if (unit === "g" || unit === "gram" || unit.includes("gram")) {
        return Number((weight / 1000).toFixed(4));
    }
    if (unit === "mg" || unit.includes("milli")) {
        return Number((weight / 1000000).toFixed(6));
    }
    if (unit === "lb" || unit === "lbs" || unit.includes("pound")) {
        return Number((weight * 0.45359237).toFixed(4));
    }
    if (unit === "oz" || unit.includes("ounce")) {
        return Number((weight * 0.02834952).toFixed(4));
    }
    if (unit === "ton" || unit === "tons" || unit === "mt") {
        return Number((weight * 1000).toFixed(3));
    }
    return Number(weight.toFixed(4)); // default already kg
}
