import type { CountSheetStockRow, MmLot, MmPhysicalInventoryDetail, MmPhysicalInventorySheet } from "../types";
import { formatQty } from "./number-format";

export const COUNT_SHEET_TITLE = "MANUFACTURING PHYSICAL INVENTORY AUDIT COUNT SHEET";
export const COUNT_SHEET_TABLE_TITLE = "MANUFACTURING FLOOR AUDIT & BATCH VERIFICATION";
export const COUNT_SHEET_MARGIN_MM = 10;
export const COUNT_SHEET_SIGNOFF_OFFSET_MM = 220;
export const COUNT_SHEET_FONT_PT = {
    title: 9.5,
    documentNumber: 8.5,
    body: 7.5,
    small: 7,
    fieldLabel: 6.5,
};
export const COUNT_SHEET_SIGNATURE_GAP_MM = 5;
export const COUNT_SHEET_SIGNING_SPACE_MM = 8;

export const COUNT_SHEET_COLUMNS = [
    { label: "LOT NO.", widthPercent: 12, align: "center" },
    { label: "BATCH NO.", widthPercent: 12, align: "center" },
    { label: "PRODUCT NAME & SKU CODE", widthPercent: 27, align: "left" },
    { label: "UOM", widthPercent: 8, align: "center" },
    { label: "SYSTEM COUNT", widthPercent: 14, align: "center" },
    { label: "PHYSICAL COUNT", widthPercent: 27, align: "center" },
] as const;

export const COUNT_SHEET_SIGNATURES = [
    { label: "1. COUNTED & AUDITED BY:", caption: "Plant Floor Auditor Signature & Date" },
    { label: "2. VERIFIED & CHECKED BY:", caption: "Warehouse Supervisor Signature & Date" },
    { label: "3. APPROVED BY:", caption: "Plant Operations Manager Signature & Date" },
] as const;

export interface CountSheetPrintOptions {
    showPhysicalCount?: boolean;
    targetLot?: number | string | null;
    printedAt?: string;
    additionalRows?: readonly CountSheetStockRow[];
    stockCutoff?: string | null;
}

type CountSheetDetail = MmPhysicalInventoryDetail & {
    lot_name?: string;
    product_name?: string;
    product_code?: string;
    uom?: string;
};

function formatTimestamp(timestamp?: string | null): string {
    const [date, time] = (timestamp ?? "").trim().split("T");
    return time ? `${date} ${time.slice(0, 5)}` : date || "N/A";
}

function batchWithCondition(batchNo: string, value: string): string {
    const condition = value?.trim().toUpperCase();
    return condition && condition !== "GOOD" ? `${batchNo}\n${condition}` : batchNo;
}

function countSheetRows(
    details: CountSheetDetail[],
    { additionalRows = [], targetLot, showPhysicalCount, stockCutoff }: CountSheetPrintOptions,
): string[][] {
    // Preserve lot and batch ordering while keeping every detail on its own row.
    const lots = new Map<string, Map<string, string[][]>>();

    function appendRow(lotId: number | undefined, lotName: string, batchNo: string, values: string[]) {
        if (typeof targetLot === "number" && lotId !== targetLot) return;
        if (typeof targetLot === "string" && lotName.toLowerCase() !== targetLot.toLowerCase()) return;
        const printedLot = lotName || "Main Storage / Unassigned Lot";
        let batches = lots.get(printedLot);
        if (!batches) {
            batches = new Map();
            lots.set(printedLot, batches);
        }
        let rows = batches.get(batchNo);
        if (!rows) {
            rows = [];
            batches.set(batchNo, rows);
        }
        rows.push([printedLot, ...values]);
    }

    for (const detail of details) {
        const lot = typeof detail.lot_id === "object" ? detail.lot_id as (MmLot & { id?: number }) | null : null;
        const lotId = typeof detail.lot_id === "number" ? detail.lot_id : lot?.lot_id ?? lot?.id;
        const lotName = lot?.lot_name || detail.lot_name || "";
        const batch = typeof detail.inventory_lot_id === "object" ? detail.inventory_lot_id : null;
        const batchNo = detail.batch_no || batch?.batch_no || "General Stock / No Batch";
        const product = typeof detail.product_id === "object" ? detail.product_id : null;
        const productName = product?.product_name || detail.product_name || "Product";
        const sku = product?.product_code || detail.product_code;
        const unit = typeof detail.unit_id === "object" ? detail.unit_id : null;
        const uom = unit?.unit_shortcut || unit?.unit_name || detail.uom || "PCS";
        const physicalCount = showPhysicalCount && detail.physical_count != null
            ? formatQty(detail.physical_count)
            : "";

        appendRow(lotId, lotName, batchNo, [
            stockCutoff ? batchWithCondition(batchNo, detail.inventory_condition) : batchNo,
            sku ? `${productName}\nCODE: ${sku}` : productName,
            uom.toUpperCase(),
            formatQty(detail.system_count),
            physicalCount,
        ]);
    }
    for (const row of additionalRows) {
        appendRow(row.lotId, row.lotName, row.batchNo, [
            batchWithCondition(row.batchNo, row.condition),
            row.productCode ? `${row.productName}\nCODE: ${row.productCode}` : row.productName,
            row.uom.toUpperCase(),
            formatQty(row.systemCount),
            "",
        ]);
    }

    return Array.from(lots.values())
        .flatMap(batches => Array.from(batches.values()).flat())
        .map(([lot, batch, product, uom, systemCount, physicalCount], index) => [
            lot, batch, `${index + 1}. ${product}`, uom, systemCount, physicalCount,
        ]);
}

export function buildManufacturingCountSheet(
    sheet: MmPhysicalInventorySheet,
    options: CountSheetPrintOptions = {},
) {
    const { targetLot, showPhysicalCount = false, printedAt = new Date().toISOString(), stockCutoff } = options;
    const branch = typeof sheet.branch_id === "object" ? sheet.branch_id : null;
    const productType = typeof sheet.product_type_id === "object" ? sheet.product_type_id : null;
    const auditor = sheet.encoder_id;
    const auditorName = auditor && typeof auditor === "object"
        ? [auditor.user_fname, auditor.user_lname].filter(Boolean).join(" ")
        : String(auditor ?? "");
    const subtitle = showPhysicalCount
        ? "Official Manufacturing Floor Audit & Physical Count Verification Document"
        : "Official Manufacturing Floor Blind Audit & Batch Verification Document";

    return {
        number: sheet.pi_no || `PI-${sheet.physical_inventory_id}`,
        status: sheet.status || "DRAFT",
        subtitle: targetLot != null ? `${subtitle} [LOT FILTERED]` : subtitle,
        printedAt: formatTimestamp(printedAt),
        showPhysicalCount,
        metadata: [
            { label: "Branch / Facility", value: branch?.branch_name || branch?.branchName || "N/A" },
            { label: "Stock Classification", value: `${sheet.stock_type || "REGULAR"} STOCK` },
            { label: "Product Type Scope", value: productType?.name || productType?.type_name || (sheet.product_type_id == null ? "All Product Types" : "N/A") },
            { label: "Auditor In-Charge", value: auditorName || "N/A" },
            { label: "Start Timestamp", value: formatTimestamp(sheet.starting_date) },
            { label: "Cut-Off Benchmark", value: stockCutoff ? `${stockCutoff} PHT` : formatTimestamp(sheet.cutoff_date) },
        ],
        rows: countSheetRows(sheet.details ?? [], options),
    };
}
