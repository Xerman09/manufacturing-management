import { formatProjectionQuantity, formatSupplyDays, longRangeCaveat } from "../utils/projection";
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
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [retry, setRetry] = useState(0);
    const [details, setDetails] = useState<VerifiedConsumptionDetail[]>([]);

    useEffect(() => {
        if (!item || !open) return;
        let active = true;

        queueMicrotask(() => { if (active) { setDetails([]); setError(null); setLoading(true); } });
        fetchMaterialConsumptionBreakdown(item).then((res) => {
            if (active) {
                setDetails(res);
            }
        }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });

        return () => {
            active = false;
        };
    }, [item, open, retry]);

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
                                    {formatProjectionQuantity(item.available_stock)} {item.unit_shortcut}
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
                                    {formatProjectionQuantity(item.total_consumed_quantity)} {item.unit_shortcut}
                                </span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-card border border-border">
                                <span className="text-[10px] text-muted-foreground block">
                                    Monthly Average (MAvg)
                                </span>
                                <span className="font-mono font-bold text-foreground text-sm">
                                    {formatProjectionQuantity(item.m_avg)} {item.unit_shortcut}
                                </span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-card border border-border">
                                <span className="text-[10px] text-muted-foreground block">
                                    Daily Average (DAvg)
                                </span>
                                <span className="font-mono font-bold text-primary text-sm">
                                    {formatProjectionQuantity(item.d_avg)} {item.unit_shortcut}
                                </span>
                            </div>

                            <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/30">
                                <span className="text-[10px] text-primary block font-medium">
                                    Days of Supply
                                </span>
                                <span className="font-mono font-bold text-primary text-base">
                                    {formatSupplyDays(item.days_to_last)}
                                </span>
                            </div>
                        </div>

                        <p className="text-xs text-muted-foreground">Calculations use full precision; displayed values are rounded.</p>
                        {item.days_to_last !== null && item.days_to_last > 12 * item.working_days_per_month && <p className="text-xs text-amber-700">{longRangeCaveat}</p>}
                        {/* Formula audit explanation */}
                        <div className="text-[11px] text-muted-foreground bg-card/60 p-2.5 rounded-lg border border-border/60 space-y-1">
                            <div>
                                <strong>1. Monthly Average (MAvg):</strong> {formatProjectionQuantity(item.total_consumed_quantity)} {item.unit_shortcut} ÷ {item.assessed_months} Mos ? <strong>{formatProjectionQuantity(item.m_avg)} {item.unit_shortcut}/month</strong>
                            </div>
                            <div>
                                <strong>2. Daily Average (DAvg):</strong> {formatProjectionQuantity(item.m_avg)} {item.unit_shortcut} ÷ {item.working_days_per_month} working days ? <strong>{formatProjectionQuantity(item.d_avg)} {item.unit_shortcut}/day</strong>
                            </div>
                            <div>
                                <strong>3. Days to Last:</strong> {formatProjectionQuantity(item.available_stock)} {item.unit_shortcut} ÷ {formatProjectionQuantity(item.d_avg)} {item.unit_shortcut}/day ? <strong>{formatSupplyDays(item.days_to_last)}</strong>
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

                        <p className="text-xs text-muted-foreground">Applied window: {item.assessment_start || "All recorded history"} to {item.assessment_end}</p>
                        {loading && <p role="status">Loading verified outflows...</p>}
                        {error && <div role="alert">{error} <Button onClick={() => setRetry(value => value + 1)}>Retry</Button></div>}
                        {!loading && !error && <p className="text-xs">Verified total: {details.reduce((sum, row) => sum + row.quantity_out, 0).toLocaleString(undefined, { maximumFractionDigits: 8 })} {item.unit_shortcut}</p>}
                        {!loading && !error && Math.abs(details.reduce((sum, row) => sum + row.quantity_out, 0) - item.total_consumed_quantity) > 0.00000001 && <p role="alert">Verified records changed since report generation. Close this preview and refresh the report before relying on these figures.</p>}
                        {loading || error ? null : details.length === 0 ? (
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
                                                    {row.quantity_out.toLocaleString(undefined, { maximumFractionDigits: 8 })} {row.unit_shortcut || item.unit_shortcut}
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
