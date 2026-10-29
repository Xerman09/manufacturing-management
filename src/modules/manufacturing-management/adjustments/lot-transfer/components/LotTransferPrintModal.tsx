"use client";

import React from "react";
import {
  Printer,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LotTransfer } from "../types";

interface LotTransferPrintModalProps {
  open: boolean;
  onClose: () => void;
  transfer: LotTransfer | null;
}

const formatDate = (val?: string | null): string => {
  if (!val) return "-";
  const str = String(val).trim();
  if (!str) return "-";
  return str.split("T")[0];
};

const formatDateTime = (val?: string | null): string => {
  if (!val) return "-";
  const str = String(val).trim();
  if (!str) return "-";
  const match = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return str;
};

export const LotTransferPrintModal: React.FC<LotTransferPrintModalProps> = ({
  open,
  onClose,
  transfer,
}) => {
  if (!open || !transfer) return null;

  const handlePrint = () => {
    window.print();
  };

  const branchDisplay =
    transfer.branchName && transfer.branchName !== "-"
      ? transfer.branchName
      : transfer.branchId
      ? `Branch #${transfer.branchId}`
      : "-";

  const sourceLotDisplay =
    transfer.sourceLotName && transfer.sourceLotName !== "-" ? transfer.sourceLotName : "-";

  const targetLotDisplay =
    transfer.targetLotName && transfer.targetLotName !== "-" ? transfer.targetLotName : "-";

  const lineItems = transfer.details || [];
  const totalUnits =
    lineItems.length > 0
      ? lineItems.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0)
      : transfer.quantity || 0;

  const printedAtStr = formatDateTime(new Date().toISOString());

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col p-0 overflow-hidden bg-background border border-border shadow-2xl h-[92vh] max-h-[92vh] !max-w-4xl w-full z-[100]"
      >
        <DialogTitle className="sr-only">
          Lot Transfer Slip - {transfer.requestNo || "Preview"}
        </DialogTitle>

        <style jsx global>{`
          @media print {
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            html,
            body {
              background: white !important;
              color: black !important;
              height: auto !important;
              overflow: visible !important;
            }
            body > *:not([data-slot="dialog-portal"]) {
              display: none !important;
            }
            [data-slot="dialog-overlay"],
            .print-hidden-bar {
              display: none !important;
            }
            [data-slot="dialog-content"] {
              position: static !important;
              display: block !important;
              width: 100% !important;
              max-width: 100% !important;
              height: auto !important;
              max-height: none !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              border: none !important;
              background: white !important;
              color: black !important;
              overflow: visible !important;
              transform: none !important;
            }
            #printable-lot-transfer-paper {
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
            tr,
            table,
            .page-break-avoid {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
          }
        `}</style>

        {/* Modal Header Action Toolbar (Hidden during print) */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0 print-hidden-bar">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">
              Transfer Slip Preview
            </span>
            <span className="font-mono text-xs text-muted-foreground ml-1">
              ({transfer.requestNo || "-"})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 text-xs font-semibold cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Slip
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              title="Close Preview (Esc)"
            >
              <X className="w-4 h-4" />
              <span className="sr-only">Close Preview</span>
            </Button>
          </div>
        </div>

        {/* Scrollable Paper Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/30 flex justify-center">
          <div
            id="printable-lot-transfer-paper"
            className="bg-white text-black w-full max-w-3xl p-8 rounded-xl shadow-md print:shadow-none print:p-0 print:m-0 my-auto text-xs font-sans border border-neutral-200 print:border-none"
          >
        {/* Company & Document Header */}
        <div className="border-b-2 border-black pb-4 mb-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold tracking-widest text-neutral-600 uppercase">
                Manufacturing Operations
              </span>
            </div>
 
            <h2 className="text-sm font-bold text-neutral-800 tracking-tight mt-0.5 uppercase">
              LOT TRANSFER SLIP
            </h2>
 
          </div>

          <div className="text-right font-mono">
            <div className="text-base font-black text-black">
              {transfer.requestNo || "-"}
            </div>
          </div>
        </div>

        {/* Transfer Routing & Details Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border border-neutral-300 rounded-lg p-3 mb-4 text-[11px] bg-neutral-50/80 print:bg-transparent">
          <div>
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Facility / Branch
            </span>
            <span className="font-extrabold text-black">{branchDisplay}</span>
          </div>

          <div>
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Transfer Date
            </span>
            <span className="font-bold font-mono text-black">
              {formatDate(transfer.transferDate)}
            </span>
          </div>

          <div>
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Source Lot
            </span>
            <span className="font-bold font-mono text-black block truncate">
              {sourceLotDisplay}
            </span>
          </div>

          <div>
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Destination Lot
            </span>
            <span className="font-bold font-mono text-black block truncate">
              {targetLotDisplay}
            </span>
          </div>

          <div>
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Total Volume / Units
            </span>
            <span className="font-extrabold font-mono text-black">
              {totalUnits.toLocaleString()}
              {transfer.unitName ? ` ${transfer.unitName}` : " PCS"}
            </span>
          </div>

          <div>
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Total Line Items
            </span>
            <span className="font-bold font-mono text-black">
              {lineItems.length} {lineItems.length === 1 ? "Line Item" : "Line Items"}
            </span>
          </div>

          <div className="col-span-2">
            <span className="font-bold text-neutral-500 block uppercase text-[9px]">
              Operational Justification / Reason
            </span>
            <span className="text-neutral-800 italic">
              {transfer.reason || "Standard operational manufacturing transfer"}
            </span>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-5 border border-neutral-300 rounded-lg overflow-hidden page-break-avoid">
          <div className="bg-neutral-900 text-white px-3 py-1.5 flex items-center justify-between border-b border-neutral-800 text-[11px] font-bold uppercase tracking-wider">
            <span>Products &amp; Batch Allocations</span>
            <span className="font-mono text-[9px] text-neutral-300">
              {lineItems.length} SKU Allocation(s)
            </span>
          </div>

          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-neutral-100 text-neutral-800 font-bold uppercase border-b border-neutral-300 text-[9px]">
                <th className="py-1.5 px-2 text-center w-8 border-r border-neutral-300">#</th>
                <th className="py-1.5 px-2 text-left border-r border-neutral-300 min-w-[170px]">Product SKU &amp; Description</th>
                <th className="py-1.5 px-2 text-left border-r border-neutral-300 w-28">Batch #</th>
                <th className="py-1.5 px-2 text-center border-r border-neutral-300 w-20">Mfg Date</th>
                <th className="py-1.5 px-2 text-center border-r border-neutral-300 w-20">Expiry Date</th>
                <th className="py-1.5 px-2 text-right border-r border-neutral-300 w-15">Qty</th>
                <th className="py-1.5 px-2 text-left min-w-[130px]">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-neutral-500 italic">
                    No individual batch lines recorded for this transfer.
                  </td>
                </tr>
              ) : (
                lineItems.map((item, idx) => {
                  const pDesc = item.productDescription;
 
                  const pCode = item.productCode && item.productCode !== "-" ? item.productCode : "";
                  const primaryTitle = pDesc || "-";
                  const mfgDate = formatDate(item.sourceManufacturingDate);
                  const expDate = formatDate(item.sourceExpiryDate);
                  const lineRemarks = item.lineRemarks || "-";

                  return (
                    <tr
                      key={item.detailId || idx}
                      className="border-b last:border-b-0 border-neutral-200 hover:bg-neutral-50/50"
                    >
                      <td className="py-1.5 px-2 text-center font-mono border-r border-neutral-200">
                        {item.lineNo || idx + 1}
                      </td>
                      <td className="py-1.5 px-2 border-r border-neutral-200">
                        <div className="font-bold text-black leading-tight">{primaryTitle}</div>
                        <div className="text-[9px] text-neutral-600 font-mono flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          {pCode && <span>SKU: {pCode}</span>}
                           
                        </div>
                      </td>
                      <td className="py-1.5 px-2 font-mono font-semibold border-r border-neutral-200">
                        {item.targetBatchNo || item.sourceBatchNo || "-"}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono text-neutral-700 border-r border-neutral-200">
                        {mfgDate}
                      </td>
                      <td className="py-1.5 px-2 text-center font-mono text-neutral-700 border-r border-neutral-200">
                        {expDate}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-black text-black border-r border-neutral-200">
                        {(Number(item.quantity) || 0).toLocaleString()}
                       
                      </td>
                      <td className="py-1.5 px-2 text-[10px] text-neutral-800 break-words whitespace-normal leading-tight">
                        {lineRemarks}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {lineItems.length > 0 && (
              <tfoot>
                <tr className="bg-neutral-100 font-bold border-t-2 border-neutral-400">
                  <td colSpan={5} className="py-1.5 px-2 text-right uppercase text-[9px] border-r border-neutral-300">
                    Grand Total Transferred:
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono font-black text-black border-r border-neutral-300">
                    {totalUnits.toLocaleString()}
                    
                  </td>
                  <td className="py-1.5 px-2 text-[9px] text-neutral-500 font-mono">
                    {lineItems.length} line(s)
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* 3-Party Verification & Sign-Off Matrix */}
        <div className="grid grid-cols-2 gap-4 pt-3 border-t-2 border-black page-break-avoid text-[10px]">
          {/* Box 1: Requested By */}
          <div className="border border-neutral-300 rounded-lg p-3 flex flex-col justify-between min-h-[72px]">
            <span className="font-bold text-neutral-600 block uppercase text-[8px] tracking-wider">
              1. Requested By
            </span>
            <div className="my-auto py-1">
              <div className="font-bold text-black text-[11px]">
                {transfer.requestedByName || "—"}
              </div>
              <div className="text-[9px] text-neutral-500 font-mono">
                {transfer.requestedAt
                  ? formatDateTime(transfer.requestedAt)
                  : formatDate(transfer.transferDate)}
              </div>
            </div>
          </div>
 

          {/* Box 3: Posted By */}
          <div className="border border-neutral-300 rounded-lg p-3 flex flex-col justify-between min-h-[72px]">
            <span className="font-bold text-neutral-600 block uppercase text-[8px] tracking-wider">
              3. Posted By
            </span>
            <div className="my-auto py-1">
              <div className="font-bold text-black text-[11px]">
                {transfer.postedByName ||
                  (transfer.status === "Posted"
                    ? "-"
                    : "Pending Floor Posting")}
              </div>
              <div className="text-[9px] text-neutral-500 font-mono">
                {transfer.postedAt ? formatDateTime(transfer.postedAt) : "-"}
              </div>
            </div>
          </div>
        </div>

        {/* System & Audit Note Footer */}
        <div className="mt-4 pt-2 border-t border-neutral-200 flex items-center justify-between text-[8px] text-neutral-500">
          <span>
           Manufacturing Management System  
          </span>
          <span>
            {printedAtStr}
          </span>
        </div>
      </div>
    </div>
  </DialogContent>
</Dialog>
);
};
