import React, { useState } from "react";
import { AlertCircle, HelpCircle, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { StockProjectionItem, ProjectionStatus } from "../types";

interface StockProjectionTableProps {
    items: StockProjectionItem[];
    loading: boolean;
    onSelectMaterial: (item: StockProjectionItem) => void;
}

export default function StockProjectionTable({
    items,
    loading,
    onSelectMaterial,
}: StockProjectionTableProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    const totalPages = Math.ceil(items.length / pageSize) || 1;
    // Guard page bounds safely without triggering cascading renders in effect
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const paginatedItems = items.slice(startIndex, startIndex + pageSize);
    if (loading) {
        return (
            <div className="bg-card border border-border rounded-xl p-8 text-center animate-pulse">
                <div className="h-6 w-1/3 mx-auto bg-muted rounded mb-4" />
                <div className="h-4 w-1/2 mx-auto bg-muted rounded" />
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
                <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-60" />
                <h4 className="text-sm font-semibold text-foreground">No Materials Match Filter</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Adjust your branch or projection status filters to view stock longevity projections.
                </p>
            </div>
        );
    }

    const renderStatusBadge = (status: ProjectionStatus) => {
        switch (status) {
            case "CRITICAL_SUPPLY":
                return (
                    <Badge variant="destructive" className="text-[10px] font-semibold">
                        Critical Supply
                    </Badge>
                );
            case "LOW_SUPPLY":
                return (
                    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-semibold">
                        Low Stock
                    </Badge>
                );
            case "ESTIMATED_SUPPLY":
                return (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">
                        Adequate Supply
                    </Badge>
                );
            case "INSUFFICIENT_HISTORY":
                return (
                    <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 text-[10px] font-semibold">
                        Insufficient History
                    </Badge>
                );
            case "NO_RECORDED_CONSUMPTION":
                return (
                    <Badge variant="outline" className="text-muted-foreground text-[10px]">
                        No Consumption
                    </Badge>
                );
        }
    };

    const renderDaysToLastBar = (days: number | null, status: ProjectionStatus) => {
        if (days === null) {
            return (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>N/A</span>
                </div>
            );
        }

        let barColor = "bg-emerald-500";
        let textColor = "text-emerald-600 dark:text-emerald-400";
        if (status === "CRITICAL_SUPPLY") {
            barColor = "bg-red-500";
            textColor = "text-red-600 dark:text-red-400 font-bold";
        } else if (status === "LOW_SUPPLY") {
            barColor = "bg-amber-500";
            textColor = "text-amber-600 dark:text-amber-400 font-semibold";
        }

        // Cap meter visual display to 30 days
        const widthPercent = Math.min(100, Math.max(5, (days / 30) * 100));

        return (
            <div className="space-y-1 min-w-[120px]">
                <div className="flex items-baseline justify-between text-xs">
                    <span className={`font-mono ${textColor}`}>{days} working days</span>
                    <span className="text-[10px] text-muted-foreground">
                        {days <= 3 ? "Runout imminent" : days > 30 ? "> 1 mo." : ""}
                    </span>
                </div>
                <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${barColor} rounded-full transition-all duration-300`}
                        style={{ width: `${widthPercent}%` }}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground text-[11px] uppercase tracking-wider font-semibold">
                        <tr>
                            <th className="py-3 px-3.5">Material &amp; Category</th>
                            <th className="py-3 px-3">Branch Location</th>
                            <th className="py-3 px-3 text-right">Available Stock</th>
                            <th className="py-3 px-3 text-right">Verified Consumed</th>
                            <th className="py-3 px-3 text-right">M. Avg / Mo</th>
                            <th className="py-3 px-3 text-right">D. Avg / Day</th>
                            <th className="py-3 px-4 min-w-[140px]">Estimated Days to Last</th>
                            <th className="py-3 px-3 text-center">Status</th>
                            <th className="py-3 px-3 text-center">Audit</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                        {paginatedItems.map((item) => (
                            <tr
                                key={`${item.product_id}-${item.branch_id}`}
                                className="hover:bg-muted/30 transition-colors"
                            >
                                {/* Material & SKU */}
                                <td className="py-3 px-3.5">
                                    <div className="font-semibold text-foreground">
                                        {item.product_name}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono mt-0.5">
                                        <span>{item.product_code}</span>
                                        {item.category_name && (
                                            <>
                                                <span>•</span>
                                                <span className="text-muted-foreground/80">
                                                    {item.category_name}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </td>

                                {/* Branch */}
                                <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                                    {item.branch_name}
                                </td>

                                {/* Available Stock */}
                                <td className="py-3 px-3 text-right font-mono font-medium">
                                    <span className="text-foreground">
                                        {item.available_stock.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                        {item.unit_shortcut}
                                    </span>
                                </td>

                                {/* Verified Consumed */}
                                <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                                    {item.total_consumed_quantity.toLocaleString()}{" "}
                                    <span className="text-[10px]">{item.unit_shortcut}</span>
                                </td>

                                {/* MAvg */}
                                <td className="py-3 px-3 text-right font-mono text-foreground font-medium">
                                    {item.m_avg.toLocaleString()}{" "}
                                    <span className="text-[10px] text-muted-foreground">
                                        {item.unit_shortcut}
                                    </span>
                                </td>

                                {/* DAvg */}
                                <td className="py-3 px-3 text-right font-mono text-foreground font-medium">
                                    {item.d_avg.toLocaleString()}{" "}
                                    <span className="text-[10px] text-muted-foreground">
                                        {item.unit_shortcut}
                                    </span>
                                </td>

                                {/* Days to Last Progress */}
                                <td className="py-3 px-4">
                                    {renderDaysToLastBar(item.days_to_last, item.status)}
                                </td>

                                {/* Status Badge */}
                                <td className="py-3 px-3 text-center whitespace-nowrap">
                                    {renderStatusBadge(item.status)}
                                </td>

                                {/* Action / Audit Breakdown */}
                                <td className="py-3 px-3 text-center">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onSelectMaterial(item)}
                                        className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
                                        title="View Verified Consumption Movements"
                                    >
                                        <FileText className="h-3.5 w-3.5 mr-1" />
                                        Audit
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 border-t border-border/80 bg-muted/20 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <span>Rows per page:</span>
                    <Select
                        value={String(pageSize)}
                        onValueChange={(val) => {
                            setPageSize(Number(val));
                            setCurrentPage(1);
                        }}
                    >
                        <SelectTrigger className="h-8 w-18 text-xs bg-card">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="15">15</SelectItem>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                    </Select>
                    <span className="ml-2">
                        Showing <strong>{items.length === 0 ? 0 : startIndex + 1}</strong>–
                        <strong>{Math.min(startIndex + pageSize, items.length)}</strong> of{" "}
                        <strong>{items.length}</strong> materials
                    </span>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <span className="text-xs mr-2">
                        Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
                    </span>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        className="h-8 w-8 bg-card"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        className="h-8 w-8 bg-card"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
