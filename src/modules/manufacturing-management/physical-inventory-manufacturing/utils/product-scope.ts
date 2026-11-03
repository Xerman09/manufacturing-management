const PRODUCT_TYPE_ID_KEYS = ["id", "product_type_id", "type_id"] as const;

export function normalizeProductTypeId(value: unknown): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of PRODUCT_TYPE_ID_KEYS) {
            const candidate = Number(record[key]);
            if (Number.isInteger(candidate) && candidate > 0) return candidate;
        }
        return 0;
    }

    const candidate = Number(value);
    return Number.isInteger(candidate) && candidate > 0 ? candidate : 0;
}

export function normalizeProductTypeName(value: unknown): string {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        value = record.name || record.type_name;
    }
    return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

export function matchesProductTypeScope(
    scope: unknown,
    productType: unknown,
    scopeName?: unknown
): boolean {
    const scopeId = normalizeProductTypeId(scope);
    const productTypeId = normalizeProductTypeId(productType);

    if (scopeId > 0) return productTypeId > 0 && scopeId === productTypeId;

    const normalizedScopeName = normalizeProductTypeName(scope) || normalizeProductTypeName(scopeName);
    const normalizedProductTypeName = normalizeProductTypeName(productType);
    return Boolean(normalizedScopeName && normalizedProductTypeName && normalizedScopeName === normalizedProductTypeName);
}
