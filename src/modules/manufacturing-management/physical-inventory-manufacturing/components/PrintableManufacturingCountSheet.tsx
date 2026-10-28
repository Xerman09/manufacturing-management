"use client";

import React, { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, Download, X, MapPin, Package, Calendar } from "lucide-react";
import { MmPhysicalInventorySheet, MmPhysicalInventoryDetail } from "../types";
import { downloadManufacturingCountSheetPDF } from "../utils/exportManufacturingCountSheetPDF";
import { formatQty } from "../utils/number-format";

interface PrintableManufacturingCountSheetProps {
    sheet: MmPhysicalInventorySheet;
    targetLot?: number | string | null;
    onClose: () => void;
}

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

export default function PrintableManufacturingCountSheet({ sheet, targetLot, onClose }: PrintableManufacturingCountSheetProps) {
    const [mounted, setMounted] = useState(false);
    const [showPhysicalCount, setShowPhysicalCount] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPDF = () => {
        downloadManufacturingCountSheetPDF(sheet, { showPhysicalCount, targetLot });
    };

    const piNo = sheet.pi_no || `PI-${sheet.physical_inventory_id}`;

    // Extract facility / branch name
    const branchName = typeof sheet.branch_id === "object" && sheet.branch_id !== null
        ? (sheet.branch_id.branch_name || sheet.branch_id.branchName || "Main Facility")
        : "Main Facility";

    // Extract product type name
    let productTypeName = "All Product Types";
    if (sheet.product_type_id) {
        if (typeof sheet.product_type_id === "object" && sheet.product_type_id !== null) {
            productTypeName = (sheet.product_type_id as { name?: string; type_name?: string }).name ||
                (sheet.product_type_id as { name?: string; type_name?: string }).type_name || "All Product Types";
        }
    }

    // Extract encoder name
    let encoderName = "Plant Inventory Auditor";
    if (sheet.encoder_id) {
        if (typeof sheet.encoder_id === "object" && sheet.encoder_id !== null) {
            const fname = sheet.encoder_id.user_fname || "";
            const lname = sheet.encoder_id.user_lname || "";
            encoderName = `${fname} ${lname}`.trim() || "Plant Inventory Auditor";
        } else {
            encoderName = String(sheet.encoder_id);
        }
    }

    const details: MmPhysicalInventoryDetail[] = useMemo(() => {
        const all = sheet.details || [];
        if (!targetLot) return all;
        return all.filter((item) => {
            const lObj = typeof item.lot_id === "object" && item.lot_id !== null ? (item.lot_id as { lot_id?: number; id?: number; lot_name?: string }) : null;
            const lId = lObj?.lot_id || lObj?.id || (typeof item.lot_id === "number" ? item.lot_id : null);
            const lName = lObj?.lot_name || (item as unknown as { lot_name?: string }).lot_name || "";
            if (typeof targetLot === "number") return lId === targetLot;
            if (typeof targetLot === "string") return lName.toLowerCase() === targetLot.toLowerCase();
            return true;
        });
    }, [sheet.details, targetLot]);

    // Group items by Lot and then by Batch
    const groupedLots: GroupedLot[] = useMemo(() => {
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
    }, [details]);

    const countGroups = groupedLots.flatMap((lotGroup) => lotGroup.batches.map((batchGroup) => ({ ...batchGroup, lotName: lotGroup.lotName })));
    let seqCounter = 1;

    const modalContent = (
        <div id="printable-countsheet-root" className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/90 backdrop-blur-xs overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:block print:overflow-visible">
            <style jsx global>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 8mm;
                    }
                    html, body {
                        background: white !important;
                        color: black !important;
                        height: auto !important;
                        overflow: visible !important;
                    }
                    /* Hide all background siblings under body when printing */
                    body > *:not(#printable-countsheet-root) {
                        display: none !important;
                    }
                    #printable-countsheet-root {
                        position: static !important;
                        display: block !important;
                        width: 100% !important;
                        height: auto !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                        overflow: visible !important;
                    }
                    #printable-paper-doc {
                        position: static !important;
                        display: block !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-shadow: none !important;
                        border: none !important;
                        background: white !important;
                        color: black !important;
                        overflow: visible !important;
                    }
                    .print\:hidden {
                        display: none !important;
                    }
                    thead {
                        display: table-header-group !important;
                    }
                    tfoot {
                        display: table-footer-group !important;
                    }
                    table {
                        break-inside: auto !important;
                        page-break-inside: auto !important;
                    }
                    #printable-count-groups > section {
                        break-inside: auto !important;
                        page-break-inside: auto !important;
                    }
                    tr, .page-break-avoid {
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                    }
                }
            `}</style>

            {/* Top Toolbar (Hidden during print) */}
            <div className="fixed top-4 right-4 z-50 flex items-center gap-2 print:hidden">
                {/* Type Switcher Toggle */}
                <div className="flex items-center bg-card border border-border p-1 rounded-xl shadow-lg">
                    <button
                        onClick={() => setShowPhysicalCount(false)}
                        className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                            !showPhysicalCount
                                ? "bg-black text-white shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Without Physical Count (Blind)
                    </button>
                    <button
                        onClick={() => setShowPhysicalCount(true)}
                        className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                            showPhysicalCount
                                ? "bg-black text-white shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        With Physical Count
                    </button>
                </div>

                <button
                    onClick={handleDownloadPDF}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl shadow-lg hover:scale-105 transition-all cursor-pointer"
                >
                    <Download className="h-4 w-4" />
                    Download PDF
                </button>
                <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-foreground font-bold text-xs rounded-xl shadow-lg hover:scale-105 transition-all border border-border cursor-pointer"
                >
                    <Printer className="h-4 w-4" />
                    Print Count Sheet
                </button>
                <button
                    onClick={onClose}
                    className="p-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground shadow-lg transition-all cursor-pointer"
                    title="Close Printable Modal"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* Printable Paper Document (A4 Portrait Shape & Compact Paper-Saving Layout) */}
            <div id="printable-paper-doc" className="bg-white text-black w-full max-w-4xl p-6 rounded-xl shadow-2xl print:shadow-none print:p-0 print:m-0 my-auto text-xs font-sans">
                {/* Company & Document Header */}
                <div className="border-b-2 border-black pb-3 mb-4 flex items-start justify-between">
                    <div>
                        <h1 className="text-lg font-black tracking-wider uppercase text-black">MAMA PINAS MANUFACTURING</h1>
                        <h2 className="text-xs font-bold text-gray-800 tracking-tight mt-0.5 uppercase">
                            MANUFACTURING PHYSICAL INVENTORY AUDIT COUNT SHEET
                        </h2>
                        <p className="text-[9px] text-gray-500 mt-0.5">
                            {showPhysicalCount
                                ? "Official Manufacturing Floor Audit & Physical Count Verification Document"
                                : "Official Manufacturing Floor Blind Audit & Batch Verification Document"}
                        </p>
                    </div>
                    <div className="text-right font-mono">
                        <div className="text-sm font-black text-black">#{piNo}</div>
                        <div className="text-[9px] text-gray-600 mt-0.5 font-sans">Status: <span className="font-bold">{sheet.status || "DRAFT"}</span></div>
                        <div className="text-[8px] text-gray-400 font-sans">Printed: {formatDate(new Date().toISOString())}</div>
                    </div>
                </div>

                {/* Compact Metadata Grid */}
                <div className="grid grid-cols-3 gap-2 border border-gray-300 rounded-lg p-2.5 mb-4 text-[10px] bg-gray-50 print:bg-transparent">
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[8px]">Branch / Facility</span>
                        <span className="font-extrabold text-black">{branchName}</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[8px]">Stock Classification</span>
                        <span className="font-bold text-black">{sheet.stock_type || "REGULAR"} STOCK</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[8px]">Product Type Scope</span>
                        <span className="font-bold text-black">{productTypeName}</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[8px]">Auditor In-Charge</span>
                        <span className="font-bold text-black">{encoderName}</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[8px]">Start Timestamp</span>
                        <span className="font-mono text-black">{formatDate(sheet.starting_date)}</span>
                    </div>
                    <div>
                        <span className="font-bold text-gray-500 block uppercase text-[8px]">Cut-Off Benchmark</span>
                        <span className="font-mono text-black">{formatDate(sheet.cutoff_date)}</span>
                    </div>
                </div>

                {/* Line Items - Grouped per Lot and Batch */}
                {groupedLots.length === 0 ? (
                    <div className="border border-gray-300 p-6 text-center text-gray-500 rounded-lg mb-4">
                        No line items registered in this count sheet.
                    </div>
                ) : (
                    <div id="printable-count-groups" className="grid grid-cols-2 items-start gap-x-3 gap-y-2">
                        {countGroups.map((batchGroup) => (
                            <section key={`${batchGroup.lotName}-${batchGroup.batchNo}`} className="border border-gray-300 rounded-lg">
                                <table className="w-full table-fixed border-collapse text-[9px]">
                                    <colgroup>
                                        <col className="w-[64%]" />
                                        <col className="w-[36%]" />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th colSpan={2} className="px-2 py-1 border-b border-gray-300 bg-gray-50 text-left text-gray-800 font-semibold leading-tight">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 uppercase">
                                                    <span className="inline-flex items-center gap-1">
                                                        <MapPin className="h-3 w-3 text-gray-500 shrink-0" />
                                                        STORAGE LOT: {batchGroup.lotName}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1">
                                                        <Package className="h-3 w-3 text-gray-500 shrink-0" />
                                                        BATCH: <span className="font-mono normal-case">{batchGroup.batchNo}</span>
                                                    </span>
                                                </div>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[8px] text-gray-600 font-mono font-normal normal-case">
                                                    <span><Calendar className="inline h-2.5 w-2.5 text-gray-400" /> MFG: {batchGroup.mfgDate}</span>
                                                    <span><Calendar className="inline h-2.5 w-2.5 text-gray-400" /> EXP: {batchGroup.expDate}</span>
                                                    <span>{batchGroup.items.length} SKU(s)</span>
                                                </div>
                                            </th>
                                        </tr>
                                        <tr className="border-b border-gray-300 text-[7px] text-gray-600 uppercase">
                                            <th className="px-2 py-0.5 text-left">Product / UOM / System Qty</th>
                                            <th className="px-1 py-0.5 text-center">
                                                {showPhysicalCount ? "Recorded Count" : "Physical Count"}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {batchGroup.items.map((item) => {
                                            const pObj = typeof item.product_id === "object" && item.product_id !== null ? item.product_id : null;
                                            const pName = pObj?.product_name || (item as unknown as { product_name?: string }).product_name || "Product";
                                            const pCode = pObj?.product_code || (item as unknown as { product_code?: string }).product_code || "";
                                            const uObj = typeof item.unit_id === "object" && item.unit_id !== null ? item.unit_id : null;
                                            const uom = uObj?.unit_shortcut || uObj?.unit_name || (item as unknown as { uom?: string }).uom || "PCS";
                                            const currentSeq = seqCounter++;

                                            return (
                                                <tr key={item.physical_inventory_detail_id || item.id || currentSeq} className="border-b last:border-b-0 border-gray-200">
                                                    <td className="px-2 py-1 align-top">
                                                        <div className="font-bold text-black leading-tight">{currentSeq}. {pName}</div>
                                                        <div className="mt-0.5 text-[7px] text-gray-600 font-mono leading-tight">
                                                            {pCode ? `CODE: ${pCode} | ` : ""}{uom.toUpperCase()} | SYS: {formatQty(item.system_count)}
                                                        </div>
                                                    </td>
                                                    <td className="px-1 py-1 align-middle text-center">
                                                        {showPhysicalCount ? (
                                                            item.physical_count !== null && item.physical_count !== undefined ? (
                                                                <span className="font-mono font-bold text-black break-all">{formatQty(item.physical_count)}</span>
                                                            ) : (
                                                                <span className="text-gray-400 italic font-mono">-</span>
                                                            )
                                                        ) : (
                                                            <div className="h-5 border-b border-dashed border-gray-500" />
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </section>
                        ))}
                    </div>

                )}
                {/* Compact Sign-Off Authorization Block */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t-2 border-black page-break-avoid">
                    <div className="space-y-6">
                        <span className="font-bold text-[9px] text-gray-600 block uppercase">Counted / Audited By:</span>
                        <div className="border-b border-black w-full" />
                        <span className="text-[8px] text-gray-500 block text-center">Plant Floor Auditor Signature & Date</span>
                    </div>

                    <div className="space-y-6">
                        <span className="font-bold text-[9px] text-gray-600 block uppercase">Verified By:</span>
                        <div className="border-b border-black w-full" />
                        <span className="text-[8px] text-gray-500 block text-center">Warehouse Supervisor Signature & Date</span>
                    </div>

                    <div className="space-y-6">
                        <span className="font-bold text-[9px] text-gray-600 block uppercase">Approved By:</span>
                        <div className="border-b border-black w-full" />
                        <span className="text-[8px] text-gray-500 block text-center">Plant Operations Manager Signature & Date</span>
                    </div>
                </div>
            </div>
        </div>
    );

    if (!mounted) return null;
    return createPortal(modalContent, document.body);
}
