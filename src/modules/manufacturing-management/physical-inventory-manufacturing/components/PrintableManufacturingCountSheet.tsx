"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Printer, X } from "lucide-react";
import type { CountSheetStockRow, MmPhysicalInventorySheet } from "../types";
import { downloadManufacturingCountSheetPDF } from "../utils/exportManufacturingCountSheetPDF";
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
} from "../utils/manufacturing-count-sheet";

interface PrintableManufacturingCountSheetProps {
    sheet: MmPhysicalInventorySheet;
    additionalRows?: CountSheetStockRow[];
    stockCutoff?: string | null;
    excludedOtherBranchBalanceCount?: number;
    targetLot?: number | string | null;
    onClose: () => void;
}

export default function PrintableManufacturingCountSheet({
    sheet, additionalRows, stockCutoff, excludedOtherBranchBalanceCount = 0, targetLot, onClose,
}: PrintableManufacturingCountSheetProps) {
    const [showPhysicalCount, setShowPhysicalCount] = useState(false);
    const [printedAt] = useState(() => new Date().toISOString());
    const data = useMemo(
        () => buildManufacturingCountSheet(sheet, { additionalRows, stockCutoff, showPhysicalCount, targetLot, printedAt }),
        [sheet, additionalRows, stockCutoff, showPhysicalCount, targetLot, printedAt],
    );

    if (typeof document === "undefined") return null;

    return createPortal(
        <div
            id="printable-countsheet-root"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manufacturing-countsheet-title"
            className="fixed inset-0 z-[9999] flex flex-col items-center overflow-auto bg-background/90 p-4 backdrop-blur-xs"
        >
            <style>{`
                #printable-paper-doc {
                    width: 100%;
                    max-width: 210mm;
                    padding: ${COUNT_SHEET_MARGIN_MM}mm;
                    font: ${COUNT_SHEET_FONT_PT.body}pt/1.25 Arial, Helvetica, sans-serif;
                    overflow-wrap: anywhere;
                }
                #printable-paper-doc header {
                    margin-bottom: 2mm;
                    gap: 4mm;
                }
                #printable-paper-doc header > :first-child {
                    padding-top: 2mm;
                }
                #printable-paper-doc h1 {
                    font-size: ${COUNT_SHEET_FONT_PT.title}pt;
                }
                #printable-paper-doc header p {
                    margin-top: 0.5mm;
                }
                #printable-paper-doc header p,
                #printable-paper-doc .countsheet-reference,
                #printable-paper-doc th,
                #printable-paper-doc footer p {
                    font-size: ${COUNT_SHEET_FONT_PT.small}pt;
                }
                #printable-paper-doc .countsheet-reference {
                    flex: 0 0 24%;
                }
                #printable-paper-doc .countsheet-reference strong {
                    display: block;
                    font-size: ${COUNT_SHEET_FONT_PT.documentNumber}pt;
                }
                #printable-paper-doc dl {
                    margin-bottom: 3mm;
                    gap: 1.5mm 3mm;
                    padding: 2.5mm 4mm;
                }
                #printable-paper-doc dt {
                    font-size: ${COUNT_SHEET_FONT_PT.fieldLabel}pt;
                }
                #printable-paper-doc h2 {
                    margin-bottom: 2mm;
                    padding: 1mm 2mm;
                }
                #printable-paper-doc thead tr {
                    height: 6mm;
                }
                #printable-paper-doc tbody tr {
                    height: 9mm;
                }
                #printable-paper-doc th {
                    padding: 1mm 1.5mm;
                }
                #printable-paper-doc td {
                    padding: 1.5mm;
                }
                #printable-paper-doc footer {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: ${COUNT_SHEET_SIGNATURE_GAP_MM}mm;
                    margin-top: 4mm;
                }
                #printable-paper-doc .countsheet-count-line,
                #printable-paper-doc .countsheet-signature-line {
                    display: block;
                    border-bottom: 0.25mm solid #444;
                }
                #printable-paper-doc .countsheet-count-line {
                    height: 5mm;
                }
                #printable-paper-doc .countsheet-signature-line {
                    margin: ${COUNT_SHEET_SIGNING_SPACE_MM}mm 0 1mm;
                }
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: ${COUNT_SHEET_MARGIN_MM}mm;
                    }
                    html, body {
                        background: white !important;
                        color: black !important;
                        height: auto !important;
                        overflow: visible !important;
                    }
                    body > *:not(#printable-countsheet-root),
                    #printable-countsheet-actions {
                        display: none !important;
                    }
                    #printable-countsheet-root, #printable-paper-doc {
                        position: static !important;
                        display: block !important;
                        width: 100% !important;
                        max-width: none !important;
                        height: auto !important;
                        min-height: 0 !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        border: 0 !important;
                        border-radius: 0 !important;
                        overflow: visible !important;
                        background: white !important;
                        box-shadow: none !important;
                    }
                    #printable-paper-doc {
                        print-color-adjust: exact;
                        -webkit-print-color-adjust: exact;
                    }
                    #printable-paper-doc thead {
                        display: table-header-group;
                    }
                    #printable-paper-doc tr,
                    #printable-paper-doc header,
                    #printable-paper-doc dl,
                    #printable-paper-doc footer {
                        break-inside: avoid;
                    }
                    #printable-paper-doc h2,
                    #printable-paper-doc > div {
                        break-after: avoid;
                    }
                }
            `}</style>

            <div id="printable-countsheet-actions" className="sticky top-0 z-10 mb-3 flex w-full flex-wrap items-center justify-end gap-2">
                <div className="flex items-center rounded-xl border border-border bg-card p-1 shadow-lg">
                    <button
                        type="button"
                        aria-pressed={!showPhysicalCount}
                        onClick={() => setShowPhysicalCount(false)}
                        className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold ${!showPhysicalCount ? "bg-black text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        Without Physical Count (Blind)
                    </button>
                    <button
                        type="button"
                        aria-pressed={showPhysicalCount}
                        onClick={() => setShowPhysicalCount(true)}
                        className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold ${showPhysicalCount ? "bg-black text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        With Physical Count
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => downloadManufacturingCountSheetPDF(sheet, { additionalRows, stockCutoff, showPhysicalCount, targetLot, printedAt })}
                    className="flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-lg"
                >
                    <Download className="h-4 w-4" />
                    Download PDF
                </button>
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-xs font-bold text-foreground shadow-lg"
                >
                    <Printer className="h-4 w-4" />
                    Print Count Sheet
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="cursor-pointer rounded-xl border border-border bg-card p-2.5 text-muted-foreground shadow-lg hover:text-foreground"
                    title="Close Printable Modal"
                    aria-label="Close count sheet preview"
                >
                    <X className="h-4 w-4" />
                </button>
                {excludedOtherBranchBalanceCount > 0 && (
                    <p role="status" className="w-full rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                        {excludedOtherBranchBalanceCount === 1
                            ? "1 stock balance was excluded because its lot and batch belong to another branch."
                            : `${excludedOtherBranchBalanceCount} stock balances were excluded because their lots and batches belong to other branches.`}
                    </p>
                )}
            </div>

            <article
                id="printable-paper-doc"
                className="rounded-xl bg-white text-black shadow-2xl"
            >
                <div style={{ minHeight: `${COUNT_SHEET_SIGNOFF_OFFSET_MM}mm` }}>
                    <header className="flex items-start justify-between">
                        <div className="min-w-0">
                            <h1 id="manufacturing-countsheet-title" className="font-bold">{COUNT_SHEET_TITLE}</h1>
                            <p>{data.subtitle}</p>
                        </div>
                        <div className="countsheet-reference text-right">
                            <strong>#{data.number}</strong>
                            <div>Status: {data.status}</div>
                            <div>Printed: {data.printedAt}</div>
                        </div>
                    </header>

                    <dl className="grid grid-cols-3 rounded-md border border-neutral-500">
                        {data.metadata.map(({ label, value }) => (
                            <div key={label}>
                                <dt className="font-bold uppercase">{label}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>

                    <h2
                        id="manufacturing-countsheet-table-title"
                        className="border border-neutral-500 bg-neutral-200 font-bold"
                    >
                        {COUNT_SHEET_TABLE_TITLE}
                    </h2>
                    <table
                        aria-labelledby="manufacturing-countsheet-table-title"
                        className="w-full table-fixed border-collapse tabular-nums"
                    >
                        <colgroup>
                            {COUNT_SHEET_COLUMNS.map(({ label, widthPercent }) => (
                                <col key={label} style={{ width: `${widthPercent}%` }} />
                            ))}
                        </colgroup>
                        <thead>
                            <tr className="bg-neutral-100">
                                {COUNT_SHEET_COLUMNS.map(({ label }) => (
                                    <th key={label} scope="col" className="border border-neutral-500 text-center font-bold">
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={COUNT_SHEET_COLUMNS.length} className="border border-neutral-500 text-center">
                                        No inventory details for this count sheet.
                                    </td>
                                </tr>
                            ) : data.rows.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                    {row.map((value, index) => (
                                        <td
                                            key={COUNT_SHEET_COLUMNS[index].label}
                                            className="whitespace-pre-line border border-neutral-500 align-middle"
                                            style={{ textAlign: COUNT_SHEET_COLUMNS[index].align }}
                                        >
                                            {!showPhysicalCount && index === COUNT_SHEET_COLUMNS.length - 1 ? (
                                                <span aria-hidden="true" className="countsheet-count-line" />
                                            ) : value}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <footer>
                    {COUNT_SHEET_SIGNATURES.map(({ label, caption }) => (
                        <div key={label}>
                            <div className="font-bold">{label}</div>
                            <div aria-hidden="true" className="countsheet-signature-line" />
                            <p>{caption}</p>
                        </div>
                    ))}
                </footer>
            </article>
        </div>,
        document.body,
    );
}
