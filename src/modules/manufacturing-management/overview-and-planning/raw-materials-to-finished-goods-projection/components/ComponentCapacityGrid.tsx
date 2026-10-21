"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    Flame,
    Eye,
    Filter,
    Package,
    Boxes,
    FolderKanban,
    AlertCircle,
    AlertTriangle,
    AlertOctagon
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeasibilityComponentResult, MaterialClassification } from "../types";

interface ComponentCapacityGridProps {
    components: FeasibilityComponentResult[];
    isLoading: boolean;
    onViewLots: (component: FeasibilityComponentResult) => void;
    fgUomName?: string;
    batchSize?: number;
}

type TabFilter = "ALL" | "SHORTAGES" | "RAW_MATERIAL" | "PACKAGING" | "SUB_ASSEMBLY";

const tabOptions: { id: TabFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "ALL", label: "All Components", icon: Filter },
    { id: "SHORTAGES", label: "Shortages & Bottlenecks", icon: AlertTriangle },
    { id: "RAW_MATERIAL", label: "Raw Materials", icon: Boxes },
    { id: "PACKAGING", label: "Packaging", icon: Package },
    { id: "SUB_ASSEMBLY", label: "Sub-Assemblies", icon: FolderKanban },
];

export const ComponentCapacityGrid: React.FC<ComponentCapacityGridProps> = ({
    components,
    isLoading,
    onViewLots,
    fgUomName = "units",
    batchSize
}) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<TabFilter>("ALL");

    // Filter components by search and category
    const filteredComponents = useMemo(() => {
        return components.filter((comp) => {
            let matchesTab = true;
            if (activeTab === "SHORTAGES") {
                matchesTab = comp.capacityInFgUnits <= 0 || comp.isLimiting;
            } else if (activeTab !== "ALL") {
                matchesTab = comp.classification === activeTab;
            }
            const searchLower = searchTerm.trim().toLowerCase();
            const matchesSearch =
                !searchLower ||
                comp.productName.toLowerCase().includes(searchLower) ||
                (comp.productCode && comp.productCode.toLowerCase().includes(searchLower));
            return matchesTab && matchesSearch;
        });
    }, [components, activeTab, searchTerm]);

    const getClassificationBadge = (classification: MaterialClassification) => {
        switch (classification) {
            case "RAW_MATERIAL":
                return (
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                        Raw Material
                    </Badge>
                );
            case "PACKAGING":
                return (
                    <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                        Packaging
                    </Badge>
                );
            case "SUB_ASSEMBLY":
                return (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                        Sub-Assembly
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                        Material
                    </Badge>
                );
        }
    };

    return (
        <Card className="border border-border/80 shadow-xs bg-card">
            <CardHeader className="p-4 sm:p-5 border-b border-border/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <span>Component Feasibility Breakdown</span>
                            <Badge variant="secondary" className="text-xs font-normal">
                                {components.length} Items
                            </Badge>
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                            Individual capacity, live stock, active reservations, and recipe consumption per unit.
                        </CardDescription>
                    </div>

                    {/* Search & Category Filter Tabs */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Filter components..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className="pl-8 h-9 text-xs"
                            />
                        </div>
                    </div>
                </div>

                {/* Filter Tabs with Motion Indicator */}
                <div className="flex items-center gap-1.5 overflow-x-auto pt-3 border-t border-border/40 mt-3 scrollbar-none">
                    {tabOptions.map((tab) => {
                        const Icon = tab.icon;
                        const count = tab.id === "ALL"
                            ? components.length
                            : tab.id === "SHORTAGES"
                            ? components.filter((c) => c.capacityInFgUnits <= 0 || c.isLimiting).length
                            : components.filter((c) => c.classification === tab.id).length;
                        const isActive = activeTab === tab.id;
                        const isShortageTabWithItems = tab.id === "SHORTAGES" && count > 0;

                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0 ${
                                    isActive
                                        ? "text-primary font-semibold"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                }`}
                            >
                                <Icon className={`h-3.5 w-3.5 ${isShortageTabWithItems ? "text-rose-500" : ""}`} />
                                <span>{tab.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                    isActive
                                        ? isShortageTabWithItems
                                            ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold"
                                            : "bg-primary/10 text-primary"
                                        : isShortageTabWithItems
                                            ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold"
                                            : "bg-muted text-muted-foreground"
                                }`}>
                                    {count}
                                </span>
                                {isActive && (
                                    <motion.div
                                        layoutId="activeTabIndicator"
                                        className="absolute inset-0 border-b-2 border-primary rounded-none"
                                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </CardHeader>

            <CardContent className="p-0">
                {isLoading ? (
                    <div className="p-6 space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-border/40">
                                <Skeleton className="h-5 w-72" />
                                <Skeleton className="h-5 w-24" />
                                <Skeleton className="h-5 w-24" />
                                <Skeleton className="h-5 w-28" />
                                <Skeleton className="h-8 w-20" />
                            </div>
                        ))}
                    </div>
                ) : filteredComponents.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="py-12 text-center"
                    >
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-2">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <h4 className="text-sm font-semibold text-foreground">No components found</h4>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                            {components.length === 0
                                ? "Selected BOM version has no routing steps or recipe component items defined in BOM Master."
                                : "No components matched the current filter or search criteria."}
                        </p>
                    </motion.div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/40">
                                <TableRow className="text-[11px] font-semibold text-muted-foreground hover:bg-transparent">
                                    <TableHead className="min-w-[280px] w-[320px] lg:w-[380px] pl-4">Component</TableHead>
                                    <TableHead className="w-[110px]">Type</TableHead>
                                    <TableHead className="text-right">Req. / Net FG Unit</TableHead>
                                    <TableHead className="text-right">Eligible On-Hand</TableHead>
                                    <TableHead className="text-right">Reservations</TableHead>
                                    <TableHead className="text-right">Net Available</TableHead>
                                    <TableHead className="text-right font-bold text-foreground min-w-[140px]">Feasible Batches</TableHead>
                                    <TableHead className="text-right font-bold text-foreground min-w-[130px]">Feasible Output ({fgUomName})</TableHead>
                                    <TableHead className="text-center w-[120px] pr-4">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <AnimatePresence mode="popLayout">
                                    {filteredComponents.map((comp, index) => {
                                        const isLimiting = comp.isLimiting;
                                        const isZeroCapacity = comp.capacityInFgUnits <= 0;
                                        const effectiveBatchSize = Number(batchSize) || 1;
                                        const oneBatchReq = comp.requiredPerNetFgUnit * effectiveBatchSize;
                                        const compBatchDecimal = oneBatchReq > 0 ? (comp.netAvailableStock / oneBatchReq) : 0;
                                        const compFullBatches = effectiveBatchSize > 0 ? Math.floor(comp.capacityInFgUnits / effectiveBatchSize) : 0;
                                        const deficit = Math.max(0, oneBatchReq - (comp.netAvailableStock || 0));

                                        const baseReqValue = comp.baseQuantityRequired ?? comp.requiredPerNetFgUnit;
                                        const baseReqFormatted = Number.isFinite(baseReqValue)
                                            ? baseReqValue.toLocaleString(undefined, {
                                                  minimumFractionDigits: 4,
                                                  maximumFractionDigits: 4
                                              })
                                            : "-";
                                        const reqFormatted = Number.isFinite(comp.requiredPerNetFgUnit)
                                            ? comp.requiredPerNetFgUnit.toLocaleString(undefined, {
                                                  minimumFractionDigits: 4,
                                                  maximumFractionDigits: 4
                                              })
                                            : "-";
                                        const onHandFormatted = Number.isFinite(comp.eligibleOnHandStock)
                                            ? comp.eligibleOnHandStock.toLocaleString(undefined, {
                                                  maximumFractionDigits: 4
                                              })
                                            : "-";
                                        const resFormatted = Number.isFinite(comp.activeReservationsDeducted)
                                            ? comp.activeReservationsDeducted.toLocaleString(undefined, {
                                                  maximumFractionDigits: 4
                                              })
                                            : "-";
                                        const netFormatted = Number.isFinite(comp.netAvailableStock)
                                            ? comp.netAvailableStock.toLocaleString(undefined, {
                                                  maximumFractionDigits: 4
                                              })
                                            : "-";
                                        const capacityFormatted = Number.isFinite(comp.capacityInFgUnits)
                                            ? comp.capacityInFgUnits.toLocaleString()
                                            : "-";

                                        return (
                                            <motion.tr
                                                key={`${comp.productId}-${comp.classification}-${index}`}
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.25, delay: index * 0.03 }}
                                                className={`border-b transition-colors hover:bg-muted/40 ${
                                                    isLimiting
                                                        ? "bg-amber-500/10 dark:bg-amber-500/15 border-l-4 border-l-amber-500"
                                                        : isZeroCapacity
                                                            ? "bg-rose-500/5 dark:bg-rose-500/10 border-l-4 border-l-rose-500"
                                                            : ""
                                                }`}
                                            >
                                                {/* Component Info */}
                                                <TableCell className="pl-4 py-3 align-middle min-w-[280px] max-w-[380px]">
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-semibold text-xs text-foreground truncate max-w-[260px] sm:max-w-[320px]" title={comp.productName}>
                                                                {comp.productName}
                                                            </span>
                                                            {isLimiting && (
                                                                <span
                                                                    title="Limiting component bottleneck for production"
                                                                    className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.2 rounded shrink-0"
                                                                >
                                                                    <Flame className="h-3 w-3 fill-current" />
                                                                    Bottleneck
                                                                </span>
                                                            )}
                                                            {!isLimiting && isZeroCapacity && (
                                                                <span
                                                                    title="Component stock cannot support 1 full batch"
                                                                    className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/15 px-1.5 py-0.2 rounded shrink-0"
                                                                >
                                                                    <AlertOctagon className="h-3 w-3" />
                                                                    Shortage
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-[11px] font-mono text-muted-foreground">
                                                            {comp.productCode || `#${comp.productId}`}
                                                        </span>
                                                        {comp.diagnostic && (
                                                            <span className="text-[10px] text-destructive mt-0.5">
                                                                {comp.diagnostic}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>

                                                {/* Classification */}
                                                <TableCell className="py-3 align-middle">
                                                    {getClassificationBadge(comp.classification)}
                                                </TableCell>

                                                {/* Recipe Requirement per Net FG Unit */}
                                                <TableCell className="text-right py-3 align-middle font-mono text-xs">
                                                    <div>
                                                        <span className="font-semibold text-foreground">{baseReqFormatted}</span>
                                                        <span className="text-[10px] text-muted-foreground ml-1">
                                                             {comp.recipeUomName || "units"}
                                                        </span>
                                                    </div>
                                                    {comp.wastageFactorPercentage > 0 && (
                                                        <span className="text-[10px] text-muted-foreground block font-sans mt-0.5">
                                                            ({reqFormatted} {comp.recipeUomName} incl. {comp.wastageFactorPercentage}% loss)
                                                        </span>
                                                    )}
                                                </TableCell>

                                                {/* Eligible On-Hand Stock */}
                                                <TableCell className="text-right py-3 align-middle font-mono text-xs">
                                                    <span>{onHandFormatted}</span>
                                                    <span className="text-[10px] text-muted-foreground ml-1">
                                                        {comp.stockUomName}
                                                    </span>
                                                </TableCell>

                                                {/* Active Reservations */}
                                                <TableCell className="text-right py-3 align-middle font-mono text-xs">
                                                    <span className={comp.activeReservationsDeducted > 0 ? "text-amber-600 dark:text-amber-400" : ""}>
                                                        {comp.activeReservationsDeducted > 0 ? `-${resFormatted}` : resFormatted}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground ml-1">
                                                        {comp.stockUomName}
                                                    </span>
                                                </TableCell>

                                                {/* Net Available */}
                                                <TableCell className="text-right py-3 align-middle font-mono text-xs font-medium">
                                                    <div className={`flex items-center justify-end gap-1 ${comp.netAvailableStock <= 0 ? "text-rose-600 dark:text-rose-400 font-bold" : "text-foreground"}`}>
                                                        <span>{netFormatted}</span>
                                                        <span className="text-[10px] text-muted-foreground ml-0.5">
                                                            {comp.stockUomName}
                                                        </span>
                                                    </div>
                                                    {comp.netAvailableStock <= 0 && (
                                                        <span className="text-[10px] text-rose-500 font-normal block mt-0.5">
                                                            Depleted
                                                        </span>
                                                    )}
                                                    {comp.convertiblePackagingSummary && (
                                                        <span
                                                            title={`Includes ${comp.convertiblePackagingSummary}`}
                                                            className="text-[9px] text-purple-600 dark:text-purple-400 font-sans block mt-0.5"
                                                        >
                                                            {comp.convertiblePackagingSummary}
                                                        </span>
                                                    )}
                                                </TableCell>

                                                {/* Feasible Batches */}
                                                <TableCell className="text-right py-3 align-middle font-mono text-xs">
                                                    {isZeroCapacity ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-bold text-sm text-rose-600 dark:text-rose-400">
                                                                0 Batches
                                                            </span>
                                                            {deficit > 0 && (
                                                                <span
                                                                    title={`Needs +${deficit.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${comp.stockUomName} for 1 batch (${effectiveBatchSize.toLocaleString()} ${fgUomName})`}
                                                                    className="inline-flex items-center text-[10px] font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 mt-1 whitespace-nowrap"
                                                                >
                                                                    Needs +{deficit.toLocaleString(undefined, { maximumFractionDigits: 2 })} {comp.stockUomName}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-end">
                                                            <span className={`font-bold text-sm ${
                                                                isLimiting
                                                                    ? "text-amber-600 dark:text-amber-400"
                                                                    : "text-foreground"
                                                            }`}>
                                                                ~{compBatchDecimal.toLocaleString(undefined, { maximumFractionDigits: 2 })} Batches
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground mt-0.5">
                                                                {compFullBatches} complete {compFullBatches === 1 ? "batch" : "batches"}
                                                            </span>
                                                        </div>
                                                    )}
                                                </TableCell>

                                                {/* Feasible Output (FG Units) */}
                                                <TableCell className="text-right py-3 align-middle font-mono text-xs">
                                                    {isZeroCapacity ? (
                                                        <span className="font-bold text-sm text-rose-600 dark:text-rose-400">
                                                            0 {fgUomName}
                                                        </span>
                                                    ) : (
                                                        <span className={`font-bold text-sm ${
                                                            isLimiting
                                                                ? "text-amber-600 dark:text-amber-400"
                                                                : "text-foreground"
                                                        }`}>
                                                            {capacityFormatted} {fgUomName}
                                                        </span>
                                                    )}
                                                </TableCell>

                                                {/* Action: View Lots */}
                                                <TableCell className="text-center py-3 pr-4 align-middle">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onViewLots(comp)}
                                                        className="h-8 px-2.5 text-xs text-primary hover:text-primary hover:bg-primary/10"
                                                        title={`Inspect lots for ${comp.productName}`}
                                                    >
                                                        <Eye className="h-3.5 w-3.5 mr-1" />
                                                        View Lots
                                                    </Button>
                                                </TableCell>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
