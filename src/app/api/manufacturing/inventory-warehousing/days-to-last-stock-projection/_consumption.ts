import type { VerifiedConsumptionDetail } from "@/modules/manufacturing-management/inventory-warehousing/days-to-last-stock-projection/types";

export function consumptionRecords(rows: Record<string, unknown>[], start: string | null, end: string): VerifiedConsumptionDetail[] {
    const unique = new Map<string, VerifiedConsumptionDetail>();
    for (const row of rows) {
        const get = (camel: string, snake: string) => row[camel] ?? row[snake];
        const source = String(get("sourceModule", "source_module") ?? "").toUpperCase();
        const type = String(get("transactionType", "transaction_type") ?? "").toUpperCase();
        if (source !== "MM_JOB_ORDER" && !["JOB_ORDER_CONSUMPTION", "MATERIAL_CONSUMPTION"].includes(type)) continue;
        const qty = Number(get("quantityOut", "quantity_out"));
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const date = String(get("transactionDate", "transaction_date") ?? "");
        const timestamp = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(date) ? date : (date.length === 10 ? date + "T00:00:00" : date.replace(" ", "T")) + "+08:00");
        if (!Number.isFinite(timestamp)) throw new Error("Verified outflow has an invalid transaction date.");
        if (timestamp > Date.parse(end) || start && timestamp < Date.parse(start)) continue;
        const key = String(get("movementKey", "movement_key") ?? "");
        if (!key) throw new Error("Verified outflow is missing its stable movement identity.");
        const record = { movement_key: key, reference_no: String(get("referenceNo", "reference_no") ?? ""), reference_id: Number(get("referenceId", "reference_id")), transaction_date: date, posted_at: String(get("postedAt", "posted_at") ?? date), branch_id: Number(get("branchId", "branch_id")), product_id: Number(get("productId", "product_id")), product_name: String(get("productName", "product_name") ?? ""), batch_no: String(get("batchNo", "batch_no") ?? "") || null, quantity_out: qty, unit_id: Number(get("unitId", "unit_id")), remarks: String(row.remarks ?? "") || null };
        if (!record.branch_id || !record.product_id) throw new Error("Verified outflow is missing product or branch identity.");
        if (unique.has(key) && JSON.stringify(unique.get(key)) !== JSON.stringify(record)) throw new Error("Conflicting verified movement identity.");
        unique.set(key, record);
    }
    return [...unique.values()];
}

export async function loadConsumption(base: string, headers: Record<string, string>, start: string | null, end: string) {
    if (!base) throw new Error("Verified consumption is unavailable. Retry the report.");
    const response = await fetch(`${base}/api/mm-inventory-movements/all`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error("Verified consumption is unavailable. Retry the report.");
    const body = await response.json();
    const rows = Array.isArray(body) ? body : body.data;
    if (!Array.isArray(rows)) throw new Error("Invalid verified consumption response.");
    return consumptionRecords(rows, start, end);
}
