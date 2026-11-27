"use client";

import React, { useState } from "react";
import { AlertCircle, ChevronRight, Eye, ShieldAlert, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import type { AssetRiskRow, RiskSeverity } from "../types";

interface AssetRiskRankedTabProps {
    rows: AssetRiskRow[];
    onSelectRow: (row: AssetRiskRow) => void;
}

export function AssetRiskRankedTab({ rows, onSelectRow }: AssetRiskRankedTabProps) {
    const [search, setSearch] = useState("");

    const filteredRows = rows.filter(
        (r) =>
            r.assetName.toLowerCase().includes(search.toLowerCase()) ||
            r.workCenterName.toLowerCase().includes(search.toLowerCase()) ||
            r.serial.toLowerCase().includes(search.toLowerCase()) ||
            r.primaryFailureMode.toLowerCase().includes(search.toLowerCase())
    );

    const getRiskBadge = (level: RiskSeverity, pct: number) => {
        let color = "bg-emerald-500 text-white";
        if (level === "Critical") color = "bg-red-500 text-white";
        else if (level === "High") color = "bg-amber-500 text-white";
        else if (level === "Medium") color = "bg-yellow-500 text-black";

        return (
            <Badge className={`${color} font-mono text-xs px-2 py-0.5`}>
                {pct.toFixed(1)}% - {level}
            </Badge>
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold">Ranked Equipment Breakdown Risk</h3>
                    <p className="text-xs text-muted-foreground">
                        Assets ordered by predicted breakdown probability within the stated horizon based on run-hours, MTBF, and historical failures.
                    </p>
                </div>
                <input
                    type="text"
                    placeholder="Search asset, station, or failure mode..."
                    className="h-8 w-full sm:w-64 rounded-md border px-2.5 text-xs bg-background"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="rounded-lg border bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-[200px]">Asset Name & Serial</TableHead>
                            <TableHead>Work Center</TableHead>
                            <TableHead>Condition</TableHead>
                            <TableHead className="text-right">Run Hours</TableHead>
                            <TableHead className="text-right">Breakdowns</TableHead>
                            <TableHead className="text-right">MTBF</TableHead>
                            <TableHead className="text-center">Breakdown Risk</TableHead>
                            <TableHead>Primary Risk Basis</TableHead>
                            <TableHead className="text-right">Evidence</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-24 text-center text-xs text-muted-foreground">
                                    No assets found matching the selected filters.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredRows.map((row) => (
                                <TableRow
                                    key={row.assetId}
                                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                                    onClick={() => onSelectRow(row)}
                                >
                                    <TableCell className="font-medium">
                                        <div className="flex flex-col">
                                            <span className="truncate">{row.assetName}</span>
                                            {row.serial && (
                                                <span className="font-mono text-[10px] text-muted-foreground">
                                                    SN: {row.serial}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {row.workCenterName}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={
                                                row.condition === "Bad" || row.condition === "Under Maintenance"
                                                    ? "text-red-600 border-red-300"
                                                    : "text-emerald-600 border-emerald-300"
                                            }
                                        >
                                            {row.condition}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {row.cumulativeRunHours.toFixed(1)} hrs
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {row.breakdownCount}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {row.mtbfHours !== null ? `${row.mtbfHours.toFixed(1)} hrs` : "-"}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {getRiskBadge(row.riskLevel, row.predictedBreakdownRiskPct)}
                                    </TableCell>
                                    <TableCell className="text-xs max-w-[220px] truncate">
                                        <span className="font-medium">{row.primaryFailureMode}</span>
                                        {row.dataGapWarning && (
                                            <div className="flex items-center text-[10px] text-amber-600">
                                                <AlertCircle className="mr-1 h-3 w-3 shrink-0" />
                                                Rule-based estimate
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectRow(row);
                                            }}
                                        >
                                            <Eye className="h-3.5 w-3.5 mr-1" />
                                            Drilldown
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
