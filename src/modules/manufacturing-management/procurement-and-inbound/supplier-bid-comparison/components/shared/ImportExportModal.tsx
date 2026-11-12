"use client";

import React, { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { exportRfqToExcel, exportRfqBidsToCsv, BIDS_CANONICAL_COLUMNS } from "../../engine/excel-export";
import {
  SupplierBid,
  RequestedItem,
  Incoterm,
  FreightBasis,
  InsuranceBasis,
  ShipmentType,
  PassFailResult,
} from "../../types";

const REQUIRED_COLUMNS_TEXT = BIDS_CANONICAL_COLUMNS.join(", ");

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedRow {
  supplier: string;
  type?: string;
  country?: string;
  currency?: string;
  incoterm?: string;
  item: string;
  quantity?: number;
  hsCode?: string;
  dutyPct?: number;
  weightKg?: number;
  volumeCbm?: number;
  unitPrice: number;
  minQty?: number;
  discountPct?: number;
  freightBasis?: string;
  freightAmount?: number;
  freightMin?: number;
  freightCurrency?: string;
  insuranceBasis?: string;
  insuranceAmount?: number;
  ftaCode?: string;
  ftaDutyPct?: number;
  vatPct?: number;
  pricesIncludeVat?: boolean;
  brokerageFee?: number;
  otherPortCharges?: number;
  inlandTrucking?: number;
  bankFee?: number;
  shipmentType?: string;
  containers20ft?: number;
  containers40ft?: number;
  numShipments?: number;
  paidByLc?: boolean;
  leadTimeDays?: number;
  downPaymentPct?: number;
  netDays?: number;
  earlyPayDiscountPct?: number;
  earlyPayDays?: number;
  validUntil?: string;
  qualityScore?: number;
  notes?: string;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = React.memo(
  ({ isOpen, onClose }) => {
    const { currentProject, updateProject } = useBidComparisonStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [fileName, setFileName] = useState<string | null>(null);
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const resetState = useCallback(() => {
      setFileName(null);
      setParsedRows([]);
      setWarnings([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    const handleClose = useCallback(() => {
      resetState();
      onClose();
    }, [resetState, onClose]);

    const normalizeKey = (key: string): string => {
      return key.toLowerCase().replace(/[^a-z0-9]/g, "");
    };

    const handleCopyColumns = () => {
      navigator.clipboard.writeText(REQUIRED_COLUMNS_TEXT);
      setIsCopied(true);
      toast.success("Column headers copied to clipboard");
      setTimeout(() => setIsCopied(false), 2000);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsProcessing(true);
      setFileName(file.name);
      setWarnings([]);

      try {
        // Dynamic import of xlsx ensures zero bundle blocking during modal open/close
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });

        // Auto-detect best sheet: prefer sheet with 'bids', 'quotation', 'data', or 'raw'
        const bestSheetName =
          workbook.SheetNames.find((s) => /bids|quotation|raw|data|items/i.test(s)) ||
          workbook.SheetNames[0];
        const sheet = workbook.Sheets[bestSheetName];
        const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
        });

        if (rawRows.length === 0) {
          toast.error("The uploaded file does not contain any data rows.");
          setIsProcessing(false);
          return;
        }

        const rows: ParsedRow[] = [];
        const warnList: string[] = [];

        rawRows.forEach((raw, idx) => {
          const map: Record<string, any> = {};
          for (const [k, v] of Object.entries(raw)) {
            map[normalizeKey(k)] = v;
          }

          const supplier = String(
            map["supplier"] || map["suppliername"] || map["vendor"] || ""
          ).trim();
          const item = String(
            map["item"] || map["itemname"] || map["product"] || map["description"] || ""
          ).trim();
          const unitPrice = parseFloat(map["unitprice"] || map["price"] || "0");

          if (!supplier && !item) return;

          if (!supplier) {
            warnList.push(`Row ${idx + 2}: Missing supplier name`);
            return;
          }
          if (!item) {
            warnList.push(`Row ${idx + 2}: Missing item description`);
            return;
          }

          const row: ParsedRow = {
            supplier,
            type: String(map["type"] || map["suppliertype"] || "International").trim(),
            country: String(map["country"] || map["origincountry"] || "CN").trim(),
            currency: String(map["currency"] || map["quotecurrency"] || "USD").trim().toUpperCase(),
            incoterm: String(map["incoterm"] || map["deliveryterms"] || "FOB").trim().toUpperCase(),
            item,
            quantity: parseFloat(map["qty"] || map["quantity"] || "0") || undefined,
            hsCode: String(map["hscode"] || "").trim(),
            dutyPct: parseFloat(map["itemduty"] || map["dutypct"] || map["duty"] || "0"),
            weightKg: parseFloat(map["kgunit"] || map["weightperunitkg"] || map["weightkg"] || "0"),
            volumeCbm: parseFloat(map["cbmunit"] || map["volumeperunitcbm"] || map["volumecbm"] || "0"),
            unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
            minQty: parseFloat(map["minqty"] || map["minimumquantity"] || map["moq"] || "0"),
            discountPct: parseFloat(map["discount"] || map["discountpct"] || "0"),
            freightBasis: String(map["freightbasis"] || "LUMP_SUM").trim(),
            freightAmount: parseFloat(map["freight"] || map["freightcost"] || "0"),
            freightMin: parseFloat(map["freightmin"] || map["freightminimum"] || "0"),
            freightCurrency: String(map["freightcurrency"] || map["currency"] || "USD").trim().toUpperCase(),
            insuranceBasis: String(map["insurancebasis"] || "PCT_GOODS_AND_FREIGHT").trim(),
            insuranceAmount: parseFloat(map["insurance"] || "0.3"),
            ftaCode: String(map["fta"] || "").trim(),
            ftaDutyPct: parseFloat(map["ftaduty"] || "0"),
            vatPct: parseFloat(map["vat"] || map["vatpct"] || "12"),
            pricesIncludeVat:
              String(map["pricesinclvat"] || map["pricesincludingvat"] || "").toLowerCase() === "true" ||
              String(map["pricesinclvat"] || "").toLowerCase() === "yes",
            brokerageFee: parseFloat(map["brokerage"] || "0"),
            otherPortCharges: parseFloat(map["customsotherportcharges"] || map["customs"] || map["otherportcharges"] || "0"),
            inlandTrucking: parseFloat(map["inland"] || map["inlandtrucking"] || "0"),
            bankFee: parseFloat(map["bankfee"] || "0"),
            shipmentType: String(map["shipmenttypefcllclairauto"] || map["shipmenttype"] || "AUTO").trim().toUpperCase(),
            containers20ft: parseInt(map["containers20ft"] || "0", 10),
            containers40ft: parseInt(map["containers40ft"] || "0", 10),
            numShipments: parseInt(map["shipments"] || map["numberofshipments"] || "1", 10) || 1,
            paidByLc:
              String(map["paidbylc"] || "").toLowerCase() === "true" ||
              String(map["paidbylc"] || "").toLowerCase() === "yes",
            leadTimeDays: parseInt(map["leaddays"] || map["leadtimedays"] || "0", 10),
            downPaymentPct: parseFloat(map["down"] || map["downpaymentpct"] || "0"),
            netDays: parseInt(map["netdays"] || map["balanceduedays"] || "0", 10),
            earlyPayDiscountPct: parseFloat(map["earlypay"] || map["earlypaydiscountpct"] || "0"),
            earlyPayDays: parseInt(map["earlypaydays"] || map["earlypaymentdiscountdays"] || "0", 10),
            validUntil: String(map["validuntil"] || "").trim(),
            qualityScore: parseFloat(map["quality15appliedtoallcriteria"] || map["quality"] || map["qualityscore"] || "0"),
            notes: String(map["notes"] || "").trim(),
          };

          rows.push(row);
        });

        setParsedRows(rows);
        setWarnings(warnList);
        if (rows.length > 0) {
          toast.success(`Successfully parsed ${rows.length} rows from ${file.name}`);
        } else {
          toast.error("No valid item quotation rows could be extracted.");
        }
      } catch (err: any) {
        toast.error(`Error parsing file: ${err.message || "Invalid format"}`);
      } finally {
        setIsProcessing(false);
      }
    };

    const handleApplyImport = () => {
      if (!currentProject || parsedRows.length === 0) return;

      updateProject((prev) => {
        const nextItems: RequestedItem[] = [...prev.items];
        const nextBids: SupplierBid[] = [...prev.bids];

        // 1. Ensure all items mentioned in parsed rows exist in project requested items
        parsedRows.forEach((row) => {
          let matchedItem = nextItems.find(
            (it) => it.itemName.toLowerCase().trim() === row.item.toLowerCase().trim()
          );
          if (!matchedItem) {
            const newItemId = `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            matchedItem = {
              id: newItemId,
              itemName: row.item,
              specifications: "",
              quantity: row.quantity && row.quantity > 0 ? row.quantity : 100,
              uom: "PCS",
              targetUnitPrice: row.unitPrice || 0,
              hsCode: row.hsCode || "",
              dutyPct: row.dutyPct || 0,
              weightPerUnitKg: row.weightKg || 0,
              cbmPerUnit: row.volumeCbm || 0,
              sortOrder: nextItems.length + 1,
            };
            nextItems.push(matchedItem);
          }
        });

        // 2. Group parsed rows by supplier
        const groupedBySupplier = new Map<string, ParsedRow[]>();
        parsedRows.forEach((row) => {
          const key = row.supplier.trim();
          const list = groupedBySupplier.get(key) || [];
          list.push(row);
          groupedBySupplier.set(key, list);
        });

        // 3. Create or update bids
        groupedBySupplier.forEach((supplierRows, suppName) => {
          const first = supplierRows[0];
          let bid = nextBids.find(
            (b) => b.supplierName.toLowerCase().trim() === suppName.toLowerCase().trim()
          );

          const incoterm = (["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"].includes(first.incoterm || "")
            ? first.incoterm
            : "FOB") as Incoterm;

          const initialScores: Record<string, { passFailResult: PassFailResult; score: number | null; evidenceRemarks: string }> = {};
          (prev.qualityCriteria || []).forEach((c) => {
            initialScores[c.id] = {
              passFailResult: c.criterionType === "PASS_FAIL" ? "PASS" : "NOT_CHECKED",
              score:
                c.criterionType === "SCORED"
                  ? first.qualityScore && first.qualityScore >= 1 && first.qualityScore <= 5
                    ? first.qualityScore
                    : 5
                  : null,
              evidenceRemarks: first.qualityScore ? `Imported quality rating: ${first.qualityScore}/5` : "",
            };
          });

          if (!bid) {
            const newBidId = `bid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            bid = {
              id: newBidId,
              supplierName: suppName,
              supplierType: first.type === "Local" ? "LOCAL" : "INTERNATIONAL",
              country: first.country || "CN",
              contactPerson: "",
              contactEmail: "",
              contactPhone: "",
              quoteCurrency: first.currency || "USD",
              quotationRef: "",
              quoteDate: new Date().toISOString().split("T")[0],
              validUntil: first.validUntil || "",
              leadTimeDays: first.leadTimeDays || 30,
              notes: first.notes || "",
              incoterm,
              vatPct: first.vatPct !== undefined ? first.vatPct : 12,
              pricesIncludeVat: first.pricesIncludeVat || false,
              inlandTruckingCompCurr: first.inlandTrucking || 0,
              freightBasis: (["LUMP_SUM", "PER_CBM", "PER_KG", "PCT_GOODS"].includes(first.freightBasis || "") ? first.freightBasis : "LUMP_SUM") as FreightBasis,
              freightRate: first.freightAmount || 0,
              freightMinimum: first.freightMin || 0,
              freightCurrency: first.freightCurrency || first.currency || "USD",
              insuranceBasis: (["PCT_GOODS_AND_FREIGHT", "FIXED_AMOUNT"].includes(first.insuranceBasis || "") ? first.insuranceBasis : "PCT_GOODS_AND_FREIGHT") as InsuranceBasis,
              insuranceRateOrAmount: first.insuranceAmount || 0.3,
              insuranceCurrency: first.freightCurrency || first.currency || "USD",
              dutyMode: first.ftaCode ? "FTA" : "PER_ITEM",
              ftaAgreementName: first.ftaCode || "",
              ftaDutyPct: first.ftaDutyPct,
              brokerageCompCurr: first.brokerageFee || 0,
              otherPortChargesCompCurr: first.otherPortCharges || 0,
              shipmentType: (["AUTO", "FCL", "LCL", "AIR"].includes(first.shipmentType || "") ? first.shipmentType : "AUTO") as ShipmentType,
              containers20ft: first.containers20ft || 0,
              containers40ft: first.containers40ft || 0,
              declarationsCount: first.numShipments || 1,
              paidByLc: first.paidByLc || false,
              downPaymentPct: first.downPaymentPct || 0,
              balanceDueDays: first.netDays || 30,
              earlyPayDiscountPct: first.earlyPayDiscountPct || 0,
              earlyPayDiscountDays: first.earlyPayDays || 0,
              takeEarlyPayDiscount: (first.earlyPayDiscountPct || 0) > 0,
              bankFeePerPaymentCompCurr: first.bankFee || 0,
              quotations: {},
              scores: initialScores,
              attachments: [],
            };
            nextBids.push(bid);
          } else {
            // Update terms on existing bid if provided in file
            if (first.incoterm) bid.incoterm = incoterm;
            if (first.currency) bid.quoteCurrency = first.currency;
            if (first.leadTimeDays) bid.leadTimeDays = first.leadTimeDays;
            if (first.validUntil) bid.validUntil = first.validUntil;
            if (first.freightAmount !== undefined && !isNaN(first.freightAmount)) bid.freightRate = first.freightAmount;
            if (first.freightBasis) bid.freightBasis = (["LUMP_SUM", "PER_CBM", "PER_KG", "PCT_GOODS"].includes(first.freightBasis) ? first.freightBasis : bid.freightBasis) as FreightBasis;
            if (first.freightMin !== undefined && !isNaN(first.freightMin)) bid.freightMinimum = first.freightMin;
            if (first.freightCurrency) bid.freightCurrency = first.freightCurrency;
            if (first.insuranceBasis) bid.insuranceBasis = (["PCT_GOODS_AND_FREIGHT", "FIXED_AMOUNT"].includes(first.insuranceBasis) ? first.insuranceBasis : bid.insuranceBasis) as InsuranceBasis;
            if (first.insuranceAmount !== undefined && !isNaN(first.insuranceAmount)) bid.insuranceRateOrAmount = first.insuranceAmount;
            if (first.ftaCode !== undefined) {
              bid.ftaAgreementName = first.ftaCode;
              if (first.ftaCode) bid.dutyMode = "FTA";
            }
            if (first.ftaDutyPct !== undefined && !isNaN(first.ftaDutyPct)) bid.ftaDutyPct = first.ftaDutyPct;
            if (first.vatPct !== undefined && !isNaN(first.vatPct)) bid.vatPct = first.vatPct;
            if (first.pricesIncludeVat !== undefined) bid.pricesIncludeVat = first.pricesIncludeVat;
            if (first.brokerageFee !== undefined && !isNaN(first.brokerageFee)) bid.brokerageCompCurr = first.brokerageFee;
            if (first.otherPortCharges !== undefined && !isNaN(first.otherPortCharges)) bid.otherPortChargesCompCurr = first.otherPortCharges;
            if (first.inlandTrucking !== undefined && !isNaN(first.inlandTrucking)) bid.inlandTruckingCompCurr = first.inlandTrucking;
            if (first.bankFee !== undefined && !isNaN(first.bankFee)) bid.bankFeePerPaymentCompCurr = first.bankFee;
            if (first.shipmentType) bid.shipmentType = (["AUTO", "FCL", "LCL", "AIR"].includes(first.shipmentType) ? first.shipmentType : bid.shipmentType) as ShipmentType;
            if (first.containers20ft !== undefined && !isNaN(first.containers20ft)) bid.containers20ft = first.containers20ft;
            if (first.containers40ft !== undefined && !isNaN(first.containers40ft)) bid.containers40ft = first.containers40ft;
            if (first.numShipments !== undefined && !isNaN(first.numShipments)) bid.declarationsCount = first.numShipments;
            if (first.paidByLc !== undefined) bid.paidByLc = first.paidByLc;
            if (first.downPaymentPct !== undefined && !isNaN(first.downPaymentPct)) bid.downPaymentPct = first.downPaymentPct;
            if (first.netDays !== undefined && !isNaN(first.netDays)) bid.balanceDueDays = first.netDays;
            if (first.earlyPayDiscountPct !== undefined && !isNaN(first.earlyPayDiscountPct)) {
              bid.earlyPayDiscountPct = first.earlyPayDiscountPct;
              bid.takeEarlyPayDiscount = first.earlyPayDiscountPct > 0;
            }
            if (first.earlyPayDays !== undefined && !isNaN(first.earlyPayDays)) bid.earlyPayDiscountDays = first.earlyPayDays;
            if (first.notes) bid.notes = first.notes;

            if (first.qualityScore && first.qualityScore >= 1) {
              Object.keys(bid.scores).forEach((critId) => {
                if (bid!.scores[critId]?.score !== null) {
                  bid!.scores[critId].score = first.qualityScore!;
                }
              });
            }
          }

          // Group rows for this supplier by matched item to support multiple price breaks
          const itemRowsMap = new Map<string, ParsedRow[]>();
          supplierRows.forEach((row) => {
            const matchedItem = nextItems.find(
              (it) => it.itemName.toLowerCase().trim() === row.item.toLowerCase().trim()
            );
            if (!matchedItem) return;
            const list = itemRowsMap.get(matchedItem.id) || [];
            list.push(row);
            itemRowsMap.set(matchedItem.id, list);
          });

          itemRowsMap.forEach((itemRows, rfqItemId) => {
            const validQuoteRows = itemRows.filter((r) => r.unitPrice > 0);
            if (validQuoteRows.length === 0) return;

            const firstValid = validQuoteRows[0];
            const priceBreaks = validQuoteRows.map((r, bIdx) => ({
              id: `break-${bIdx + 1}`,
              minQuantity: r.minQty && r.minQty > 0 ? r.minQty : 1,
              unitPrice: r.unitPrice,
            }));

            bid!.quotations[rfqItemId] = {
              id: bid!.quotations[rfqItemId]?.id || `quote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
              rfqItemId,
              discountPct: firstValid.discountPct || 0,
              priceBreaks,
            };
          });
        });

        return {
          ...prev,
          items: nextItems,
          bids: nextBids,
        };
      });

      toast.success(`Successfully imported ${parsedRows.length} item lines across suppliers.`);
      handleClose();
    };

    const handleDownloadTemplate = () => {
      window.open("/api/manufacturing/procurement-and-inbound/supplier-bid-comparison/template", "_blank");
    };

    if (!isOpen) return null;

    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-6">
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" />
              <span>Import bids from CSV or Excel</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              One row per supplier × item × price break. Suppliers and items are matched by name; new ones are created.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {/* Required Column Schema Callout */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                  Columns (any order, headers required):
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyColumns}
                  className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {isCopied ? "Copied" : "Copy Header List"}
                </Button>
              </div>
              <p className="text-[11px] font-mono text-muted-foreground bg-background p-2 rounded border border-border/50 leading-relaxed select-all">
                {REQUIRED_COLUMNS_TEXT}
              </p>
            </div>

            {/* Action Row: Export Current / Download Template */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/10 border gap-2.5">
              <div className="text-xs text-muted-foreground">
                Export current project bids or download a clean template to edit offline in Excel or Google Sheets.
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {currentProject && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportRfqToExcel(currentProject)}
                      className="gap-1 text-xs h-7 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
                    >
                      <Download className="w-3 h-3 text-emerald-600" />
                      Export Current (.xlsx)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportRfqBidsToCsv(currentProject)}
                      className="gap-1 text-xs h-7 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800"
                    >
                      <Download className="w-3 h-3 text-blue-600" />
                      Export Current (.csv)
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="gap-1 text-xs h-7 text-muted-foreground hover:text-foreground"
                >
                  <Download className="w-3 h-3" />
                  Template (.csv)
                </Button>
              </div>
            </div>

            {/* File Upload Drop Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-6 text-center cursor-pointer transition-colors bg-card hover:bg-muted/10"
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {fileName ? fileName : "Click to select or drag & drop CSV or Excel file"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Supports .csv, .xlsx, .xls up to 10MB
                  </p>
                </div>
              </div>
            </div>

            {/* Warnings List */}
            {warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  Validation Warnings ({warnings.length})
                </div>
                <ul className="list-disc list-inside max-h-24 overflow-y-auto space-y-0.5 text-[11px]">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Parsed Preview Table */}
            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span>Parsed Quotations ({parsedRows.length} rows)</span>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 gap-1 text-[11px]">
                    <CheckCircle2 className="w-3 h-3" /> Ready to Import
                  </Badge>
                </div>
                <div className="rounded-lg border overflow-hidden max-h-48 overflow-y-auto bg-card">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 border-b text-muted-foreground uppercase text-[10px] font-semibold sticky top-0">
                      <tr>
                        <th className="py-1.5 px-3">Supplier</th>
                        <th className="py-1.5 px-2">Item</th>
                        <th className="py-1.5 px-2">Incoterm</th>
                        <th className="py-1.5 px-2 text-right">Price</th>
                        <th className="py-1.5 px-2">Currency</th>
                        <th className="py-1.5 px-2 text-center">Lead Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {parsedRows.slice(0, 10).map((r, i) => (
                        <tr key={i} className="hover:bg-muted/10">
                          <td className="py-1.5 px-3 font-medium text-foreground">{r.supplier}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{r.item}</td>
                          <td className="py-1.5 px-2 font-mono text-[11px]">{r.incoterm}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-medium text-foreground">
                            {r.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-1.5 px-2 text-muted-foreground">{r.currency}</td>
                          <td className="py-1.5 px-2 text-center text-muted-foreground">{r.leadTimeDays ? `${r.leadTimeDays}d` : "-"}</td>
                        </tr>
                      ))}
                      {parsedRows.length > 10 && (
                        <tr className="bg-muted/10 text-muted-foreground italic text-center">
                          <td colSpan={6} className="py-1.5 px-3">
                            ... and {parsedRows.length - 10} more rows
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetState}
              disabled={!fileName}
              className="text-xs text-muted-foreground hover:text-foreground h-8"
            >
              Clear File
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleClose} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApplyImport}
                disabled={parsedRows.length === 0 || isProcessing}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 h-8 text-xs font-semibold"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Apply Import ({parsedRows.length} rows)
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

ImportExportModal.displayName = "ImportExportModal";
