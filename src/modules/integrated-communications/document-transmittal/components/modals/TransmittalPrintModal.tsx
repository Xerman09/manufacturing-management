"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    DocumentTransmittalHeader,
    DocumentTransmittalDetail,
} from "../../types/document-transmittal.types";
import { generateTransmittalPDF } from "../../utils/generateTransmittalPDF";
import { useTimeZone } from "@/providers/TimeZoneProvider";
import { Printer, Download, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

interface TransmittalPrintModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    header: DocumentTransmittalHeader;
    details: DocumentTransmittalDetail[];
    currentUser?: { name: string; email: string };
}

export const TransmittalPrintModal: React.FC<TransmittalPrintModalProps> = ({
    open,
    onOpenChange,
    header,
    details,
    currentUser,
}) => {
    const { timeZone } = useTimeZone();
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleGeneratePreview = useCallback(async () => {
        try {
            setIsLoading(true);
            const doc = await generateTransmittalPDF(header, details, currentUser, timeZone);
            const blob = doc.output("blob");
            const url = URL.createObjectURL(blob);
            setPdfUrl(url);
        } catch (error) {
            console.error("Failed to generate PDF preview:", error);
            toast.error("Failed to generate PDF preview.");
        } finally {
            setIsLoading(false);
        }
    }, [header, details, currentUser, timeZone]);

    useEffect(() => {
        if (open) {
            handleGeneratePreview();
        } else {
            if (pdfUrl) {
                URL.revokeObjectURL(pdfUrl);
                setPdfUrl(null);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, handleGeneratePreview]);

    const handleDownload = () => {
        if (pdfUrl) {
            const link = document.createElement("a");
            link.href = pdfUrl;
            link.download = `Transmittal_${header.documentTransmittalNo || header.id}.pdf`;
            link.click();
        }
    };

    const handlePrint = async () => {
        const doc = await generateTransmittalPDF(header, details, currentUser, timeZone);
        doc.autoPrint();

        const printUrl = URL.createObjectURL(doc.output("blob"));
        const printWindow = window.open(printUrl, "_blank");

        if (!printWindow) {
            URL.revokeObjectURL(printUrl);
            toast.error("Unable to open the print dialog. Please allow pop-ups for this site.");
            return;
        }

        printWindow.opener = null;
        window.setTimeout(() => URL.revokeObjectURL(printUrl), 60_000);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="!max-w-7xl h-[92vh] flex flex-col p-0 overflow-hidden bg-zinc-950 border-zinc-800 shadow-2xl">
                <DialogHeader className="p-6 pb-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                                <Printer className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl text-zinc-100">Print Preview</DialogTitle>
                                <p className="text-sm text-zinc-400">
                                    {header.documentTransmittalNo || `DT-${header.id.toString().padStart(5, "0")}`} - {details.length} Invoices
                                </p>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 p-6">
                    <div className="w-full h-full bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden relative group">
                        {isLoading ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900/50 backdrop-blur-sm z-10">
                                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                <p className="text-sm font-medium text-zinc-300">Generating preview...</p>
                            </div>
                        ) : pdfUrl ? (
                            <iframe
                                src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                                className="w-full h-full border-none"
                                title="Transmittal PDF Preview"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-500">
                                <FileText className="h-12 w-12 opacity-20" />
                                <p>Unable to load preview</p>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="p-4 bg-zinc-900/50 border-t border-zinc-800 flex items-center justify-between sm:justify-between px-6">
                    <p className="text-xs text-zinc-500">
                        Review the transmittal details above before downloading or printing.
                    </p>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handlePrint}
                            disabled={!pdfUrl || isLoading}
                            className="gap-2"
                        >
                            <Printer className="h-4 w-4" />
                            Print
                        </Button>
                        <Button
                            onClick={handleDownload}
                            disabled={!pdfUrl || isLoading}
                            className="gap-2"
                        >
                            <Download className="h-4 w-4" />
                            Download PDF
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
