"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";
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
  Filter,
  Layers,
  Building2,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { exportRfqBidsToCsv, BIDS_CANONICAL_COLUMNS } from "../../engine/excel-export";
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
    const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());
    const [importStrategy, setImportStrategy] = useState<"merge" | "replace">("merge");
    const [warnings, setWarnings] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const resetState = useCallback(() => {
      setFileName(null);
      setParsedRows([]);
      setSelectedSuppliers(new Set());
      setImportStrategy("merge");
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

    // Detected unique suppliers and items from parsed rows
    const detectedSuppliers = useMemo(() => {
      const suppMap = new Map<string, { name: string; count: number; currency: string; type: string }>();
      parsedRows.forEach((r) => {
        const sName = r.supplier.trim();
        const existing = suppMap.get(sName);
        if (existing) {
          existing.count += 1;
        } else {
          suppMap.set(sName, {
            name: sName,
            count: 1,
            currency: r.currency || "PHP",
            type: r.type || "International",
          });
        }
      });
      return Array.from(suppMap.values());
    }, [parsedRows]);

    const detectedItemsCount = useMemo(() => {
      const items = new Set<string>();
      parsedRows.forEach((r) => {
        if (r.item) items.add(r.item.toLowerCase().trim());
      });
      return items.size;
    }, [parsedRows]);

    // Active rows to be imported based on selected suppliers
    const rowsToImport = useMemo(() => {
      return parsedRows.filter((r) => selectedSuppliers.has(r.supplier.trim()));
    }, [parsedRows, selectedSuppliers]);

    const handleToggleSupplier = (suppName: string) => {
      setSelectedSuppliers((prev) => {
        const next = new Set(prev);
        if (next.has(suppName)) {
          next.delete(suppName);
        } else {
          next.add(suppName);
        }
        return next;
      });
    };

    const handleSelectAllSuppliers = () => {
      setSelectedSuppliers(new Set(detectedSuppliers.map((s) => s.name)));
    };

    const handleDeselectAllSuppliers = () => {
      setSelectedSuppliers(new Set());
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsProcessing(true);
      setFileName(file.name);
      setWarnings([]);

      try {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });

        const bestSheetName =
          workbook.SheetNames.find((s) => /bids|quotation|raw|data|items/i.test(s)) ||
          workbook.SheetNames[0];
        const sheet = workbook.Sheets[bestSheetName];
        const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
        });

        if (rawRows.length === 0) {
          toast.error("The uploaded file does not contain any data rows.");
          setIsProcessing(false);
          return;
        }

        const rows: ParsedRow[] = [];
        const warnList: string[] = [];
        const foundSuppliers = new Set<string>();

        const getVal = (m: Record<string, unknown>, ...keys: string[]): string => {
          for (const k of keys) {
            const v = m[k];
            if (v !== undefined && v !== null && v !== "") return String(v);
          }
          return "";
        };

        rawRows.forEach((raw, idx) => {
          const map: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(raw)) {
            map[normalizeKey(k)] = v;
          }

          const supplier = getVal(map, "supplier", "suppliername", "vendor").trim();
          const item = getVal(map, "item", "itemname", "product", "description").trim();
          const unitPrice = parseFloat(getVal(map, "unitprice", "price") || "0");

          if (!supplier && !item) return;

          if (!supplier) {
            warnList.push(`Row ${idx + 2}: Missing supplier name`);
            return;
          }
          if (!item) {
            warnList.push(`Row ${idx + 2}: Missing item description`);
            return;
          }

          foundSuppliers.add(supplier);

          const row: ParsedRow = {
            supplier,
            type: getVal(map, "type", "suppliertype") || "International",
            country: getVal(map, "country", "origincountry") || "CN",
            currency: (getVal(map, "currency", "quotecurrency") || "USD").toUpperCase(),
            incoterm: (getVal(map, "incoterm", "deliveryterms") || "FOB").toUpperCase(),
            item,
            quantity: parseFloat(getVal(map, "qty", "quantity") || "0") || undefined,
            hsCode: getVal(map, "hscode").trim(),
            dutyPct: parseFloat(getVal(map, "itemduty", "dutypct", "duty") || "0"),
            weightKg: parseFloat(getVal(map, "kgunit", "weightperunitkg", "weightkg") || "0"),
            volumeCbm: parseFloat(getVal(map, "cbmunit", "volumeperunitcbm", "volumecbm") || "0"),
            unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
            minQty: parseFloat(getVal(map, "minqty", "minimumquantity", "moq") || "0"),
            discountPct: parseFloat(getVal(map, "discount", "discountpct") || "0"),
            freightBasis: getVal(map, "freightbasis") || "LUMP_SUM",
            freightAmount: parseFloat(getVal(map, "freight", "freightcost") || "0"),
            freightMin: parseFloat(getVal(map, "freightmin", "freightminimum") || "0"),
            freightCurrency: (getVal(map, "freightcurrency", "currency") || "USD").toUpperCase(),
            insuranceBasis: getVal(map, "insurancebasis") || "PCT_GOODS_AND_FREIGHT",
            insuranceAmount: parseFloat(getVal(map, "insurance") || "0.3"),
            ftaCode: getVal(map, "fta").trim(),
            ftaDutyPct: parseFloat(getVal(map, "ftaduty") || "0"),
            vatPct: parseFloat(getVal(map, "vat", "vatpct") || "12"),
            pricesIncludeVat:
              getVal(map, "pricesinclvat", "pricesincludingvat").toLowerCase() === "true" ||
              getVal(map, "pricesinclvat").toLowerCase() === "yes",
            brokerageFee: parseFloat(getVal(map, "brokerage") || "0"),
            otherPortCharges: parseFloat(getVal(map, "customsotherportcharges", "customs", "otherportcharges") || "0"),
            inlandTrucking: parseFloat(getVal(map, "inland", "inlandtrucking") || "0"),
            bankFee: parseFloat(getVal(map, "bankfee") || "0"),
            shipmentType: (getVal(map, "shipmenttypefcllclairauto", "shipmenttype") || "AUTO").toUpperCase(),
            containers20ft: parseInt(getVal(map, "containers20ft") || "0", 10),
            containers40ft: parseInt(getVal(map, "containers40ft") || "0", 10),
            numShipments: parseInt(getVal(map, "shipments", "numberofshipments") || "1", 10) || 1,
            paidByLc:
              getVal(map, "paidbylc").toLowerCase() === "true" ||
              getVal(map, "paidbylc").toLowerCase() === "yes",
            leadTimeDays: parseInt(getVal(map, "leaddays", "leadtimedays") || "0", 10),
            downPaymentPct: parseFloat(getVal(map, "down", "downpaymentpct") || "0"),
            netDays: parseInt(getVal(map, "netdays", "balanceduedays") || "0", 10),
            earlyPayDiscountPct: parseFloat(getVal(map, "earlypay", "earlypaydiscountpct") || "0"),
            earlyPayDays: parseInt(getVal(map, "earlypaydays", "earlypaymentdiscountdays") || "0", 10),
            validUntil: getVal(map, "validuntil").trim(),
            qualityScore: parseFloat(getVal(map, "quality15appliedtoallcriteria", "quality", "qualityscore") || "0"),
            notes: getVal(map, "notes").trim(),
          };          rows.push(row);
        });

        setParsedRows(rows);
        setSelectedSuppliers(foundSuppliers);
        setWarnings(warnList);
        if (rows.length > 0) {
          toast.success(`Parsed ${rows.length} rows across ${foundSuppliers.size} suppliers from ${file.name}`);
        } else {
          toast.error("No valid item quotation rows could be extracted.");
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Invalid format";
        toast.error(`Error parsing file: ${errMsg}`);
      } finally {
        setIsProcessing(false);
      }
    };

    const handleApplyImport = () => {
      if (!currentProject || rowsToImport.length === 0) return;

      updateProject((prev) => {
        const nextItems: RequestedItem[] = [...prev.items];
        // If "replace", clear current bids; otherwise keep existing and merge
        const nextBids: SupplierBid[] = importStrategy === "replace" ? [] : [...prev.bids];

        // 1. Ensure all items mentioned in rows exist in project requested items
        rowsToImport.forEach((row) => {
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

        // 2. Group rows to import by supplier
        const groupedBySupplier = new Map<string, ParsedRow[]>();
        rowsToImport.forEach((row) => {
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

          // Group rows for this supplier by item
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

      toast.success(
        `Successfully imported ${rowsToImport.length} quotations across ${selectedSuppliers.size} suppliers (${importStrategy === "replace" ? "Replaced all bids" : "Merged & updated"}).`
      );
      handleClose();
    };

    const handleDownloadTemplate = () => {
      window.open("/api/manufacturing/procurement-and-inbound/supplier-bid-comparison/template", "_blank");
    };

    if (!isOpen) return null;

    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent
          style={{ width: "min(1240px, 94vw)", maxWidth: "94vw", height: "80vh" }}
          className="!w-[94vw] !max-w-[1240px] !max-h-[90vh] flex flex-col p-6 shadow-2xl border-border bg-card"
        >
          {/* Header */}
          <DialogHeader className="space-y-1.5 pb-2 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    Import Bids from CSV or Excel
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Upload vendor quotation sheets to automatically map items, commercial terms, and tiered price breaks.
                  </DialogDescription>
                </div>
              </div>
              {parsedRows.length > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-medium border-border gap-1 py-1">
                    <Building2 className="w-3 h-3 text-muted-foreground" />
                    {detectedSuppliers.length} Suppliers Detected
                  </Badge>
                  <Badge variant="outline" className="text-xs font-medium border-border gap-1 py-1">
                    <Package className="w-3 h-3 text-muted-foreground" />
                    {detectedItemsCount} Items Found
                  </Badge>
                </div>
              )}
            </div>
          </DialogHeader>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1">
            {/* Top Action / Help Ribbon */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
              {/* Canonical Columns Callout */}
              <div className="lg:col-span-8 rounded-lg border bg-muted/20 p-3 space-y-1.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                    Standard Column Format (42 Columns):
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
                <p className="text-[11px] font-mono text-muted-foreground bg-background p-2 rounded border border-border/50 leading-relaxed select-all max-h-16 overflow-y-auto">
                  {REQUIRED_COLUMNS_TEXT}
                </p>
              </div>

              {/* Offline Export / Template Help Card */}
              <div className="lg:col-span-4 rounded-lg border bg-muted/15 p-3 flex flex-col justify-between space-y-2">
                <div>
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider block">
                    Prepare Offline Template:
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    Download a clean template or current project bids to edit in Excel or Google Sheets.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="gap-1 text-xs h-7 flex-1 text-foreground"
                  >
                    <Download className="w-3 h-3 text-muted-foreground" />
                    Template (.csv)
                  </Button>
                  {currentProject && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportRfqBidsToCsv(currentProject)}
                      className="gap-1 text-xs h-7 flex-1 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900"
                    >
                      <Download className="w-3 h-3 text-blue-600" />
                      Current Bids (.csv)
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Drop Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-5 text-center cursor-pointer transition-colors bg-card hover:bg-muted/10 group"
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center text-primary transition-colors">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {fileName ? (
                      <span className="text-primary font-bold">{fileName}</span>
                    ) : (
                      "Click to select or drag & drop CSV or Excel spreadsheet"
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Supports .xlsx, .xls, .csv files up to 10MB
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

            {/* Dynamic Selective Import Controls (When file is loaded) */}
            {parsedRows.length > 0 && (
              <div className="rounded-xl border bg-card p-4 space-y-3.5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                      Select What to Import
                    </span>
                    <Badge variant="secondary" className="text-[11px]">
                      {selectedSuppliers.size} of {detectedSuppliers.length} Suppliers Active
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAllSuppliers}
                      className="h-6 text-[11px] text-primary hover:text-primary/80"
                    >
                      Select All
                    </Button>
                    <span className="text-muted-foreground text-xs">•</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeselectAllSuppliers}
                      className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Deselect All
                    </Button>
                  </div>
                </div>

                {/* Suppliers Checkbox Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {detectedSuppliers.map((supp) => {
                    const isChecked = selectedSuppliers.has(supp.name);
                    return (
                      <div
                        key={supp.name}
                        onClick={() => handleToggleSupplier(supp.name)}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all select-none ${
                          isChecked
                            ? "border-primary/50 bg-primary/5 text-foreground"
                            : "border-border/60 bg-muted/10 text-muted-foreground opacity-60 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent div
                            className="w-3.5 h-3.5 rounded border-border text-primary cursor-pointer accent-primary"
                          />
                          <span className="font-semibold truncate text-[11px]">{supp.name}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0 ml-1">
                          {supp.count} {supp.count === 1 ? "row" : "rows"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>

                {/* Import Strategy Options */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Layers className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">Import Strategy:</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="importStrategy"
                        value="merge"
                        checked={importStrategy === "merge"}
                        onChange={() => setImportStrategy("merge")}
                        className="accent-primary"
                      />
                      <span className="font-medium text-foreground">Merge & Update</span>
                      <span className="text-[10px] text-muted-foreground">(Keep existing & add/update)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="importStrategy"
                        value="replace"
                        checked={importStrategy === "replace"}
                        onChange={() => setImportStrategy("replace")}
                        className="accent-primary"
                      />
                      <span className="font-medium text-destructive">Replace All Bids</span>
                      <span className="text-[10px] text-muted-foreground">(Clear previous bids)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Parsed Preview Table */}
            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <div className="flex items-center gap-2">
                    <span>Active Quotation Lines ({rowsToImport.length} of {parsedRows.length} rows)</span>
                    {rowsToImport.length > 0 ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 gap-1 text-[11px]">
                        <CheckCircle2 className="w-3 h-3" /> Ready to Import
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 gap-1 text-[11px]">
                        <AlertCircle className="w-3 h-3" /> No suppliers selected
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Showing top {Math.min(rowsToImport.length, 12)} rows
                  </span>
                </div>

                <div className="rounded-lg border overflow-hidden max-h-52 overflow-y-auto bg-card">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 border-b text-muted-foreground uppercase text-[10px] font-semibold sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Supplier</th>
                        <th className="py-2 px-2">Item</th>
                        <th className="py-2 px-2">Incoterm</th>
                        <th className="py-2 px-2 text-right">Quoted Price</th>
                        <th className="py-2 px-2">Currency</th>
                        <th className="py-2 px-2 text-center">Lead Time</th>
                        <th className="py-2 px-2 text-center">Discount %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {rowsToImport.slice(0, 12).map((r, i) => (
                        <tr key={i} className="hover:bg-muted/10 transition-colors">
                          <td className="py-1.5 px-3 font-semibold text-foreground">{r.supplier}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{r.item}</td>
                          <td className="py-1.5 px-2 font-mono text-[11px]">{r.incoterm || "FOB"}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-medium text-foreground">
                            {r.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-muted-foreground">{r.currency}</td>
                          <td className="py-1.5 px-2 text-center text-muted-foreground">
                            {r.leadTimeDays ? `${r.leadTimeDays}d` : "-"}
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono">
                            {r.discountPct && r.discountPct > 0 ? `${r.discountPct}%` : "-"}
                          </td>
                        </tr>
                      ))}
                      {rowsToImport.length > 12 && (
                        <tr className="bg-muted/10 text-muted-foreground italic text-center">
                          <td colSpan={7} className="py-2 px-3">
                            ... and {rowsToImport.length - 12} more selected quotation lines
                          </td>
                        </tr>
                      )}
                      {rowsToImport.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-muted-foreground italic">
                            No rows selected. Check one or more suppliers above to preview and import their bids.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
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
                disabled={rowsToImport.length === 0 || isProcessing}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 h-8 text-xs font-semibold px-4"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Apply Import ({rowsToImport.length} rows)
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

ImportExportModal.displayName = "ImportExportModal";
