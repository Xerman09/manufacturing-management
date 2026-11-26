import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PriceListItem } from "../types";
import { PdfEngine } from "@/components/pdf-layout-design/PdfEngine";
import { fetchProvider } from "../providers/fetchProvider";
import { formatInZone, nowUtcSql } from "@/lib/datetime";

interface GenerateParams {
    items: PriceListItem[];
    templateName: string;
    salesmanName: string;
    salesmanCode: string;
    supplierName?: string;
    productTypeName?: string;
    showBarcode?: boolean;
    timeZone?: string | null;
}

interface VariantGroup {
    categoryCode: string;
    groupName: string;
    variants: PriceListItem[];
}

function formatCurrency(val: number | null): string {
    if (val === null || val === undefined) return "-";
    return val.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function normalizeUnitKey(unit?: string): string {
    const trimmed = String(unit || "").trim();
    return trimmed ? trimmed.toLowerCase() : "-";
}

function formatUnitLabel(unit?: string): string {
    const trimmed = String(unit || "").trim();
    return trimmed || "-";
}

export async function generatePriceListPDF({
    items,
    templateName,
    salesmanName,
    salesmanCode,
    supplierName,
    productTypeName,
    showBarcode = false,
    timeZone = null,
}: GenerateParams): Promise<jsPDF> {
    // 1. Fetch Company Data (strict: throw on HTTP error)
    const compRes = await fetch("/api/pdf/company", { cache: "no-store" });
    if (!compRes.ok) {
        throw new Error(`Failed to fetch company profile (HTTP ${compRes.status})`);
    }
    const compResult = await compRes.json();
    const companyData =
        compResult.data?.[0] || (Array.isArray(compResult.data) ? null : compResult.data);

    // 2. Fetch Category Names (strict: throw on HTTP error)
    const uniqueCategories = Array.from(new Set(items.map((i) => i.categoryCode).filter(Boolean)));
    const categoryMap = new Map<string, string>();

    await Promise.all(
        uniqueCategories.map(async (catCode) => {
            const data = await fetchProvider.getCategory(catCode);
            categoryMap.set(catCode, data.category_name || "-");
        })
    );

    const generatedUtc = nowUtcSql();
    const formattedDate = generatedUtc ? formatInZone(generatedUtc, timeZone) : "-";

    // 3. Collect distinct unit types & group parent + child unit variants
    const unitOrder: Array<{ key: string; label: string }> = [];
    const seenUnitKeys = new Set<string>();

    for (const item of items) {
        const key = normalizeUnitKey(item.unit);
        if (!seenUnitKeys.has(key)) {
            seenUnitKeys.add(key);
            unitOrder.push({ key, label: formatUnitLabel(item.unit) });
        }
    }

    const groupsMap = new Map<string, VariantGroup>();
    for (const item of items) {
        const groupId = item.parentId ?? item.productId;
        const groupKey =
            groupId !== undefined
                ? `id:${groupId}`
                : `name:${item.groupName || item.productName}`;

        if (!groupsMap.has(groupKey)) {
            groupsMap.set(groupKey, {
                categoryCode: item.categoryCode,
                groupName: item.groupName || item.productName,
                variants: [],
            });
        }
        groupsMap.get(groupKey)!.variants.push(item);
    }

    const groups = Array.from(groupsMap.values());
    const useMultiRowMode = unitOrder.length > 3 || unitOrder.length === 0;

    // 4. Generate with PdfEngine
    return await PdfEngine.generateWithFrame(templateName, companyData, (doc, startY, config) => {
        if (!config.pageNumber) {
            config.pageNumber = {
                show: true,
                position: "bottom-right",
                fontSize: 8,
                fontFamily: "helvetica",
                color: "#64748b",
                format: "Page {pageNumber} of {totalPages}",
                marginY: 12,
                marginX: 10,
            };
        } else {
            config.pageNumber.show = true;
            config.pageNumber.marginY = 12;
            if (!config.pageNumber.fontFamily) {
                config.pageNumber.fontFamily = "helvetica";
            }
        }

        const margins = config.margins || { top: 10, bottom: 25, left: 10, right: 10 };
        const pageWidth = doc.internal.pageSize.getWidth();
        const contentWidth = pageWidth - margins.left - margins.right;

        // Header Box
        const boxHeight = 15;
        const boxY = startY + 5;

        doc.setFillColor(255, 230, 200);
        doc.rect(margins.left, boxY, contentWidth, boxHeight, "F");

        const headerBannerTitle = supplierName
            ? "GROCERY PRODUCTS (GP)"
            : (productTypeName || "IN-HOUSE PRODUCTION").toUpperCase();

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(headerBannerTitle, pageWidth / 2, boxY + 6, { align: "center" });
        doc.text("OFFICIAL PRICELIST", pageWidth / 2, boxY + 11, { align: "center" });

        // Metadata
        const metaY = boxY + boxHeight + 5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);

        const metaLines: string[] = [];
        if (supplierName) {
            metaLines.push(`Supplier: ${supplierName}`);
        }
        if (productTypeName) {
            metaLines.push(`Product Type: ${productTypeName}`);
        }
        metaLines.push(`Salesman: ${salesmanName}`);
        metaLines.push(`Salesman Code: ${salesmanCode}`);

        metaLines.forEach((line, idx) => {
            doc.text(line, margins.left, metaY + idx * 4);
        });
        doc.text(`Generated at: ${formattedDate}`, pageWidth - margins.right, metaY, {
            align: "right",
        });

        const tableStartY = metaY + metaLines.length * 4 + 3;

        let head: Array<Array<Record<string, unknown>>> = [];
        let tableBody: Array<Array<unknown>> = [];
        const colStyles: Record<number, Record<string, unknown>> = {};
        let priceColStartIndex = 0;

        if (!useMultiRowMode) {
            // Mode A: Up to 3 distinct units side-by-side dynamically
            let lastCategory = "";
            tableBody = groups.map((group) => {
                const isFirstInGroup = group.categoryCode !== lastCategory;
                lastCategory = group.categoryCode;
                const categoryName = categoryMap.get(group.categoryCode) || "-";

                const codes = Array.from(
                    new Set(group.variants.map((v) => v.productCode || "").filter(Boolean))
                );
                const barcodes = Array.from(
                    new Set(
                        group.variants
                            .map((v) => v.barcode || v.barcodeNo || "")
                            .filter(Boolean)
                    )
                );
                const pckgList = Array.from(new Set(group.variants.map((v) => v.pckg || 1)));

                const priceByUnitKey = new Map<string, number | null>();
                for (const v of group.variants) {
                    priceByUnitKey.set(normalizeUnitKey(v.unit), v.price);
                }

                const row: Array<unknown> = [];
                if (showBarcode) {
                    row.push(barcodes.join("\n") || "");
                }
                row.push(
                    isFirstInGroup ? categoryName : "",
                    group.groupName,
                    codes.join("\n") || "-",
                    pckgList.join("/")
                );
                for (const u of unitOrder) {
                    const priceVal = priceByUnitKey.has(u.key)
                        ? (priceByUnitKey.get(u.key) ?? null)
                        : null;
                    row.push(formatCurrency(priceVal));
                }
                return row;
            });

            const head1: Array<Record<string, unknown>> = [];
            if (showBarcode) {
                head1.push({
                    content: "BARCODE",
                    rowSpan: 2,
                    styles: { valign: "middle", halign: "center" },
                });
            }
            head1.push(
                { content: "CATEGORY", rowSpan: 2, styles: { valign: "middle" } },
                {
                    content: "PRODUCT DESCRIPTION",
                    rowSpan: 2,
                    styles: { valign: "middle", halign: "center" },
                },
                { content: "FG CODE", rowSpan: 2, styles: { valign: "middle", halign: "center" } },
                { content: "PCKG", rowSpan: 2, styles: { valign: "middle", halign: "center" } },
                { content: "PRICE", colSpan: unitOrder.length, styles: { halign: "center" } }
            );

            const head2 = unitOrder.map((u) => ({
                content: u.label,
                styles: { halign: "center" as const },
            }));

            head = [head1, head2];

            let colIdx = 0;
            if (showBarcode) {
                colStyles[colIdx++] = { cellWidth: 23, halign: "center", fontSize: 6.5 };
            }
            colStyles[colIdx++] = { cellWidth: 22, fontSize: 6.5 };
            colStyles[colIdx++] = { fontSize: 7 };
            colStyles[colIdx++] = { cellWidth: 30, halign: "center", fontSize: 6.5 };
            colStyles[colIdx++] = { cellWidth: 11, halign: "center", fontSize: 6.5 };
            priceColStartIndex = colIdx;
            for (let i = 0; i < unitOrder.length; i++) {
                colStyles[colIdx++] = { cellWidth: 20, halign: "right", fontSize: 7 };
            }
        } else {
            // Mode B: Multi-row per product variant (supports unlimited child unit types cleanly)
            let lastCategory = "";
            for (const group of groups) {
                const isFirstInCategory = group.categoryCode !== lastCategory;
                lastCategory = group.categoryCode;
                const categoryName = categoryMap.get(group.categoryCode) || "-";
                const variantCount = group.variants.length;

                group.variants.forEach((variant, idx) => {
                    const row: Array<unknown> = [];
                    if (showBarcode) {
                        row.push(variant.barcode || variant.barcodeNo || "");
                    }
                    if (idx === 0) {
                        row.push({
                            content: isFirstInCategory ? categoryName : "",
                            rowSpan: variantCount,
                            styles: { valign: "middle" },
                        });
                        row.push({
                            content: group.groupName,
                            rowSpan: variantCount,
                            styles: { valign: "middle" },
                        });
                    }
                    row.push(
                        variant.productCode || "-",
                        formatUnitLabel(variant.unit),
                        variant.pckg || 1,
                        formatCurrency(variant.price)
                    );
                    tableBody.push(row);
                });
            }

            const head1: Array<Record<string, unknown>> = [];
            if (showBarcode) {
                head1.push({
                    content: "BARCODE",
                    styles: { valign: "middle", halign: "center" },
                });
            }
            head1.push(
                { content: "CATEGORY", styles: { valign: "middle" } },
                { content: "PRODUCT DESCRIPTION", styles: { valign: "middle", halign: "center" } },
                { content: "FG CODE", styles: { valign: "middle", halign: "center" } },
                { content: "UNIT", styles: { valign: "middle", halign: "center" } },
                { content: "PCKG", styles: { valign: "middle", halign: "center" } },
                { content: "PRICE", styles: { valign: "middle", halign: "right" } }
            );
            head = [head1];

            let colIdx = 0;
            if (showBarcode) {
                colStyles[colIdx++] = { cellWidth: 23, halign: "center", fontSize: 6.5 };
            }
            colStyles[colIdx++] = { cellWidth: 22, fontSize: 6.5 };
            colStyles[colIdx++] = { fontSize: 7 };
            colStyles[colIdx++] = { cellWidth: 32, halign: "center", fontSize: 6.5 };
            priceColStartIndex = colIdx;
            colStyles[colIdx++] = { cellWidth: 24, halign: "center", fontSize: 7 };
            colStyles[colIdx++] = { cellWidth: 12, halign: "center", fontSize: 7 };
            colStyles[colIdx++] = { cellWidth: 22, halign: "right", fontSize: 7 };
        }

        autoTable(doc, {
            startY: tableStartY,
            margin: { ...margins, top: 10, bottom: 25 },
            head,
            body: tableBody as never,
            theme: "grid",
            headStyles: {
                fillColor: [10, 48, 93],
                textColor: 255,
                fontSize: 8,
                fontStyle: "bold",
                lineWidth: 0.1,
                lineColor: [0, 0, 0],
            },
            columnStyles: colStyles,
            styles: {
                lineColor: [0, 0, 0],
                lineWidth: 0.1,
                valign: "middle",
                textColor: [0, 0, 0],
                cellPadding: { top: 0.6, bottom: 0.6, left: 0.8, right: 0.8 },
                minCellHeight: 4,
            },
            didParseCell: (data) => {
                if (!useMultiRowMode && data.section === "head" && data.row.index === 1) {
                    data.cell.styles.fillColor = [230, 235, 245];
                    data.cell.styles.textColor = [0, 0, 0];
                }
            },
            didDrawCell: (data) => {
                if (data.section === "body" && data.column.index === priceColStartIndex) {
                    const tableDoc = data.doc;
                    tableDoc.setDrawColor(0, 0, 0);
                    tableDoc.setLineWidth(0.3);
                    tableDoc.line(
                        data.cell.x,
                        data.cell.y,
                        data.cell.x,
                        data.cell.y + data.cell.height
                    );
                }
            },
        });

        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            const pageHeight = doc.internal.pageSize.getHeight();
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            const footerSourceName = supplierName || productTypeName || "Price List";
            doc.text(`${footerSourceName} - Price List`, margins.left, pageHeight - 12, {
                baseline: "middle",
            });
        }
    });
}
