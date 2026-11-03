"use client";

import React from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
    CheckCircle2,
    AlertTriangle,
    HelpCircle,
    Boxes,
    Flame,
    Layers,
    Gauge,
    Info,
    // AlertOctagon,
    Ban
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeasibilityResult, FeasibilityStatus } from "../types";

interface FeasibilitySummaryCardsProps {
    result: FeasibilityResult | null;
    isLoading: boolean;
}

const statusConfig: Record<
    FeasibilityStatus,
    {
        label: string;
        description: string;
        badgeClass: string;
        icon: React.ComponentType<{ className?: string }>;
        cardBorder: string;
    }
> = {
    PRODUCIBLE: {
        label: "Ready to Produce",
        description: "Eligible inventory fulfills all recipe requirements.",
        badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        icon: CheckCircle2,
        cardBorder: "border-emerald-500/20"
    },
    NOT_PRODUCIBLE: {
        label: "Cannot Produce (Shortage)",
        description: "Material shortage halts production execution.",
        badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
        icon: AlertTriangle,
        cardBorder: "border-rose-500/30"
    },
    INCOMPLETE_DATA: {
        label: "Missing Unit Conversion / Recipe Data",
        description: "Calculation paused: Unit conversion or recipe specifications are missing.",
        badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        icon: HelpCircle,
        cardBorder: "border-amber-500/20"
    }
};

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08
        }
    }
};

const cardVariants: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.35, ease: "easeOut" }
    }
};

export const FeasibilitySummaryCards: React.FC<FeasibilitySummaryCardsProps> = ({
    result,
    isLoading
}) => {
    if (isLoading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="border border-border/80 shadow-xs">
                        <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between items-center">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-8 w-8 rounded-full" />
                            </div>
                            <Skeleton className="h-7 w-32" />
                            <Skeleton className="h-3 w-40" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    if (!result) {
        return (
            <Card className="border border-dashed border-border/80 bg-muted/20">
                <CardContent className="p-6 text-center">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                        <Gauge className="h-5 w-5" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">Awaiting Projection Query</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                        Select a production branch, finished good, and approved BOM version above, then click
                        &quot;Calculate&quot; to estimate feasible output and evaluate inventory bottlenecks.
                    </p>
                </CardContent>
            </Card>
        );
    }

    const isNotProducible = result.status === "NOT_PRODUCIBLE";
    const currentStatus = statusConfig[result.status] || statusConfig.INCOMPLETE_DATA;
    const StatusIcon = currentStatus.icon;
    const limiting = result.limitingComponent;

    // Formatting numbers with fallback "-"
    const formattedMaxFgUnits = Number.isFinite(result.maxFgUnits)
        ? result.maxFgUnits.toLocaleString()
        : "-";
    const formattedFullBatches = Number.isFinite(result.fullBatches)
        ? result.fullBatches.toLocaleString()
        : "-";
    const formattedRemainder = Number.isFinite(result.batchRemainderUnits)
        ? result.batchRemainderUnits.toLocaleString()
        : "-";
    const formattedBatchSize = Number.isFinite(result.batchSize)
        ? result.batchSize.toLocaleString()
        : "-";

    // Deficit calculation for 1 batch across components
    const batchQty = result.batchSize || 1;
    const reqForOneBatch = limiting ? (limiting.requiredPerNetFgUnit * batchQty) : 0;
    const shortageDeficit = limiting ? Math.max(0, reqForOneBatch - (limiting.netAvailableStock || 0)) : 0;
    const totalDecimalBatches = (result.batchSize && result.batchSize > 0)
        ? (result.maxFgUnits / result.batchSize)
        : 0;
    const hasAnyConvertibleStock = Array.isArray(result.components) && result.components.some((c) => Boolean(c.convertiblePackagingSummary));

    // Identify all components that cannot fulfill at least 1 full batch
    const shortageComponents = (Array.isArray(result.components) ? result.components : [])
        .map((comp) => {
            const reqForBatch = comp.requiredPerNetFgUnit * batchQty;
            const netAvailable = comp.netAvailableStock || 0;
            const deficit = Math.max(0, reqForBatch - netAvailable);
            return {
                ...comp,
                reqForBatch,
                deficit,
            };
        })
        .filter((c) => c.deficit > 0 || (isNotProducible && c.capacityInFgUnits <= 0))
        .sort((a, b) => {
            if (a.capacityInFgUnits !== b.capacityInFgUnits) {
                return a.capacityInFgUnits - b.capacityInFgUnits;
            }
            return b.deficit - a.deficit;
        });

    // const primaryShortage = (limiting && shortageComponents.find((c) => c.productId === limiting.productId)) ||
    //     shortageComponents[0] ||
    //     (limiting ? {
    //         ...limiting,
    //         reqForBatch: reqForOneBatch,
    //         deficit: shortageDeficit
    //     } : null);

    return (
        <div className="space-y-4">
            {/* Critical Shortage Alert Banner for NOT_PRODUCIBLE */}
            {/* <AnimatePresence>
                {isNotProducible && (shortageComponents.length > 0 || limiting) && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3 }}
                        className="rounded-xl border border-rose-500/30 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent p-4 sm:p-5 shadow-xs"
                    >
                        {shortageComponents.length > 1 ? (
                            <div className="space-y-3.5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-500/20 pb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0">
                                            <AlertOctagon className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                                                    Production Halted — {shortageComponents.length} Materials in Shortage
                                                </span>
                                                <Badge variant="outline" className="text-[10px] border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">
                                                    {shortageComponents.length} Deficits
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                The following recipe components cannot fulfill the minimum batch demand for 1 batch ({formattedBatchSize} {result.fgUomName}).
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                    {shortageComponents.map((shortage) => (
                                        <div
                                            key={shortage.productId}
                                            className="flex items-center justify-between p-3 rounded-lg bg-background/60 dark:bg-background/40 border border-rose-500/20 hover:border-rose-500/40 transition-colors gap-3"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-xs font-semibold text-foreground truncate max-w-[200px]" title={shortage.productName}>
                                                        {shortage.productName}
                                                    </span>
                                                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 uppercase border-rose-500/30 text-rose-600 dark:text-rose-400">
                                                        {shortage.classification.replace("_", " ")}
                                                    </Badge>
                                                </div>
                                                {shortage.productCode && (
                                                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                                        {shortage.productCode}
                                                    </div>
                                                )}
                                                <div className="text-[11px] text-muted-foreground mt-1">
                                                    {shortage.netAvailableStock.toLocaleString()} on-hand vs {shortage.reqForBatch.toLocaleString(undefined, { maximumFractionDigits: 3 })} needed
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <span className="text-[10px] font-medium text-muted-foreground block">Deficit:</span>
                                                <span className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400">
                                                    -{shortage.deficit.toLocaleString(undefined, { maximumFractionDigits: 3 })} {shortage.stockUomName}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : primaryShortage ? (
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-start gap-3.5">
                                    <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5">
                                        <AlertOctagon className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                                                Production Halted — Material Shortage
                                            </span>
                                            <Badge variant="outline" className="text-[10px] border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium uppercase">
                                                {primaryShortage.classification.replace("_", " ")}
                                            </Badge>
                                        </div>
                                        <h3 className="text-sm font-semibold text-foreground">
                                            {primaryShortage.productName}
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                                            Available stock ({primaryShortage.netAvailableStock.toLocaleString()} {primaryShortage.stockUomName}) cannot fulfill the minimum batch demand of {primaryShortage.reqForBatch.toLocaleString(undefined, { maximumFractionDigits: 3 })} {primaryShortage.stockUomName} ({formattedBatchSize} {result.fgUomName}).
                                        </p>
                                    </div>
                                </div>

                                <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center border-t md:border-t-0 md:border-l border-rose-500/20 pt-3 md:pt-0 md:pl-6 shrink-0 gap-1">
                                    <span className="text-[11px] font-medium text-muted-foreground">Shortage Deficit for 1 Batch:</span>
                                    <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 flex items-baseline gap-1">
                                        <span>-{primaryShortage.deficit.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                                        <span className="text-xs font-normal text-muted-foreground">{primaryShortage.stockUomName}</span>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground">
                                        {primaryShortage.netAvailableStock.toLocaleString()} on-hand vs {primaryShortage.reqForBatch.toLocaleString(undefined, { maximumFractionDigits: 2 })} needed
                                    </span>
                                </div>
                            </div>
                        ) : null}
                    </motion.div>
                )}
            </AnimatePresence> */}

            {/* 4 Summary Cards */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={`${result.status}-${result.maxFgUnits}-${result.mode}`}
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                >
                    {/* 1. Feasibility Status */}
                    <motion.div variants={cardVariants}>
                        <Card className={`border shadow-xs h-full ${isNotProducible ? "border-rose-500/40 bg-rose-500/5" : currentStatus.cardBorder} bg-card transition-colors`}>
                            <CardContent className="flex flex-col justify-between h-full space-y-3">
                                <div className="flex items-center justify-between">
                                    <span
                                        className="text-xs font-semibold text-muted-foreground"
                                        title="Indicates whether current material stock is sufficient to start production or if shortages exist."
                                    >
                                        Production Readiness Status
                                    </span>
                                    <div className={`p-2 rounded-lg ${isNotProducible ? "bg-rose-500/20 text-rose-600 dark:text-rose-400" : "bg-muted/60 text-muted-foreground"}`}>
                                        <StatusIcon className="h-4 w-4" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Badge variant="outline" className={`text-xs px-2.5 py-0.5 font-semibold ${currentStatus.badgeClass}`}>
                                        {isNotProducible ? "Cannot Produce (0 Units)" : currentStatus.label}
                                    </Badge>
                                    <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
                                        {result.bottleneckReason && result.status !== "PRODUCIBLE"
                                            ? result.bottleneckReason
                                            : currentStatus.description}
                                    </p>
                                </div>
                                <div className="pt-1 text-[11px] text-muted-foreground/80 flex items-center gap-1">
                                    <Info className="h-3 w-3 shrink-0" />
                                    <span>Read-only projection query</span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* 2. Maximum Capacity (Convertible Batches & FG Units) */}
                    <motion.div variants={cardVariants}>
                        <Card className={`border shadow-xs h-full bg-card ${isNotProducible ? "border-rose-500/30" : "border-border/80"}`}>
                            <CardContent className=" flex flex-col justify-between h-full space-y-3 ">
                                <div className="flex items-center justify-between">
                                    <span
                                        className="text-xs font-semibold text-muted-foreground"
                                        title="The maximum volume of finished goods and batches that can be manufactured with available stock."
                                    >
                                        Estimated Production Output
                                    </span>
                                    <div className={`p-2 rounded-lg ${isNotProducible ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary"}`}>
                                        {isNotProducible ? <Ban className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
                                    </div>
                                </div>
                                <div>
                                    <div className={`text-2xl font-bold tracking-tight flex items-baseline gap-1.5 ${isNotProducible ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                                        <span>
                                            {isNotProducible
                                                ? "0 Batches"
                                                : `~${totalDecimalBatches.toLocaleString(undefined, { maximumFractionDigits: 2 })} Batches`}
                                        </span>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                        {result.status === "INCOMPLETE_DATA" ? (
                                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                                                Calculation paused: Missing recipe or unit conversion data
                                            </span>
                                        ) : isNotProducible ? (
                                            <span className="text-rose-500 font-medium">
                                                0 of {formattedBatchSize} needed for 1 batch
                                            </span>
                                        ) : (
                                            <>
                                                <span className="font-semibold text-foreground">
                                                    {formattedMaxFgUnits} {result.fgUomName || "units"}
                                                </span>
                                                <span>({formattedFullBatches} full {result.fullBatches === 1 ? "batch" : "batches"})</span>
                                                {result.mode === "WHOLE_UNITS" && result.batchRemainderUnits > 0 && (
                                                    <span className="text-[11px] text-primary font-medium">
                                                        (+{formattedRemainder} extra units)
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="pt-1 flex flex-wrap items-center gap-1.5">
                                    <Badge
                                        variant={isNotProducible ? "destructive" : result.status === "INCOMPLETE_DATA" ? "outline" : "secondary"}
                                        className={`text-[10px] font-normal py-0 ${result.status === "INCOMPLETE_DATA" ? "border-amber-500/30 text-amber-600 dark:text-amber-400" : ""}`}
                                    >
                                        {result.status === "INCOMPLETE_DATA"
                                            ? "Missing Recipe or Conversion"
                                            : isNotProducible
                                                ? "Zero Feasible Output"
                                                : result.mode === "WHOLE_UNITS"
                                                    ? "Allow Partial Batches"
                                                    : "Full Batches Only"}
                                    </Badge>
                                    {hasAnyConvertibleStock && !isNotProducible && (
                                        <Badge
                                            variant="outline"
                                            className="text-[10px] font-normal py-0 border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400"
                                        >
                                            Includes Convertible Packaging
                                        </Badge>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* 3. Limiting Component / Bottleneck */}
                    <motion.div variants={cardVariants}>
                        <Card className={`border shadow-xs h-full bg-card ${limiting ? (isNotProducible ? "border-rose-500/30 bg-rose-500/5" : "border-amber-500/20") : result.status === "INCOMPLETE_DATA" ? "border-amber-500/20" : "border-border/80"}`}>
                            <CardContent className="flex flex-col justify-between h-full space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span
                                            className="text-xs font-semibold text-muted-foreground"
                                            title="The material in shortest supply that sets the maximum limit on total production output."
                                        >
                                            {isNotProducible && shortageComponents.length > 1 ? "Primary Limiting Material (Bottleneck)" : "Limiting Material (Bottleneck)"}
                                        </span>
                                        {isNotProducible && shortageComponents.length > 1 && (
                                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">
                                                +{shortageComponents.length - 1} more
                                            </Badge>
                                        )}
                                    </div>
                                    <div className={`p-2 rounded-lg ${limiting ? (isNotProducible ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400") : result.status === "INCOMPLETE_DATA" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted/60 text-muted-foreground"}`}>
                                        {result.status === "INCOMPLETE_DATA" && !limiting ? <HelpCircle className="h-4 w-4" /> : <Flame className="h-4 w-4" />}
                                    </div>
                                </div>
                                <div>
                                    {limiting ? (
                                        <>
                                            <div className="font-semibold text-sm text-foreground truncate" title={limiting.productName}>
                                                {limiting.productName}
                                            </div>
                                            {limiting.productCode && (
                                                <span className="text-[11px] font-mono text-muted-foreground">
                                                    {limiting.productCode}
                                                </span>
                                            )}
                                            <div className="mt-1.5 text-xs text-muted-foreground flex flex-col gap-0.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span>Available:</span>
                                                    <span className="font-semibold text-foreground">
                                                        {limiting.netAvailableStock.toLocaleString()} {limiting.stockUomName}
                                                    </span>
                                                </div>
                                                {limiting.convertiblePackagingSummary && (
                                                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-sans">
                                                        ({limiting.convertiblePackagingSummary})
                                                    </span>
                                                )}
                                                {!isNotProducible && reqForOneBatch > 0 && (
                                                    <div className="flex items-center gap-1 text-[11px]">
                                                        <span>Supports:</span>
                                                        <span className="font-semibold text-foreground">
                                                            ~{(limiting.netAvailableStock / reqForOneBatch).toLocaleString(undefined, { maximumFractionDigits: 2 })} Batches
                                                        </span>
                                                        <span className="text-muted-foreground">
                                                            ({limiting.capacityInFgUnits.toLocaleString()} {result.fgUomName})
                                                        </span>
                                                    </div>
                                                )}
                                                {isNotProducible && shortageDeficit > 0 && (
                                                    <div className="space-y-0.5 mt-0.5">
                                                        <span className="text-[11px] font-medium text-rose-500 block">
                                                            Deficit: -{shortageDeficit.toLocaleString(undefined, { maximumFractionDigits: 2 })} {limiting.stockUomName}
                                                        </span>
                                                        {shortageComponents.length > 1 && (
                                                            <span className="text-[10px] text-muted-foreground block">
                                                                +{shortageComponents.length - 1} other material{shortageComponents.length - 1 > 1 ? "s" : ""} in deficit
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : result.status === "INCOMPLETE_DATA" ? (
                                        <>
                                            <div className="font-semibold text-sm text-amber-600 dark:text-amber-400">
                                                Recipe or Unit Conversion Incomplete
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Please resolve the missing unit conversions or component requirements listed above.
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                                                No Material Bottleneck
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                All required materials exceed current batch capacity.
                                            </p>
                                        </>
                                    )}
                                </div>
                                <div className="pt-1">
                                    {limiting?.classification && (
                                        <Badge variant="outline" className={`text-[10px] py-0 uppercase ${isNotProducible ? "border-rose-500/30 text-rose-600 dark:text-rose-400" : "border-muted text-muted-foreground"}`}>
                                            {limiting.classification.replace("_", " ")}
                                        </Badge>
                                    )}
                                    {result.status === "INCOMPLETE_DATA" && !limiting && (
                                        <Badge variant="outline" className="text-[10px] py-0 border-amber-500/30 text-amber-600 dark:text-amber-400">
                                            No Components
                                        </Badge>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* 4. Batch & Sizing Context */}
                    <motion.div variants={cardVariants}>
                        <Card className="border border-border/80 shadow-xs h-full bg-card">
                            <CardContent className="flex flex-col justify-between h-full space-y-3">
                                <div className="flex items-center justify-between">
                                    <span
                                        className="text-xs font-semibold text-muted-foreground"
                                        title="Recipe standard batch quantity and yield/wastage allowances factored into this projection."
                                    >
                                        Standard Recipe Batch Sizing
                                    </span>
                                    <div className="p-2 rounded-lg bg-muted/60 text-muted-foreground">
                                        <Layers className="h-4 w-4" />
                                    </div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold tracking-tight text-foreground flex items-baseline gap-1.5">
                                        <span>{result.components.length > 0 ? formattedBatchSize : "-"}</span>
                                        <span className="text-xs font-normal text-muted-foreground">
                                            {result.components.length > 0 ? `${result.fgUomName || "units"} / batch` : "No Recipe Sizing"}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1.5">
                                        {result.components.length > 0
                                            ? `${result.components.length} recipe materials evaluated`
                                            : "BOM version lacks route step or component definitions"}
                                    </p>
                                </div>
                                <div className="pt-1 text-[11px] text-muted-foreground flex items-center justify-between">
                                    <span>Wastage &amp; Scrap Factored</span>
                                    <span className={`font-mono font-medium ${result.components.length > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                                        {result.components.length > 0 ? "Included" : "Pending Recipe"}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};
