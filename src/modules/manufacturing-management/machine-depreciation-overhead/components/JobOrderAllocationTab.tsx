"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Briefcase,
  Package,
  DollarSign,
  TrendingDown,
  AlertCircle,
  RefreshCw,
  BarChart2,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
} from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import type { JobOrderAllocationData, JobOrderAllocationRow } from "../types";
import { pesoFmt, numFmt, fmtPesoAxis } from "./OverviewTab";

const BAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

interface Props {
  data: JobOrderAllocationData | null;
  loading: boolean;
  error: string | null;
  onRefetch: () => void;
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <div className="h-3 bg-muted rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

function FormulaTooltip({ formula, description }: { formula: string; description?: string }) {
  return (
    <UITooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="View calculation formula"
          className="text-muted-foreground/40 hover:text-foreground cursor-help p-0.5 rounded transition-colors ml-auto"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs p-2.5 max-w-xs space-y-1 bg-popover text-popover-foreground border border-border shadow-md">
        <div className="font-semibold text-foreground text-[11px]">Formula</div>
        <div className="font-mono text-[11px] text-primary">{formula}</div>
        {description && <div className="text-[10px] text-muted-foreground pt-0.5">{description}</div>}
      </TooltipContent>
    </UITooltip>
  );
}

export function JobOrderAllocationTab({ data, loading, error, onRefetch }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const kpis = data?.kpis;
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.jobOrderNo.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.machineName.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const isEmpty = !loading && !error && rows.length === 0;

  const chartData = useMemo(() => {
    return rows
      .slice()
      .filter((r) => r.depreciationAttributed > 0)
      .sort((a, b) => b.depreciationAttributed - a.depreciationAttributed)
      .slice(0, 10)
      .map((r) => ({
        name: r.jobOrderNo.length > 16 ? `${r.jobOrderNo.slice(0, 15)}…` : r.jobOrderNo,
        attributed: r.depreciationAttributed,
      }));
  }, [rows]);

  // Totals for filtered rows
  const totals = useMemo(() => {
    return {
      output: filtered.reduce((s, r) => s + r.productionOutput, 0),
      attributed: filtered.reduce((s, r) => s + r.depreciationAttributed, 0),
    };
  }, [filtered]);

  const dynamicChartHeight = Math.max(160, chartData.length * 48);

  function handleExportExcel() {
    try {
      if (!filtered.length) {
        toast.error("No job order allocation records to export.");
        return;
      }

      const headers = [
        "Job Order No",
        "Finished Good",
        "Machine",
        "Output",
        "UOM",
        "Rate Per Unit (PHP)",
        "Depreciation Attributed (PHP)",
      ];

      const tableRows = filtered.map((r) => [
        r.jobOrderNo,
        r.productName,
        r.machineName,
        r.productionOutput,
        r.uom,
        r.ratePerUnit,
        r.depreciationAttributed,
      ]);

      const minWidths = [18, 28, 24, 14, 10, 20, 26];

      // Auto-fit column widths with safety minimums
      const colWidths = headers.map((header, colIdx) => {
        let maxLen = header.length;
        tableRows.forEach((row) => {
          const val = row[colIdx];
          const str = val != null ? String(val) : "";
          if (str.length > maxLen) {
            maxLen = str.length;
          }
        });
        return { wch: Math.max(maxLen + 4, minWidths[colIdx] || 12) };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...tableRows]);

      // Apply explicit column widths
      ws["!cols"] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, "Job Order Allocations");

      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `job_order_depreciation_allocations_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Job order allocations exported to Excel successfully.");
    } catch (err) {
      console.error("Export Excel error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to export Excel file.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive p-4 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={onRefetch}
            className="ml-auto text-xs underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* KPI Cards: Clean, Neutral */}
      {!error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border p-4 animate-pulse bg-muted/20 flex flex-col gap-2">
                <div className="h-3 bg-muted rounded w-2/3" />
                <div className="h-6 bg-muted rounded w-1/2 mt-1" />
              </div>
            ))
            : (
              <>
                <div className="rounded-xl border border-border p-4 bg-card text-card-foreground shadow-sm flex flex-col justify-between gap-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                    <Briefcase className="h-4 w-4 text-primary shrink-0" />
                    <span>Job Orders with Output</span>
                    <FormulaTooltip
                      formula="Count of distinct Job Orders with Output > 0"
                      description="Discrete production orders manufactured during the period"
                    />
                  </div>
                  <div className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                    {kpis ? String(kpis.jobOrdersWithOutput) : "—"}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Distinct job orders manufactured</p>
                </div>

                <div className="rounded-xl border border-border p-4 bg-card text-card-foreground shadow-sm flex flex-col justify-between gap-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                    <Package className="h-4 w-4 text-sky-500 shrink-0" />
                    <span>Total Production Output</span>
                    <FormulaTooltip
                      formula="Sum of Job Order output units"
                      description="Compatible finished units produced; displays Multiple UOMs if mixed"
                    />
                  </div>
                  <div className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums truncate">
                    {kpis && kpis.totalProductionOutput !== null
                      ? `${numFmt.format(kpis.totalProductionOutput)} ${kpis.totalOutputUom}`
                      : kpis?.totalOutputUom ?? "—"}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {kpis?.totalProductionOutput !== null ? "Compatible UOM units" : "Mixed unit measurements"}
                  </p>
                </div>

                <div className="rounded-xl border border-border p-4 bg-card text-card-foreground shadow-sm flex flex-col justify-between gap-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                    <DollarSign className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Depreciation Attributed</span>
                    <FormulaTooltip
                      formula="Sum of (Job Order Output × Machine Unit Rate)"
                      description="Total equipment depreciation cost absorbed into Job Orders"
                    />
                  </div>
                  <div className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                    {kpis ? pesoFmt.format(kpis.depreciationAttributed) : "—"}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Absorbed across job production</p>
                </div>

                <div className="rounded-xl border border-border p-4 bg-card text-card-foreground shadow-sm flex flex-col justify-between gap-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                    <TrendingDown className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>Average Depreciation / Unit</span>
                    <FormulaTooltip
                      formula="Total Depreciation Attributed ÷ Total Production Output"
                      description="Weighted average equipment burden rate per finished unit"
                    />
                  </div>
                  <div className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums truncate">
                    {kpis?.avgRateUom ? kpis.avgRateUom : "—"}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {kpis?.avgDepreciationPerUnit !== null ? "Job-order production burden rate" : "Safeguarded against mixed UOMs"}
                  </p>
                </div>
              </>
            )}
        </div>
      )}

      {/* In-tab Search & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-2.5 rounded-xl border border-border">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search job order, product, machine..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-8 pr-3 h-8 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2">
          {search && (
            <span className="text-xs text-muted-foreground font-mono">
              {filtered.length} of {rows.length} rows
            </span>
          )}

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-input bg-background hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
          >
            <Download className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Table with Right-Aligned Financial Columns and Removed COGM Column */}
      <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/80 border-b border-border">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Job Order</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Finished Good</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Machine</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Output</th>
                <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">UOM</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Rate / Unit</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground whitespace-nowrap">Depreciation Attributed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : isEmpty
                ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <BarChart2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm font-medium text-muted-foreground">No job order depreciation attributions in period</p>
                    </td>
                  </tr>
                )
                : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-muted-foreground italic">
                      No job orders match &ldquo;{search}&rdquo;
                    </td>
                  </tr>
                )
                : paginatedRows.map((row: JobOrderAllocationRow, i: number) => (
                  <tr key={`${row.jobOrderId}-${row.machineName}-${i}`} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 font-mono font-medium">{row.jobOrderNo}</td>
                    <td className="px-3 py-2.5 max-w-[200px] truncate" title={row.productName}>
                      {row.productName}
                    </td>
                    <td className="px-3 py-2.5 max-w-[160px] truncate text-muted-foreground" title={row.machineName}>
                      {row.machineName}
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums text-right font-medium">
                      {numFmt.format(row.productionOutput)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
                        {row.uom}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums text-right">
                      {pesoFmt.format(row.ratePerUnit)}{" "}
                      <span className="text-muted-foreground text-[10px] font-sans">/ {row.uom}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums text-right font-bold text-foreground">
                      {pesoFmt.format(row.depreciationAttributed)}
                    </td>
                  </tr>
                ))}
            </tbody>
            {/* Totals Footer Row */}
            {!loading && filtered.length > 0 && (
              <tfoot className="bg-muted/40 border-t border-border font-semibold text-xs text-foreground">
                <tr>
                  <td colSpan={3} className="px-3 py-2.5 font-sans">
                    Total ({filtered.length} allocation{filtered.length > 1 ? "s" : ""})
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right font-bold">
                    {numFmt.format(totals.output)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground font-mono">—</td>
                  <td className="px-3 py-2.5 text-muted-foreground font-mono">—</td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right font-bold text-primary">
                    {pesoFmt.format(totals.attributed)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {!loading && !error && filtered.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground pt-1">
          <div>
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} allocation{filtered.length > 1 ? "s" : ""}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Rows per page:</span>
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
                className="p-1.5 rounded-md border border-input hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 py-1 rounded-md border border-input bg-muted/30 font-mono">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
                className="p-1.5 rounded-md border border-input hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chart: Proportional Bar Size & Adaptive Height */}
      {!loading && !error && chartData.length > 0 && (
        <div className="rounded-xl border border-border p-4 bg-card shadow-sm">
          <div className="mb-3">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Depreciation Attributed by Job Order (Top 10)
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Identifies which production orders absorbed the largest equipment depreciation
            </p>
          </div>
          <div style={{ height: `${dynamicChartHeight}px` }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/60" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmtPesoAxis} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 10 }}
                  width={120}
                  tickFormatter={(v: string) => (v.length > 15 ? `${v.slice(0, 14)}…` : v)}
                />
                <Tooltip
                  formatter={(v: number) => [pesoFmt.format(v), "Depreciation Attributed"]}
                  contentStyle={{ fontSize: "11px", borderRadius: "8px" }}
                />
                <Bar dataKey="attributed" name="Attributed" radius={[0, 4, 4, 0]} barSize={28}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
