export const SESSION_QUANTITY_FIELDS = [
    ["manufacturing_job_order_materials", "actual_consumed_quantity", 18],
    ["manufacturing_job_order_materials", "reserved_quantity", 18],
    ["manufacturing_job_order_materials_reservations", "actual_used_quantity", 20],
    ["manufacturing_job_order_yield_ledger_bom_consumage", "quantity_consumed", 18],
    ["jo_material_genealogy", "consumed_quantity", 18]
] as const;

export type PrecisionRow = Record<string, unknown>;
export interface PrecisionRepairSnapshot {
    ledger: PrecisionRow;
    consumptions: PrecisionRow[];
    reservations: PrecisionRow[];
    materials: PrecisionRow[];
    genealogy: PrecisionRow[];
    revisions: PrecisionRow[];
}
export interface PrecisionRepair {
    collection: string;
    id: number;
    before: PrecisionRow;
    patch: Record<string, string>;
}

// Decimal strings keep recovery comparisons exact, including the old four-place rounding.
export function quantityUnits(value: unknown, scale = 6): bigint {
    const text = String(value ?? "0");
    const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match) throw new Error(`Invalid non-negative decimal quantity: ${text}`);
    const fraction = match[2] || "";
    const units = BigInt(match[1] + fraction.slice(0, scale).padEnd(scale, "0"));
    return units + (Number(fraction[scale] || 0) >= 5 ? BigInt(1) : BigInt(0));
}

export function quantityText(value: unknown): string {
    const units = quantityUnits(value).toString().padStart(7, "0");
    return `${units.slice(0, -6)}.${units.slice(-6)}`;
}

export function precisionSchema(schema: PrecisionRow, minimumPrecision: number) {
    const scale = Number(schema.numeric_scale);
    const precision = Number(schema.numeric_precision);
    if (!Number.isInteger(scale) || !Number.isInteger(precision)) throw new Error("Decimal schema metadata is required.");
    return {
        numeric_precision: Math.max(minimumPrecision, precision + Math.max(0, 6 - scale)),
        numeric_scale: Math.max(6, scale)
    };
}

export function quantityPrecisionSql(collection: string, field: string, schema: PrecisionRow, minimumPrecision: number) {
    if (!SESSION_QUANTITY_FIELDS.some(([table, column]) => table === collection && column === field)) throw new Error("Unexpected precision migration field.");
    const desired = precisionSchema(schema, minimumPrecision);
    const nullable = schema.is_nullable ? "NULL" : "NOT NULL";
    const defaultValue = schema.default_value == null ? (schema.is_nullable ? " DEFAULT NULL" : "") : ` DEFAULT ${quantityText(schema.default_value)}`;
    const comment = String(schema.comment || "");
    if (comment.includes("\\")) throw new Error("Review the SQL mode before migrating a column comment containing backslashes.");
    return `ALTER TABLE \`${collection}\` MODIFY COLUMN \`${field}\` DECIMAL(${desired.numeric_precision},${desired.numeric_scale}) ${nullable}${defaultValue} COMMENT '${comment.replaceAll("'", "''")}';`;
}

function id(value: unknown): number {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result <= 0) throw new Error("Invalid recovery record identifier.");
    return result;
}
function applied(value: unknown) { return value === true || value === 1 || value === "1"; }
function record(value: unknown): PrecisionRow {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Saved shift payload is unavailable.");
    return parsed as PrecisionRow;
}

export function buildPrecisionRepairs(snapshot: PrecisionRepairSnapshot, ledgerId: number, jobOrderId: number): PrecisionRepair[] {
    const { ledger, consumptions, reservations, materials, genealogy, revisions } = snapshot;
    const payload = record(ledger.session_payload);
    if (id(ledger.ledger_id) !== ledgerId || id(ledger.job_order_id) !== jobOrderId
        || ledger.commit_status !== "PENDING" || applied(ledger.job_order_updated)
        || !ledger.request_hash || payload.sessionScope !== "JOB_ORDER" || ledger.jo_route_id
        || id(payload.joId) !== jobOrderId || payload.sessionKey !== ledger.session_key) {
        throw new Error("Recovery requires the unchanged pending Job Order shift and its saved request hash.");
    }
    if (!Array.isArray(payload.materialsConsumed) || !payload.materialsConsumed.length) throw new Error("Saved material lines are missing.");
    const lines = payload.materialsConsumed.map(record);
    if (new Set(lines.map(line => id(line.reservationId))).size !== lines.length) throw new Error("Duplicate saved reservations.");
    if (consumptions.length !== lines.length) throw new Error("Recover only a session with all consumption snapshots present.");
    const repairs = new Map<string, PrecisionRepair>();
    function repair(collection: string, row: PrecisionRow, key: string, values: PrecisionRow) {
        const rowId = id(row[key]);
        const patch: Record<string, string> = {};
        for (const [field, expected] of Object.entries(values)) {
            if (quantityUnits(row[field]) === quantityUnits(expected)) continue;
            if (quantityUnits(row[field], 4) !== quantityUnits(expected, 4)
                || quantityUnits(row[field]) !== quantityUnits(row[field], 4) * BigInt(100)) {
                throw new Error(`Unexplained balance change: ${collection}/${rowId}.${field}`);
            }
            const latest = revisions.filter(revision => revision.collection === collection && String(revision.item) === String(rowId))
                .sort((a, b) => Number(b.id) - Number(a.id))
                .find(revision => Object.hasOwn(record(revision.delta), field));
            if (!latest || quantityUnits(record(latest.delta)[field]) !== quantityUnits(expected)
                || ![quantityUnits(expected), quantityUnits(row[field])].includes(quantityUnits(record(latest.data)[field]))) {
                throw new Error(`Missing matching audit evidence: ${collection}/${rowId}.${field}`);
            }
            patch[field] = quantityText(expected);
        }
        if (Object.keys(patch).length) repairs.set(`${collection}/${rowId}`, { collection, id: rowId, before: row, patch });
    }
    const materialProgress = new Map<number, PrecisionRow>();
    const seenGenealogy = new Set<number>();
    for (const line of lines) {
        const reservationId = id(line.reservationId);
        const key = `production-session:${jobOrderId}:JOB_ORDER:${ledger.session_key}:reservation:${reservationId}`;
        const matches = consumptions.filter(row => row.source_event_key === key);
        if (matches.length !== 1) throw new Error(`Ambiguous consumption for reservation ${reservationId}.`);
        const consumption = matches[0];
        for (const [field, source] of Object.entries({ jo_material_id: "joMaterialId", reservation_id: "reservationId", product_id: "productId", mm_lot_id: "mmLotId", inventory_lot_id: "inventoryLotId", uom_id: "uomId" })) {
            if (id(consumption[field]) !== id(line[source])) throw new Error(`Consumption identity changed: ${field}.`);
        }
        if (id(consumption.ledger_id) !== ledgerId || consumption.session_key !== ledger.session_key || consumption.batch_no !== line.batchNo) throw new Error("Consumption session or batch changed.");
        if (quantityUnits(consumption.reservation_actual_after) - quantityUnits(consumption.reservation_actual_before) !== quantityUnits(line.actualQty)
            || quantityUnits(consumption.remaining_wip_before) - quantityUnits(consumption.remaining_wip_after) !== quantityUnits(line.actualQty)
            || quantityUnits(consumption.material_actual_after) - quantityUnits(consumption.material_actual_before) !== quantityUnits(line.actualQty)) throw new Error("Saved consumption snapshots do not agree with the payload.");
        repair("manufacturing_job_order_yield_ledger_bom_consumage", consumption, "consumage_id", { quantity_consumed: line.actualQty });
        const reservation = reservations.find(row => id(row.jo_materials_reservation_id) === reservationId);
        if (!reservation || id(reservation.jo_material_id) !== id(line.joMaterialId)
            || id(reservation.product_id) !== id(line.productId) || id(reservation.mm_lot_id) !== id(line.mmLotId)
            || id(reservation.inventory_lot_id) !== id(line.inventoryLotId) || id(reservation.uom_id) !== id(line.uomId)
            || reservation.batch_no !== line.batchNo || reservation.reservation_status !== "WIP") throw new Error("Reservation identity or status changed.");
        // This maintenance command repairs known applied writes; ambiguous, unmarked writes need a separate reconciliation.
        if (!applied(consumption.reservation_applied)) throw new Error(`Reservation ${reservationId} is not confirmed applied.`);
        if (quantityUnits(reservation.issued_to_wip_quantity) - quantityUnits(reservation.returned_quantity)
            - quantityUnits(consumption.reservation_actual_after) !== quantityUnits(consumption.remaining_wip_after)) throw new Error("WIP basis changed.");
        repair("manufacturing_job_order_materials_reservations", reservation, "jo_materials_reservation_id", {
            actual_used_quantity: consumption.reservation_actual_after,
            remaining_wip_quantity: consumption.remaining_wip_after
        });
        const previous = materialProgress.get(id(line.joMaterialId));
        if (previous && (!applied(previous.material_aggregate_applied)
            || quantityUnits(previous.material_actual_after) !== quantityUnits(consumption.material_actual_before)
            || quantityUnits(previous.material_reserved_after) !== quantityUnits(consumption.material_reserved_before))) throw new Error("Material application order is ambiguous.");
        materialProgress.set(id(line.joMaterialId), consumption);
        const links = genealogy.filter(row => row.source_event_key === key);
        if (links.length > 1) throw new Error("Duplicate genealogy records.");
        if (links[0]) {
            const link = links[0];
            if (!applied(consumption.material_aggregate_applied) || id(link.job_order_id) !== jobOrderId
                || id(link.reservation_id) !== reservationId || id(link.jo_material_id) !== id(line.joMaterialId)
                || id(link.component_product_id) !== id(line.productId) || id(link.component_mm_lot_id) !== id(line.mmLotId)
                || id(link.component_inventory_lot_id) !== id(line.inventoryLotId) || id(link.uom_id) !== id(line.uomId)
                || link.component_batch_no !== line.batchNo || link.session_key !== ledger.session_key) throw new Error("Genealogy identity changed.");
            seenGenealogy.add(id(link.genealogy_id));
            repair("jo_material_genealogy", link, "genealogy_id", { consumed_quantity: line.actualQty });
        }
    }
    if (seenGenealogy.size !== genealogy.length) throw new Error("Unexpected genealogy records in this session.");
    // Aggregates are restored last, so an automatic resume cannot advance on a partially repaired baseline.
    for (const [materialId, last] of materialProgress) {
        const material = materials.find(row => id(row.jo_material_id) === materialId);
        if (!material || id(material.job_order_id) !== jobOrderId) throw new Error("Material ownership changed.");
        const suffix = applied(last.material_aggregate_applied) ? "after" : "before";
        repair("manufacturing_job_order_materials", material, "jo_material_id", {
            actual_consumed_quantity: last[`material_actual_${suffix}`],
            reserved_quantity: last[`material_reserved_${suffix}`]
        });
    }
    return [...repairs.values()];
}
