import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import type { MmPhysicalInventorySheet } from "@/modules/manufacturing-management/physical-inventory-manufacturing/types";
import { readOffsetPairings } from "@/modules/manufacturing-management/physical-inventory-offsetting/utils/offset-pairings";

export async function readPhysicalInventorySheet(sheetId: number): Promise<MmPhysicalInventorySheet | null> {
    const headerUrl = `${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}?fields=*,branch_id.*,product_type_id.*,price_type_id.*,encoder_id.*,committed_by.*,cancelled_by.*`;
    const headerRes = await fetch(headerUrl, { headers, cache: "no-store" });
    if (!headerRes.ok) return null;

    const header = (await headerRes.json()).data;
    if (!header) return null;
    const offsetPairings = readOffsetPairings(header.remarks);

    const detailsUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&limit=-1&fields=*,inventory_lot_id.*,lot_id.*,lot_id.unit_id.*,product_id.*,product_id.product_type.*,product_id.unit_of_measurement.*,unit_id.*`;
    const detailsRes = await fetch(detailsUrl, { headers, cache: "no-store" });
    const details = detailsRes.ok ? (await detailsRes.json().catch(() => null))?.data : null;
    if (!Array.isArray(details)) {
        throw new Error("Failed to load the audit detail records. Reload before editing pairings.");
    }

    return { ...header, details, offset_pairings: offsetPairings };
}
