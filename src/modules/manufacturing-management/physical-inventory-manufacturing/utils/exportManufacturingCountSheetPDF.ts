import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { MmPhysicalInventorySheet } from "../types";
import {
    buildManufacturingCountSheet,
    COUNT_SHEET_COLUMNS,
    COUNT_SHEET_FONT_PT,
    COUNT_SHEET_MARGIN_MM,
    COUNT_SHEET_SIGNATURE_GAP_MM,
    COUNT_SHEET_SIGNATURES,
    COUNT_SHEET_SIGNOFF_OFFSET_MM,
    COUNT_SHEET_SIGNING_SPACE_MM,
    COUNT_SHEET_TABLE_TITLE,
    COUNT_SHEET_TITLE,
    type CountSheetPrintOptions,
} from "./manufacturing-count-sheet";

export type PDFExportOptions = CountSheetPrintOptions;

function drawText(
    doc: jsPDF,
    text: string,
    x: number,
    y: number,
    width: number,
    size: number,
    bold = false,
    align: "left" | "right" = "left",
): number {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines: string[] = doc.splitTextToSize(text, width);
    const lineHeightFactor = 1.25;
    doc.text(lines, x, y, { align, lineHeightFactor });
    return y + lines.length * size * lineHeightFactor / doc.internal.scaleFactor;
}

export function generateManufacturingCountSheetPDF(
    sheet: MmPhysicalInventorySheet,
    options?: PDFExportOptions,
): jsPDF {
    const data = buildManufacturingCountSheet(sheet, options);
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = COUNT_SHEET_MARGIN_MM;
    const contentWidth = pageWidth - 2 * margin;
    const right = pageWidth - margin;
    const fontSize = COUNT_SHEET_FONT_PT;

    doc.setTextColor(25);
    const stampWidth = 46;
    const titleWidth = contentWidth - stampWidth - 4;
    const titleBottom = drawText(doc, COUNT_SHEET_TITLE, margin, margin + 6, titleWidth, fontSize.title, true);
    const subtitleBottom = drawText(doc, data.subtitle, margin, titleBottom, titleWidth, fontSize.small);

    let stampY = drawText(doc, `#${data.number}`, right, margin + 3, stampWidth, fontSize.documentNumber, true, "right");
    stampY = drawText(doc, `Status: ${data.status}`, right, stampY, stampWidth, fontSize.small, false, "right");
    stampY = drawText(doc, `Printed: ${data.printedAt}`, right, stampY, stampWidth, fontSize.small, false, "right");

    const metadataTop = Math.max(subtitleBottom, stampY) + 2;
    const columnWidth = (contentWidth - 8) / 3;
    let metadataY = metadataTop + 4.5;
    for (let index = 0; index < data.metadata.length; index += 3) {
        let rowBottom = metadataY;
        data.metadata.slice(index, index + 3).forEach(({ label, value }, column) => {
            const x = margin + 4 + column * columnWidth;
            const valueY = drawText(doc, label.toUpperCase(), x, metadataY, columnWidth - 3, fontSize.fieldLabel, true);
            rowBottom = Math.max(rowBottom, drawText(doc, value, x, valueY, columnWidth - 3, fontSize.body));
        });
        metadataY = rowBottom + 1.5;
    }
    doc.setDrawColor(105);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, metadataTop, contentWidth, metadataY - metadataTop, 1.5, 1.5);

    const tableTitleY = metadataY + 3;
    doc.setFillColor(229, 229, 229);
    doc.rect(margin, tableTitleY, contentWidth, 6, "FD");
    drawText(doc, COUNT_SHEET_TABLE_TITLE, margin + 2, tableTitleY + 4, contentWidth - 4, fontSize.body, true);

    const tableStart = tableTitleY + 8;
    const countColumn = COUNT_SHEET_COLUMNS.length - 1;
    const signatures = COUNT_SHEET_SIGNATURES.length;
    const signatureWidth = (contentWidth - (signatures - 1) * COUNT_SHEET_SIGNATURE_GAP_MM) / signatures;
    autoTable(doc, {
        startY: tableStart,
        margin: { top: margin, left: margin, right: margin, bottom: margin },
        head: [COUNT_SHEET_COLUMNS.map(column => column.label)],
        body: data.rows.length ? data.rows : [[{
            content: "No inventory details for this count sheet.",
            colSpan: COUNT_SHEET_COLUMNS.length,
            styles: { halign: "center" },
        }]],
        // AutoTable reserves this space when deciding where the last count row fits.
        foot: [[{ content: "", colSpan: COUNT_SHEET_COLUMNS.length }]],
        theme: "grid",
        showHead: "everyPage",
        showFoot: "lastPage",
        rowPageBreak: "avoid",
        styles: {
            font: "helvetica",
            fontSize: fontSize.body,
            textColor: 25,
            lineColor: 105,
            lineWidth: 0.25,
            cellPadding: 1.5,
            minCellHeight: 9,
            valign: "middle",
            overflow: "linebreak",
        },
        headStyles: { fillColor: 243, fontSize: fontSize.small, fontStyle: "bold", halign: "center", minCellHeight: 6 },
        footStyles: { fillColor: false, lineWidth: 0, minCellHeight: 26 },
        columnStyles: Object.fromEntries(COUNT_SHEET_COLUMNS.map(({ widthPercent, align }, index) => [
            index, { cellWidth: contentWidth * widthPercent / 100, halign: align },
        ])),
        didDrawCell: ({ section, column, cell }) => {
            if (section === "foot") {
                const signatureY = doc.getNumberOfPages() === 1
                    ? Math.max(cell.y + 7, margin + COUNT_SHEET_SIGNOFF_OFFSET_MM + 4)
                    : cell.y + 7;
                COUNT_SHEET_SIGNATURES.forEach(({ label, caption }, index) => {
                    const x = margin + index * (signatureWidth + COUNT_SHEET_SIGNATURE_GAP_MM);
                    doc.setTextColor(25);
                    const labelBottom = drawText(doc, label, x, signatureY, signatureWidth, fontSize.body, true);
                    const lineY = labelBottom + COUNT_SHEET_SIGNING_SPACE_MM;
                    doc.setDrawColor(65);
                    doc.setLineWidth(0.25);
                    doc.line(x, lineY, x + signatureWidth, lineY);
                    drawText(doc, caption, x, lineY + 3.5, signatureWidth, fontSize.small);
                });
                return;
            }
            if (section !== "body" || column.index !== countColumn || data.showPhysicalCount) return;
            const y = cell.y + cell.height - 2;
            doc.setDrawColor(65);
            doc.setLineWidth(0.25);
            doc.line(cell.x + 2, y, cell.x + cell.width - 2, y);
        },
    });

    const totalPages = doc.getNumberOfPages();
    if (totalPages > 1) {
        for (let page = 1; page <= totalPages; page++) {
            doc.setPage(page);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(fontSize.small);
            doc.text(`#${data.number}  |  Page ${page} of ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: "center" });
        }
    }

    return doc;
}

export function downloadManufacturingCountSheetPDF(sheet: MmPhysicalInventorySheet, options?: PDFExportOptions) {
    const doc = generateManufacturingCountSheetPDF(sheet, options);
    const piNo = sheet.pi_no || `PI-${sheet.physical_inventory_id}`;
    const modeSuffix = options?.showPhysicalCount ? "WithPhysicalCount" : "BlindCount";
    doc.save(`Mfg_CountSheet_${piNo}_${modeSuffix}.pdf`);
}
