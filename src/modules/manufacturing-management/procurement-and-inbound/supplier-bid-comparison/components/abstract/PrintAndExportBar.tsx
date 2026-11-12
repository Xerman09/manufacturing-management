"use client";

import React from "react";
import { Printer, FileSpreadsheet, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { exportRfqToExcel, exportRfqBidsToCsv } from "../../engine/excel-export";

interface PrintAndExportBarProps {
    onPrint: () => void;
}

export const PrintAndExportBar: React.FC<PrintAndExportBarProps> = ({ onPrint }) => {
    const { currentProject } = useBidComparisonStore();
    if (!currentProject) return null;

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/40 border rounded-lg shadow-xs print:hidden">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Official Abstract of Bids Actions:
            </span>

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    size="sm"
                    onClick={onPrint}
                    className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
                >
                    <Printer className="h-3.5 w-3.5" />
                    Print / Save PDF (A4)
                </Button>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportRfqToExcel(currentProject)}
                    className="h-8 text-xs gap-1.5"
                >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                    Download Excel (.xlsx)
                </Button>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportRfqBidsToCsv(currentProject)}
                    className="h-8 text-xs gap-1.5"
                >
                    <FileText className="h-3.5 w-3.5 text-blue-600" />
                    Download Bids CSV (.csv)
                </Button>
            </div>
        </div>
    );
};
