"use client";

import React, { useState, useMemo } from "react";
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
  Download,
  FileSpreadsheet,
  FileText,
  FileCode,
  Building2,
  Package,
  Layers,
  Award,
  CheckCircle2,
  AlertCircle,
  Check,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { RfqProject } from "../../types";
import {
  exportRfqToExcel,
  exportRfqBidsToCsv,
  exportRfqComparisonToCsv,
  exportRfqQualityToCsv,
  exportRfqToJson,
  DynamicExportOptions,
} from "../../engine/excel-export";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: RfqProject | null;
  onTriggerPrint?: () => void;
}

type ExportFormat = "EXCEL" | "BIDS_CSV" | "COMPARISON_CSV" | "QUALITY_CSV" | "JSON";

export const ExportModal: React.FC<ExportModalProps> = React.memo(
  ({ isOpen, onClose, project, onTriggerPrint }) => {
    // Export Format
    const [format, setFormat] = useState<ExportFormat>("EXCEL");

    // Dynamic Selections
    const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(() => {
      return new Set((project?.bids || []).map((b) => b.id));
    });

    const [selectedItems, setSelectedItems] = useState<Set<string>>(() => {
      return new Set((project?.items || []).map((i) => i.id));
    });

    // Content Toggles
    const [includeCostWaterfall, setIncludeCostWaterfall] = useState(true);
    const [includeCommercialTerms, setIncludeCommercialTerms] = useState(true);
    const [includeQualityScores, setIncludeQualityScores] = useState(true);
    const [includeAwards, setIncludeAwards] = useState(true);

    const [isExporting, setIsExporting] = useState(false);

    // Keep selections up to date if project bids/items count changes
    const allSuppliers = useMemo(() => project?.bids || [], [project?.bids]);
    const allItems = useMemo(() => project?.items || [], [project?.items]);

    const localSuppliers = useMemo(
      () => allSuppliers.filter((b) => b.supplierType === "LOCAL"),
      [allSuppliers]
    );

    const intlSuppliers = useMemo(
      () => allSuppliers.filter((b) => b.supplierType === "INTERNATIONAL"),
      [allSuppliers]
    );

    // Quick supplier filter actions
    const selectAllSuppliers = () => {
      setSelectedSuppliers(new Set(allSuppliers.map((b) => b.id)));
    };

    const selectLocalOnly = () => {
      setSelectedSuppliers(new Set(localSuppliers.map((b) => b.id)));
    };

    const selectIntlOnly = () => {
      setSelectedSuppliers(new Set(intlSuppliers.map((b) => b.id)));
    };

    const deselectAllSuppliers = () => {
      setSelectedSuppliers(new Set());
    };

    const toggleSupplier = (id: string) => {
      setSelectedSuppliers((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    // Quick item filter actions
    const selectAllItems = () => {
      setSelectedItems(new Set(allItems.map((i) => i.id)));
    };

    const deselectAllItems = () => {
      setSelectedItems(new Set());
    };

    const toggleItem = (id: string) => {
      setSelectedItems((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    // Calculate dynamic quotation count
    const activeQuotationsCount = useMemo(() => {
      let count = 0;
      allSuppliers.forEach((b) => {
        if (!selectedSuppliers.has(b.id)) return;
        allItems.forEach((i) => {
          if (!selectedItems.has(i.id)) return;
          if (b.quotations?.[i.id]) count += 1;
        });
      });
      return count;
    }, [allSuppliers, allItems, selectedSuppliers, selectedItems]);

    const handleExecuteExport = async () => {
      if (!project) return;
      if (selectedSuppliers.size === 0 && allSuppliers.length > 0) {
        toast.error("Please select at least one supplier to export.");
        return;
      }
      if (selectedItems.size === 0 && allItems.length > 0) {
        toast.error("Please select at least one item to export.");
        return;
      }

      setIsExporting(true);
      try {
        const options: DynamicExportOptions = {
          supplierIds: Array.from(selectedSuppliers),
          itemIds: Array.from(selectedItems),
          includeCostWaterfall,
          includeCommercialTerms,
          includeQualityScores,
          includeAwards,
        };

        if (format === "EXCEL") {
          await exportRfqToExcel(project, options);
          toast.success("Excel workbook exported successfully.");
        } else if (format === "BIDS_CSV") {
          exportRfqBidsToCsv(project, options);
          toast.success("Bids & quotations CSV exported successfully.");
        } else if (format === "COMPARISON_CSV") {
          exportRfqComparisonToCsv(project, options);
          toast.success("Comparison matrix CSV exported successfully.");
        } else if (format === "QUALITY_CSV") {
          exportRfqQualityToCsv(project, options);
          toast.success("Technical quality evaluation CSV exported successfully.");
        } else if (format === "JSON") {
          exportRfqToJson(project, options);
          toast.success("Project JSON backup exported successfully.");
        }

        onClose();
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        toast.error(`Export failed: ${errorMsg}`);
      } finally {
        setIsExporting(false);
      }
    };

    if (!isOpen || !project) return null;

    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          style={{ width: "min(1080px, 94vw)", maxWidth: "94vw" }}
          className="!w-[94vw] !max-w-[1080px] !max-h-[90vh] flex flex-col p-6 shadow-2xl border-border bg-card"
        >
          {/* Header */}
          <DialogHeader className="space-y-1.5 pb-2 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    Export Bid Comparison Data
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Customize your export package. Choose format, target suppliers, items, and evaluation sections.
                  </DialogDescription>
                </div>
              </div>

              {onTriggerPrint && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onTriggerPrint();
                  }}
                  className="gap-1.5 text-xs h-7 text-muted-foreground hover:text-foreground"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Abstract
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1">
            {/* 1. Format Selection */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-foreground uppercase tracking-wider block">
                1. Select Export Format
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {/* Excel Option */}
                <div
                  onClick={() => setFormat("EXCEL")}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                    format === "EXCEL"
                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500/30"
                      : "border-border/70 hover:border-border hover:bg-muted/10"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Excel Workbook</div>
                        <div className="text-[10px] text-muted-foreground">.xlsx (Full)</div>
                      </div>
                    </div>
                    {format === "EXCEL" && (
                      <div className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Complete multi-sheet workbook: Setup, Rates, Criteria, Items with Specs, Bids &amp; Awards.
                  </p>
                </div>

                {/* Bids CSV Option */}
                <div
                  onClick={() => setFormat("BIDS_CSV")}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                    format === "BIDS_CSV"
                      ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 ring-1 ring-blue-500/30"
                      : "border-border/70 hover:border-border hover:bg-muted/10"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Bids Dataset</div>
                        <div className="text-[10px] text-muted-foreground">.csv (Canonical)</div>
                      </div>
                    </div>
                    {format === "BIDS_CSV" && (
                      <div className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    42-column tabular bids dataset. 100% import-compatible format.
                  </p>
                </div>

                {/* Comparison Matrix CSV Option */}
                <div
                  onClick={() => setFormat("COMPARISON_CSV")}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                    format === "COMPARISON_CSV"
                      ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 ring-1 ring-indigo-500/30"
                      : "border-border/70 hover:border-border hover:bg-muted/10"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Matrix Table</div>
                        <div className="text-[10px] text-muted-foreground">.csv (Summary)</div>
                      </div>
                    </div>
                    {format === "COMPARISON_CSV" && (
                      <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Side-by-side landed unit and total cost per item across suppliers.
                  </p>
                </div>

                {/* Quality Matrix CSV Option */}
                <div
                  onClick={() => setFormat("QUALITY_CSV")}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                    format === "QUALITY_CSV"
                      ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-500/30"
                      : "border-border/70 hover:border-border hover:bg-muted/10"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                        <Award className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Quality Matrix</div>
                        <div className="text-[10px] text-muted-foreground">.csv (Audit)</div>
                      </div>
                    </div>
                    {format === "QUALITY_CSV" && (
                      <div className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Technical evaluation: Pass/fail checks, 1-5 ratings &amp; audit remarks.
                  </p>
                </div>

                {/* JSON Option */}
                <div
                  onClick={() => setFormat("JSON")}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between space-y-2 ${
                    format === "JSON"
                      ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-500/30"
                      : "border-border/70 hover:border-border hover:bg-muted/10"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                        <FileCode className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">JSON Backup</div>
                        <div className="text-[10px] text-muted-foreground">.json (State)</div>
                      </div>
                    </div>
                    {format === "JSON" && (
                      <div className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Complete RFQ state snapshot including assumptions and awards.
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Dynamic Suppliers Filter */}
            <div className="rounded-xl border bg-card p-3.5 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                    2. Filter Suppliers ({selectedSuppliers.size} of {allSuppliers.length} selected)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllSuppliers}
                    className="h-6 text-[11px] text-primary hover:text-primary/80"
                  >
                    All ({allSuppliers.length})
                  </Button>
                  <span className="text-muted-foreground text-xs">•</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectLocalOnly}
                    disabled={localSuppliers.length === 0}
                    className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Local Only ({localSuppliers.length})
                  </Button>
                  <span className="text-muted-foreground text-xs">•</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectIntlOnly}
                    disabled={intlSuppliers.length === 0}
                    className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Int&apos;l Only ({intlSuppliers.length})
                  </Button>
                  <span className="text-muted-foreground text-xs">•</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={deselectAllSuppliers}
                    className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                {allSuppliers.map((supp) => {
                  const isChecked = selectedSuppliers.has(supp.id);
                  return (
                    <div
                      key={supp.id}
                      onClick={() => toggleSupplier(supp.id)}
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
                        <span className="font-semibold truncate text-[11px]">{supp.supplierName}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 uppercase font-mono"
                        >
                          {supp.supplierType === "LOCAL" ? "Local" : supp.country || "Intl"}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="text-[9px] px-1 py-0 font-mono"
                        >
                          {supp.quoteCurrency}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Dynamic Items Filter */}
            <div className="rounded-xl border bg-card p-3.5 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                    3. Filter Requested Items ({selectedItems.size} of {allItems.length} selected)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={selectAllItems}
                    className="h-6 text-[11px] text-primary hover:text-primary/80"
                  >
                    All Items ({allItems.length})
                  </Button>
                  <span className="text-muted-foreground text-xs">•</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={deselectAllItems}
                    className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                {allItems.map((item, idx) => {
                  const isChecked = selectedItems.has(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
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
                        <span className="font-semibold truncate text-[11px]">
                          {idx + 1}. {item.itemName}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0 ml-1">
                        {item.quantity.toLocaleString()} {item.uom}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. Sections & Calculation Toggles (For Excel & Full Backups) */}
            {(format === "EXCEL" || format === "JSON") && (
              <div className="rounded-xl border bg-muted/15 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                    4. Evaluation Sections to Include
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <label className="flex items-center gap-2 p-2 rounded-lg border bg-card cursor-pointer select-none hover:bg-muted/10">
                    <input
                      type="checkbox"
                      checked={includeCostWaterfall}
                      onChange={(e) => setIncludeCostWaterfall(e.target.checked)}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    <div>
                      <div className="font-semibold text-foreground">Cost Waterfall</div>
                      <div className="text-[10px] text-muted-foreground">Freight, duty, VAT & inland</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg border bg-card cursor-pointer select-none hover:bg-muted/10">
                    <input
                      type="checkbox"
                      checked={includeCommercialTerms}
                      onChange={(e) => setIncludeCommercialTerms(e.target.checked)}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    <div>
                      <div className="font-semibold text-foreground">Commercial Terms</div>
                      <div className="text-[10px] text-muted-foreground">Incoterms, net days & lead time</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg border bg-card cursor-pointer select-none hover:bg-muted/10">
                    <input
                      type="checkbox"
                      checked={includeQualityScores}
                      onChange={(e) => setIncludeQualityScores(e.target.checked)}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    <div>
                      <div className="font-semibold text-foreground">Quality & Compliance</div>
                      <div className="text-[10px] text-muted-foreground">Pass/fail audit, scored criteria &amp; remarks sheet</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg border bg-card cursor-pointer select-none hover:bg-muted/10">
                    <input
                      type="checkbox"
                      checked={includeAwards}
                      onChange={(e) => setIncludeAwards(e.target.checked)}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    <div>
                      <div className="font-semibold text-foreground">Award & Approvals</div>
                      <div className="text-[10px] text-muted-foreground">Allocations & signatories sheet</div>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Footer & Action Summary */}
          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between border-t pt-3 gap-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 self-start sm:self-center">
              {selectedSuppliers.size > 0 && selectedItems.size > 0 ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Ready to export: <strong>{selectedSuppliers.size}</strong> suppliers · <strong>{selectedItems.size}</strong> items ({activeQuotationsCount} bids) as <strong>{format}</strong>.
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-amber-700 dark:text-amber-400">
                    Please select at least 1 supplier and 1 item to generate the export.
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end">
              <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteExport}
                disabled={
                  isExporting ||
                  selectedSuppliers.size === 0 ||
                  selectedItems.size === 0
                }
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 h-8 text-xs font-semibold px-4"
              >
                <Download className="w-3.5 h-3.5" />
                {isExporting ? "Generating..." : `Download ${format === "EXCEL" ? ".xlsx" : format === "JSON" ? ".json" : ".csv"}`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

ExportModal.displayName = "ExportModal";
