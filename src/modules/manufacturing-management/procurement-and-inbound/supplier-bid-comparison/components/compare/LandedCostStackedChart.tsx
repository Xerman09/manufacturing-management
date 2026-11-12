"use client";

import React from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";

export const LandedCostStackedChart: React.FC = () => {
    const { currentProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const compCurr = currentProject.comparisonCurrency || "PHP";
    const summary = React.useMemo(() => evaluateAndCompareSuppliers(currentProject), [currentProject]);

    // Only full bids, sorted cheapest to most expensive
    const fullBids = React.useMemo(() => {
        return currentProject.bids
            .filter((b) => summary.results[b.id]?.isFullBid)
            .sort((a, b) => {
                const costA = summary.results[a.id]?.totalLandedCostCompCurr || 0;
                const costB = summary.results[b.id]?.totalLandedCostCompCurr || 0;
                return costA - costB;
            });
    }, [currentProject.bids, summary]);

    const chartData = React.useMemo(() => {
        return fullBids.map((b) => {
            const res = summary.results[b.id];
            return {
                name: b.supplierName,
                goods: res.goodsAfterDiscountCompCurr,
                freightAndInsurance: res.freightCompCurr + res.insuranceCompCurr,
                fxBuffer: res.fxBufferCompCurr,
                duty: res.dutyCompCurr,
                vat: res.vatCompCurr,
                brokerageAndCustoms: res.customsAndPortTotalCompCurr,
                inlandAndTerms:
                    res.inlandTruckingCompCurr +
                    res.bankFeesCompCurr +
                    res.paymentTermsCostCompCurr -
                    res.earlyPayDiscountAmountCompCurr,
                total: res.totalLandedCostCompCurr,
            };
        });
    }, [fullBids, summary]);

    if (fullBids.length === 0) {
        return null;
    }

    const formatCurrency = (val: number) => `₱${(val / 1000).toFixed(0)}k`;

    const CustomChartTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;

        const total = payload.reduce((sum: number, p: any) => sum + (Number(p.value) || 0), 0);

        return (
            <div className="bg-popover text-popover-foreground border border-border rounded-lg shadow-xl p-3 text-xs min-w-[240px] z-50">
                <p className="font-bold text-foreground text-xs mb-2 pb-1.5 border-b border-border flex items-center justify-between">
                    <span>{label}</span>
                    <span className="font-mono text-primary font-bold">₱{Math.round(total).toLocaleString()}</span>
                </p>
                <div className="space-y-1.5">
                    {payload.map((entry: any, index: number) => (
                        <div key={`entry-${index}`} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-2 text-muted-foreground text-[11px]">
                                <span
                                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                                    style={{ backgroundColor: entry.color }}
                                />
                                <span>{entry.name}</span>
                            </span>
                            <span className="font-mono font-medium text-foreground text-[11px]">
                                ₱{Number(entry.value).toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between text-xs font-bold">
                    <span className="text-muted-foreground uppercase text-[10px] tracking-wider">Total Landed:</span>
                    <span className="font-mono text-primary text-xs">₱{Math.round(total).toLocaleString()}</span>
                </div>
            </div>
        );
    };

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    3.4 Total Landed Cost Composition ({compCurr})
                </CardTitle>
                <CardDescription className="text-xs">
                    Stacked cost breakdown for full-scope bids, from lowest to highest total landed cost.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
                <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            margin={{ top: 20, right: 30, left: 20, bottom: 25 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis
                                dataKey="name"
                                tickLine={false}
                                tick={{ fontSize: 11 }}
                                interval={0}
                            />
                            <YAxis
                                tickFormatter={formatCurrency}
                                tickLine={false}
                                tick={{ fontSize: 11 }}
                            />
                            <Tooltip content={<CustomChartTooltip />} />
                            <Legend
                                wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }}
                            />
                            <Bar dataKey="goods" name="Goods Value" stackId="cost" fill="#3B82F6" />
                            <Bar dataKey="freightAndInsurance" name="Freight & Insurance" stackId="cost" fill="#06B6D4" />
                            <Bar dataKey="duty" name="Customs Duty" stackId="cost" fill="#8B5CF6" />
                            <Bar dataKey="vat" name="VAT" stackId="cost" fill="#EC4899" />
                            <Bar dataKey="brokerageAndCustoms" name="Port & Brokerage" stackId="cost" fill="#F59E0B" />
                            <Bar dataKey="fxBuffer" name="FX Buffer" stackId="cost" fill="#10B981" />
                            <Bar dataKey="inlandAndTerms" name="Inland & Terms" stackId="cost" fill="#64748B" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
};
