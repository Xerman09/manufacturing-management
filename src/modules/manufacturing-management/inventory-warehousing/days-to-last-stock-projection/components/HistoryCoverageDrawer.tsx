import React, { useEffect, useState } from "react";
import { X, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StockProjectionItem, VerifiedConsumptionDetail } from "../types";
import { fetchMaterialConsumptionBreakdown } from "../services/daysToLastProjectionService";

interface HistoryCoverageDrawerProps {
    item: StockProjectionItem | null;
    open: boolean;
    onClose: () => void;
}

export default function HistoryCoverageDrawer({
    item,
    open,
    onClose,
}: HistoryCoverageDrawerProps) {
    const [details, setDetails] = useState<VerifiedConsumptionDetail[]>([]);

    useEffect(() => {
        if (!item || !open) return;
        let active = true;

        fetchMaterialConsumptionBreakdown(item.product_id, item.branch_id).then((res) => {
            if (active) {
                setDetails(res);
            }
        });

        return () => {
            active = false;
        };
    }, [item, open]);

    if (!open || !item) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in">
            <div className="w-full max-w-xl bg-card border-l border-border h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
                {/* Header */}
                <div className="p-4 border-b border-border flex items-center justify-between bg-muted/40">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-mono uppercase bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold">
                                {item.product_code}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                                {item.category_name || "Raw Material"}
                            </Badge>
                        </div>
                        <h3 className="text-sm font-bold text-foreground mt-1">
                            {item.product_name}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            {item.branch_name}
                        </p>
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Calculation Audit Card */}
                    <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                            <Calculator className="h-4 w-4 text-primary" />
                            <span>Projection Calculation Breakdown</span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                            <div className="p-2.5 rounded-lg bg-card border border-border">
                                <span className="text-[10px] text-muted-foreground block">
                                    Eligible Available Stock
                                </span>
                                <span className="font-mono font-bold text-foreground text-sm">
                                    {item.available_stock.toLocaleString()} {item.unit_shortcut}
                                </span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-card border border-border">
                                <span className="text-[10px] text-muted-foreground block">
                                    Assessed Period
                                </span>
                                <span className="font-mono font-bold text-foreground text-sm">
                                    {item.assessed_months} Mos ({item.actual_working_days_covered}d)
                                </span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-card border border-border">
                                <span className="text-[10px] text-muted-foreground block">
                                    Total Consumed
                                </span>
                                <span className="font-mono font-bold text-foreground text-sm">
                                    {item.total_consumed_quantity.toLocaleString()} {item.unit_shortcut}
                                </span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-card border border-border">
                                <span className="text-[10px] text-muted-foreground block">
                                    Monthly Average (MAvg)
                                </span>
                                <span className="font-mono font-bold text-foreground text-sm">
                                    {item.m_avg.toLocaleString()} {item.unit_shortcut}
                                </span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-card border border-border">
                                <span className="text-[10px] text-muted-foreground block">
                                    Daily Average (DAvg)
                                </span>
                                <span className="font-mono font-bold text-primary text-sm">
                                    {item.d_avg.toLocaleString()} {item.unit_shortcut}
                                </span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/30">
                                <span className="text-[10px] text-primary block font-medium">
                                    Days of Supply
                                </span>
                                <span className="font-mono font-bold text-primary text-base">
                                    {item.days_to_last !== null ? `${item.days_to_last} Days` : "N/A"}
                                </span>
                            </div>
                        </div>

                        {/* Formula audit explanation */}
                        <div className="text-[11px] text-muted-foreground bg-card/60 p-2.5 rounded-lg border border-border/60 space-y-1">
                            <div>
                                <strong>1. Monthly Average (MAvg):</strong> {item.total_consumed_quantity.toLocaleString()} {item.unit_shortcut} ÷ {item.assessed_months} Mos = <strong>{item.m_avg.toLocaleString()} {item.unit_shortcut}/month</strong>
                            </div>
                            <div>
                                <strong>2. Daily Average (DAvg):</strong> {item.m_avg.toLocaleString()} {item.unit_shortcut} ÷ {item.working_days_per_month} working days = <strong>{item.d_avg.toLocaleString()} {item.unit_shortcut}/day</strong>
                            </div>
                            <div>
                                <strong>3. Days to Last:</strong> {item.available_stock.toLocaleString()} {item.unit_shortcut} ÷ {item.d_avg.toLocaleString()} {item.unit_shortcut}/day = <strong>{item.days_to_last ?? "N/A"} working days</strong>
                            </div>
                        </div>
                    </div>

                    {/* Transaction breakdown table */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                                Verified Outflow Records ({details.length})
                            </h4>
                            <span className="text-[11px] text-muted-foreground">
                                Filtered to Assessed Window
                            </span>
                        </div>

                        {details.length === 0 ? (
                            <div className="p-6 border border-border rounded-xl text-center text-xs text-muted-foreground bg-muted/20">
                                No individual transaction records retrieved for this material.
                            </div>
                        ) : (
                            <div className="border border-border rounded-xl overflow-hidden">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-muted/60 text-muted-foreground text-[10px] uppercase font-semibold">
                                        <tr>
                                            <th className="py-2 px-3">Job Order No</th>
                                            <th className="py-2 px-3">Transaction Date</th>
                                            <th className="py-2 px-3">Batch</th>
                                            <th className="py-2 px-3 text-right">Quantity Out</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/60 font-mono">
                                        {details.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-muted/30">
                                                <td className="py-2 px-3 font-semibold text-primary">
                                                    {row.reference_no}
                                                </td>
                                                <td className="py-2 px-3 text-muted-foreground text-[11px]">
                                                    {row.transaction_date}
                                                </td>
                                                <td className="py-2 px-3 text-muted-foreground text-[11px]">
                                                    {row.batch_no || "-"}
                                                </td>
                                                <td className="py-2 px-3 text-right font-bold text-foreground">
                                                    {row.quantity_out.toLocaleString()} {row.unit_shortcut || item.unit_shortcut}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-border bg-muted/30 flex justify-end">
                    <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
                        Close Audit
                    </Button>
                </div>
            </div>
        </div>
    );
}
