type UnitOfMeasureRecord = {
    uom_name?: unknown;
    uom_shortcut?: unknown;
    unit_name?: unknown;
    unit_shortcut?: unknown;
    unit_of_measurement?: unknown;
    uom?: unknown;
};

function firstLabel(values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
}

export function getUnitOfMeasureLabel(source: UnitOfMeasureRecord | string | null | undefined): string {
    if (typeof source === "string") return source.trim() || "UOM unavailable";
    if (!source) return "UOM unavailable";

    const measurement = source.unit_of_measurement;
    const nestedUnit = measurement && typeof measurement === "object"
        ? measurement as UnitOfMeasureRecord
        : null;

    const missingUomId = "uom_id" in source && (source as UnitOfMeasureRecord & { uom_id?: unknown }).uom_id == null;
    const fullLabel = firstLabel([
        source.uom_name,
        source.unit_name,
        nestedUnit?.unit_name,
        typeof measurement === "string" ? measurement : null,
        source.uom,
    ]);
    if (fullLabel) {
        if (missingUomId && ["pc", "pcs", "piece", "pieces"].includes(fullLabel.toLowerCase())) {
            return "UOM unavailable";
        }
        return fullLabel;
    }

    const shortcut = firstLabel([
        source.uom_shortcut,
        source.unit_shortcut,
        nestedUnit?.unit_shortcut,
    ]);
    return shortcut || "UOM unavailable";
}
