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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { exportRfqBidsToCsv, exportFullProjectTemplate, BIDS_CANONICAL_COLUMNS } from "../../engine/excel-export";
import {
  SupplierBid,
  RequestedItem,
  Incoterm,
  FreightBasis,
  InsuranceBasis,
  ShipmentType,
  PassFailResult,
  AwardStrategy,
  ExchangeRateEntry,
  QualityCriterion,
  RfqProject,
  BidAttachment,
  ItemAward,
  CustomsChargesConfig,
  ItemQuotation,
  IpcBracket,
  DutyMode,
} from "../../types";
import { DEFAULT_CUSTOMS_RATES, DEFAULT_IPC_BRACKETS } from "../../constants/default-customs-rates";

const VALID_INCOTERMS: Incoterm[] = [
  "DELIVERED",
  "PICK_UP",
  "EXW",
  "FCA",
  "FOB",
  "CFR",
  "CPT",
  "CIF",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
];

function parseDateOnly(val: unknown): string {
  if (val === null || val === undefined) return "";
  const pad = (n: number) => String(n).padStart(2, "0");

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}`;
  }

  if (typeof val === "number") {
    // Excel serial date (e.g. 45000 is around 2023)
    if (val > 20000 && val < 80000) {
      const excelEpoch = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(excelEpoch.getTime())) {
        return `${excelEpoch.getFullYear()}-${pad(excelEpoch.getMonth() + 1)}-${pad(excelEpoch.getDate())}`;
      }
    }
  }

  const trimmed = String(val).trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined" || trimmed === "—" || trimmed === "-") {
    return "";
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
  }

  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    if (y >= 1900 && y <= 2100) {
      return `${y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }
  return "";
}

const REQUIRED_COLUMNS_TEXT = BIDS_CANONICAL_COLUMNS.join(", ");

function mergeExchangeRates(
  existingRates: ExchangeRateEntry[] = [],
  importedRates: ExchangeRateEntry[] = []
): ExchangeRateEntry[] {
  const merged = [...existingRates];
  importedRates.forEach((ir) => {
    const idx = merged.findIndex((er) => er.currencyCode.toUpperCase() === ir.currencyCode.toUpperCase());
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], rateToComparison: ir.rateToComparison };
    } else {
      merged.push({ currencyCode: ir.currencyCode.toUpperCase(), rateToComparison: ir.rateToComparison });
    }
  });
  return merged;
}

function parseCleanFloat(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "number") return isNaN(val) ? fallback : val;
  const str = String(val).trim();
  if (!str) return fallback;
  const cleaned = str.replace(/[^0-9.-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
}

function parseCleanInt(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "number") return isNaN(val) ? fallback : Math.floor(val);
  const str = String(val).trim();
  if (!str) return fallback;
  const cleaned = str.replace(/[^0-9-]/g, "");
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? fallback : n;
}

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedProjectSetup {
  rfqTitle?: string;
  rfqReference?: string;
  notes?: string;
  targetDate?: string;
  budget?: number | null;
  comparisonCurrency?: string;
  fxRiskBufferPct?: number;
  costOfMoneyPctPerYear?: number;
  defaultVatPct?: number;
  countVatAsCost?: boolean;
  calcCustomsAuto?: boolean;
  scoringWeightPricePct?: number;
  scoringWeightQualityPct?: number;
  scoringWeightLeadTimePct?: number;
  awardStrategy?: AwardStrategy;
  preparedBy?: string;
  preparedByTitle?: string;
  reviewedBy?: string;
  reviewedByTitle?: string;
  approvedBy?: string;
  approvedByTitle?: string;
  justification?: string;
  exchangeRates?: ExchangeRateEntry[];
  qualityCriteria?: QualityCriterion[];
  items?: RequestedItem[];
  customsRates?: Partial<CustomsChargesConfig>;
  ipcBrackets?: IpcBracket[];
  awards?: ItemAward[];
}

interface ParsedRow {
  supplier: string;
  type?: string;
  country?: string;
  currency?: string;
  incoterm?: string;
  item: string;
  specifications?: string;
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
  supplierId?: string;
  quotationRef?: string;
  quoteDate?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  insuranceCurrency?: string;
  dutyMode?: string;
  singleDutyPct?: number;
  takeEarlyPayDiscount?: boolean;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = React.memo(
  ({ isOpen, onClose }) => {
    const { currentProject, updateProject, projectsList, importFullProject } = useBidComparisonStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [fileName, setFileName] = useState<string | null>(null);
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [detectedProjectSetup, setDetectedProjectSetup] = useState<ParsedProjectSetup | null>(null);
    const [parsedJsonProject, setParsedJsonProject] = useState<RfqProject | null>(null);
    const [parsedQualityScores, setParsedQualityScores] = useState<Map<string, Map<string, { passFailResult: PassFailResult; score: number | null; evidenceRemarks: string }>>>(new Map());
    const [parsedAttachments, setParsedAttachments] = useState<Map<string, BidAttachment[]>>(new Map());
    const [parsedAwardsList, setParsedAwardsList] = useState<Array<{ itemName: string; awardedSupplier: string; landedUnit: number; landedTotal: number }>>([]);
    const [importScope, setImportScope] = useState<"full_project" | "bids_only">("full_project");
    const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());
    const [importStrategy, setImportStrategy] = useState<"merge" | "replace">("merge");
    const [warnings, setWarnings] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [showColumnGuide, setShowColumnGuide] = useState(false);

    const resetState = useCallback(() => {
      setFileName(null);
      setParsedRows([]);
      setDetectedProjectSetup(null);
      setParsedJsonProject(null);
      setParsedQualityScores(new Map());
      setParsedAttachments(new Map());
      setParsedAwardsList([]);
      setImportScope("full_project");
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

      // -----------------------------------------------------------------------
      // A. Handle JSON Full Project Backup (.json)
      // -----------------------------------------------------------------------
      if (file.name.toLowerCase().endsWith(".json") || file.type === "application/json") {
        try {
          const text = await file.text();
          const json = JSON.parse(text) as Partial<RfqProject>;
          if (!json || typeof json !== "object") {
            throw new Error("Invalid JSON file content");
          }

          setParsedJsonProject(json as RfqProject);

          // Extract project setup
          const setup: ParsedProjectSetup = {
            rfqTitle: json.rfqTitle,
            rfqReference: json.rfqReference,
            notes: json.notes,
            targetDate: json.targetDate,
            budget: json.budget,
            comparisonCurrency: json.comparisonCurrency,
            fxRiskBufferPct: json.fxRiskBufferPct,
            costOfMoneyPctPerYear: json.costOfMoneyPctPerYear,
            defaultVatPct: json.defaultVatPct,
            countVatAsCost: json.countVatAsCost,
            calcCustomsAuto: json.calcCustomsAuto,
            scoringWeightPricePct: json.scoringWeightPricePct,
            scoringWeightQualityPct: json.scoringWeightQualityPct,
            scoringWeightLeadTimePct: json.scoringWeightLeadTimePct,
            awardStrategy: json.awardStrategy,
            preparedBy: json.preparedBy,
            preparedByTitle: json.preparedByTitle,
            reviewedBy: json.reviewedBy,
            reviewedByTitle: json.reviewedByTitle,
            approvedBy: json.approvedBy,
            approvedByTitle: json.approvedByTitle,
            justification: json.justification,
            exchangeRates: json.exchangeRates || [],
            qualityCriteria: json.qualityCriteria || [],
            items: json.items || [],
            customsRates: json.customsRates,
            awards: json.awards || [],
          };
          setDetectedProjectSetup(setup);
          setImportScope("full_project");

          // Build preview rows from json.bids
          const rows: ParsedRow[] = [];
          const foundSuppliers = new Set<string>();

          (json.bids || []).forEach((bid) => {
            const sName = (bid.supplierName || "").trim();
            if (sName) foundSuppliers.add(sName);
            (json.items || []).forEach((item) => {
              const q = bid.quotations?.[item.id];
              const pbs = q?.priceBreaks && q.priceBreaks.length > 0 ? q.priceBreaks : [{ minQuantity: 1, unitPrice: 0 }];
              pbs.forEach((pb) => {
                rows.push({
                  supplier: sName,
                  type: bid.supplierType === "LOCAL" ? "Local" : "International",
                  country: bid.country || "PH",
                  currency: bid.quoteCurrency || "PHP",
                  incoterm: bid.incoterm || (bid.supplierType === "LOCAL" ? "DELIVERED" : "FOB"),
                  item: item.itemName,
                  specifications: item.specifications,
                  quantity: item.quantity,
                  hsCode: item.hsCode,
                  dutyPct: item.dutyPct,
                  weightKg: item.weightPerUnitKg,
                  volumeCbm: item.cbmPerUnit,
                  unitPrice: pb.unitPrice || 0,
                  minQty: pb.minQuantity || 1,
                  discountPct: q?.discountPct || 0,
                  freightBasis: bid.freightBasis,
                  freightAmount: bid.freightRate,
                  freightMin: bid.freightMinimum,
                  freightCurrency: bid.freightCurrency,
                  insuranceBasis: bid.insuranceBasis,
                  insuranceAmount: bid.insuranceRateOrAmount,
                  ftaCode: bid.ftaAgreementName,
                  ftaDutyPct: bid.ftaDutyPct,
                  vatPct: bid.vatPct,
                  pricesIncludeVat: bid.pricesIncludeVat,
                  brokerageFee: bid.brokerageCompCurr,
                  otherPortCharges: bid.otherPortChargesCompCurr,
                  inlandTrucking: bid.inlandTruckingCompCurr,
                  bankFee: bid.bankFeePerPaymentCompCurr,
                  shipmentType: bid.shipmentType,
                  containers20ft: bid.containers20ft,
                  containers40ft: bid.containers40ft,
                  numShipments: bid.declarationsCount,
                  paidByLc: bid.paidByLc,
                  leadTimeDays: bid.leadTimeDays,
                  downPaymentPct: bid.downPaymentPct,
                  netDays: bid.balanceDueDays,
                  earlyPayDiscountPct: bid.earlyPayDiscountPct,
                  earlyPayDays: bid.earlyPayDiscountDays,
                  validUntil: parseDateOnly(bid.validUntil),
                  notes: bid.notes,
                  supplierId: bid.supplierId ? String(bid.supplierId) : undefined,
                  quotationRef: bid.quotationRef,
                  quoteDate: parseDateOnly(bid.quoteDate),
                  contactPerson: bid.contactPerson,
                  contactEmail: bid.contactEmail,
                  contactPhone: bid.contactPhone,
                  insuranceCurrency: bid.insuranceCurrency,
                  dutyMode: bid.dutyMode,
                  singleDutyPct: bid.singleDutyPct,
                  takeEarlyPayDiscount: bid.takeEarlyPayDiscount,
                });
              });
            });
          });

          setParsedRows(rows);
          setSelectedSuppliers(foundSuppliers);
          toast.success(`Loaded full project backup "${json.rfqTitle || "Untitled"}" (${json.items?.length || 0} items, ${foundSuppliers.size} suppliers)`);
          return;
        } catch (err) {
          toast.error("Failed to parse JSON backup: " + ((err as Error).message || "Invalid JSON"));
          return;
        } finally {
          setIsProcessing(false);
        }
      }

      // -----------------------------------------------------------------------
      // B. Handle Excel (.xlsx, .xls) and CSV (.csv)
      // -----------------------------------------------------------------------
      try {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetNames = workbook.SheetNames;

        let projectSetup: ParsedProjectSetup | null = null;
        const qualityScoresMap = new Map<string, Map<string, { passFailResult: PassFailResult; score: number | null; evidenceRemarks: string }>>();
        const attachmentsMap = new Map<string, BidAttachment[]>();
        const awardsList: Array<{ itemName: string; awardedSupplier: string; landedUnit: number; landedTotal: number }> = [];

        // 1. Detect & Parse "Project Setup" sheet
        const setupSheetName = sheetNames.find((s) => /project.*setup|setup|rfq.*config/i.test(s));
        if (setupSheetName) {
          const setupSheet = workbook.Sheets[setupSheetName];
          const rawSetupRows = XLSX.utils.sheet_to_json(setupSheet, { header: 1 }) as (string | number)[][];
          projectSetup = projectSetup || {};

          rawSetupRows.forEach((row) => {
            if (!row || row.length < 2) return;
            const key = String(row[0] || "").toLowerCase().trim();
            const val = row[1];
            if (val === undefined || val === null || val === "") return;

            if (/prepared.*by.*title/i.test(key)) projectSetup!.preparedByTitle = String(val).trim();
            else if (/prepared.*by$/i.test(key)) projectSetup!.preparedBy = String(val).trim();
            else if (/reviewed.*by.*title/i.test(key)) projectSetup!.reviewedByTitle = String(val).trim();
            else if (/reviewed.*by$/i.test(key)) projectSetup!.reviewedBy = String(val).trim();
            else if (/approved.*by.*title/i.test(key)) projectSetup!.approvedByTitle = String(val).trim();
            else if (/approved.*by$/i.test(key)) projectSetup!.approvedBy = String(val).trim();
            else if (
              /^(rfq\s*title|project\s*title|project\s*\/\s*rfq\s*title|title)$/i.test(key) ||
              (/title/i.test(key) && !/by|officer|lead|specialist|signatory/i.test(key))
            ) {
              projectSetup!.rfqTitle = String(val).trim();
            }
            else if (/reference/i.test(key)) projectSetup!.rfqReference = String(val).trim();
            else if (/target.*date|deadline/i.test(key)) projectSetup!.targetDate = parseDateOnly(val);
            else if (/budget/i.test(key)) {
              const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
              if (!isNaN(num)) projectSetup!.budget = num;
            } else if (/comparison.*currency|base.*currency/i.test(key)) {
              projectSetup!.comparisonCurrency = String(val).trim().toUpperCase();
            } else if (/notes/i.test(key)) {
              projectSetup!.notes = String(val).trim();
            } else if (/fx.*risk|buffer/i.test(key)) {
              const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
              if (!isNaN(num)) projectSetup!.fxRiskBufferPct = num;
            } else if (/cost.*of.*money|interest/i.test(key)) {
              const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
              if (!isNaN(num)) projectSetup!.costOfMoneyPctPerYear = num;
            } else if (/default.*vat|vat.*%/i.test(key)) {
              const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
              if (!isNaN(num)) projectSetup!.defaultVatPct = num;
            } else if (/count.*vat/i.test(key)) {
              projectSetup!.countVatAsCost = /yes|true|1/i.test(String(val));
            } else if (/customs.*auto/i.test(key)) {
              projectSetup!.calcCustomsAuto = /yes|true|1/i.test(String(val));
            } else if (/scoring.*weight.*price|price.*weight/i.test(key)) {
              const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
              if (!isNaN(num)) projectSetup!.scoringWeightPricePct = num;
            } else if (/scoring.*weight.*quality|quality.*weight/i.test(key)) {
              const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
              if (!isNaN(num)) projectSetup!.scoringWeightQualityPct = num;
            } else if (/scoring.*weight.*lead.*time|lead.*time.*weight/i.test(key)) {
              const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
              if (!isNaN(num)) projectSetup!.scoringWeightLeadTimePct = num;
            } else if (/cds.*fee|customs.*entry/i.test(key)) {
              projectSetup!.customsRates = projectSetup!.customsRates || {};
              projectSetup!.customsRates.cdsCompCurr = parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 100;
            } else if (/bir.*dst|stamp.*tax/i.test(key)) {
              projectSetup!.customsRates = projectSetup!.customsRates || {};
              projectSetup!.customsRates.birDstCompCurr = parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 30;
            } else if (/container.*security/i.test(key)) {
              projectSetup!.customsRates = projectSetup!.customsRates || {};
              projectSetup!.customsRates.containerSecurityUsd = parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 5;
            } else if (/arrastre.*20/i.test(key)) {
              projectSetup!.customsRates = projectSetup!.customsRates || {};
              projectSetup!.customsRates.arrastre20ftCompCurr = parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 4738;
            } else if (/arrastre.*40/i.test(key)) {
              projectSetup!.customsRates = projectSetup!.customsRates || {};
              projectSetup!.customsRates.arrastre40ftCompCurr = parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 10869;
            } else if (/wharfage.*20/i.test(key)) {
              projectSetup!.customsRates = projectSetup!.customsRates || {};
              projectSetup!.customsRates.wharfage20ftCompCurr = parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 519.35;
            } else if (/wharfage.*40/i.test(key)) {
              projectSetup!.customsRates = projectSetup!.customsRates || {};
              projectSetup!.customsRates.wharfage40ftCompCurr = parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 779.05;
            } else if (/lcl.*arrastre/i.test(key)) {
              projectSetup!.customsRates = projectSetup!.customsRates || {};
              projectSetup!.customsRates.lclArrastrePerRtCompCurr = parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 149;
            } else if (/lcl.*wharfage/i.test(key)) {
              projectSetup!.customsRates = projectSetup!.customsRates || {};
              projectSetup!.customsRates.lclWharfagePerRtCompCurr = parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 30.55;
            } else if (/lc.*bank.*charge/i.test(key)) {
              projectSetup!.customsRates = projectSetup!.customsRates || {};
              projectSetup!.customsRates.lcBankChargePct = parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 0.125;
            } else if (/ipc.*brackets?|price.*change.*brackets?/i.test(key)) {
              try {
                const parsedIpc = typeof val === "string" ? JSON.parse(val) : val;
                if (Array.isArray(parsedIpc)) projectSetup!.ipcBrackets = parsedIpc;
              } catch {
                // Ignore invalid json
              }
            } else if (/award.*strategy/i.test(key)) {
              const strat = String(val).trim().toUpperCase();
              if (["ALL_RECOMMENDED", "LOWEST_TOTAL_OPTIMIZED", "CHEAPEST_PER_ITEM", "MANUAL"].includes(strat)) {
                projectSetup!.awardStrategy = strat as AwardStrategy;
              }
            } else if (/justification/i.test(key)) projectSetup!.justification = String(val).trim();
          });
        }

        // 2. Detect & Parse "Exchange Rates" sheet (1.6 Evaluation Exchange Rates)
        const ratesSheetName =
          sheetNames.find((s) => /^exchange\s*rates?$/i.test(s.trim())) ||
          sheetNames.find((s) => /exchange.*rates?|currencies|^rates$/i.test(s.trim())) ||
          sheetNames.find((s) => /rates/i.test(s));

        if (ratesSheetName) {
          const ratesSheet = workbook.Sheets[ratesSheetName];
          const rawRatesRows = XLSX.utils.sheet_to_json(ratesSheet, { header: 1 }) as (string | number)[][];
          const parsedRates: ExchangeRateEntry[] = [];

          let headerIdx = -1;
          let codeCol = -1;
          let rateCol = -1;

          for (let r = 0; r < Math.min(rawRatesRows.length, 10); r++) {
            const row = rawRatesRows[r];
            if (!row || row.length === 0) continue;
            let tempCode = -1;
            let tempRate = -1;

            for (let c = 0; c < row.length; c++) {
              const cell = String(row[c] || "").toLowerCase().trim();
              if (/rate|comparison/i.test(cell)) {
                tempRate = c;
              } else if (/code|currency|symbol/i.test(cell)) {
                tempCode = c;
              }
            }
            if (tempCode >= 0 && tempRate >= 0 && tempCode !== tempRate) {
              headerIdx = r;
              codeCol = tempCode;
              rateCol = tempRate;
              break;
            }
          }

          if (headerIdx >= 0) {
            for (let r = headerIdx + 1; r < rawRatesRows.length; r++) {
              const row = rawRatesRows[r];
              if (!row || row.length === 0) continue;
              const rawCode = codeCol >= 0 ? String(row[codeCol] || "").trim().toUpperCase() : "";
              if (!rawCode || rawCode.length < 2 || rawCode.length > 5 || /currency|code|rate/i.test(rawCode)) continue;
              const rawRate = rateCol >= 0 ? row[rateCol] : null;
              const rate = parseCleanFloat(rawRate, 0);
              if (rate > 0) {
                const existing = parsedRates.find((pr) => pr.currencyCode === rawCode);
                if (existing) {
                  existing.rateToComparison = rate;
                } else {
                  parsedRates.push({ currencyCode: rawCode, rateToComparison: rate });
                }
              }
            }
          }

          if (parsedRates.length > 0) {
            projectSetup = projectSetup || {};
            projectSetup.exchangeRates = parsedRates;
          }
        }

        // 3. Detect & Parse "Quality Criteria" sheet (1.4 Scored & 1.5 Pass/Fail Mandatory)
        const critSheetName =
          sheetNames.find((s) => /^quality\s*criteria$/i.test(s.trim())) ||
          sheetNames.find((s) => /quality\s*criteria/i.test(s) && !/compliance|evaluation|matrix/i.test(s)) ||
          sheetNames.find((s) => /criteria/i.test(s) && !/compliance/i.test(s));
        if (critSheetName) {
          const critSheet = workbook.Sheets[critSheetName];
          const rawCritRows = XLSX.utils.sheet_to_json(critSheet, { header: 1 }) as (string | number)[][];
          const parsedCriteria: QualityCriterion[] = [];

          let headerIdx = -1;
          let typeCol = -1;
          let nameCol = -1;
          let weightCol = -1;
          let orderCol = -1;

          for (let r = 0; r < Math.min(rawCritRows.length, 10); r++) {
            const row = rawCritRows[r];
            if (!row || row.length === 0) continue;
            let tempType = -1;
            let tempName = -1;
            let tempWeight = -1;
            let tempOrder = -1;

            for (let c = 0; c < row.length; c++) {
              const cell = String(row[c] || "").toLowerCase().trim();
              if (/criterion\s*type|req.*type/i.test(cell)) {
                tempType = c;
              } else if (/criterion\s*name|parameter|requirement\s*name/i.test(cell)) {
                tempName = c;
              } else if (/(^criterion$|^requirement$)/i.test(cell)) {
                tempName = c;
              } else if (/weight/i.test(cell)) {
                tempWeight = c;
              } else if (/order|sort/i.test(cell)) {
                tempOrder = c;
              }
            }
            if (tempName >= 0 || (tempType >= 0 && row.length >= 2)) {
              headerIdx = r;
              typeCol = tempType;
              nameCol = tempName >= 0 ? tempName : (tempType === 0 ? 1 : 0);
              weightCol = tempWeight;
              orderCol = tempOrder;
              break;
            }
          }

          if (headerIdx >= 0) {
            for (let r = headerIdx + 1; r < rawCritRows.length; r++) {
              const row = rawCritRows[r];
              if (!row || row.length === 0) continue;

              const rawType = typeCol >= 0 ? String(row[typeCol] || "").trim() : "";
              const rawName = nameCol >= 0 ? String(row[nameCol] || "").trim() : "";
              if (!rawName) continue;

              // Reject invalid criterion names (header labels, blank, or bare types)
              const cleanUpper = rawName.toUpperCase();
              if (
                cleanUpper === "CRITERION TYPE" ||
                cleanUpper === "CRITERION NAME" ||
                cleanUpper === "CRITERION" ||
                cleanUpper === "SCORED" ||
                cleanUpper === "PASS_FAIL" ||
                cleanUpper === "PASS / FAIL" ||
                cleanUpper === "TYPE" ||
                /mandatory\s*requirements/i.test(rawName)
              ) {
                continue;
              }

              const isPassFail = /pass|fail|mandatory/i.test(rawType);
              const type: "PASS_FAIL" | "SCORED" = isPassFail ? "PASS_FAIL" : "SCORED";

              let weight = 0;
              if (weightCol >= 0 && row[weightCol] !== undefined && row[weightCol] !== null) {
                const nw = typeof row[weightCol] === "number" ? (row[weightCol] as number) : parseFloat(String(row[weightCol]));
                if (!isNaN(nw)) weight = nw;
              }

              let sortOrder = parsedCriteria.length + 1;
              if (orderCol >= 0 && row[orderCol] !== undefined && row[orderCol] !== null) {
                const no = typeof row[orderCol] === "number" ? (row[orderCol] as number) : parseInt(String(row[orderCol]), 10);
                if (!isNaN(no)) sortOrder = no;
              }

              parsedCriteria.push({
                id: `crit-import-${parsedCriteria.length + 1}-${Date.now().toString(36)}`,
                criterionType: type,
                criterionName: rawName,
                weightPct: type === "SCORED" ? weight : 0,
                sortOrder,
              });
            }
          }

          if (parsedCriteria.length > 0) {
            projectSetup = projectSetup || {};
            projectSetup.qualityCriteria = parsedCriteria;
          }
        }

        // 4. Detect & Parse "Quality & Compliance" sheet (2.5 Technical Quality Evaluation matrix)
        const qualSheetName = sheetNames.find((s) => /quality.*compliance|compliance.*matrix|evaluation.*matrix/i.test(s));
        if (qualSheetName) {
          const qualSheet = workbook.Sheets[qualSheetName];
          const rawQualRows = XLSX.utils.sheet_to_json(qualSheet, { header: 1 }) as (string | number)[][];

          let currentSection: "PASS_FAIL" | "SCORED" | null = null;
          let pfSuppliers: string[] = [];
          let scoredSuppliers: string[] = [];

          rawQualRows.forEach((row) => {
            if (!row || row.length === 0) return;
            const firstCell = String(row[0] || "").trim();
            const secondCell = String(row[1] || "").trim();

            if (/1\.\s*MANDATORY\s*COMPLIANCE/i.test(firstCell)) {
              currentSection = "PASS_FAIL";
              return;
            }
            if (/2\.\s*TECHNICAL\s*SCORED/i.test(firstCell)) {
              currentSection = "SCORED";
              return;
            }
            if (/3\.\s*TECHNICAL\s*EVALUATION/i.test(firstCell)) {
              currentSection = null;
              return;
            }

            // Header row for Pass/Fail section
            if (currentSection === "PASS_FAIL" && firstCell === "#" && /criterion/i.test(secondCell)) {
              pfSuppliers = [];
              for (let c = 3; c < row.length; c += 2) {
                const headerText = String(row[c] || "").replace(/\s+result$/i, "").trim();
                if (headerText) pfSuppliers.push(headerText);
              }
              return;
            }

            // Header row for Scored section
            if (currentSection === "SCORED" && firstCell === "#" && /parameter|criterion/i.test(secondCell)) {
              scoredSuppliers = [];
              for (let c = 3; c < row.length; c += 3) {
                const headerText = String(row[c] || "").replace(/\s+rating.*$/i, "").trim();
                if (headerText) scoredSuppliers.push(headerText);
              }
              return;
            }

            const rowNum = Number(row[0]);
            const hasValidIndex = !isNaN(rowNum) && rowNum > 0;

            // Data rows in PASS_FAIL
            if (currentSection === "PASS_FAIL" && pfSuppliers.length > 0 && hasValidIndex && secondCell) {
              const criterionName = secondCell.trim();
              pfSuppliers.forEach((suppName, sIdx) => {
                const resultVal = String(row[3 + sIdx * 2] || "").trim().toUpperCase();
                const remarksVal = String(row[4 + sIdx * 2] || "").trim();
                const pfResult: PassFailResult = resultVal === "PASS" ? "PASS" : resultVal === "FAIL" ? "FAIL" : "NOT_CHECKED";
                const remarks = remarksVal && remarksVal !== "-" ? remarksVal : "";

                const sKey = suppName.toLowerCase();
                if (!qualityScoresMap.has(sKey)) qualityScoresMap.set(sKey, new Map());
                const sMap = qualityScoresMap.get(sKey)!;
                const scoreObj = {
                  passFailResult: pfResult,
                  score: null,
                  evidenceRemarks: remarks,
                };
                sMap.set(criterionName.toLowerCase(), scoreObj);
                sMap.set(normalizeKey(criterionName), scoreObj);
              });
              return;
            }

            // Data rows in SCORED
            if (currentSection === "SCORED" && scoredSuppliers.length > 0 && hasValidIndex && secondCell) {
              const criterionName = secondCell.trim();
              scoredSuppliers.forEach((suppName, sIdx) => {
                const rawScore = row[3 + sIdx * 3];
                const numScore = typeof rawScore === "number" ? rawScore : parseFloat(String(rawScore));
                const remarksVal = String(row[5 + sIdx * 3] || "").trim();
                const validScore = !isNaN(numScore) && numScore >= 1 && numScore <= 5 ? numScore : null;
                const remarks = remarksVal && remarksVal !== "-" ? remarksVal : "";

                const sKey = suppName.toLowerCase();
                if (!qualityScoresMap.has(sKey)) qualityScoresMap.set(sKey, new Map());
                const sMap = qualityScoresMap.get(sKey)!;
                const scoreObj = {
                  passFailResult: "NOT_CHECKED" as PassFailResult,
                  score: validScore,
                  evidenceRemarks: remarks,
                };
                sMap.set(criterionName.toLowerCase(), scoreObj);
                sMap.set(normalizeKey(criterionName), scoreObj);
              });
              return;
            }
          });
        }
        setParsedQualityScores(qualityScoresMap);

        // 5. Detect & Parse "Attachments" sheet (Quotation & certificate links)
        const attSheetName = sheetNames.find((s) => /attachment/i.test(s));
        if (attSheetName) {
          const attSheet = workbook.Sheets[attSheetName];
          const rawAttRows = XLSX.utils.sheet_to_json(attSheet, { header: 1 }) as (string | number)[][];

          let headerIdx = -1;
          let suppCol = -1;
          let typeCol = -1;
          let nameCol = -1;
          let idCol = -1;
          let sizeCol = -1;
          let mimeCol = -1;
          let urlCol = -1;

          for (let r = 0; r < rawAttRows.length; r++) {
            const row = rawAttRows[r];
            if (!row || row.length === 0) continue;
            for (let c = 0; c < row.length; c++) {
              const cell = String(row[c] || "").toLowerCase().trim();
              if (/supplier/i.test(cell)) suppCol = c;
              else if (/doc.*type|type/i.test(cell)) typeCol = c;
              else if (/file.*name|document.*name/i.test(cell)) nameCol = c;
              else if (/directus|file.*id/i.test(cell)) idCol = c;
              else if (/size|bytes/i.test(cell)) sizeCol = c;
              else if (/mime/i.test(cell)) mimeCol = c;
              else if (/url|link|download/i.test(cell)) urlCol = c;
            }
            if (suppCol >= 0 && (nameCol >= 0 || urlCol >= 0 || idCol >= 0)) {
              headerIdx = r;
              break;
            }
          }

          if (headerIdx >= 0) {
            for (let r = headerIdx + 1; r < rawAttRows.length; r++) {
              const row = rawAttRows[r];
              if (!row || row.length === 0) continue;

              const supplierName = suppCol >= 0 ? String(row[suppCol] || "").trim() : "";
              if (!supplierName || /supplier\s*name/i.test(supplierName)) continue;

              const docType = typeCol >= 0 ? String(row[typeCol] || "").trim() : "Quotation";
              const fileName = nameCol >= 0 ? String(row[nameCol] || "").trim() : "";
              const fileId = idCol >= 0 ? String(row[idCol] || "").trim() : "";
              const url = urlCol >= 0 ? String(row[urlCol] || "").trim() : "";
              const mimeType = mimeCol >= 0 ? String(row[mimeCol] || "").trim() : "";

              let fileSize: number | undefined = undefined;
              if (sizeCol >= 0 && row[sizeCol] !== undefined && row[sizeCol] !== null) {
                const ns = typeof row[sizeCol] === "number" ? (row[sizeCol] as number) : parseInt(String(row[sizeCol]), 10);
                if (!isNaN(ns) && ns > 0) fileSize = ns;
              }

              if (supplierName && (fileName || url || fileId)) {
                const sKey = supplierName.toLowerCase();
                const list = attachmentsMap.get(sKey) || [];
                list.push({
                  id: `att-import-${list.length + 1}-${Date.now().toString(36)}`,
                  documentType: docType || "Quotation",
                  fileName: fileName || (url ? url.split("/").pop() || "Document" : "Attachment"),
                  directusFileId: fileId || "",
                  fileSize,
                  mimeType: mimeType || undefined,
                  fileUrl: url || undefined,
                });
                attachmentsMap.set(sKey, list);
              }
            }
          }
        }
        setParsedAttachments(attachmentsMap);

        // 6. Detect & Parse "Award & Approval" sheet
        const awardSheetName = sheetNames.find((s) => /award.*approval|awards?/i.test(s));
        if (awardSheetName) {
          const awardSheet = workbook.Sheets[awardSheetName];
          const rawAwardRows = XLSX.utils.sheet_to_json(awardSheet, { header: 1 }) as (string | number)[][];
          let inTable = false;

          rawAwardRows.forEach((row, rIdx) => {
            if (!row || row.length < 5) return;
            const firstCell = String(row[0] || "").trim();
            const secondCell = String(row[1] || "").trim();
            const fifthCell = String(row[4] || "").trim();

            if (firstCell === "#" && /item/i.test(secondCell)) {
              inTable = true;
              return;
            }
            if (/TOTAL AWARDED|APPROVED BUDGET|JUSTIFICATION|SIGNATORIES/i.test(secondCell) || /JUSTIFICATION|SIGNATORIES/i.test(firstCell)) {
              inTable = false;
            }

            const rowNum = Number(firstCell);
            if (inTable && !isNaN(rowNum) && rowNum > 0 && secondCell && fifthCell && !/unawarded/i.test(fifthCell)) {
              const rawUnit = row[5];
              const rawTotal = row[6];
              const landedUnit = typeof rawUnit === "number" ? rawUnit : (parseFloat(String(rawUnit).replace(/[^0-9.-]/g, "")) || 0);
              const landedTotal = typeof rawTotal === "number" ? rawTotal : (parseFloat(String(rawTotal).replace(/[^0-9.-]/g, "")) || 0);

              awardsList.push({
                itemName: secondCell,
                awardedSupplier: fifthCell,
                landedUnit,
                landedTotal,
              });
            }

            // Also check for justification and signatories in Sheet 6
            if (/JUSTIFICATION.*REASON.*FOR.*AWARD/i.test(firstCell) || /JUSTIFICATION.*REASON.*FOR.*AWARD/i.test(secondCell)) {
              const nextRow = rawAwardRows[rIdx + 1];
              if (nextRow && nextRow[0]) {
                const justText = String(nextRow[0]).trim();
                if (justText && !/no justification recorded/i.test(justText) && projectSetup) {
                  projectSetup.justification = projectSetup.justification || justText;
                }
              }
            }

            if (/SIGNATORIES/i.test(firstCell) || /SIGNATORIES/i.test(secondCell)) {
              const nextRow = rawAwardRows[rIdx + 1];
              if (nextRow) {
                nextRow.forEach((cellVal) => {
                  const str = String(cellVal || "").trim();
                  const prepMatch = str.match(/Prepared\s*by:\s*([^(]+)(?:\(([^)]+)\))?/i);
                  if (prepMatch && projectSetup) {
                    projectSetup.preparedBy = projectSetup.preparedBy || prepMatch[1].trim();
                    if (prepMatch[2]) projectSetup.preparedByTitle = projectSetup.preparedByTitle || prepMatch[2].trim();
                  }
                  const revMatch = str.match(/Reviewed\s*by:\s*([^(]+)(?:\(([^)]+)\))?/i);
                  if (revMatch && projectSetup) {
                    projectSetup.reviewedBy = projectSetup.reviewedBy || revMatch[1].trim();
                    if (revMatch[2]) projectSetup.reviewedByTitle = projectSetup.reviewedByTitle || revMatch[2].trim();
                  }
                  const appMatch = str.match(/Approved\s*by:\s*([^(]+)(?:\(([^)]+)\))?/i);
                  if (appMatch && projectSetup) {
                    projectSetup.approvedBy = projectSetup.approvedBy || appMatch[1].trim();
                    if (appMatch[2]) projectSetup.approvedByTitle = projectSetup.approvedByTitle || appMatch[2].trim();
                  }
                });
              }
            }
          });
        }
        setParsedAwardsList(awardsList);

        // 7. Detect & Parse "Requested Items" sheet
        const itemsSheetName = sheetNames.find((s) => /requested.*items|items|products|materials/i.test(s));
        if (itemsSheetName) {
          const itemsSheet = workbook.Sheets[itemsSheetName];
          const rawItemsRows = XLSX.utils.sheet_to_json(itemsSheet, { header: 1 }) as (string | number)[][];
          const parsedItems: RequestedItem[] = [];

          let headerIdx = -1;
          let nameCol = -1;
          let specCol = -1;
          let qtyCol = -1;
          let uomCol = -1;
          let priceCol = -1;
          let hsCol = -1;
          let dutyCol = -1;
          let weightCol = -1;
          let volCol = -1;
          let prodIdCol = -1;
          let tmplIdCol = -1;
          let varIdCol = -1;

          for (let r = 0; r < rawItemsRows.length; r++) {
            const row = rawItemsRows[r];
            if (!row || row.length === 0) continue;
            for (let c = 0; c < row.length; c++) {
              const cell = String(row[c] || "").toLowerCase().trim();
              if (/item.*name|product\s*name/i.test(cell) && !/spec/i.test(cell)) nameCol = c;
              else if (/spec/i.test(cell)) specCol = c;
              else if (/quantity|qty/i.test(cell)) qtyCol = c;
              else if (/uom|unit/i.test(cell) && !/price|cost|weight|vol/i.test(cell)) uomCol = c;
              else if (/target.*unit|target.*price|budget/i.test(cell)) priceCol = c;
              else if (/hs.*code/i.test(cell)) hsCol = c;
              else if (/duty/i.test(cell)) dutyCol = c;
              else if (/weight|kg/i.test(cell)) weightCol = c;
              else if (/volume|cbm/i.test(cell)) volCol = c;
              else if (/product.*id/i.test(cell)) prodIdCol = c;
              else if (/template.*id/i.test(cell)) tmplIdCol = c;
              else if (/variant.*id/i.test(cell)) varIdCol = c;
            }
            if (nameCol >= 0) {
              headerIdx = r;
              break;
            }
          }

          if (headerIdx >= 0) {
            for (let r = headerIdx + 1; r < rawItemsRows.length; r++) {
              const row = rawItemsRows[r];
              if (!row || row.length === 0) continue;

              const itemName = nameCol >= 0 ? String(row[nameCol] || "").trim() : "";
              if (!itemName || /item\s*name/i.test(itemName)) continue;

              const specifications = specCol >= 0 ? String(row[specCol] || "").trim() : "";
              const uom = uomCol >= 0 ? String(row[uomCol] || "").trim().toUpperCase() || "PCS" : "PCS";
              const hsCode = hsCol >= 0 ? String(row[hsCol] || "").trim() : "";

              let quantity = 100;
              if (qtyCol >= 0 && row[qtyCol] !== undefined) {
                const n = typeof row[qtyCol] === "number" ? (row[qtyCol] as number) : parseFloat(String(row[qtyCol]).replace(/[^0-9.-]/g, ""));
                if (!isNaN(n) && n > 0) quantity = n;
              }

              let targetUnitPrice = 0;
              if (priceCol >= 0 && row[priceCol] !== undefined) {
                const n = typeof row[priceCol] === "number" ? (row[priceCol] as number) : parseFloat(String(row[priceCol]).replace(/[^0-9.-]/g, ""));
                if (!isNaN(n)) targetUnitPrice = n;
              }

              let dutyPct = 0;
              if (dutyCol >= 0 && row[dutyCol] !== undefined) {
                const n = typeof row[dutyCol] === "number" ? (row[dutyCol] as number) : parseFloat(String(row[dutyCol]).replace(/[^0-9.-]/g, ""));
                if (!isNaN(n)) dutyPct = n;
              }

              let weight = 0;
              if (weightCol >= 0 && row[weightCol] !== undefined) {
                const n = typeof row[weightCol] === "number" ? (row[weightCol] as number) : parseFloat(String(row[weightCol]).replace(/[^0-9.-]/g, ""));
                if (!isNaN(n)) weight = n;
              }

              let volume = 0;
              if (volCol >= 0 && row[volCol] !== undefined) {
                const n = typeof row[volCol] === "number" ? (row[volCol] as number) : parseFloat(String(row[volCol]).replace(/[^0-9.-]/g, ""));
                if (!isNaN(n)) volume = n;
              }

              const productId = prodIdCol >= 0 && row[prodIdCol] !== undefined ? (Number(row[prodIdCol]) || undefined) : undefined;
              const itemTemplateId = tmplIdCol >= 0 && row[tmplIdCol] !== undefined ? (Number(row[tmplIdCol]) || undefined) : undefined;
              const itemVariantId = varIdCol >= 0 && row[varIdCol] !== undefined ? (Number(row[varIdCol]) || undefined) : undefined;

              parsedItems.push({
                id: `item-import-${parsedItems.length + 1}-${Date.now().toString(36)}`,
                itemName,
                specifications,
                quantity,
                uom,
                targetUnitPrice,
                hsCode,
                dutyPct,
                weightPerUnitKg: weight,
                cbmPerUnit: volume,
                productId,
                itemTemplateId,
                itemVariantId,
                sortOrder: parsedItems.length + 1,
              });
            }
          }

          if (parsedItems.length > 0) {
            projectSetup = projectSetup || {};
            projectSetup.items = parsedItems;
          }
        }

        // 8. Detect & Parse "Bids & Quotations" sheet
        const bestSheetName =
          sheetNames.find((s) => /bids?.*quotations?|quotations?|bids?/i.test(s) && !/comparison/i.test(s)) ||
          sheetNames.find((s) => !/setup|rates|criteria|items|comparison|award|quality|compliance|attachment/i.test(s)) ||
          sheetNames[0];
        const sheet = workbook.Sheets[bestSheetName];
        const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
        });

        if (rawRows.length === 0 && (!projectSetup || !projectSetup.items || projectSetup.items.length === 0)) {
          toast.error("The uploaded file does not contain any bid quotations or item setup data.");
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
          const specifications = getVal(map, "specifications", "specification", "specs", "technicalspecifications").trim();
          const rawPriceStr = getVal(map, "unitprice", "price");
          const unitPrice = parseCleanFloat(rawPriceStr, 0);

          if (!supplier && !item) return;

          if (!supplier) {
            warnList.push(`Row ${idx + 2}: Missing supplier name`);
            return;
          }
          if (!item) {
            warnList.push(`Row ${idx + 2}: Missing item description`);
            return;
          }

          if (rawPriceStr && unitPrice <= 0) {
            warnList.push(`Row ${idx + 2}: Unit price for "${item}" from "${supplier}" is 0 or non-numeric ("${rawPriceStr}")`);
          }

          foundSuppliers.add(supplier);

          const rawType = getVal(map, "type", "suppliertype") || "International";
          const rawCountry = getVal(map, "country", "origincountry") || (rawType.toLowerCase() === "local" ? "PH" : "CN");
          const isLocalSupplier = rawType.toLowerCase() === "local" || rawCountry.toUpperCase() === "PH";
          const rawInco = getVal(map, "incoterm", "deliveryterms").toUpperCase();
          const incoterm = rawInco || (isLocalSupplier ? "DELIVERED" : "FOB");

          const supplierId = getVal(map, "supplierid", "vendorid").trim();
          const quotationRef = getVal(map, "quotationref", "quotationreference", "quoteref").trim();
          const quoteDate = parseDateOnly(getVal(map, "quotedate", "date"));
          const contactPerson = getVal(map, "contactperson", "contactname", "contact").trim();
          const contactEmail = getVal(map, "contactemail", "email").trim();
          const contactPhone = getVal(map, "contactphone", "phone", "tel").trim();
          const insuranceCurrency = (getVal(map, "insurancecurrency") || getVal(map, "freightcurrency", "currency") || "USD").toUpperCase();
          const dutyMode = getVal(map, "dutymode").toUpperCase().trim();
          const singleDutyPct = parseCleanFloat(getVal(map, "singledutypct", "singleduty"), 0);
          const takeEarlyPayRaw = getVal(map, "takeearlypay", "takeearlypayment", "takeearlypaymentdiscount").toLowerCase();
          const takeEarlyPayDiscount = takeEarlyPayRaw ? /yes|true|1/i.test(takeEarlyPayRaw) : undefined;

          const row: ParsedRow = {
            supplier,
            type: rawType,
            country: rawCountry,
            currency: (getVal(map, "currency", "quotecurrency") || (isLocalSupplier ? "PHP" : "USD")).toUpperCase(),
            incoterm,
            item,
            specifications: specifications || undefined,
            quantity: parseCleanFloat(getVal(map, "qty", "quantity"), 0) || undefined,
            hsCode: getVal(map, "hscode").trim(),
            dutyPct: parseCleanFloat(getVal(map, "itemduty", "dutypct", "duty"), 0),
            weightKg: parseCleanFloat(getVal(map, "kgunit", "weightperunitkg", "weightkg"), 0),
            volumeCbm: parseCleanFloat(getVal(map, "cbmunit", "volumeperunitcbm", "volumecbm"), 0),
            unitPrice,
            minQty: parseCleanFloat(getVal(map, "minqty", "minimumquantity", "moq"), 1),
            discountPct: parseCleanFloat(getVal(map, "discount", "discountpct"), 0),
            freightBasis: getVal(map, "freightbasis") || "LUMP_SUM",
            freightAmount: parseCleanFloat(getVal(map, "freight", "freightcost"), 0),
            freightMin: parseCleanFloat(getVal(map, "freightmin", "freightminimum"), 0),
            freightCurrency: (getVal(map, "freightcurrency", "currency") || "USD").toUpperCase(),
            insuranceBasis: getVal(map, "insurancebasis") || "PCT_GOODS_AND_FREIGHT",
            insuranceAmount: parseCleanFloat(getVal(map, "insurance"), 0.3),
            ftaCode: getVal(map, "fta").trim(),
            ftaDutyPct: parseCleanFloat(getVal(map, "ftaduty"), 0),
            vatPct: parseCleanFloat(getVal(map, "vat", "vatpct"), 12),
            pricesIncludeVat:
              getVal(map, "pricesinclvat", "pricesincludingvat").toLowerCase() === "true" ||
              getVal(map, "pricesinclvat").toLowerCase() === "yes",
            brokerageFee: parseCleanFloat(getVal(map, "brokerage"), 0),
            otherPortCharges: parseCleanFloat(getVal(map, "customsotherportcharges", "customs", "otherportcharges"), 0),
            inlandTrucking: parseCleanFloat(getVal(map, "inland", "inlandtrucking"), 0),
            bankFee: parseCleanFloat(getVal(map, "bankfee"), 0),
            shipmentType: (getVal(map, "shipmenttypefcllclairauto", "shipmenttype") || "AUTO").toUpperCase(),
            containers20ft: parseCleanInt(getVal(map, "containers20ft"), 0),
            containers40ft: parseCleanInt(getVal(map, "containers40ft"), 0),
            numShipments: parseCleanInt(getVal(map, "shipments", "numberofshipments"), 1) || 1,
            paidByLc:
              getVal(map, "paidbylc").toLowerCase() === "true" ||
              getVal(map, "paidbylc").toLowerCase() === "yes",
            leadTimeDays: parseCleanInt(getVal(map, "leaddays", "leadtimedays"), 0),
            downPaymentPct: parseCleanFloat(getVal(map, "down", "downpaymentpct"), 0),
            netDays: parseCleanInt(getVal(map, "netdays", "balanceduedays"), 0),
            earlyPayDiscountPct: parseCleanFloat(getVal(map, "earlypay", "earlypaypct", "discountforpromptpayment", "earlypaydiscountpct"), 0),
            earlyPayDays: parseCleanInt(getVal(map, "earlypaydays", "earlypaymentdiscountdays", "earlypaydiscountdays"), 0),
            validUntil: parseDateOnly(getVal(map, "validuntil", "quotationvaliduntil")),
            qualityScore: parseCleanFloat(getVal(map, "quality15appliedtoallcriteria", "quality", "qualityscore"), 0),
            notes: getVal(map, "notes").trim(),
            supplierId: supplierId || undefined,
            quotationRef: quotationRef || undefined,
            quoteDate: quoteDate || undefined,
            contactPerson: contactPerson || undefined,
            contactEmail: contactEmail || undefined,
            contactPhone: contactPhone || undefined,
            insuranceCurrency: insuranceCurrency || undefined,
            dutyMode: dutyMode || undefined,
            singleDutyPct: singleDutyPct || undefined,
            takeEarlyPayDiscount,
          };
          rows.push(row);
        });

        setParsedRows(rows);
        setSelectedSuppliers(foundSuppliers);
        setWarnings(warnList);
        setDetectedProjectSetup(projectSetup);
        if (projectSetup) {
          setImportScope("full_project");
        }

        if (rows.length > 0) {
          const setupMsg = projectSetup ? " (with full project setup, criteria & evaluations)" : "";
          toast.success(`Parsed ${rows.length} rows across ${foundSuppliers.size} suppliers${setupMsg} from ${file.name}`);
        } else if (projectSetup && projectSetup.items && projectSetup.items.length > 0) {
          toast.success(`Parsed project setup with ${projectSetup.items.length} items from ${file.name}`);
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
      // Guard against importing into locked projects (Defect 11)
      if (currentProject && (currentProject.status === "Submitted" || currentProject.status === "Approved")) {
        toast.error(`Cannot import into a locked project (${currentProject.status}). Please return it to Draft or create a new canvass.`);
        return;
      }

      // -----------------------------------------------------------------------
      // Path 1: Applying from Full JSON Backup
      // -----------------------------------------------------------------------
      if (parsedJsonProject) {
        let targetRef = (parsedJsonProject.rfqReference || `RFQ-${Date.now().toString().slice(-6)}`).trim();
        const baseRef = targetRef;
        let attempt = 1;
        while (
          projectsList.some(
            (p) => p.rfqReference?.toLowerCase().trim() === targetRef.toLowerCase().trim() && p.id !== currentProject?.id
          ) &&
          attempt <= 20
        ) {
          attempt++;
          targetRef = `${baseRef}-COPY${attempt > 2 ? `-${attempt}` : ""}`;
        }

        const filteredBids = (parsedJsonProject.bids || [])
          .filter((b) => selectedSuppliers.has(b.supplierName.trim()))
          .map((b) => {
            const cleanQuotes: Record<string, ItemQuotation> = {};
            if (b.quotations) {
              Object.entries(b.quotations).forEach(([itemId, q]) => {
                cleanQuotes[itemId] = {
                  ...q,
                  dbId: undefined,
                  priceBreaks: (q.priceBreaks || []).map((pb) => ({
                    ...pb,
                    dbId: undefined,
                  })),
                };
              });
            }
            return {
              ...b,
              dbId: undefined,
              quotations: cleanQuotes,
              scores: { ...(b.scores || {}) },
              attachments: [...(b.attachments || [])],
            };
          });

        const cleanItems = (parsedJsonProject.items || []).map((it) => ({
          ...it,
          dbId: undefined,
        }));
        const cleanCriteria = (parsedJsonProject.qualityCriteria || []).map((qc) => ({
          ...qc,
          dbId: undefined,
        }));
        const cleanAwards = (parsedJsonProject.awards || []).map((a) => ({
          ...a,
          dbId: undefined,
        }));

        if (currentProject && importScope !== "full_project") {
          updateProject((prev) => ({
            ...prev,
            bids: importStrategy === "replace" ? filteredBids : [...prev.bids, ...filteredBids],
          }));
          toast.success(`Imported ${filteredBids.length} suppliers into current project.`);
        } else if (currentProject && importScope === "full_project") {
          // Full project import into open RFQ honoring Merge/Replace without creating duplicate -COPY (Defect 10)
          updateProject((prev) => {
            let nextItems: RequestedItem[];
            let nextBids: SupplierBid[];

            if (importStrategy === "replace") {
              nextItems = cleanItems;
              nextBids = filteredBids;
            } else {
              // Merge items
              nextItems = [...prev.items];
              cleanItems.forEach((cItem) => {
                const existing = nextItems.find((it) => it.itemName.toLowerCase().trim() === cItem.itemName.toLowerCase().trim());
                if (!existing) nextItems.push(cItem);
              });
              // Merge bids
              nextBids = [...prev.bids];
              filteredBids.forEach((fBid) => {
                const existingIdx = nextBids.findIndex((b) => b.supplierName.toLowerCase().trim() === fBid.supplierName.toLowerCase().trim());
                if (existingIdx >= 0) nextBids[existingIdx] = fBid;
                else nextBids.push(fBid);
              });
            }

            return {
              ...prev,
              rfqTitle: parsedJsonProject.rfqTitle || prev.rfqTitle,
              notes: parsedJsonProject.notes !== undefined ? parsedJsonProject.notes : prev.notes,
              targetDate: parsedJsonProject.targetDate || prev.targetDate,
              budget: parsedJsonProject.budget !== undefined ? parsedJsonProject.budget : prev.budget,
              comparisonCurrency: parsedJsonProject.comparisonCurrency || prev.comparisonCurrency,
              fxRiskBufferPct: parsedJsonProject.fxRiskBufferPct !== undefined ? parsedJsonProject.fxRiskBufferPct : prev.fxRiskBufferPct,
              costOfMoneyPctPerYear: parsedJsonProject.costOfMoneyPctPerYear !== undefined ? parsedJsonProject.costOfMoneyPctPerYear : prev.costOfMoneyPctPerYear,
              defaultVatPct: parsedJsonProject.defaultVatPct !== undefined ? parsedJsonProject.defaultVatPct : prev.defaultVatPct,
              countVatAsCost: parsedJsonProject.countVatAsCost !== undefined ? parsedJsonProject.countVatAsCost : prev.countVatAsCost,
              calcCustomsAuto: parsedJsonProject.calcCustomsAuto !== undefined ? parsedJsonProject.calcCustomsAuto : prev.calcCustomsAuto,
              scoringWeightPricePct: parsedJsonProject.scoringWeightPricePct !== undefined ? parsedJsonProject.scoringWeightPricePct : prev.scoringWeightPricePct,
              scoringWeightQualityPct: parsedJsonProject.scoringWeightQualityPct !== undefined ? parsedJsonProject.scoringWeightQualityPct : prev.scoringWeightQualityPct,
              scoringWeightLeadTimePct: parsedJsonProject.scoringWeightLeadTimePct !== undefined ? parsedJsonProject.scoringWeightLeadTimePct : prev.scoringWeightLeadTimePct,
              awardStrategy: parsedJsonProject.awardStrategy || prev.awardStrategy,
              preparedBy: parsedJsonProject.preparedBy || prev.preparedBy,
              preparedByTitle: parsedJsonProject.preparedByTitle || prev.preparedByTitle,
              reviewedBy: parsedJsonProject.reviewedBy || prev.reviewedBy,
              reviewedByTitle: parsedJsonProject.reviewedByTitle || prev.reviewedByTitle,
              approvedBy: parsedJsonProject.approvedBy || prev.approvedBy,
              approvedByTitle: parsedJsonProject.approvedByTitle || prev.approvedByTitle,
              justification: parsedJsonProject.justification || prev.justification,
              exchangeRates: parsedJsonProject.exchangeRates && parsedJsonProject.exchangeRates.length > 0
                ? (importStrategy === "replace" ? parsedJsonProject.exchangeRates : mergeExchangeRates(prev.exchangeRates, parsedJsonProject.exchangeRates))
                : prev.exchangeRates,
              qualityCriteria: cleanCriteria.length > 0 ? cleanCriteria : prev.qualityCriteria,
              customsRates: parsedJsonProject.customsRates || prev.customsRates,
              ipcBrackets: parsedJsonProject.ipcBrackets || prev.ipcBrackets,
              items: nextItems,
              bids: nextBids,
              awards: cleanAwards.length > 0 ? cleanAwards : prev.awards,
            };
          });
          toast.success(`Successfully imported full project backup into "${currentProject.rfqTitle || "Current RFQ"}" (${importStrategy === "replace" ? "Replaced all" : "Merged & updated"}).`);
        } else {
          const newProjectData: RfqProject = {
            ...parsedJsonProject,
            id: `rfq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            dbId: undefined,
            rfqReference: targetRef,
            roundNo: parsedJsonProject.roundNo || 1,
            status: "Draft", // Always Draft
            version: 1,
            rejectionReason: undefined,
            approvalRemarks: undefined,
            items: cleanItems,
            qualityCriteria: cleanCriteria,
            exchangeRates: parsedJsonProject.exchangeRates || [],
            customsRates: parsedJsonProject.customsRates || { ...DEFAULT_CUSTOMS_RATES },
            ipcBrackets: parsedJsonProject.ipcBrackets || [...DEFAULT_IPC_BRACKETS],
            bids: filteredBids,
            awards: cleanAwards,
            approvalHistory: [],
            updatedAt: new Date().toISOString(),
          };
          importFullProject(newProjectData);
          toast.success(`Successfully created new RFQ "${newProjectData.rfqTitle}" (${newProjectData.rfqReference}) from backup.`);
        }
        handleClose();
        return;
      }

      // -----------------------------------------------------------------------
      // Path 2: Applying Full Project from Excel
      // -----------------------------------------------------------------------
      if (importScope === "full_project" || !currentProject) {
        let targetRef = (detectedProjectSetup?.rfqReference || `RFQ-${Date.now().toString().slice(-6)}`).trim();
        const baseRef = targetRef;
        let attempt = 1;
        while (
          projectsList.some(
            (p) => p.rfqReference?.toLowerCase().trim() === targetRef.toLowerCase().trim() && p.id !== currentProject?.id
          ) &&
          attempt <= 20
        ) {
          attempt++;
          targetRef = `${baseRef}-COPY${attempt > 2 ? `-${attempt}` : ""}`;
        }

        const nextItems: RequestedItem[] = detectedProjectSetup?.items && detectedProjectSetup.items.length > 0
          ? [...detectedProjectSetup.items]
          : [];

        rowsToImport.forEach((row) => {
          let matchedItem = nextItems.find(
            (it) => it.itemName.toLowerCase().trim() === row.item.toLowerCase().trim()
          );
          if (!matchedItem) {
            const newItemId = `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            matchedItem = {
              id: newItemId,
              itemName: row.item,
              specifications: row.specifications || "",
              quantity: row.quantity && row.quantity > 0 ? row.quantity : 100,
              uom: "PCS",
              targetUnitPrice: 0,
              hsCode: row.hsCode || "",
              dutyPct: row.dutyPct || 0,
              weightPerUnitKg: row.weightKg || 0,
              cbmPerUnit: row.volumeCbm || 0,
              sortOrder: nextItems.length + 1,
            };
            nextItems.push(matchedItem);
          } else if (row.specifications && !matchedItem.specifications) {
            matchedItem.specifications = row.specifications;
          }
        });

        const targetCriteria = detectedProjectSetup?.qualityCriteria && detectedProjectSetup.qualityCriteria.length > 0
          ? detectedProjectSetup.qualityCriteria
          : [];

        const nextBids: SupplierBid[] = [];
        const groupedBySupplier = new Map<string, ParsedRow[]>();
        rowsToImport.forEach((row) => {
          const key = row.supplier.trim();
          const list = groupedBySupplier.get(key) || [];
          list.push(row);
          groupedBySupplier.set(key, list);
        });

        groupedBySupplier.forEach((supplierRows, suppName) => {
          const first = supplierRows[0];
          const rawInco = (first.incoterm || "").toUpperCase().trim();
          const isLocal = first.type === "Local" || (first.country || "").toUpperCase() === "PH";
          const incoterm: Incoterm = VALID_INCOTERMS.includes(rawInco as Incoterm)
            ? (rawInco as Incoterm)
            : (isLocal ? "DELIVERED" : "FOB");

          // Build exact scores: strictly NO fallback to 5 or dummy text
          const initialScores: Record<string, { passFailResult: PassFailResult; score: number | null; evidenceRemarks: string }> = {};
          let sMap = parsedQualityScores.get(suppName.toLowerCase());
          if (!sMap) {
            for (const [key, map] of parsedQualityScores.entries()) {
              if (normalizeKey(key) === normalizeKey(suppName)) {
                sMap = map;
                break;
              }
            }
          }

          targetCriteria.forEach((c) => {
            const match = sMap?.get(c.criterionName.toLowerCase()) || sMap?.get(normalizeKey(c.criterionName));
            if (match) {
              initialScores[c.id] = {
                passFailResult: match.passFailResult,
                score: c.criterionType === "SCORED" && match.score && match.score >= 1 && match.score <= 5 ? match.score : null,
                evidenceRemarks: match.evidenceRemarks || "",
              };
            } else {
              initialScores[c.id] = {
                passFailResult: "NOT_CHECKED",
                score: null,
                evidenceRemarks: "",
              };
            }
          });

          let supplierAtts = parsedAttachments.get(suppName.toLowerCase());
          if (!supplierAtts) {
            for (const [key, atts] of parsedAttachments.entries()) {
              if (normalizeKey(key) === normalizeKey(suppName)) {
                supplierAtts = atts;
                break;
              }
            }
          }
          supplierAtts = supplierAtts || [];

          const newBidId = `bid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          const bid: SupplierBid = {
            id: newBidId,
            supplierName: suppName,
            supplierType: isLocal ? "LOCAL" : "INTERNATIONAL",
            country: first.country || (isLocal ? "PH" : "CN"),
            contactPerson: first.contactPerson || "",
            contactEmail: first.contactEmail || "",
            contactPhone: first.contactPhone || "",
            quoteCurrency: first.currency || (isLocal ? "PHP" : "USD"),
            quotationRef: first.quotationRef || "",
            quoteDate: first.quoteDate || new Date().toISOString().split("T")[0],
            validUntil: first.validUntil || "",
            leadTimeDays: first.leadTimeDays !== undefined && !isNaN(first.leadTimeDays) ? first.leadTimeDays : 30,
            notes: first.notes || "",
            incoterm,
            vatPct: first.vatPct !== undefined && !isNaN(first.vatPct) ? first.vatPct : 12,
            pricesIncludeVat: first.pricesIncludeVat || false,
            inlandTruckingCompCurr: first.inlandTrucking !== undefined && !isNaN(first.inlandTrucking) ? first.inlandTrucking : 0,
            freightBasis: (["LUMP_SUM", "PER_CBM", "PER_KG", "PCT_GOODS"].includes(first.freightBasis || "") ? first.freightBasis : "LUMP_SUM") as FreightBasis,
            freightRate: first.freightAmount !== undefined && !isNaN(first.freightAmount) ? first.freightAmount : 0,
            freightMinimum: first.freightMin !== undefined && !isNaN(first.freightMin) ? first.freightMin : 0,
            freightCurrency: first.freightCurrency || first.currency || "USD",
            insuranceBasis: (["PCT_GOODS_AND_FREIGHT", "FIXED_AMOUNT"].includes(first.insuranceBasis || "") ? first.insuranceBasis : "PCT_GOODS_AND_FREIGHT") as InsuranceBasis,
            insuranceRateOrAmount: first.insuranceAmount !== undefined && !isNaN(first.insuranceAmount) ? first.insuranceAmount : 0.3,
            insuranceCurrency: first.insuranceCurrency || first.freightCurrency || first.currency || "USD",
            dutyMode: (first.dutyMode as DutyMode) || (first.ftaCode ? "FTA" : "PER_ITEM"),
            ftaAgreementName: first.ftaCode || "",
            ftaDutyPct: first.ftaDutyPct,
            singleDutyPct: first.singleDutyPct !== undefined && !isNaN(first.singleDutyPct) ? first.singleDutyPct : undefined,
            brokerageCompCurr: first.brokerageFee !== undefined && !isNaN(first.brokerageFee) ? first.brokerageFee : 0,
            otherPortChargesCompCurr: first.otherPortCharges !== undefined && !isNaN(first.otherPortCharges) ? first.otherPortCharges : 0,
            shipmentType: (["AUTO", "FCL", "LCL", "AIR"].includes(first.shipmentType || "") ? first.shipmentType : "AUTO") as ShipmentType,
            containers20ft: first.containers20ft !== undefined && !isNaN(first.containers20ft) ? first.containers20ft : 0,
            containers40ft: first.containers40ft !== undefined && !isNaN(first.containers40ft) ? first.containers40ft : 0,
            declarationsCount: first.numShipments !== undefined && !isNaN(first.numShipments) ? first.numShipments : 1,
            paidByLc: Boolean(first.paidByLc),
            downPaymentPct: first.downPaymentPct !== undefined && !isNaN(first.downPaymentPct) ? first.downPaymentPct : 0,
            balanceDueDays: first.netDays !== undefined && !isNaN(first.netDays) ? first.netDays : 30,
            earlyPayDiscountPct: first.earlyPayDiscountPct !== undefined && !isNaN(first.earlyPayDiscountPct) ? first.earlyPayDiscountPct : 0,
            earlyPayDiscountDays: first.earlyPayDays !== undefined && !isNaN(first.earlyPayDays) ? first.earlyPayDays : 0,
            takeEarlyPayDiscount: first.takeEarlyPayDiscount !== undefined ? first.takeEarlyPayDiscount : (first.earlyPayDiscountPct || 0) > 0,
            bankFeePerPaymentCompCurr: first.bankFee !== undefined && !isNaN(first.bankFee) ? first.bankFee : 0,
            supplierId: first.supplierId ? (Number(first.supplierId) || undefined) : undefined,
            quotations: {},
            scores: initialScores,
            attachments: [...supplierAtts],
          };

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
            bid.quotations[rfqItemId] = {
              id: `quote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
              rfqItemId,
              discountPct: firstValid.discountPct || 0,
              priceBreaks,
            };
          });

          nextBids.push(bid);
        });

        // Reconstruct awards
        const finalAwards: ItemAward[] = [];
        parsedAwardsList.forEach((pa) => {
          const matchedItem = nextItems.find((it) => it.itemName.toLowerCase().trim() === pa.itemName.toLowerCase().trim());
          const matchedBid = nextBids.find((b) => b.supplierName.toLowerCase().trim() === pa.awardedSupplier.toLowerCase().trim());
          if (matchedItem && matchedBid) {
            finalAwards.push({
              id: `award-${matchedItem.id}`,
              rfqItemId: matchedItem.id,
              rfqBidId: matchedBid.id,
              awardedLandedUnitCost: pa.landedUnit,
              awardedLandedTotal: pa.landedTotal,
            });
          }
        });

        if (currentProject) {
          // Full project import into open RFQ honoring Merge/Replace without creating duplicate -COPY (Defect 10)
          updateProject((prev) => {
            let nextCombinedItems: RequestedItem[];
            let nextCombinedBids: SupplierBid[];

            if (importStrategy === "replace") {
              nextCombinedItems = nextItems;
              nextCombinedBids = nextBids;
            } else {
              // Merge items
              nextCombinedItems = [...prev.items];
              nextItems.forEach((nItem) => {
                const existing = nextCombinedItems.find((it) => it.itemName.toLowerCase().trim() === nItem.itemName.toLowerCase().trim());
                if (!existing) nextCombinedItems.push(nItem);
              });
              // Merge bids
              nextCombinedBids = [...prev.bids];
              nextBids.forEach((nBid) => {
                const existingIdx = nextCombinedBids.findIndex((b) => b.supplierName.toLowerCase().trim() === nBid.supplierName.toLowerCase().trim());
                if (existingIdx >= 0) nextCombinedBids[existingIdx] = nBid;
                else nextCombinedBids.push(nBid);
              });
            }

            return {
              ...prev,
              items: nextCombinedItems,
              bids: nextCombinedBids,
              ...(finalAwards.length > 0 ? { awards: finalAwards } : (detectedProjectSetup?.awards ? { awards: detectedProjectSetup.awards } : {})),
              ...(targetCriteria && targetCriteria.length > 0 ? { qualityCriteria: targetCriteria } : {}),
              ...(detectedProjectSetup?.exchangeRates && detectedProjectSetup.exchangeRates.length > 0
                ? {
                    exchangeRates: importStrategy === "replace"
                      ? detectedProjectSetup.exchangeRates
                      : mergeExchangeRates(prev.exchangeRates, detectedProjectSetup.exchangeRates),
                  }
                : {}),
              ...(detectedProjectSetup?.customsRates ? { customsRates: { ...prev.customsRates, ...detectedProjectSetup.customsRates } } : {}),
              ...(detectedProjectSetup?.ipcBrackets ? { ipcBrackets: detectedProjectSetup.ipcBrackets } : {}),
              ...(detectedProjectSetup?.rfqTitle && importStrategy === "replace" ? { rfqTitle: detectedProjectSetup.rfqTitle } : {}),
              ...(detectedProjectSetup?.targetDate ? { targetDate: detectedProjectSetup.targetDate } : {}),
              ...(detectedProjectSetup?.budget !== undefined ? { budget: detectedProjectSetup.budget } : {}),
              ...(detectedProjectSetup?.comparisonCurrency ? { comparisonCurrency: detectedProjectSetup.comparisonCurrency } : {}),
              ...(detectedProjectSetup?.notes !== undefined ? { notes: detectedProjectSetup.notes } : {}),
              ...(detectedProjectSetup?.fxRiskBufferPct !== undefined ? { fxRiskBufferPct: detectedProjectSetup.fxRiskBufferPct } : {}),
              ...(detectedProjectSetup?.costOfMoneyPctPerYear !== undefined ? { costOfMoneyPctPerYear: detectedProjectSetup.costOfMoneyPctPerYear } : {}),
              ...(detectedProjectSetup?.defaultVatPct !== undefined ? { defaultVatPct: detectedProjectSetup.defaultVatPct } : {}),
              ...(detectedProjectSetup?.countVatAsCost !== undefined ? { countVatAsCost: detectedProjectSetup.countVatAsCost } : {}),
              ...(detectedProjectSetup?.calcCustomsAuto !== undefined ? { calcCustomsAuto: detectedProjectSetup.calcCustomsAuto } : {}),
              ...(detectedProjectSetup?.scoringWeightPricePct !== undefined ? { scoringWeightPricePct: detectedProjectSetup.scoringWeightPricePct } : {}),
              ...(detectedProjectSetup?.scoringWeightQualityPct !== undefined ? { scoringWeightQualityPct: detectedProjectSetup.scoringWeightQualityPct } : {}),
              ...(detectedProjectSetup?.scoringWeightLeadTimePct !== undefined ? { scoringWeightLeadTimePct: detectedProjectSetup.scoringWeightLeadTimePct } : {}),
              ...(detectedProjectSetup?.awardStrategy ? { awardStrategy: detectedProjectSetup.awardStrategy } : {}),
              ...(detectedProjectSetup?.preparedBy ? { preparedBy: detectedProjectSetup.preparedBy } : {}),
              ...(detectedProjectSetup?.preparedByTitle ? { preparedByTitle: detectedProjectSetup.preparedByTitle } : {}),
              ...(detectedProjectSetup?.reviewedBy ? { reviewedBy: detectedProjectSetup.reviewedBy } : {}),
              ...(detectedProjectSetup?.reviewedByTitle ? { reviewedByTitle: detectedProjectSetup.reviewedByTitle } : {}),
              ...(detectedProjectSetup?.approvedBy ? { approvedBy: detectedProjectSetup.approvedBy } : {}),
              ...(detectedProjectSetup?.approvedByTitle ? { approvedByTitle: detectedProjectSetup.approvedByTitle } : {}),
              ...(detectedProjectSetup?.justification ? { justification: detectedProjectSetup.justification } : {}),
            };
          });
          toast.success(
            `Successfully imported full project into "${currentProject.rfqTitle || "Current RFQ"}" (${rowsToImport.length} quotations across ${selectedSuppliers.size} suppliers, ${importStrategy === "replace" ? "Replaced all" : "Merged & updated"}).`
          );
        } else {
          const newProjectData: RfqProject = {
            id: `rfq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            dbId: undefined, // Reset dbId so saving inserts a new record!
            rfqTitle: detectedProjectSetup?.rfqTitle || "Imported RFQ Project",
            rfqReference: targetRef,
            targetDate: detectedProjectSetup?.targetDate || "",
            budget: detectedProjectSetup?.budget ?? null,
            comparisonCurrency: detectedProjectSetup?.comparisonCurrency || "PHP",
            notes: detectedProjectSetup?.notes || "",
            fxRiskBufferPct: detectedProjectSetup?.fxRiskBufferPct ?? 3,
            costOfMoneyPctPerYear: detectedProjectSetup?.costOfMoneyPctPerYear ?? 8,
            defaultVatPct: detectedProjectSetup?.defaultVatPct ?? 12,
            countVatAsCost: detectedProjectSetup?.countVatAsCost ?? true,
            calcCustomsAuto: detectedProjectSetup?.calcCustomsAuto ?? true,
            scoringWeightPricePct: detectedProjectSetup?.scoringWeightPricePct ?? 50,
            scoringWeightQualityPct: detectedProjectSetup?.scoringWeightQualityPct ?? 35,
            scoringWeightLeadTimePct: detectedProjectSetup?.scoringWeightLeadTimePct ?? 15,
            awardStrategy: detectedProjectSetup?.awardStrategy || "LOWEST_TOTAL_OPTIMIZED",
            status: "Draft", // Always Draft
            version: 1,
            preparedBy: detectedProjectSetup?.preparedBy || "",
            preparedByTitle: detectedProjectSetup?.preparedByTitle || "Procurement Officer",
            reviewedBy: detectedProjectSetup?.reviewedBy || "",
            reviewedByTitle: detectedProjectSetup?.reviewedByTitle || "BAC Reviewer",
            approvedBy: detectedProjectSetup?.approvedBy || "",
            approvedByTitle: detectedProjectSetup?.approvedByTitle || "Approving Officer",
            justification: detectedProjectSetup?.justification || "",
            exchangeRates: detectedProjectSetup?.exchangeRates && detectedProjectSetup.exchangeRates.length > 0
              ? detectedProjectSetup.exchangeRates
              : [
                  { currencyCode: "USD", rateToComparison: 56.50 },
                  { currencyCode: "EUR", rateToComparison: 61.20 },
                  { currencyCode: "CNY", rateToComparison: 7.85 },
                  { currencyCode: "JPY", rateToComparison: 0.38 },
                ],
            qualityCriteria: targetCriteria,
            items: nextItems,
            customsRates: { ...DEFAULT_CUSTOMS_RATES, ...(detectedProjectSetup?.customsRates || {}) },
            ipcBrackets: detectedProjectSetup?.ipcBrackets || [...DEFAULT_IPC_BRACKETS],
            roundNo: 1,
            bids: nextBids,
            awards: finalAwards.length > 0 ? finalAwards : (detectedProjectSetup?.awards || []),
            approvalHistory: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          importFullProject(newProjectData);
          toast.success(`Successfully created new RFQ "${newProjectData.rfqTitle}" (${newProjectData.rfqReference}) from backup.`);
        }
        handleClose();
        return;
      }

      // -----------------------------------------------------------------------
      // Path 3: Bids Only Import into Existing Project
      // -----------------------------------------------------------------------
      if (!currentProject) return;

      updateProject((prev) => {
        const nextItems: RequestedItem[] = [...prev.items];
        const nextBids: SupplierBid[] = importStrategy === "replace" ? [] : [...prev.bids];

        rowsToImport.forEach((row) => {
          let matchedItem = nextItems.find(
            (it) => it.itemName.toLowerCase().trim() === row.item.toLowerCase().trim()
          );
          if (!matchedItem) {
            const newItemId = `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            matchedItem = {
              id: newItemId,
              itemName: row.item,
              specifications: row.specifications || "",
              quantity: row.quantity && row.quantity > 0 ? row.quantity : 100,
              uom: "PCS",
              targetUnitPrice: 0,
              hsCode: row.hsCode || "",
              dutyPct: row.dutyPct || 0,
              weightPerUnitKg: row.weightKg || 0,
              cbmPerUnit: row.volumeCbm || 0,
              sortOrder: nextItems.length + 1,
            };
            nextItems.push(matchedItem);
          }
        });

        const targetCriteria = (detectedProjectSetup?.qualityCriteria && detectedProjectSetup.qualityCriteria.length > 0)
          ? detectedProjectSetup.qualityCriteria
          : (prev.qualityCriteria || []);

        const groupedBySupplier = new Map<string, ParsedRow[]>();
        rowsToImport.forEach((row) => {
          const key = row.supplier.trim();
          const list = groupedBySupplier.get(key) || [];
          list.push(row);
          groupedBySupplier.set(key, list);
        });

        groupedBySupplier.forEach((supplierRows, suppName) => {
          const first = supplierRows[0];
          let bid = nextBids.find(
            (b) => b.supplierName.toLowerCase().trim() === suppName.toLowerCase().trim()
          );

          const rawInco = (first.incoterm || "").toUpperCase().trim();
          const isLocal = (bid ? bid.supplierType === "LOCAL" : (first.type === "Local" || (first.country || "").toUpperCase() === "PH"));
          const incoterm: Incoterm = VALID_INCOTERMS.includes(rawInco as Incoterm)
            ? (rawInco as Incoterm)
            : (isLocal ? "DELIVERED" : "FOB");

          const initialScores: Record<string, { passFailResult: PassFailResult; score: number | null; evidenceRemarks: string }> = {};
          let sMap = parsedQualityScores.get(suppName.toLowerCase());
          if (!sMap) {
            for (const [key, map] of parsedQualityScores.entries()) {
              if (normalizeKey(key) === normalizeKey(suppName)) {
                sMap = map;
                break;
              }
            }
          }

          targetCriteria.forEach((c) => {
            const match = sMap?.get(c.criterionName.toLowerCase()) || sMap?.get(normalizeKey(c.criterionName));
            if (match) {
              initialScores[c.id] = {
                passFailResult: match.passFailResult,
                score: c.criterionType === "SCORED" && match.score && match.score >= 1 && match.score <= 5 ? match.score : null,
                evidenceRemarks: match.evidenceRemarks || "",
              };
            } else {
              initialScores[c.id] = {
                passFailResult: "NOT_CHECKED",
                score: null,
                evidenceRemarks: "",
              };
            }
          });

          let supplierAtts = parsedAttachments.get(suppName.toLowerCase());
          if (!supplierAtts) {
            for (const [key, atts] of parsedAttachments.entries()) {
              if (normalizeKey(key) === normalizeKey(suppName)) {
                supplierAtts = atts;
                break;
              }
            }
          }
          supplierAtts = supplierAtts || [];

          if (!bid) {
            const newBidId = `bid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            bid = {
              id: newBidId,
              supplierName: suppName,
              supplierType: isLocal ? "LOCAL" : "INTERNATIONAL",
              country: first.country || (isLocal ? "PH" : "CN"),
              contactPerson: first.contactPerson || "",
              contactEmail: first.contactEmail || "",
              contactPhone: first.contactPhone || "",
              quoteCurrency: first.currency || (isLocal ? "PHP" : "USD"),
              quotationRef: first.quotationRef || "",
              quoteDate: first.quoteDate || new Date().toISOString().split("T")[0],
              validUntil: first.validUntil || "",
              leadTimeDays: first.leadTimeDays !== undefined && !isNaN(first.leadTimeDays) ? first.leadTimeDays : 30,
              notes: first.notes || "",
              incoterm,
              vatPct: first.vatPct !== undefined && !isNaN(first.vatPct) ? first.vatPct : 12,
              pricesIncludeVat: first.pricesIncludeVat || false,
              inlandTruckingCompCurr: first.inlandTrucking !== undefined && !isNaN(first.inlandTrucking) ? first.inlandTrucking : 0,
              freightBasis: (["LUMP_SUM", "PER_CBM", "PER_KG", "PCT_GOODS"].includes(first.freightBasis || "") ? first.freightBasis : "LUMP_SUM") as FreightBasis,
              freightRate: first.freightAmount !== undefined && !isNaN(first.freightAmount) ? first.freightAmount : 0,
              freightMinimum: first.freightMin !== undefined && !isNaN(first.freightMin) ? first.freightMin : 0,
              freightCurrency: first.freightCurrency || first.currency || "USD",
              insuranceBasis: (["PCT_GOODS_AND_FREIGHT", "FIXED_AMOUNT"].includes(first.insuranceBasis || "") ? first.insuranceBasis : "PCT_GOODS_AND_FREIGHT") as InsuranceBasis,
              insuranceRateOrAmount: first.insuranceAmount !== undefined && !isNaN(first.insuranceAmount) ? first.insuranceAmount : 0.3,
              insuranceCurrency: first.insuranceCurrency || first.freightCurrency || first.currency || "USD",
              dutyMode: (first.dutyMode as DutyMode) || (first.ftaCode ? "FTA" : "PER_ITEM"),
              ftaAgreementName: first.ftaCode || "",
              ftaDutyPct: first.ftaDutyPct,
              singleDutyPct: first.singleDutyPct !== undefined && !isNaN(first.singleDutyPct) ? first.singleDutyPct : undefined,
              brokerageCompCurr: first.brokerageFee !== undefined && !isNaN(first.brokerageFee) ? first.brokerageFee : 0,
              otherPortChargesCompCurr: first.otherPortCharges !== undefined && !isNaN(first.otherPortCharges) ? first.otherPortCharges : 0,
              shipmentType: (["AUTO", "FCL", "LCL", "AIR"].includes(first.shipmentType || "") ? first.shipmentType : "AUTO") as ShipmentType,
              containers20ft: first.containers20ft !== undefined && !isNaN(first.containers20ft) ? first.containers20ft : 0,
              containers40ft: first.containers40ft !== undefined && !isNaN(first.containers40ft) ? first.containers40ft : 0,
              declarationsCount: first.numShipments !== undefined && !isNaN(first.numShipments) ? first.numShipments : 1,
              paidByLc: Boolean(first.paidByLc),
              downPaymentPct: first.downPaymentPct !== undefined && !isNaN(first.downPaymentPct) ? first.downPaymentPct : 0,
              balanceDueDays: first.netDays !== undefined && !isNaN(first.netDays) ? first.netDays : 30,
              earlyPayDiscountPct: first.earlyPayDiscountPct !== undefined && !isNaN(first.earlyPayDiscountPct) ? first.earlyPayDiscountPct : 0,
              earlyPayDiscountDays: first.earlyPayDays !== undefined && !isNaN(first.earlyPayDays) ? first.earlyPayDays : 0,
              takeEarlyPayDiscount: first.takeEarlyPayDiscount !== undefined ? first.takeEarlyPayDiscount : (first.earlyPayDiscountPct || 0) > 0,
              bankFeePerPaymentCompCurr: first.bankFee !== undefined && !isNaN(first.bankFee) ? first.bankFee : 0,
              supplierId: first.supplierId ? (Number(first.supplierId) || undefined) : undefined,
              quotations: {},
              scores: initialScores,
              attachments: [...supplierAtts],
            };
            nextBids.push(bid);
          } else {
            if (first.incoterm) bid.incoterm = incoterm;
            if (first.currency) bid.quoteCurrency = first.currency;
            if (first.leadTimeDays !== undefined && !isNaN(first.leadTimeDays)) bid.leadTimeDays = first.leadTimeDays;
            if (first.validUntil) bid.validUntil = first.validUntil;
            if (first.freightAmount !== undefined && !isNaN(first.freightAmount)) bid.freightRate = first.freightAmount;
            if (first.freightBasis) bid.freightBasis = (["LUMP_SUM", "PER_CBM", "PER_KG", "PCT_GOODS"].includes(first.freightBasis) ? first.freightBasis : bid.freightBasis) as FreightBasis;
            if (first.freightMin !== undefined && !isNaN(first.freightMin)) bid.freightMinimum = first.freightMin;
            if (first.freightCurrency) bid.freightCurrency = first.freightCurrency;
            if (first.insuranceBasis) bid.insuranceBasis = (["PCT_GOODS_AND_FREIGHT", "FIXED_AMOUNT"].includes(first.insuranceBasis) ? first.insuranceBasis : bid.insuranceBasis) as InsuranceBasis;
            if (first.insuranceAmount !== undefined && !isNaN(first.insuranceAmount)) bid.insuranceRateOrAmount = first.insuranceAmount;
            if (first.insuranceCurrency) bid.insuranceCurrency = first.insuranceCurrency;
            if (first.dutyMode) bid.dutyMode = first.dutyMode as DutyMode;
            if (first.singleDutyPct !== undefined && !isNaN(first.singleDutyPct)) bid.singleDutyPct = first.singleDutyPct;
            if (first.supplierId) bid.supplierId = Number(first.supplierId) || bid.supplierId;
            if (first.quotationRef) bid.quotationRef = first.quotationRef;
            if (first.quoteDate) bid.quoteDate = first.quoteDate;
            if (first.contactPerson) bid.contactPerson = first.contactPerson;
            if (first.contactEmail) bid.contactEmail = first.contactEmail;
            if (first.contactPhone) bid.contactPhone = first.contactPhone;
            if (first.takeEarlyPayDiscount !== undefined) bid.takeEarlyPayDiscount = first.takeEarlyPayDiscount;
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

            Object.keys(initialScores).forEach((critId) => {
              bid!.scores[critId] = initialScores[critId];
            });

            if (supplierAtts.length > 0) {
              const existingFileIds = new Set((bid.attachments || []).map((a) => a.directusFileId || a.fileUrl || a.fileName));
              const newAtts = supplierAtts.filter((a) => !existingFileIds.has(a.directusFileId || a.fileUrl || a.fileName));
              bid.attachments = [...(bid.attachments || []), ...newAtts];
            }
          }

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

        // Reconstruct awards if present
        const finalAwards: ItemAward[] = [];
        parsedAwardsList.forEach((pa) => {
          const matchedItem = nextItems.find((it) => it.itemName.toLowerCase().trim() === pa.itemName.toLowerCase().trim());
          const matchedBid = nextBids.find((b) => b.supplierName.toLowerCase().trim() === pa.awardedSupplier.toLowerCase().trim());
          if (matchedItem && matchedBid) {
            finalAwards.push({
              id: `award-${matchedItem.id}`,
              rfqItemId: matchedItem.id,
              rfqBidId: matchedBid.id,
              awardedLandedUnitCost: pa.landedUnit,
              awardedLandedTotal: pa.landedTotal,
            });
          }
        });

        return {
          ...prev,
          items: nextItems,
          bids: nextBids,
          ...(finalAwards.length > 0 ? { awards: finalAwards } : {}),
          ...(targetCriteria && targetCriteria.length > 0 ? { qualityCriteria: targetCriteria } : {}),
          ...(detectedProjectSetup?.exchangeRates && detectedProjectSetup.exchangeRates.length > 0
            ? {
                exchangeRates: importStrategy === "replace"
                  ? detectedProjectSetup.exchangeRates
                  : mergeExchangeRates(prev.exchangeRates, detectedProjectSetup.exchangeRates),
              }
            : {}),
          ...(detectedProjectSetup?.scoringWeightPricePct !== undefined ? { scoringWeightPricePct: detectedProjectSetup.scoringWeightPricePct } : {}),
          ...(detectedProjectSetup?.scoringWeightQualityPct !== undefined ? { scoringWeightQualityPct: detectedProjectSetup.scoringWeightQualityPct } : {}),
          ...(detectedProjectSetup?.scoringWeightLeadTimePct !== undefined ? { scoringWeightLeadTimePct: detectedProjectSetup.scoringWeightLeadTimePct } : {}),
          ...(detectedProjectSetup?.preparedBy ? { preparedBy: detectedProjectSetup.preparedBy } : {}),
          ...(detectedProjectSetup?.preparedByTitle ? { preparedByTitle: detectedProjectSetup.preparedByTitle } : {}),
          ...(detectedProjectSetup?.reviewedBy ? { reviewedBy: detectedProjectSetup.reviewedBy } : {}),
          ...(detectedProjectSetup?.reviewedByTitle ? { reviewedByTitle: detectedProjectSetup.reviewedByTitle } : {}),
          ...(detectedProjectSetup?.approvedBy ? { approvedBy: detectedProjectSetup.approvedBy } : {}),
          ...(detectedProjectSetup?.approvedByTitle ? { approvedByTitle: detectedProjectSetup.approvedByTitle } : {}),
          ...(detectedProjectSetup?.justification ? { justification: detectedProjectSetup.justification } : {}),
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
          style={
            parsedRows.length === 0
              ? { width: "min(720px, 94vw)", maxWidth: "720px" }
              : { width: "min(1280px, 95vw)", maxWidth: "95vw", height: "88vh" }
          }
          className={
            parsedRows.length === 0
              ? "!w-[94vw] !max-w-[720px] flex flex-col p-6 shadow-2xl border-border bg-card transition-all"
              : "!w-[95vw] !max-w-[1280px] !h-[88vh] !max-h-[92vh] flex flex-col p-5 shadow-2xl border-border bg-card transition-all"
          }
        >
          {/* Header */}
          <DialogHeader className="space-y-1 pb-3 border-b shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    {parsedRows.length === 0 ? "Import Bids from CSV or Excel" : "Review & Import Bids"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    {parsedRows.length === 0
                      ? "Upload vendor quotation sheets to automatically map commercial terms and price breaks."
                      : "Select suppliers to import and configure your merge strategy."}
                  </DialogDescription>
                </div>
              </div>

              {parsedRows.length === 0 ? (
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportFullProjectTemplate(currentProject || undefined)}
                    className="gap-1.5 text-xs h-7 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40 hover:bg-emerald-100"
                    title="Download Complete Multi-Sheet Project Template (Setup, Rates, Criteria, Items with Specs, and Bids)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    Full Project Template (.xlsx)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="gap-1.5 text-xs h-7 text-foreground"
                    title="Download Blank CSV Template"
                  >
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                    Blank Bids (.csv)
                  </Button>
                  {currentProject && currentProject.bids?.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportRfqBidsToCsv(currentProject)}
                      className="gap-1.5 text-xs h-7 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900"
                      title="Export Current Bids to CSV"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      Current Bids
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs font-medium border-border gap-1 py-1">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    {detectedSuppliers.length} Suppliers Detected
                  </Badge>
                  <Badge variant="outline" className="text-xs font-medium border-border gap-1 py-1">
                    <Package className="w-3.5 h-3.5 text-muted-foreground" />
                    {detectedItemsCount} Items Found
                  </Badge>
                  <Badge variant="secondary" className="text-xs font-medium gap-1 py-1">
                    <Layers className="w-3.5 h-3.5" />
                    {parsedRows.length} Rows
                  </Badge>
                </div>
              )}
            </div>
          </DialogHeader>

          {/* Hidden File Input (Always Available) */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls,.csv,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Modal Body */}
          {parsedRows.length === 0 ? (
            /* =========================================================================
               STATE A: EMPTY / PRE-UPLOAD STATE (Compact, Focused, No White Void)
               ========================================================================= */
            <div className="py-4 space-y-4">
              {/* Hero Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border/80 hover:border-primary/70 rounded-xl p-8 text-center cursor-pointer transition-all bg-card hover:bg-muted/10 group flex flex-col items-center justify-center gap-3"
              >
                <div className="w-14 h-14 rounded-full bg-primary/10 group-hover:bg-primary/20 group-hover:scale-105 flex items-center justify-center text-primary transition-all shadow-xs">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    Click to select or drag & drop Excel, JSON backup, or CSV file
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supports .xlsx, .xls, .csv, .json (full project backup) • 100% round-trip fidelity
                  </p>
                </div>
              </div>

              {/* Validation Warnings */}
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

              {/* Collapsible Column Guide */}
              <div className="rounded-lg border bg-muted/15 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowColumnGuide((prev) => !prev)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/20 transition-colors"
                >
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-primary" />
                    Supported Column Format (42 Columns)
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {showColumnGuide ? "Hide columns" : "View column list"}
                    </span>
                    {showColumnGuide ? (
                      <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {showColumnGuide && (
                  <div className="p-3 pt-0 space-y-2 border-t border-border/40">
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[11px] text-muted-foreground">
                        Columns can be in any order. Headers are matched case-insensitively.
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyColumns}
                        className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground shrink-0"
                      >
                        {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        {isCopied ? "Copied" : "Copy Header List"}
                      </Button>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground bg-background p-2.5 rounded border border-border/50 leading-relaxed select-all max-h-28 overflow-y-auto">
                      {REQUIRED_COLUMNS_TEXT}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* =========================================================================
               STATE B: POST-UPLOAD STATE (Full-Featured, Expanded Preview & Selection Hub)
               ========================================================================= */
            <div className="flex-1 min-h-0 flex flex-col space-y-3 py-2 overflow-hidden">
              {/* Compact File Summary Strip */}
              <div className="rounded-lg border bg-muted/20 px-3.5 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground truncate">
                      {fileName || "Spreadsheet"}
                    </span>
                    <Badge variant="outline" className="text-[10px] bg-background font-mono shrink-0">
                      {parsedRows.length} rows parsed
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 text-xs gap-1"
                  >
                    <Upload className="w-3 h-3" />
                    Replace File
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetState}
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {/* Warnings (if any) */}
              {warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-800 dark:text-amber-300 space-y-1 shrink-0">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    Validation Warnings ({warnings.length})
                  </div>
                  <ul className="list-disc list-inside max-h-16 overflow-y-auto space-y-0.5 text-[11px]">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Full Project Setup Detected Banner */}
              {detectedProjectSetup && (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2 shadow-xs shrink-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-foreground">
                        Full Project Configuration Detected
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-background border-primary/40 text-primary font-semibold py-0">
                        Multi-Sheet
                      </Badge>
                    </div>

                    {/* Import Scope Selector */}
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground text-[11px] font-medium">Scope:</span>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="radio"
                          name="importScope"
                          value="full_project"
                          checked={importScope === "full_project"}
                          onChange={() => setImportScope("full_project")}
                          className="accent-primary"
                        />
                        <span className="font-semibold text-foreground text-xs">Full Project (Setup, Rates, Criteria, Items & Bids)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="radio"
                          name="importScope"
                          value="bids_only"
                          checked={importScope === "bids_only"}
                          onChange={() => setImportScope("bids_only")}
                          className="accent-primary"
                        />
                        <span className="text-muted-foreground text-xs">Bids Only</span>
                      </label>
                    </div>
                  </div>

                  {/* Badges of detected project details */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/40 text-[11px]">
                    {detectedProjectSetup.rfqTitle && (
                      <Badge variant="secondary" className="gap-1 font-normal py-0.5 text-[11px]">
                        <strong>Title:</strong> {detectedProjectSetup.rfqTitle}
                      </Badge>
                    )}
                    {detectedProjectSetup.targetDate && (
                      <Badge variant="outline" className="gap-1 font-normal bg-background py-0.5 text-[11px]">
                        <strong>Target Date:</strong> {detectedProjectSetup.targetDate}
                      </Badge>
                    )}
                    {detectedProjectSetup.budget && (
                      <Badge variant="outline" className="gap-1 font-normal bg-background py-0.5 text-[11px]">
                        <strong>Budget:</strong> ₱{detectedProjectSetup.budget.toLocaleString()}
                      </Badge>
                    )}
                    {detectedProjectSetup.exchangeRates && detectedProjectSetup.exchangeRates.length > 0 && (
                      <Badge variant="outline" className="gap-1 font-normal bg-background py-0.5 text-[11px]">
                        <strong>Exchange Rates:</strong> {detectedProjectSetup.exchangeRates.map((r) => r.currencyCode).join(", ")}
                      </Badge>
                    )}
                    {detectedProjectSetup.qualityCriteria && detectedProjectSetup.qualityCriteria.length > 0 && (
                      <Badge variant="outline" className="gap-1 font-normal bg-background py-0.5 text-[11px]">
                        <strong>Quality Criteria:</strong> {detectedProjectSetup.qualityCriteria.length} ({detectedProjectSetup.qualityCriteria.filter((c) => c.criterionType === "PASS_FAIL").length} Pass/Fail)
                      </Badge>
                    )}
                    {detectedProjectSetup.items && detectedProjectSetup.items.length > 0 && (
                      <Badge variant="outline" className="gap-1 font-normal bg-background py-0.5 text-[11px]">
                        <strong>Items with Specs:</strong> {detectedProjectSetup.items.length}
                      </Badge>
                    )}
                    {detectedProjectSetup.notes && (
                      <Badge variant="secondary" className="gap-1 font-normal py-0.5 text-[11px] max-w-[260px] truncate" title={detectedProjectSetup.notes}>
                        <strong>Notes:</strong> {detectedProjectSetup.notes}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Supplier Selection & Import Strategy Card */}
              <div className="rounded-xl border bg-card p-3 space-y-2.5 shadow-xs shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b pb-2">
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                      Select What to Import
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {detectedSuppliers.map((supp) => {
                    const isChecked = selectedSuppliers.has(supp.name);
                    return (
                      <div
                        key={supp.name}
                        onClick={() => handleToggleSupplier(supp.name)}
                        className={`flex items-center justify-between p-1.5 px-2.5 rounded-lg border text-xs cursor-pointer transition-all select-none ${
                          isChecked
                            ? "border-primary/50 bg-primary/5 text-foreground"
                            : "border-border/60 bg-muted/10 text-muted-foreground opacity-60 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent div
                            className="w-3.5 h-3.5 rounded border-border text-primary cursor-pointer accent-primary shrink-0"
                          />
                          <span className="font-semibold truncate text-[11px]">{supp.name}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0 ml-1 py-0 px-1">
                          {supp.count}
                        </Badge>
                      </div>
                    );
                  })}
                </div>

                {/* Import Strategy Options */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t text-xs">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground text-xs">Import Strategy:</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="importStrategy"
                        value="merge"
                        checked={importStrategy === "merge"}
                        onChange={() => setImportStrategy("merge")}
                        className="accent-primary"
                      />
                      <span className="font-medium text-foreground text-xs">Merge & Update</span>
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
                      <span className="font-medium text-destructive text-xs">Replace All Bids</span>
                      <span className="text-[10px] text-muted-foreground">(Clear previous bids)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Full-Height Preview Table */}
              <div className="flex-1 min-h-[240px] flex flex-col space-y-1.5 overflow-hidden">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground px-0.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <span>Active Quotation Lines ({rowsToImport.length} of {parsedRows.length} rows)</span>
                    {rowsToImport.length > 0 ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 gap-1 text-[10px] py-0">
                        <CheckCircle2 className="w-3 h-3" /> Ready to Import
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 gap-1 text-[10px] py-0">
                        <AlertCircle className="w-3 h-3" /> No suppliers selected
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Showing all {rowsToImport.length} selected lines
                  </span>
                </div>

                <div className="flex-1 overflow-auto rounded-lg border bg-card">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/70 backdrop-blur-xs border-b text-muted-foreground uppercase text-[10px] font-semibold sticky top-0 z-10">
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
                      {rowsToImport.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/15 transition-colors">
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
                      {rowsToImport.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-muted-foreground italic">
                            No rows selected. Check one or more suppliers above to preview and import their bids.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <DialogFooter className="flex items-center justify-between border-t pt-3 shrink-0">
            <div className="text-xs text-muted-foreground">
              {parsedRows.length > 0 && (
                <span>
                  <strong className="text-foreground">{selectedSuppliers.size}</strong> of {detectedSuppliers.length} suppliers active (
                  <strong className="text-foreground">{rowsToImport.length}</strong> quotation rows)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleClose} className="h-8 text-xs">
                Cancel
              </Button>
              {parsedRows.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleApplyImport}
                  disabled={rowsToImport.length === 0 || isProcessing}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 h-8 text-xs font-semibold px-4"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Apply Import ({rowsToImport.length} rows)
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

ImportExportModal.displayName = "ImportExportModal";
