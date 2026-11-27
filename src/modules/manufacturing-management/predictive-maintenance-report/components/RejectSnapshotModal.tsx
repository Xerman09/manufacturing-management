"use client";

import React, { useState } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";

interface RejectSnapshotModalProps {
    isOpen: boolean;
    reportCode: string;
    version: number;
    onClose: () => void;
    onConfirmReject: (reason: string) => void;
    isLoading?: boolean;
}

export function RejectSnapshotModal({
    isOpen,
    reportCode,
    version,
    onClose,
    onConfirmReject,
    isLoading
}: RejectSnapshotModalProps) {
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = () => {
        if (!reason.trim()) {
            setError("Please provide a reason for rejecting this snapshot.");
            return;
        }
        setError(null);
        onConfirmReject(reason.trim());
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
                        <AlertCircle className="h-5 w-5" />
                        Reject Snapshot ({reportCode} v{version})
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        This action returns the report to <strong>Draft</strong> status and notifies the planner with your review comments.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <label className="text-xs font-semibold text-foreground">
                        Rejection Reason / Reviewer Notes <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                        placeholder="State specific issues, e.g., missing sensor inspection on CNC station, incorrect prediction horizon, or unverified work orders..."
                        className="text-xs min-h-[90px]"
                        value={reason}
                        onChange={(e) => {
                            setReason(e.target.value);
                            if (error) setError(null);
                        }}
                    />
                    {error && <span className="text-xs text-red-500">{error}</span>}
                </div>

                <DialogFooter className="flex items-center justify-between sm:justify-between border-t pt-3">
                    <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        disabled={isLoading}
                        onClick={handleSubmit}
                    >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Confirm Rejection
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
