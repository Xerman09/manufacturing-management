"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    AlertTriangle,
    Boxes,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Clock,
    ExternalLink,
    Factory,
    RotateCcw,
    SlidersHorizontal,
    Users
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
    ConfidenceLevel,
    DemandForecastReportPayload,
    ScenarioAssumptions
} from "../types";
import {
    computeAdjustedPlanningRows,
    DEFAULT_SCENARIO_ASSUMPTIONS,
    formatNumberOrDash
} from "../utils/scenarioMath";

interface PlanningScenariosTabProps {
    payload: DemandForecastReportPayload;
    assumptions: ScenarioAssumptions;
    onChangeAssumptions: (updates: Partial<ScenarioAssumptions>) => void;
    onResetAssumptions: () => void;
    onOpenEvidence: (
        title: string,
        subtitle: string,
        evidenceIds: string[],
        totalEvidenceCount: number
    ) => void;
}

type PlanningLens = "all" | "inventory" | "production" | "labor";

export const PlanningScenariosTab: React.FC<PlanningScenariosTabProps> = ({
    payload,
    assumptions,
    onChangeAssumptions,
    onResetAssumptions,
    onOpenEvidence
}) => {
    const [lens, setLens] = useState<PlanningLens>("all");
    const [page, setPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(10);

    const [demandDraft, setDemandDraft] = useState<string | null>(null);
    const [safetyDraft, setSafetyDraft] = useState<string | null>(null);
    const [leadDraft, setLeadDraft] = useState<string | null>(null);

    const demandInput = demandDraft ?? String(assumptions.demandAdjustmentPct);
    const safetyInput = safetyDraft ?? String(assumptions.safetyStockDays);
    const leadInput = leadDraft ?? String(assumptions.leadTimeBufferDays);

    // Bipolar center-zero geometry for Demand Uplift / Downside (-50% to +100%)
    const clampedDemand = Math.min(
        100,
        Math.max(-50, Number(assumptions.demandAdjustmentPct) || 0)
    );
    const demandZeroPct = (50 / 150) * 100; // 33.33%
    const demandCurrentPct = ((clampedDemand + 50) / 150) * 100;
    const demandFillLeft = Math.min(demandZeroPct, demandCurrentPct);
    const demandFillWidth = Math.abs(demandCurrentPct - demandZeroPct);
    const isDemandNegative = clampedDemand < 0;
    const isDemandPositive = clampedDemand > 0;

    // Linear geometry for Safety Stock Coverage (0 to 90 days)
    const clampedSafety = Math.min(90, Math.max(0, Number(assumptions.safetyStockDays) || 0));
    const safetyFillPct = (clampedSafety / 90) * 100;
    const safetyStdTickPct = (7 / 90) * 100; // 7.78%

    // Linear geometry for Lead-Time Buffer (0 to 60 days)
    const clampedLead = Math.min(60, Math.max(0, Number(assumptions.leadTimeBufferDays) || 0));
    const leadFillPct = (clampedLead / 60) * 100;

    const adjustedRows = useMemo(
        () => computeAdjustedPlanningRows(payload.planningRows, assumptions),
        [payload.planningRows, assumptions]
    );

    const totalRows = adjustedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRows);

    const paginatedRows = useMemo(
        () => adjustedRows.slice(startIndex, endIndex),
        [adjustedRows, startIndex, endIndex]
    );

    const visiblePageNumbers = useMemo(() => {
        if (totalPages <= 5) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }
        if (safePage <= 3) {
            return [1, 2, 3, 4, "ellipsis-end", totalPages] as const;
        }
        if (safePage >= totalPages - 2) {
            return [1, "ellipsis-start", totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
        }
        return [1, "ellipsis-start", safePage - 1, safePage, safePage + 1, "ellipsis-end", totalPages] as const;
    }, [totalPages, safePage]);

    const totals = useMemo(() => {
        const inventoryUnavailable = adjustedRows.some((r) => r.liveOnhandUnits === null);
        const totalSuggestedProd = inventoryUnavailable
            ? null
            : adjustedRows.reduce((s, r) => s + (r.suggestedProductionUnits ?? 0), 0);
        const hasLaborData = adjustedRows.some((r) => r.suggestedLaborHours !== null);
        const totalLaborHours =
            inventoryUnavailable || !hasLaborData
                ? null
                : Number(
                      adjustedRows
                          .reduce((s, r) => s + (r.suggestedLaborHours ?? 0), 0)
                          .toFixed(1)
                  );
        const stockoutCount = adjustedRows.filter((r) => r.planningRisk === "Stockout Risk").length;
        const expiringSoonUnitsTotal = adjustedRows.reduce((s, r) => s + r.expiringSoonUnits, 0);
        const fefoRiskLots = adjustedRows.reduce((s, r) => s + r.expiringSoonLotCount, 0);

        return {
            inventoryUnavailable,
            totalSuggestedProd,
            totalLaborHours,
            totalShifts: totalLaborHours !== null ? Number((totalLaborHours / 8).toFixed(1)) : null,
            stockoutCount,
            expiringSoonUnitsTotal,
            fefoRiskLots
        };
    }, [adjustedRows]);

    const isDefaultScenario =
        assumptions.demandAdjustmentPct === DEFAULT_SCENARIO_ASSUMPTIONS.demandAdjustmentPct &&
        assumptions.confidenceLevel === DEFAULT_SCENARIO_ASSUMPTIONS.confidenceLevel &&
        assumptions.safetyStockDays === DEFAULT_SCENARIO_ASSUMPTIONS.safetyStockDays &&
        assumptions.leadTimeBufferDays === DEFAULT_SCENARIO_ASSUMPTIONS.leadTimeBufferDays &&
        assumptions.plannerNote === "";

    const commitNumericField = (
        raw: string,
        min: number,
        max: number,
        fallback: number,
        allowDecimal: boolean,
        clearDraft: () => void,
        onValid: (num: number) => void
    ) => {
        const trimmed = raw.trim();
        if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") {
            clearDraft();
            onValid(fallback);
            return;
        }
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) {
            clearDraft();
            onValid(fallback);
            return;
        }
        const normalized = allowDecimal ? Number(parsed.toFixed(1)) : Math.round(parsed);
        const clamped = Math.max(min, Math.min(max, normalized));
        clearDraft();
        onValid(clamped);
    };

    const handleSelectOnFocus = (
        e: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>
    ) => {
        e.currentTarget.select();
    };

    return (
        <div className="space-y-4">
            {/* Interactive Scenario Assumptions Workbench */}
            <Card className="rounded-2xl border-border/60 shadow-sm">
                <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <SlidersHorizontal className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                            Scenario Assumptions Workbench
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Test demand changes, confidence range, safety stock days, and lead-time buffers to see live inventory, production, and labor impact
                        </CardDescription>
                    </div>
                    {!isDefaultScenario && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setDemandDraft(null);
                                setSafetyDraft(null);
                                setLeadDraft(null);
                                onResetAssumptions();
                            }}
                            className="h-7 px-2.5 text-xs gap-1 text-muted-foreground hover:text-foreground self-start"
                        >
                            <RotateCcw className="h-3 w-3" />
                            Reset Baseline
                        </Button>
                    )}
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        {/* Demand Adjustment % (bipolar center-zero -50 to +100, supports decimals like 12.5) */}
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold">Demand Uplift / Downside</span>
                                <div className="relative flex items-center">
                                    <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={demandInput}
                                        onFocus={handleSelectOnFocus}
                                        onClick={handleSelectOnFocus}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (/^-?\d*\.?\d*$/.test(v)) {
                                                setDemandDraft(v);
                                                if (v !== "" && v !== "-" && v !== "." && v !== "-.") {
                                                    const n = Number(v);
                                                    if (Number.isFinite(n) && n >= -50 && n <= 100) {
                                                        onChangeAssumptions({
                                                            demandAdjustmentPct: Number(n.toFixed(1))
                                                        });
                                                    }
                                                }
                                            }
                                        }}
                                        onBlur={() =>
                                            commitNumericField(
                                                demandInput,
                                                -50,
                                                100,
                                                0,
                                                true,
                                                () => setDemandDraft(null),
                                                (n) => onChangeAssumptions({ demandAdjustmentPct: n })
                                            )
                                        }
                                        className={`h-7 w-20 pr-6 text-right text-xs font-bold tabular-nums bg-background transition-colors ${
                                            isDemandNegative
                                                ? "text-amber-600 dark:text-amber-400"
                                                : isDemandPositive
                                                ? "text-primary"
                                                : ""
                                        }`}
                                    />
                                    <span className="pointer-events-none absolute right-2 text-[11px] font-semibold text-muted-foreground">
                                        %
                                    </span>
                                </div>
                            </div>

                            <div className="relative flex items-center py-1">
                                <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-muted-foreground/20">
                                    <div
                                        style={{ left: `${demandZeroPct}%` }}
                                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-[2px] rounded-full bg-muted-foreground/50"
                                    />
                                    {demandFillWidth > 0 && (
                                        <div
                                            style={{
                                                left: `${demandFillLeft}%`,
                                                width: `${demandFillWidth}%`
                                            }}
                                            className={`absolute top-0 h-full rounded-full transition-colors ${
                                                isDemandNegative ? "bg-amber-500" : "bg-primary"
                                            }`}
                                        />
                                    )}
                                </div>
                                <Slider
                                    value={[clampedDemand]}
                                    min={-50}
                                    max={100}
                                    step={0.5}
                                    onValueChange={([v]) => {
                                        setDemandDraft(null);
                                        onChangeAssumptions({ demandAdjustmentPct: v });
                                    }}
                                    className="relative z-10 cursor-pointer [&>span:first-child]:bg-transparent [&>span:first-child>span]:bg-transparent"
                                />
                            </div>

                            <div className="relative h-4 text-[10px] text-muted-foreground select-none">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDemandDraft(null);
                                        onChangeAssumptions({ demandAdjustmentPct: -50 });
                                    }}
                                    className={`absolute left-0 transition-colors hover:text-foreground cursor-pointer ${
                                        clampedDemand === -50 ? "font-semibold text-foreground" : ""
                                    }`}
                                >
                                    -50% Downside
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDemandDraft(null);
                                        onChangeAssumptions({ demandAdjustmentPct: 0 });
                                    }}
                                    style={{ left: `${demandZeroPct}%` }}
                                    title="Reset to 0% Base"
                                    className={`absolute -translate-x-1/2 transition-colors hover:text-foreground cursor-pointer ${
                                        clampedDemand === 0 ? "font-semibold text-foreground" : ""
                                    }`}
                                >
                                    0% Base
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDemandDraft(null);
                                        onChangeAssumptions({ demandAdjustmentPct: 100 });
                                    }}
                                    className={`absolute right-0 transition-colors hover:text-foreground cursor-pointer ${
                                        clampedDemand === 100 ? "font-semibold text-foreground" : ""
                                    }`}
                                >
                                    +100% Surge
                                </button>
                            </div>
                        </div>

                        {/* Confidence Range */}
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold">Confidence Range</span>
                                <Badge variant="secondary" className="text-[10px] font-bold">
                                    {assumptions.confidenceLevel}% Service
                                </Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-1 rounded-lg bg-background p-1 border border-border/60">
                                {([80, 90, 95] as ConfidenceLevel[]).map((lvl) => {
                                    const active = assumptions.confidenceLevel === lvl;
                                    return (
                                        <button
                                            key={lvl}
                                            type="button"
                                            onClick={() => onChangeAssumptions({ confidenceLevel: lvl })}
                                            className={`relative py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                                                active
                                                    ? "text-primary-foreground"
                                                    : "text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            {active && (
                                                <motion.span
                                                    layoutId="scenario-confidence-pill"
                                                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                                                    className="absolute inset-0 rounded-md bg-primary shadow-sm"
                                                />
                                            )}
                                            <span className="relative z-10">{lvl}%</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                Adjusts expected demand range &amp; safety stock cushion
                            </div>
                        </div>

                        {/* Safety Stock Days (aligned 0–90 on BOTH slider & input) */}
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-xs font-semibold truncate">
                                        Safety Stock Coverage
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSafetyDraft(null);
                                            onChangeAssumptions({ safetyStockDays: 7 });
                                        }}
                                        title="Apply 7-day standard safety coverage"
                                        className={`shrink-0 px-1.5 py-0.5 rounded border text-[10px] leading-none transition-colors cursor-pointer ${
                                            clampedSafety === 7
                                                ? "border-primary/40 bg-primary/10 text-primary font-semibold"
                                                : "border-border/60 bg-background/80 text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        7d Std
                                    </button>
                                </div>
                                <div className="relative flex items-center shrink-0">
                                    <Input
                                        type="text"
                                        inputMode="numeric"
                                        value={safetyInput}
                                        onFocus={handleSelectOnFocus}
                                        onClick={handleSelectOnFocus}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (/^\d*$/.test(v)) {
                                                setSafetyDraft(v);
                                                if (v !== "") {
                                                    const n = Number(v);
                                                    if (n >= 0 && n <= 90) {
                                                        onChangeAssumptions({ safetyStockDays: n });
                                                    }
                                                }
                                            }
                                        }}
                                        onBlur={() =>
                                            commitNumericField(
                                                safetyInput,
                                                0,
                                                90,
                                                0,
                                                false,
                                                () => setSafetyDraft(null),
                                                (n) => onChangeAssumptions({ safetyStockDays: n })
                                            )
                                        }
                                        className={`h-7 w-20 pr-9 text-right text-xs font-bold tabular-nums bg-background transition-colors ${
                                            clampedSafety > 0 ? "text-primary" : ""
                                        }`}
                                    />
                                    <span className="pointer-events-none absolute right-2 text-[11px] text-muted-foreground">
                                        days
                                    </span>
                                </div>
                            </div>

                            <div className="relative flex items-center py-1">
                                <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-muted-foreground/20">
                                    {/* 7d standard tick */}
                                    <div
                                        style={{ left: `${safetyStdTickPct}%` }}
                                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-[2px] rounded-full bg-muted-foreground/45"
                                    />
                                    {/* 45d midpoint tick */}
                                    <div
                                        style={{ left: "50%" }}
                                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-[2px] rounded-full bg-muted-foreground/50"
                                    />
                                    {safetyFillPct > 0 && (
                                        <div
                                            style={{ width: `${safetyFillPct}%` }}
                                            className="absolute left-0 top-0 h-full rounded-full bg-primary transition-colors"
                                        />
                                    )}
                                </div>
                                <Slider
                                    value={[clampedSafety]}
                                    min={0}
                                    max={90}
                                    step={1}
                                    onValueChange={([v]) => {
                                        setSafetyDraft(null);
                                        onChangeAssumptions({ safetyStockDays: v });
                                    }}
                                    className="relative z-10 cursor-pointer [&>span:first-child]:bg-transparent [&>span:first-child>span]:bg-transparent"
                                />
                            </div>

                            <div className="relative h-4 text-[10px] text-muted-foreground select-none">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSafetyDraft(null);
                                        onChangeAssumptions({ safetyStockDays: 0 });
                                    }}
                                    className={`absolute left-0 transition-colors hover:text-foreground cursor-pointer ${
                                        clampedSafety === 0 ? "font-semibold text-foreground" : ""
                                    }`}
                                >
                                    0d Lean
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSafetyDraft(null);
                                        onChangeAssumptions({ safetyStockDays: 45 });
                                    }}
                                    style={{ left: "50%" }}
                                    className={`absolute -translate-x-1/2 transition-colors hover:text-foreground cursor-pointer ${
                                        clampedSafety === 45 ? "font-semibold text-foreground" : ""
                                    }`}
                                >
                                    45d
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSafetyDraft(null);
                                        onChangeAssumptions({ safetyStockDays: 90 });
                                    }}
                                    className={`absolute right-0 transition-colors hover:text-foreground cursor-pointer ${
                                        clampedSafety === 90 ? "font-semibold text-foreground" : ""
                                    }`}
                                >
                                    90d Buffer
                                </button>
                            </div>
                        </div>

                        {/* Lead-Time Buffer Days (aligned 0–60 on BOTH slider & input) */}
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold">Lead-Time Buffer</span>
                                <div className="relative flex items-center shrink-0">
                                    <Input
                                        type="text"
                                        inputMode="numeric"
                                        value={leadInput}
                                        onFocus={handleSelectOnFocus}
                                        onClick={handleSelectOnFocus}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (/^\d*$/.test(v)) {
                                                setLeadDraft(v);
                                                if (v !== "") {
                                                    const n = Number(v);
                                                    if (n >= 0 && n <= 60) {
                                                        onChangeAssumptions({ leadTimeBufferDays: n });
                                                    }
                                                }
                                            }
                                        }}
                                        onBlur={() =>
                                            commitNumericField(
                                                leadInput,
                                                0,
                                                60,
                                                0,
                                                false,
                                                () => setLeadDraft(null),
                                                (n) => onChangeAssumptions({ leadTimeBufferDays: n })
                                            )
                                        }
                                        className={`h-7 w-20 pr-9 text-right text-xs font-bold tabular-nums bg-background transition-colors ${
                                            clampedLead > 0 ? "text-primary" : ""
                                        }`}
                                    />
                                    <span className="pointer-events-none absolute right-2 text-[11px] text-muted-foreground">
                                        days
                                    </span>
                                </div>
                            </div>

                            <div className="relative flex items-center py-1">
                                <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-muted-foreground/20">
                                    {/* +30d midpoint tick */}
                                    <div
                                        style={{ left: "50%" }}
                                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-[2px] rounded-full bg-muted-foreground/50"
                                    />
                                    {leadFillPct > 0 && (
                                        <div
                                            style={{ width: `${leadFillPct}%` }}
                                            className="absolute left-0 top-0 h-full rounded-full bg-primary transition-colors"
                                        />
                                    )}
                                </div>
                                <Slider
                                    value={[clampedLead]}
                                    min={0}
                                    max={60}
                                    step={1}
                                    onValueChange={([v]) => {
                                        setLeadDraft(null);
                                        onChangeAssumptions({ leadTimeBufferDays: v });
                                    }}
                                    className="relative z-10 cursor-pointer [&>span:first-child]:bg-transparent [&>span:first-child>span]:bg-transparent"
                                />
                            </div>

                            <div className="relative h-4 text-[10px] text-muted-foreground select-none">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLeadDraft(null);
                                        onChangeAssumptions({ leadTimeBufferDays: 0 });
                                    }}
                                    className={`absolute left-0 transition-colors hover:text-foreground cursor-pointer ${
                                        clampedLead === 0 ? "font-semibold text-foreground" : ""
                                    }`}
                                >
                                    +0d Nominal
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLeadDraft(null);
                                        onChangeAssumptions({ leadTimeBufferDays: 30 });
                                    }}
                                    style={{ left: "50%" }}
                                    className={`absolute -translate-x-1/2 transition-colors hover:text-foreground cursor-pointer ${
                                        clampedLead === 30 ? "font-semibold text-foreground" : ""
                                    }`}
                                >
                                    +30d
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLeadDraft(null);
                                        onChangeAssumptions({ leadTimeBufferDays: 60 });
                                    }}
                                    className={`absolute right-0 transition-colors hover:text-foreground cursor-pointer ${
                                        clampedLead === 60 ? "font-semibold text-foreground" : ""
                                    }`}
                                >
                                    +60d Buffer
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Optional Planner Assumption Note */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                        <span className="text-[11px] font-semibold text-muted-foreground shrink-0">
                            Scenario Note:
                        </span>
                        <Input
                            value={assumptions.plannerNote}
                            onChange={(e) => onChangeAssumptions({ plannerNote: e.target.value })}
                            placeholder="Document promotion, seasonal peak, or supplier constraint assumptions for export..."
                            className="h-8 text-xs bg-background"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Planning Totals Rollup Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                        <span>Suggested Production</span>
                        <Factory className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div className="text-xl font-black mt-1.5 tabular-nums">
                        {formatNumberOrDash(totals.totalSuggestedProd)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                        Net of usable stock, near-expiry FEFO risk &amp; open JOs
                    </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                        <span>Estimated Direct Labor</span>
                        <Users className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="text-xl font-black mt-1.5 tabular-nums">
                        {totals.totalLaborHours !== null ? `${totals.totalLaborHours.toLocaleString()} hrs` : "-"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                        {totals.totalShifts !== null
                            ? `≈ ${totals.totalShifts.toLocaleString()} standard 8h shifts (from active BOMs)`
                            : "Requires active BOM labor standards & live stock"}
                    </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                        <span>Stockout Risk SKUs</span>
                        <AlertTriangle className="h-4 w-4 text-rose-500" />
                    </div>
                    <div className="text-xl font-black mt-1.5 tabular-nums text-rose-600 dark:text-rose-400">
                        {totals.inventoryUnavailable ? "-" : totals.stockoutCount}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                        {totals.inventoryUnavailable
                            ? "Live inventory unavailable"
                            : `Out of ${adjustedRows.length} active planned SKUs`}
                    </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                        <span>Near-Expiry / QA Alerts</span>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="text-xl font-black mt-1.5 tabular-nums text-amber-600 dark:text-amber-400">
                        {totals.fefoRiskLots} lots
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                        {totals.expiringSoonUnitsTotal > 0
                            ? `${formatNumberOrDash(totals.expiringSoonUnitsTotal)} units expiring ≤30d`
                            : "Expired/quarantined stock already excluded"}
                    </div>
                </div>
            </div>

            {/* Suggested Planning Quantities Table with Lens Filter & Pagination */}
            <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
                <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Boxes className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                            <span>Suggested Inventory, Production &amp; Labor Planning Quantities</span>
                            <Badge variant="secondary" className="text-[10px] font-bold tabular-nums">
                                {totalRows} SKUs
                            </Badge>
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Usable On-Hand excludes expired, quarantined, and unburnable near-expiry FEFO stock
                        </CardDescription>
                    </div>
                    <div className="inline-flex items-center rounded-xl border border-border/70 bg-muted/50 p-0.5 self-start">
                        {(
                            [
                                { id: "all", label: "Unified" },
                                { id: "inventory", label: "Inventory" },
                                { id: "production", label: "Production" },
                                { id: "labor", label: "Labor" }
                            ] as Array<{ id: PlanningLens; label: string }>
                        ).map((opt) => {
                            const active = lens === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setLens(opt.id)}
                                    className={`relative px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                                        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="planning-lens-pill"
                                            transition={{ type: "spring", stiffness: 420, damping: 32 }}
                                            className="absolute inset-0 rounded-lg bg-background shadow-sm border border-border/50"
                                        />
                                    )}
                                    <span className="relative z-10">{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {totalRows === 0 ? (
                        <div className="py-12 text-center text-xs text-muted-foreground">
                            No planned products available for current filters.
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-y border-border/60 bg-muted/40 text-[11px] text-muted-foreground">
                                            <th className="py-2.5 px-3.5 text-left font-bold">Product</th>
                                            <th className="py-2.5 px-2.5 text-center font-bold">Rotation</th>
                                            <th className="py-2.5 px-3 text-right font-bold">Scenario Demand</th>
                                            {(lens === "all" || lens === "inventory") && (
                                                <>
                                                    <th className="py-2.5 px-3 text-right font-bold">Target Stock</th>
                                                    <th className="py-2.5 px-3 text-right font-bold">Usable On-Hand</th>
                                                </>
                                            )}
                                            {(lens === "all" || lens === "production") && (
                                                <>
                                                    <th className="py-2.5 px-3 text-right font-bold">Open JOs</th>
                                                    <th className="py-2.5 px-3 text-right font-bold">Suggested Prod</th>
                                                    <th className="py-2.5 px-3 text-right font-bold">Batches</th>
                                                </>
                                            )}
                                            {(lens === "all" || lens === "labor") && (
                                                <>
                                                    <th className="py-2.5 px-3 text-right font-bold">Labor Hrs</th>
                                                    <th className="py-2.5 px-3 text-right font-bold">8h Shifts</th>
                                                </>
                                            )}
                                            <th className="py-2.5 px-3 text-center font-bold">Status</th>
                                            <th className="py-2.5 px-3 text-right font-bold">Evidence</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {paginatedRows.map((row, idx) => (
                                            <motion.tr
                                                key={row.productId}
                                                initial={{ opacity: 0, y: -5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.18, delay: Math.min(idx * 0.02, 0.3) }}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() =>
                                                    onOpenEvidence(
                                                        `Planning Trace: ${row.productName} (${row.productCode})`,
                                                        `Scenario Demand ${formatNumberOrDash(row.scenarioForecastUnits)} ${row.unitLabel} · Usable On-Hand ${formatNumberOrDash(row.effectiveUsableOnhandUnits)} · Open JOs ${formatNumberOrDash(row.openJobOrderUnits)} · Suggested Production ${formatNumberOrDash(row.suggestedProductionUnits)} · Labor ${formatNumberOrDash(row.suggestedLaborHours, 1)} hrs`,
                                                        row.evidenceIds,
                                                        row.totalEvidenceCount
                                                    )
                                                }
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        onOpenEvidence(
                                                            `Planning Trace: ${row.productName} (${row.productCode})`,
                                                            `Scenario Demand ${formatNumberOrDash(row.scenarioForecastUnits)} ${row.unitLabel} · Usable On-Hand ${formatNumberOrDash(row.effectiveUsableOnhandUnits)} · Open JOs ${formatNumberOrDash(row.openJobOrderUnits)} · Suggested Production ${formatNumberOrDash(row.suggestedProductionUnits)} · Labor ${formatNumberOrDash(row.suggestedLaborHours, 1)} hrs`,
                                                            row.evidenceIds,
                                                            row.totalEvidenceCount
                                                        );
                                                    }
                                                }}
                                                className="hover:bg-accent/45 focus-visible:bg-accent/60 focus-visible:outline-none transition-colors cursor-pointer"
                                            >
                                                <td className="py-2.5 px-3.5">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-semibold text-foreground">{row.productName}</span>
                                                        {row.dataSufficiency !== "SUFFICIENT" && (
                                                            <Badge
                                                                variant="outline"
                                                                className={`text-[9px] px-1 py-0 ${
                                                                    row.dataSufficiency === "LIMITED"
                                                                        ? "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10"
                                                                        : "border-slate-500/40 text-slate-600 dark:text-slate-400 bg-slate-500/10"
                                                                }`}
                                                            >
                                                                {row.dataSufficiency === "LIMITED"
                                                                    ? `Limited (${row.observationCount} obs)`
                                                                    : "Insufficient"}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {row.productCode} · Lead {row.manufacturingLeadDays}d
                                                        {row.expiringSoonLotCount > 0 && (
                                                            <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-semibold">
                                                                · {row.expiringSoonLotCount} lot alert(s)
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-2.5 text-center">
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[10px] px-1.5 py-0 ${
                                                            row.inventoryPolicy === "FEFO"
                                                                ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                                                                : row.inventoryPolicy === "FIFO"
                                                                ? "border-sky-500/40 text-sky-700 dark:text-sky-300"
                                                                : "border-muted-foreground/30 text-muted-foreground"
                                                        }`}
                                                    >
                                                        {row.inventoryPolicy === "UNKNOWN" ? "Unknown" : row.inventoryPolicy}
                                                    </Badge>
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                                                    {formatNumberOrDash(row.scenarioForecastUnits)}{" "}
                                                    <span className="text-[10px] font-normal text-muted-foreground">
                                                        {row.unitLabel}
                                                    </span>
                                                </td>
                                                {(lens === "all" || lens === "inventory") && (
                                                    <>
                                                        <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                                                            {formatNumberOrDash(row.targetInventoryUnits)}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                                                            <div>{formatNumberOrDash(row.effectiveUsableOnhandUnits)}</div>
                                                            {row.atRiskExpiringUnits > 0 && (
                                                                <div className="text-[10px] font-normal text-amber-600 dark:text-amber-400">
                                                                    -{formatNumberOrDash(row.atRiskExpiringUnits)} expiring
                                                                </div>
                                                            )}
                                                        </td>
                                                    </>
                                                )}
                                                {(lens === "all" || lens === "production") && (
                                                    <>
                                                        <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                                                            {formatNumberOrDash(row.openJobOrderUnits)}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                                                            {formatNumberOrDash(row.suggestedProductionUnits)}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right tabular-nums">
                                                            {formatNumberOrDash(row.recommendedBatches)}
                                                        </td>
                                                    </>
                                                )}
                                                {(lens === "all" || lens === "labor") && (
                                                    <>
                                                        <td className="py-2.5 px-3 text-right tabular-nums">
                                                            {row.laborAuditStatus === "Standard Time Outlier" ? (
                                                                <span
                                                                    className="text-[10px] font-medium text-amber-600 dark:text-amber-400"
                                                                    title={`Standard-time outlier (${row.unitStandardLaborHours?.toFixed(1)} hrs/unit; raw ${row.rawLaborHours?.toLocaleString()} hrs excluded from rollup)`}
                                                                >
                                                                    Audit Outlier
                                                                </span>
                                                            ) : row.laborAuditStatus === "Missing Routing" && (row.suggestedProductionUnits || 0) > 0 ? (
                                                                <span
                                                                    className="text-[10px] text-muted-foreground font-medium"
                                                                    title="No BOM labor routing or standard times logged"
                                                                >
                                                                    No Routing
                                                                </span>
                                                            ) : (
                                                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                                    {formatNumberOrDash(row.suggestedLaborHours, 1)}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                                                            {formatNumberOrDash(row.suggestedShifts, 1)}
                                                        </td>
                                                    </>
                                                )}
                                                <td className="py-2.5 px-3 text-center">
                                                    <Badge
                                                        variant="secondary"
                                                        className={`text-[10px] px-1.5 py-0 ${
                                                            row.planningRisk === "Stockout Risk"
                                                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                                                                : row.planningRisk === "Excess Buffer"
                                                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                                                : row.planningRisk === "Balanced"
                                                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                                                : ""
                                                        }`}
                                                    >
                                                        {row.planningRisk}
                                                    </Badge>
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                                                        Trace
                                                        <ExternalLink className="h-3 w-3" />
                                                    </span>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Controls */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-3.5 py-2.5 text-xs">
                                <div className="flex items-center gap-3 text-muted-foreground">
                                    <span className="tabular-nums">
                                        Showing{" "}
                                        <span className="font-semibold text-foreground">{startIndex + 1}</span>–
                                        <span className="font-semibold text-foreground">{endIndex}</span> of{" "}
                                        <span className="font-semibold text-foreground">{totalRows}</span> SKUs
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <span>Rows:</span>
                                        <select
                                            aria-label="Rows per page"
                                            value={pageSize}
                                            onChange={(e) => {
                                                setPageSize(Number(e.target.value));
                                                setPage(1);
                                            }}
                                            className="h-7 rounded-lg border border-border/70 bg-background px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                                        >
                                            {[10, 20, 50, 100].map((size) => (
                                                <option key={size} value={size}>
                                                    {size}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 self-end sm:self-auto">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setPage(1)}
                                        disabled={safePage <= 1}
                                        aria-label="First page"
                                        className="h-7 w-7 rounded-lg"
                                    >
                                        <ChevronsLeft className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setPage(Math.max(1, safePage - 1))}
                                        disabled={safePage <= 1}
                                        aria-label="Previous page"
                                        className="h-7 w-7 rounded-lg"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                    </Button>

                                    <div className="flex items-center gap-1 px-1">
                                        {visiblePageNumbers.map((item) =>
                                            typeof item === "string" ? (
                                                <span
                                                    key={item}
                                                    className="px-1.5 text-muted-foreground select-none"
                                                >
                                                    …
                                                </span>
                                            ) : (
                                                <button
                                                    key={item}
                                                    type="button"
                                                    onClick={() => setPage(item)}
                                                    aria-current={safePage === item ? "page" : undefined}
                                                    className={`h-7 min-w-7 px-2 rounded-lg text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                                                        safePage === item
                                                            ? "bg-primary text-primary-foreground shadow-xs"
                                                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                                    }`}
                                                >
                                                    {item}
                                                </button>
                                            )
                                        )}
                                    </div>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                                        disabled={safePage >= totalPages}
                                        aria-label="Next page"
                                        className="h-7 w-7 rounded-lg"
                                    >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setPage(totalPages)}
                                        disabled={safePage >= totalPages}
                                        aria-label="Last page"
                                        className="h-7 w-7 rounded-lg"
                                    >
                                        <ChevronsRight className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};