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
} from "../../types";

const REQUIRED_COLUMNS_TEXT = BIDS_CANONICAL_COLUMNS.join(", ");

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
}

export const ImportExportModal: React.FC<ImportExportModalProps> = React.memo(
  ({ isOpen, onClose }) => {
    const { currentProject, updateProject } = useBidComparisonStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [fileName, setFileName] = useState<string | null>(null);
    const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
    const [detectedProjectSetup, setDetectedProjectSetup] = useState<ParsedProjectSetup | null>(null);
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

      try {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetNames = workbook.SheetNames;

        let projectSetup: ParsedProjectSetup | null = null;

        // ---------------------------------------------------------------------
        // 1. Detect & Parse "Project Setup" sheet
        // ---------------------------------------------------------------------
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

            if (/title/i.test(key)) projectSetup!.rfqTitle = String(val).trim();
            else if (/reference/i.test(key)) projectSetup!.rfqReference = String(val).trim();
            else if (/target.*date|deadline/i.test(key)) projectSetup!.targetDate = String(val).trim();
            else if (/budget/i.test(key)) {
              const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
              if (!isNaN(num)) projectSetup!.budget = num;
            } else if (/comparison.*currency|base.*currency/i.test(key)) {
              projectSetup!.comparisonCurrency = String(val).trim().toUpperCase();
            } else if (/notes/i.test(key)) {
              projectSetup!.notes = String(val).trim();
            } else if (/fx.*risk|buffer/i.test(key)) {
              const num = parseFloat(String(val));
              if (!isNaN(num)) projectSetup!.fxRiskBufferPct = num;
            } else if (/cost.*of.*money|interest/i.test(key)) {
              const num = parseFloat(String(val));
              if (!isNaN(num)) projectSetup!.costOfMoneyPctPerYear = num;
            } else if (/default.*vat|vat.*%/i.test(key)) {
              const num = parseFloat(String(val));
              if (!isNaN(num)) projectSetup!.defaultVatPct = num;
            } else if (/count.*vat/i.test(key)) {
              projectSetup!.countVatAsCost = /yes|true|1/i.test(String(val));
            } else if (/customs.*auto/i.test(key)) {
              projectSetup!.calcCustomsAuto = /yes|true|1/i.test(String(val));
            } else if (/price.*weight/i.test(key)) {
              const num = parseFloat(String(val));
              if (!isNaN(num)) projectSetup!.scoringWeightPricePct = num;
            } else if (/quality.*weight/i.test(key)) {
              const num = parseFloat(String(val));
              if (!isNaN(num)) projectSetup!.scoringWeightQualityPct = num;
            } else if (/lead.*time.*weight/i.test(key)) {
              const num = parseFloat(String(val));
              if (!isNaN(num)) projectSetup!.scoringWeightLeadTimePct = num;
            } else if (/award.*strategy/i.test(key)) {
              const strat = String(val).trim().toUpperCase();
              if (["ALL_RECOMMENDED", "LOWEST_TOTAL_OPTIMIZED", "CHEAPEST_PER_ITEM", "MANUAL"].includes(strat)) {
                projectSetup!.awardStrategy = strat as AwardStrategy;
              }
            } else if (/prepared.*by$/i.test(key)) projectSetup!.preparedBy = String(val).trim();
            else if (/prepared.*by.*title/i.test(key)) projectSetup!.preparedByTitle = String(val).trim();
            else if (/reviewed.*by$/i.test(key)) projectSetup!.reviewedBy = String(val).trim();
            else if (/reviewed.*by.*title/i.test(key)) projectSetup!.reviewedByTitle = String(val).trim();
            else if (/approved.*by$/i.test(key)) projectSetup!.approvedBy = String(val).trim();
            else if (/approved.*by.*title/i.test(key)) projectSetup!.approvedByTitle = String(val).trim();
            else if (/justification/i.test(key)) projectSetup!.justification = String(val).trim();
          });
        }

        // ---------------------------------------------------------------------
        // 2. Detect & Parse "Exchange Rates" sheet
        // ---------------------------------------------------------------------
        const ratesSheetName = sheetNames.find((s) => /exchange.*rates?|currencies|rates/i.test(s));
        if (ratesSheetName) {
          const ratesSheet = workbook.Sheets[ratesSheetName];
          const rawRows = XLSX.utils.sheet_to_json(ratesSheet) as Record<string, unknown>[];
          const parsedRates: ExchangeRateEntry[] = [];
          rawRows.forEach((r) => {
            let code = "";
            let rate = 0;
            for (const [k, v] of Object.entries(r)) {
              const lk = k.toLowerCase();
              if (/code|currency/i.test(lk)) code = String(v).trim().toUpperCase();
              if (/rate|value|php/i.test(lk)) {
                const n = parseFloat(String(v));
                if (!isNaN(n)) rate = n;
              }
            }
            if (code && rate > 0) {
              parsedRates.push({ currencyCode: code, rateToComparison: rate });
            }
          });
          if (parsedRates.length > 0) {
            projectSetup = projectSetup || {};
            projectSetup.exchangeRates = parsedRates;
          }
        }

        // ---------------------------------------------------------------------
        // 3. Detect & Parse "Quality Criteria" sheet (1.5 Pass/Fail & Scored)
        // ---------------------------------------------------------------------
        const critSheetName = sheetNames.find((s) => /quality.*criteria|compliance|mandatory|criteria/i.test(s));
        if (critSheetName) {
          const critSheet = workbook.Sheets[critSheetName];
          const rawRows = XLSX.utils.sheet_to_json(critSheet) as Record<string, unknown>[];
          const parsedCriteria: QualityCriterion[] = [];
          rawRows.forEach((r, idx) => {
            let type: "PASS_FAIL" | "SCORED" = "SCORED";
            let name = "";
            let weight = 0;
            let sortOrder = idx + 1;
            for (const [k, v] of Object.entries(r)) {
              const lk = k.toLowerCase();
              if (/type/i.test(lk)) {
                type = /pass|fail|mandatory/i.test(String(v)) ? "PASS_FAIL" : "SCORED";
              } else if (/name|criterion|requirement|parameter/i.test(lk)) {
                name = String(v).trim();
              } else if (/weight/i.test(lk)) {
                const n = parseFloat(String(v));
                if (!isNaN(n)) weight = n;
              } else if (/order|sort/i.test(lk)) {
                const n = parseInt(String(v), 10);
                if (!isNaN(n)) sortOrder = n;
              }
            }
            if (name) {
              parsedCriteria.push({
                id: `crit-import-${idx + 1}-${Date.now().toString(36)}`,
                criterionType: type,
                criterionName: name,
                weightPct: type === "SCORED" ? weight : 0,
                sortOrder,
              });
            }
          });
          if (parsedCriteria.length > 0) {
            projectSetup = projectSetup || {};
            projectSetup.qualityCriteria = parsedCriteria;
          }
        }

        // ---------------------------------------------------------------------
        // 4. Detect & Parse "Requested Items" sheet
        // ---------------------------------------------------------------------
        const itemsSheetName = sheetNames.find((s) => /requested.*items|items|products|materials/i.test(s));
        if (itemsSheetName) {
          const itemsSheet = workbook.Sheets[itemsSheetName];
          const rawRows = XLSX.utils.sheet_to_json(itemsSheet) as Record<string, unknown>[];
          const parsedItems: RequestedItem[] = [];
          rawRows.forEach((r, idx) => {
            let itemName = "";
            let specifications = "";
            let quantity = 100;
            let uom = "PCS";
            let targetUnitPrice = 0;
            let hsCode = "";
            let dutyPct = 0;
            let weight = 0;
            let volume = 0;

            for (const [k, v] of Object.entries(r)) {
              const lk = k.toLowerCase();
              if (/item.*name|product/i.test(lk) && !/spec/i.test(lk)) itemName = String(v).trim();
              else if (/spec/i.test(lk)) specifications = String(v).trim();
              else if (/qty|quantity/i.test(lk)) {
                const n = parseFloat(String(v));
                if (!isNaN(n) && n > 0) quantity = n;
              } else if (/uom|unit/i.test(lk) && !/price|weight|volume/i.test(lk)) {
                uom = String(v).trim().toUpperCase();
              } else if (/target|budget.*unit/i.test(lk)) {
                const n = parseFloat(String(v));
                if (!isNaN(n)) targetUnitPrice = n;
              } else if (/hs.*code/i.test(lk)) hsCode = String(v).trim();
              else if (/duty/i.test(lk)) {
                const n = parseFloat(String(v));
                if (!isNaN(n)) dutyPct = n;
              } else if (/weight|kg/i.test(lk)) {
                const n = parseFloat(String(v));
                if (!isNaN(n)) weight = n;
              } else if (/volume|cbm/i.test(lk)) {
                const n = parseFloat(String(v));
                if (!isNaN(n)) volume = n;
              }
            }
            if (itemName) {
              parsedItems.push({
                id: `item-import-${idx + 1}-${Date.now().toString(36)}`,
                itemName,
                specifications,
                quantity,
                uom: uom || "PCS",
                targetUnitPrice,
                hsCode,
                dutyPct,
                weightPerUnitKg: weight,
                cbmPerUnit: volume,
                sortOrder: idx + 1,
              });
            }
          });
          if (parsedItems.length > 0) {
            projectSetup = projectSetup || {};
            projectSetup.items = parsedItems;
          }
        }

        // ---------------------------------------------------------------------
        // 5. Detect & Parse "Bids & Quotations" sheet
        // ---------------------------------------------------------------------
        const bestSheetName =
          sheetNames.find((s) => /bids.*quotations?|bids|quotations?|raw.*data/i.test(s)) ||
          sheetNames.find((s) => !/setup|rates|criteria|items|comparison|award|quality/i.test(s)) ||
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
            specifications: specifications || undefined,
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
          const setupMsg = projectSetup ? " (with full project setup & criteria)" : "";
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
      if (!currentProject) return;

      updateProject((prev) => {
        let nextItems: RequestedItem[] = [...prev.items];
        // If "replace", clear current bids; otherwise keep existing and merge
        const nextBids: SupplierBid[] = importStrategy === "replace" ? [] : [...prev.bids];

        // If Full Project import scope and detected setup has items, start with those
        if (importScope === "full_project" && detectedProjectSetup?.items && detectedProjectSetup.items.length > 0) {
          nextItems = [...detectedProjectSetup.items];
        }

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
              specifications: row.specifications || "",
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
          } else if (row.specifications && !matchedItem.specifications) {
            matchedItem.specifications = row.specifications;
          }
        });

        // 2. Resolve Quality Criteria to use
        const targetCriteria = (importScope === "full_project" && detectedProjectSetup?.qualityCriteria && detectedProjectSetup.qualityCriteria.length > 0)
          ? detectedProjectSetup.qualityCriteria
          : prev.qualityCriteria || [];

        // 3. Group rows to import by supplier
        const groupedBySupplier = new Map<string, ParsedRow[]>();
        rowsToImport.forEach((row) => {
          const key = row.supplier.trim();
          const list = groupedBySupplier.get(key) || [];
          list.push(row);
          groupedBySupplier.set(key, list);
        });

        // 4. Create or update bids
        groupedBySupplier.forEach((supplierRows, suppName) => {
          const first = supplierRows[0];
          let bid = nextBids.find(
            (b) => b.supplierName.toLowerCase().trim() === suppName.toLowerCase().trim()
          );

          const incoterm = (["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"].includes(first.incoterm || "")
            ? first.incoterm
            : "FOB") as Incoterm;

          const initialScores: Record<string, { passFailResult: PassFailResult; score: number | null; evidenceRemarks: string }> = {};
          targetCriteria.forEach((c) => {
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

        const updatedProject: RfqProject = {
          ...prev,
          items: nextItems,
          bids: nextBids,
        };

        if (importScope === "full_project" && detectedProjectSetup) {
          if (detectedProjectSetup.rfqTitle) updatedProject.rfqTitle = detectedProjectSetup.rfqTitle;
          if (detectedProjectSetup.rfqReference) updatedProject.rfqReference = detectedProjectSetup.rfqReference;
          if (detectedProjectSetup.notes !== undefined) updatedProject.notes = detectedProjectSetup.notes;
          if (detectedProjectSetup.targetDate) updatedProject.targetDate = detectedProjectSetup.targetDate;
          if (detectedProjectSetup.budget !== undefined) updatedProject.budget = detectedProjectSetup.budget;
          if (detectedProjectSetup.comparisonCurrency) updatedProject.comparisonCurrency = detectedProjectSetup.comparisonCurrency;
          if (detectedProjectSetup.fxRiskBufferPct !== undefined) updatedProject.fxRiskBufferPct = detectedProjectSetup.fxRiskBufferPct;
          if (detectedProjectSetup.costOfMoneyPctPerYear !== undefined) updatedProject.costOfMoneyPctPerYear = detectedProjectSetup.costOfMoneyPctPerYear;
          if (detectedProjectSetup.defaultVatPct !== undefined) updatedProject.defaultVatPct = detectedProjectSetup.defaultVatPct;
          if (detectedProjectSetup.countVatAsCost !== undefined) updatedProject.countVatAsCost = detectedProjectSetup.countVatAsCost;
          if (detectedProjectSetup.calcCustomsAuto !== undefined) updatedProject.calcCustomsAuto = detectedProjectSetup.calcCustomsAuto;
          if (detectedProjectSetup.scoringWeightPricePct !== undefined) updatedProject.scoringWeightPricePct = detectedProjectSetup.scoringWeightPricePct;
          if (detectedProjectSetup.scoringWeightQualityPct !== undefined) updatedProject.scoringWeightQualityPct = detectedProjectSetup.scoringWeightQualityPct;
          if (detectedProjectSetup.scoringWeightLeadTimePct !== undefined) updatedProject.scoringWeightLeadTimePct = detectedProjectSetup.scoringWeightLeadTimePct;
          if (detectedProjectSetup.awardStrategy) updatedProject.awardStrategy = detectedProjectSetup.awardStrategy;
          if (detectedProjectSetup.preparedBy) updatedProject.preparedBy = detectedProjectSetup.preparedBy;
          if (detectedProjectSetup.preparedByTitle) updatedProject.preparedByTitle = detectedProjectSetup.preparedByTitle;
          if (detectedProjectSetup.reviewedBy) updatedProject.reviewedBy = detectedProjectSetup.reviewedBy;
          if (detectedProjectSetup.reviewedByTitle) updatedProject.reviewedByTitle = detectedProjectSetup.reviewedByTitle;
          if (detectedProjectSetup.approvedBy) updatedProject.approvedBy = detectedProjectSetup.approvedBy;
          if (detectedProjectSetup.approvedByTitle) updatedProject.approvedByTitle = detectedProjectSetup.approvedByTitle;
          if (detectedProjectSetup.justification) updatedProject.justification = detectedProjectSetup.justification;
          if (detectedProjectSetup.exchangeRates && detectedProjectSetup.exchangeRates.length > 0) {
            updatedProject.exchangeRates = detectedProjectSetup.exchangeRates;
          }
          if (targetCriteria.length > 0) {
            updatedProject.qualityCriteria = targetCriteria;
          }
        }

        return updatedProject;
      });

      const setupSummary = (importScope === "full_project" && detectedProjectSetup)
        ? ` (including Project Setup, ${detectedProjectSetup.exchangeRates?.length || 0} exchange rates, and ${detectedProjectSetup.qualityCriteria?.length || 0} quality criteria)`
        : "";

      toast.success(
        `Successfully imported ${rowsToImport.length} quotations across ${selectedSuppliers.size} suppliers${setupSummary} (${importStrategy === "replace" ? "Replaced all bids" : "Merged & updated"}).`
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
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
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
                    Click to select or drag & drop CSV or Excel spreadsheet
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supports .xlsx, .xls, .csv files up to 10MB • Auto-maps 42 standard bid columns
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
