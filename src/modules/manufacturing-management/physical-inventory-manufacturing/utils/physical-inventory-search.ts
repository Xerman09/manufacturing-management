import type { MmPhysicalInventoryDetail } from "../types";

function relationValue(value: unknown, field: string): unknown {
    if (typeof value === "object" && value !== null) {
        const record = value as Record<string, unknown>;
        return record[field] ?? (field === "lot_id" ? record.id : undefined);
    }
    return value;
}

export function matchesPhysicalInventoryDetail(detail: MmPhysicalInventoryDetail, searchTerm: string): boolean {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    const productName = relationValue(detail.product_id, "product_name");
    const productCode = relationValue(detail.product_id, "product_code");
    const lotName = relationValue(detail.lot_id, "lot_name");
    const lotId = relationValue(detail.lot_id, "lot_id");

    return [productName, productCode, lotName, lotId, detail.batch_no]
        .some((value) => String(value ?? "").toLowerCase().includes(query));
}
