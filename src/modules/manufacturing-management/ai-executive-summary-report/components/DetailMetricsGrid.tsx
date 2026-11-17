"use client";

import React from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import type { DetailedKPIRow } from "../types";

interface Props {
    rows: DetailedKPIRow[];
    onOpenDrilldown: (row: DetailedKPIRow) => void;
}

const statusBadge = (status: DetailedKPIRow["status"]) => {
    switch (status) {
        case "good":
            return <Badge className="bg-emerald-600/10 text-emerald-700 border-emerald-200">On Target</Badge>;
        case "warning":
            return <Badge className="bg-amber-600/10 text-amber-700 border-amber-200">Warning</Badge>;
        case "critical":
            return <Badge className="bg-rose-600/10 text-rose-700 border-rose-200">Attention</Badge>;
        default:
            return <Badge variant="outline">Neutral</Badge>;
    }
};

export const DetailMetricsGrid: React.FC<Props> = ({ rows, onOpenDrilldown }) => {
    return (
        <div className="rounded-xl border bg-card/60 backdrop-blur-md shadow-sm">
            <div className="p-4 border-b">
                <h3 className="text-sm font-bold text-foreground">
                    Verified KPI Computations &amp; Operational Scope
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Aggregated across active plant operations. Click &ldquo;View Records&rdquo; on any row to inspect underlying batches, work centers, or fulfillment orders.
                </p>
            </div>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="text-xs">
                            <TableHead className="w-[180px] font-bold">Category</TableHead>
                            <TableHead className="font-bold">Metric / KPI</TableHead>
                            <TableHead className="text-right font-bold">Actual</TableHead>
                            <TableHead className="text-right font-bold">Target</TableHead>
                            <TableHead className="text-right font-bold">Variance Performance</TableHead>
                            <TableHead className="text-center font-bold">Health</TableHead>
                            <TableHead className="font-bold">Operational Scope</TableHead>
                            <TableHead className="text-center font-bold w-[120px]">Drilldown</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.key} className="hover:bg-muted/40 text-xs">
                                <TableCell className="font-semibold text-muted-foreground">{row.category}</TableCell>
                                <TableCell className="font-bold text-foreground">{row.kpi}</TableCell>
                                <TableCell className="text-right font-black text-foreground">{row.actual}</TableCell>
                                <TableCell className="text-right text-muted-foreground font-medium" title={row.targetBasis}>
                                    {row.target}
                                </TableCell>
                                <TableCell className="text-right">
                                    <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded font-bold text-[11px] ${
                                            row.varianceType === "favorable"
                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                        }`}
                                    >
                                        {row.variance}
                                    </span>
                                </TableCell>
                                <TableCell className="text-center">{statusBadge(row.status)}</TableCell>
                                <TableCell className="text-muted-foreground font-medium truncate max-w-[220px]">
                                    {row.operationalScope}
                                </TableCell>
                                <TableCell className="text-center">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2.5 text-[11px] gap-1 hover:bg-primary/10 hover:text-primary transition-colors"
                                        onClick={() => onOpenDrilldown(row)}
                                    >
                                        <span>View Records</span>
                                        <ExternalLink className="h-3 w-3" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};
