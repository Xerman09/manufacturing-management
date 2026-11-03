import type { OffsettingLineDetail, OffsettingPairing } from "../types";

const MARKER = "__OFFSET_DATA__:";
const EPSILON = 0.0001;

export class OffsetPairingError extends Error {
    constructor(message: string, public status = 422) {
        super(message);
        this.name = "OffsetPairingError";
    }
}

export function offsetFlag(value: unknown): boolean {
    return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

export function canEditOffsetPairings(sheet: { status: unknown; isCommitted?: unknown; isCancelled?: unknown }): boolean {
    return ["DRAFT", "PENDING_REVIEW"].includes(String(sheet.status).toUpperCase())
        && !offsetFlag(sheet.isCommitted) && !offsetFlag(sheet.isCancelled);
}

export function readOffsetPairings(remarks: unknown): OffsettingPairing[] {
    if (typeof remarks !== "string" || !remarks.includes(MARKER)) return [];
    try {
        const parsed: unknown = JSON.parse(remarks.slice(remarks.indexOf(MARKER) + MARKER.length));
        if (!Array.isArray(parsed) || parsed.some(pair => !pair || typeof pair !== "object" || typeof pair.id !== "string")) {
            throw new Error("Invalid pairing array");
        }
        return parsed;
    } catch {
        throw new OffsetPairingError("Stored offset pairings could not be read. Reload or have this record reviewed before saving; existing data has been preserved.");
    }
}

export function writeOffsetPairings(remarks: unknown, pairings: OffsettingPairing[]): string | null {
    const text = typeof remarks === "string" ? remarks : "";
    const plainRemarks = (text.includes(MARKER) ? text.slice(0, text.indexOf(MARKER)) : text).trim();
    const stored = pairings.length ? `${plainRemarks ? `${plainRemarks}\n` : ""}${MARKER}${JSON.stringify(pairings)}` : plainRemarks || null;
    // The verified mm_physical_inventory.remarks contract is MySQL TEXT (65,535 bytes).
    if (stored && new TextEncoder().encode(stored).byteLength > 65535) {
        throw new OffsetPairingError("The audit remarks and offset pairs exceed the 65,535-byte storage limit. Shorten the notes or reduce the number of links before saving.", 413);
    }
    return stored;
}

export function sameOffsetPairings(left: OffsettingPairing[], right: OffsettingPairing[]): boolean {
    const stable = (pairs: OffsettingPairing[]) => JSON.stringify([...pairs].sort((a, b) => a.id.localeCompare(b.id)).map(pair =>
        Object.fromEntries(Object.entries(pair).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)))
    ));
    return stable(left) === stable(right);
}

function recordId(value: unknown, key: string): number {
    return Number(value && typeof value === "object" ? (value as Record<string, unknown>)[key] : value);
}

function detailFactor(detail: OffsettingLineDetail): number | undefined {
    const product = typeof detail.product_id === "object" ? detail.product_id : null;
    const factor = Number(product?.unit_of_measurement_count);
    if (Number.isFinite(factor) && factor > 0) return factor;
    const unit = typeof detail.unit_id === "object" ? detail.unit_id
        : product && typeof product.unit_of_measurement === "object" ? product.unit_of_measurement : null;
    return /^(pcs?|pieces?|units?)$/i.test(unit?.unit_shortcut || unit?.unit_name || "") ? 1 : undefined;
}

/** Normalizes the older count-unit format as well as the workspace's explicit piece format. */
export function normalizeOffsetPairings(pairings: OffsettingPairing[], details: OffsettingLineDetail[], validate = true): OffsettingPairing[] {
    const rows = new Map(details.map(detail => [Number(detail.physical_inventory_detail_id || detail.id), detail]));
    const allocated = new Map<number, number>();
    const ids = new Set<string>();
    return pairings.map(pair => {
        if (!pair || typeof pair !== "object" || typeof pair.id !== "string" || !pair.id || ids.has(pair.id)) {
            throw new OffsetPairingError("Offset pairs must have distinct, nonempty IDs. Review the affected pair before saving.");
        }
        ids.add(pair.id);
        const shortage = rows.get(Number(pair.shortage_detail_id));
        const surplus = rows.get(Number(pair.surplus_detail_id));
        if (!shortage || !surplus || shortage === surplus
            || recordId(shortage.product_id, "product_id") !== Number(pair.shortage_product_id)
            || recordId(surplus.product_id, "product_id") !== Number(pair.surplus_product_id)
            || recordId(shortage.lot_id, "lot_id") !== Number(pair.shortage_lot_id)
            || recordId(surplus.lot_id, "lot_id") !== Number(pair.surplus_lot_id)) {
            throw new OffsetPairingError(`Pair ${pair.id} does not match shortage and surplus lines in this audit record.`);
        }
        const shortageVariance = Number(shortage.physical_count ?? shortage.system_count) - Number(shortage.system_count);
        const surplusVariance = Number(surplus.physical_count ?? surplus.system_count) - Number(surplus.system_count);
        const explicitPieces = pair.offset_pieces !== undefined;
        const shortFactor = Number(pair.shortage_uom_count ?? detailFactor(shortage));
        const surplusFactor = Number(pair.surplus_uom_count ?? detailFactor(surplus));
        if (![shortFactor, surplusFactor].every(value => Number.isFinite(value) && value > 0)
            || (!explicitPieces && (pair.shortage_product_id !== pair.surplus_product_id || shortFactor !== surplusFactor))) {
            throw new OffsetPairingError(`The quantity conversion for pair ${pair.id} is unavailable or ambiguous. Review its UOM before editing or saving.`);
        }
        if (validate && ((detailFactor(shortage) !== undefined && shortFactor !== detailFactor(shortage))
            || (detailFactor(surplus) !== undefined && surplusFactor !== detailFactor(surplus)))) {
            throw new OffsetPairingError(`The UOM conversion for pair ${pair.id} changed. Review the linked lines before saving.`);
        }
        const pieces = explicitPieces ? Number(pair.offset_pieces) : Number(pair.offset_qty) * shortFactor;
        if (!Number.isFinite(pieces) || pieces <= 0) throw new OffsetPairingError("Offset quantity must be a finite number greater than zero.");
        const reason = String(pair.reason_code || "").trim();
        const notes = String(pair.notes || "").trim();
        if (validate && pair.shortage_product_id !== pair.surplus_product_id && (!reason || !notes)) {
            throw new OffsetPairingError("Cross-product pairs require a reason code and an auditor note.");
        }
        for (const [id, capacity] of [[Number(pair.shortage_detail_id), -shortageVariance * shortFactor], [Number(pair.surplus_detail_id), surplusVariance * surplusFactor]]) {
            const total = (allocated.get(id) || 0) + pieces;
            if (validate && (capacity <= 0 || total > capacity + EPSILON)) {
                throw new OffsetPairingError(`Offset quantities exceed the available shortage or surplus for detail ${id}.`);
            }
            allocated.set(id, total);
        }
        const shortCost = Number(shortage.unit_cost);
        const surplusCost = Number(surplus.unit_cost);
        if (![shortCost, surplusCost].every(Number.isFinite)) throw new OffsetPairingError("Linked line costs are unavailable. Reload the audit record before saving.");
        const costVariance = surplusCost / surplusFactor - shortCost / shortFactor;
        return {
            ...pair,
            group_link_id: pair.group_link_id || `OFF-LEGACY-${pair.shortage_product_id}-${pair.surplus_product_id}-${pair.reason_code}`,
            shortage_detail_id: Number(pair.shortage_detail_id),
            surplus_detail_id: Number(pair.surplus_detail_id),
            shortage_product_id: Number(pair.shortage_product_id),
            surplus_product_id: Number(pair.surplus_product_id),
            shortage_lot_id: Number(pair.shortage_lot_id),
            surplus_lot_id: Number(pair.surplus_lot_id),
            offset_qty: pieces,
            offset_pieces: pieces,
            shortage_uom_count: shortFactor,
            surplus_uom_count: surplusFactor,
            shortage_containers_deducted: pieces / shortFactor,
            surplus_containers_deducted: pieces / surplusFactor,
            shortage_unit_cost: shortCost,
            surplus_unit_cost: surplusCost,
            unit_cost_variance: costVariance,
            net_financial_impact: pieces * costVariance,
            reason_code: reason,
            notes: notes || undefined,
        };
    });
}

/** Keep the count-sheet editor's older wire format while validating in base pieces. */
export function prepareOffsetPairingsForSave(pairings: OffsettingPairing[], details: OffsettingLineDetail[]): OffsettingPairing[] {
    return normalizeOffsetPairings(pairings, details).map((normalized, index) => {
        const original = pairings[index];
        if (original.offset_pieces !== undefined) return normalized;
        const variance = normalized.surplus_unit_cost - normalized.shortage_unit_cost;
        return {
            ...original,
            shortage_unit_cost: normalized.shortage_unit_cost,
            surplus_unit_cost: normalized.surplus_unit_cost,
            unit_cost_variance: variance,
            net_financial_impact: Number(original.offset_qty) * variance,
            reason_code: normalized.reason_code,
            notes: normalized.notes,
        };
    });
}
