import { jsPDF } from "jspdf";
import { MmPhysicalInventorySheet, MmPhysicalInventoryDetail } from "../types";
import { formatQty } from "./number-format";

function formatDate(dateStr?: string | null): string {
    if (!dateStr) return "N/A";
    const str = String(dateStr).trim();
    if (str.includes("T")) {
        const parts = str.split("T");
        return `${parts[0]} ${parts[1].slice(0, 5)}`;
    }
    return str;
}

interface GroupedBatch {
    batchNo: string;
    mfgDate: string;
    expDate: string;
    items: MmPhysicalInventoryDetail[];
}

interface GroupedLot {
    lotName: string;
    batches: GroupedBatch[];
}

function groupDetailsByLotAndBatch(details: MmPhysicalInventoryDetail[]): GroupedLot[] {
    const lotMap = new Map<string, Map<string, { mfgDate: string; expDate: string; items: MmPhysicalInventoryDetail[] }>>();

    for (const item of details) {
        const lObj = typeof item.lot_id === "object" && item.lot_id !== null ? item.lot_id : null;
        const lotName = lObj?.lot_name || (item as unknown as { lot_name?: string }).lot_name || "Main Storage / Unassigned Lot";

        const bObj = typeof item.inventory_lot_id === "object" && item.inventory_lot_id !== null ? item.inventory_lot_id : null;
        const batchNo = item.batch_no || bObj?.batch_no || "General Stock / No Batch";

        const mfgDateRaw = item.manufacturing_date || bObj?.manufacturing_date || "—";
        const expDateRaw = item.expiration_date || (item as unknown as { expiry_date?: string }).expiry_date || bObj?.expiry_date || bObj?.expiration_date || "—";

        const mfgDate = mfgDateRaw !== "—" ? mfgDateRaw.split("T")[0] : "—";
        const expDate = expDateRaw !== "—" ? expDateRaw.split("T")[0] : "—";

        if (!lotMap.has(lotName)) {
            lotMap.set(lotName, new Map());
        }
        const batchMap = lotMap.get(lotName)!;

        if (!batchMap.has(batchNo)) {
            batchMap.set(batchNo, { mfgDate, expDate, items: [] });
        }
        batchMap.get(batchNo)!.items.push(item);
    }

    const result: GroupedLot[] = [];
    lotMap.forEach((batchMap, lotName) => {
        const batches: GroupedBatch[] = [];
        batchMap.forEach((batchData, batchNo) => {
            batches.push({
                batchNo,
                mfgDate: batchData.mfgDate,
                expDate: batchData.expDate,
                items: batchData.items,
            });
        });
        result.push({ lotName, batches });
    });

    return result;
}

export interface PDFExportOptions {
    showPhysicalCount?: boolean;
    targetLot?: number | string | null;
}

function matchesLot(item: MmPhysicalInventoryDetail, targetLot: number | string): boolean {
    const lObj = typeof item.lot_id === "object" && item.lot_id !== null ? (item.lot_id as { lot_id?: number; id?: number; lot_name?: string }) : null;
    const lId = lObj?.lot_id || lObj?.id || (typeof item.lot_id === "number" ? item.lot_id : null);
    const lName = lObj?.lot_name || (item as unknown as { lot_name?: string }).lot_name || "";

    if (typeof targetLot === "number") {
        return lId === targetLot;
    }
    if (typeof targetLot === "string") {
        return lName.toLowerCase() === targetLot.toLowerCase();
    }
    return true;
}

export function generateManufacturingCountSheetPDF(
    sheet: MmPhysicalInventorySheet,
    options?: PDFExportOptions
): jsPDF {
    const showPhysicalCount = options?.showPhysicalCount ?? false;
    const targetLot = options?.targetLot ?? null;

    // 1. PORTRAIT Orientation & Paper-Saving Compact Dimensions
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
    const margin = 10; // 10mm compact margins

    // Top Header (Pure Neutral Black & Gray Styling)
    doc.setTextColor(0, 0, 0); // Pure Black
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81); // gray-700
    doc.text("MANUFACTURING PHYSICAL INVENTORY AUDIT COUNT SHEET", margin, 14);

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128); // gray-500
    let subtitle = showPhysicalCount
        ? "Official Manufacturing Floor Audit & Physical Count Verification Document"
        : "Official Manufacturing Floor Blind Audit & Batch Verification Document";
    if (targetLot) {
        subtitle += ` [LOT FILTERED]`;
    }
    doc.text(subtitle, margin, 18);

    // Right-side Sheet Metadata
    const piNo = sheet.pi_no || `PI-${sheet.physical_inventory_id}`;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`#${piNo}`, pageWidth - margin, 9, { align: "right" });

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(75, 85, 99); // gray-600
    doc.text(`Status: ${sheet.status || "DRAFT"}`, pageWidth - margin, 13.5, { align: "right" });

    doc.setFontSize(6.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`Printed: ${formatDate(new Date().toISOString())}`, pageWidth - margin, 17.5, { align: "right" });

    // Header Separator line
    doc.setDrawColor(229, 231, 235); // gray-200
    doc.setLineWidth(0.3);
    doc.line(margin, 20, pageWidth - margin, 20);

    let currentY = 22;

    // Extract facility / branch name
    const branchName = typeof sheet.branch_id === "object" && sheet.branch_id !== null
        ? (sheet.branch_id.branch_name || sheet.branch_id.branchName || "Main Branch")
        : "Main Branch";

    // Extract product type name
    let productTypeName = "Finished Goods";
    if (sheet.product_type_id) {
        if (typeof sheet.product_type_id === "object" && sheet.product_type_id !== null) {
            productTypeName = (sheet.product_type_id as { name?: string; type_name?: string }).name ||
                (sheet.product_type_id as { name?: string; type_name?: string }).type_name || "Finished Goods";
        }
    }

    // Extract encoder name
    let encoderName = "Plant Auditor";
    if (sheet.encoder_id) {
        if (typeof sheet.encoder_id === "object" && sheet.encoder_id !== null) {
            const fname = sheet.encoder_id.user_fname || "";
            const lname = sheet.encoder_id.user_lname || "";
            encoderName = `${fname} ${lname}`.trim() || "Plant Auditor";
        } else {
            encoderName = String(sheet.encoder_id);
        }
    }

    // 2. Compact Neutral Metadata Box (16mm Height)
    doc.setFillColor(249, 250, 251); // gray-50 neutral
    doc.setDrawColor(229, 231, 235); // gray-200 border
    doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 16, 1.5, 1.5, "FD");

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");

    const colWidth = (pageWidth - (margin * 2) - 6) / 3;

    // Col 1
    doc.setTextColor(107, 114, 128); // gray-500
    doc.text("BRANCH / FACILITY", margin + 4, currentY + 4.5);
    doc.setTextColor(0, 0, 0); // Pure Black
    doc.text(String(branchName), margin + 4, currentY + 8.5);

    doc.setTextColor(107, 114, 128);
    doc.text("AUDITOR IN-CHARGE", margin + 4, currentY + 12);
    doc.setTextColor(0, 0, 0);
    doc.text(String(encoderName), margin + 4, currentY + 15);

    // Col 2
    const col2X = margin + colWidth + 3;
    doc.setTextColor(107, 114, 128);
    doc.text("STOCK CLASSIFICATION", col2X, currentY + 4.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`${sheet.stock_type || "REGULAR"} STOCK`, col2X, currentY + 8.5);

    doc.setTextColor(107, 114, 128);
    doc.text("START TIMESTAMP", col2X, currentY + 12);
    doc.setTextColor(0, 0, 0);
    doc.text(formatDate(sheet.starting_date), col2X, currentY + 15);

    // Col 3
    const col3X = margin + (colWidth * 2) + 3;
    doc.setTextColor(107, 114, 128);
    doc.text("PRODUCT TYPE SCOPE", col3X, currentY + 4.5);
    doc.setTextColor(0, 0, 0);
    doc.text(String(productTypeName), col3X, currentY + 8.5);

    doc.setTextColor(107, 114, 128);
    doc.text("CUT-OFF BENCHMARK", col3X, currentY + 12);
    doc.setTextColor(0, 0, 0);
    doc.text(formatDate(sheet.cutoff_date), col3X, currentY + 15);

    currentY += 19;

    // 3. Two-column compact grouped lot and batch panels.
    const details: MmPhysicalInventoryDetail[] = sheet.details || [];
    const filteredDetails = targetLot ? details.filter((item) => matchesLot(item, targetLot)) : details;
    const groupedLots = groupDetailsByLotAndBatch(filteredDetails);
    const panelGap = 5;
    const panelWidth = (pageWidth - (margin * 2) - panelGap) / 2;
    const countWidth = 27;
    const infoWidth = panelWidth - countWidth - 8;
    const contentBottom = pageHeight - margin - 8;
    let groupY = currentY;

    type CountEntry = {
        item: MmPhysicalInventoryDetail;
        nameLines: string[];
        codeLines: string[];
        detailLines: string[];
        rowHeight: number;
    };
    type CountGroup = {
        lotName: string;
        batchNo: string;
        mfgDate: string;
        expDate: string;
        items: CountEntry[];
    };

    let itemSequence = 1;
    const countGroups: CountGroup[] = groupedLots.flatMap((lotGroup) =>
        lotGroup.batches.map((batchGroup) => ({
            lotName: lotGroup.lotName,
            batchNo: batchGroup.batchNo,
            mfgDate: batchGroup.mfgDate,
            expDate: batchGroup.expDate,
            items: batchGroup.items.map((item) => {
                const pObj = typeof item.product_id === "object" && item.product_id !== null ? item.product_id : null;
                const pName = pObj?.product_name || (item as unknown as { product_name?: string }).product_name || "Product";
                const pCode = pObj?.product_code || (item as unknown as { product_code?: string }).product_code || "";
                const uObj = typeof item.unit_id === "object" && item.unit_id !== null ? item.unit_id : null;
                const uom = uObj?.unit_shortcut || uObj?.unit_name || (item as unknown as { uom?: string }).uom || "PCS";
                const sequence = itemSequence++;

                doc.setFont("helvetica", "bold");
                doc.setFontSize(6.2);
                const nameLines = doc.splitTextToSize(`${sequence}. ${pName}`, infoWidth);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(5.2);
                const codeLines = pCode ? doc.splitTextToSize(`CODE: ${pCode}`, infoWidth) : [];
                doc.setFontSize(5.4);
                const detailLines = doc.splitTextToSize(`UOM: ${uom.toUpperCase()} | SYS: ${formatQty(item.system_count)}`, infoWidth);
                const rowHeight = Math.max(11, 2 + (nameLines.length * 2.8) + (codeLines.length * 2.3) + (detailLines.length * 2.3));

                return { item, nameLines, codeLines, detailLines, rowHeight };
            }),
        }))
    );

    const getGroupHeader = (group: CountGroup) => {
        const textWidth = panelWidth - 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.1);
        const lotLines = doc.splitTextToSize(`STORAGE LOT: ${group.lotName}`, textWidth);
        const batchLines = doc.splitTextToSize(`BATCH: ${group.batchNo}`, textWidth);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.4);
        const dateLines = doc.splitTextToSize(`MFG: ${group.mfgDate} | EXP: ${group.expDate} | ${group.items.length} SKU(s)`, textWidth);
        const height = 2 + (lotLines.length * 2.7) + (batchLines.length * 2.7) + (dateLines.length * 2.4) + 1;
        return { lotLines, batchLines, dateLines, height };
    };

    const drawGroupSegment = (group: CountGroup, itemStart: number, x: number, y: number, maxY: number) => {
        const header = getGroupHeader(group);
        let usedHeight = header.height;
        const segmentItems: CountEntry[] = [];
        for (let index = itemStart; index < group.items.length; index++) {
            const entry = group.items[index];
            if (y + usedHeight + entry.rowHeight > maxY) break;
            segmentItems.push(entry);
            usedHeight += entry.rowHeight;
        }

        if (segmentItems.length === 0) {
            return { nextItem: itemStart, bottomY: y, progressed: false };
        }

        doc.setFillColor(250, 250, 250);
        doc.rect(x, y, panelWidth, header.height, "F");
        let headerY = y + 3.2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.1);
        doc.setTextColor(31, 41, 55);
        doc.text(header.lotLines, x + 2.5, headerY);
        headerY += header.lotLines.length * 2.7;
        doc.text(header.batchLines, x + 2.5, headerY);
        headerY += header.batchLines.length * 2.7;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.4);
        doc.setTextColor(75, 85, 99);
        doc.text(header.dateLines, x + 2.5, headerY);
        doc.setDrawColor(209, 213, 219);
        doc.setLineWidth(0.15);
        doc.line(x, y + header.height, x + panelWidth, y + header.height);

        let itemY = y + header.height;
        for (const entry of segmentItems) {
            let textY = itemY + 3;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(6.2);
            doc.setTextColor(0, 0, 0);
            doc.text(entry.nameLines, x + 2.5, textY);
            textY += entry.nameLines.length * 2.8;

            if (entry.codeLines.length > 0) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(5.2);
                doc.setTextColor(107, 114, 128);
                doc.text(entry.codeLines, x + 2.5, textY);
                textY += entry.codeLines.length * 2.3;
            }

            doc.setFont("helvetica", "normal");
            doc.setFontSize(5.4);
            doc.setTextColor(75, 85, 99);
            doc.text(entry.detailLines, x + 2.5, textY);

            const countX = x + panelWidth - countWidth - 1.5;
            doc.setDrawColor(209, 213, 219);
            doc.line(countX - 1.5, itemY + 1, countX - 1.5, itemY + entry.rowHeight - 1);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(5);
            doc.setTextColor(107, 114, 128);
            doc.text(showPhysicalCount ? "RECORDED" : "PHYSICAL COUNT", countX, itemY + 3.2);

            if (showPhysicalCount && entry.item.physical_count !== null && entry.item.physical_count !== undefined) {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(6.2);
                doc.setTextColor(0, 0, 0);
                doc.text(formatQty(entry.item.physical_count), x + panelWidth - 2, itemY + 7.2, { align: "right" });
            } else if (!showPhysicalCount) {
                doc.setDrawColor(107, 114, 128);
                doc.line(countX, itemY + entry.rowHeight - 2.5, x + panelWidth - 2, itemY + entry.rowHeight - 2.5);
            } else {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(6);
                doc.setTextColor(156, 163, 175);
                doc.text("-", countX, itemY + 7.2);
            }

            itemY += entry.rowHeight;
            doc.setDrawColor(229, 231, 235);
            doc.line(x, itemY, x + panelWidth, itemY);
        }

        const bottomY = y + usedHeight;
        doc.setDrawColor(209, 213, 219);
        doc.setLineWidth(0.2);
        doc.rect(x, y, panelWidth, usedHeight, "S");
        return { nextItem: itemStart + segmentItems.length, bottomY, progressed: true };
    };

    for (let groupIndex = 0; groupIndex < countGroups.length; groupIndex += 2) {
        const leftGroup = countGroups[groupIndex];
        const rightGroup = countGroups[groupIndex + 1];
        let leftItem = 0;
        let rightItem = 0;
        let pairComplete = false;

        while (!pairComplete) {
            const leftResult = leftItem < leftGroup.items.length
                ? drawGroupSegment(leftGroup, leftItem, margin, groupY, contentBottom)
                : { nextItem: leftItem, bottomY: groupY, progressed: false };
            const rightResult = rightGroup && rightItem < rightGroup.items.length
                ? drawGroupSegment(rightGroup, rightItem, margin + panelWidth + panelGap, groupY, contentBottom)
                : { nextItem: rightItem, bottomY: groupY, progressed: false };

            if (!leftResult.progressed && !rightResult.progressed) {
                doc.addPage();
                groupY = margin;
                continue;
            }

            leftItem = leftResult.nextItem;
            rightItem = rightResult.nextItem;
            const leftDone = leftItem >= leftGroup.items.length;
            const rightDone = !rightGroup || rightItem >= rightGroup.items.length;
            pairComplete = leftDone && rightDone;

            if (pairComplete) {
                groupY = Math.max(leftResult.bottomY, rightResult.bottomY) + 3;
            } else {
                doc.addPage();
                groupY = margin;
            }
        }
    }
    // 4. Compact Neutral Sign-Off Authorization Block
    const finalY = groupY + 3;

    let signY = finalY;
    if (signY > pageHeight - 24) {
        doc.addPage();
        signY = 18;
    }

    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, signY - 2, pageWidth - margin, signY - 2);

    const signColW = (pageWidth - (margin * 2) - 12) / 3;

    // Sign Column 1: Auditor
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81); // gray-700
    doc.text("1. COUNTED & AUDITED BY:", margin, signY + 3);
    doc.setDrawColor(0, 0, 0); // Pure Black Line
    doc.line(margin, signY + 12, margin + signColW, signY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(107, 114, 128);
    doc.text("Plant Floor Auditor Signature & Date", margin, signY + 15);

    // Sign Column 2: Supervisor
    const col2SignX = margin + signColW + 6;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text("2. VERIFIED & CHECKED BY:", col2SignX, signY + 3);
    doc.setDrawColor(0, 0, 0);
    doc.line(col2SignX, signY + 12, col2SignX + signColW, signY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(107, 114, 128);
    doc.text("Warehouse Supervisor Signature & Date", col2SignX, signY + 15);

    // Sign Column 3: Operations Manager
    const col3SignX = col2SignX + signColW + 6;
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(55, 65, 81);
    doc.text("3. APPROVED BY:", col3SignX, signY + 3);
    doc.setDrawColor(0, 0, 0);
    doc.line(col3SignX, signY + 12, col3SignX + signColW, signY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(107, 114, 128);
    doc.text("Plant Operations Manager Signature & Date", col3SignX, signY + 15);

    // Page Numbers Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(6.5);
        doc.setTextColor(156, 163, 175);
        doc.text(
            `Mama Pinas Manufacturing • Manufacturing Physical Inventory Count Sheet #${piNo} • Page ${i} of ${totalPages}`,
            pageWidth / 2,
            pageHeight - 4,
            { align: "center" }
        );
    }

    return doc;
}

export function downloadManufacturingCountSheetPDF(sheet: MmPhysicalInventorySheet, options?: PDFExportOptions) {
    const doc = generateManufacturingCountSheetPDF(sheet, options);
    const piNo = sheet.pi_no || `PI-${sheet.physical_inventory_id}`;
    const modeSuffix = options?.showPhysicalCount ? "WithPhysicalCount" : "BlindCount";
    doc.save(`Mfg_CountSheet_${piNo}_${modeSuffix}.pdf`);
}
