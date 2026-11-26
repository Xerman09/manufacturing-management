"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckSquare, Printer, User } from "lucide-react";
import { Combobox } from "../Combobox";
import { DataTable } from "@/components/ui/new-data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { TransmittalPrintModal } from "./TransmittalPrintModal";
import { useTimeZone } from "@/providers/TimeZoneProvider";
import { nowUtcSql } from "@/lib/datetime";
import { formatDateOnly } from "../../utils/helpers";
import { toast } from "sonner";
import {
    DocumentTransmittalDetail,
    DocumentTransmittalHeader,
} from "../../types/document-transmittal.types";

interface PendingDetail {
    id: number;
    receivedAt?: string | null;
    post_dispatch_plan_id?: {
        doc_no: string;
    } | null;
    invoice_id: {
        invoice_id: number;
        invoice_no: string;
        invoice_date: string | null;
        net_amount: number;
        customer_code: string;
        customer_name?: string | null;
    };
}

interface BulkAcknowledgeModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    availableUsers: { label: string; value: string }[];
    onBulkAcknowledge: (
        details: { id: number; headerId: number | null; salesInvoiceId?: number }[],
        assignedUserId: number
    ) => Promise<boolean>;
    isAcknowledging: boolean;
    currentUser?: { name: string; email: string };
}

interface PrintData {
    header: DocumentTransmittalHeader;
    details: DocumentTransmittalDetail[];
}

export const BulkAcknowledgeModal = ({
    isOpen,
    onOpenChange,
    availableUsers,
    onBulkAcknowledge,
    isAcknowledging,
    currentUser,
}: BulkAcknowledgeModalProps) => {
    const { timeZone } = useTimeZone();
    const [isLoading, setIsLoading] = useState(false);
    const [pendingDetails, setPendingDetails] = useState<PendingDetail[]>([]);
    const [selectedRows, setSelectedRows] = useState<PendingDetail[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>("");
    const [printData, setPrintData] = useState<PrintData | null>(null);
    const [nextTransmittalNo, setNextTransmittalNo] = useState<string | null>(null);

    const fetchPending = useCallback(async () => {
        setIsLoading(true);
        try {
            const [pendingRes, nextNoRes] = await Promise.all([
                fetch("/api/ic/document-transmittal/pending"),
                fetch("/api/ic/document-transmittal/next-no"),
            ]);
            const pendingData = await pendingRes.json();
            if (pendingRes.ok && pendingData.success) {
                setPendingDetails(pendingData.data);
            } else {
                toast.error("Error", { description: pendingData.message || "Failed to load pending invoices." });
            }
            const nextNoData = await nextNoRes.json();
            if (nextNoRes.ok && nextNoData.success) {
                setNextTransmittalNo(nextNoData.data);
            } else {
                toast.error("Error", { description: nextNoData.message || "Failed to fetch next transmittal number." });
            }
        } catch (error) {
            console.error("Failed to fetch pending details", error);
            toast.error("Network Error", { description: "Failed to load pending receipts." });
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchPending();
            setSelectedRows([]);
            setSelectedUserId("");
        }
    }, [isOpen, fetchPending]);

    const handleConfirm = async () => {
        if (selectedRows.length === 0 || !selectedUserId) return;

        const payload = selectedRows.map((row) => ({
            id: row.id,
            headerId: null,
            salesInvoiceId: row.invoice_id.invoice_id,
        }));

        const success = await onBulkAcknowledge(payload, parseInt(selectedUserId));
        if (success) {
            onOpenChange(false);
        }
    };

    const handlePrint = () => {
        if (selectedRows.length === 0) return;

        const createdAtUtc = nowUtcSql();
        if (!createdAtUtc) {
            toast.error("Error", { description: "Failed to generate UTC timestamp for print preview." });
            return;
        }

        const selectedReceiver = availableUsers.find((user) => user.value === selectedUserId);
        const [receiverFname, ...receiverLnameParts] = (
            selectedReceiver?.label || "Not selected"
        ).split(" ");

        const senderParts = (currentUser?.name || "User").split(" ");
        const senderFname = senderParts[0] || "User";
        const senderLname = senderParts.slice(1).join(" ") || "";

        setPrintData({
            header: {
                id: 0,
                documentTransmittalNo: nextTransmittalNo,
                senderId: 0,
                receiverId: selectedUserId ? Number(selectedUserId) : 0,
                createdAt: createdAtUtc,
                receivedAt: null,
                sender: {
                    userId: 0,
                    userFname: senderFname,
                    userMname: null,
                    userLname: senderLname,
                },
                receiver: {
                    userId: selectedUserId ? Number(selectedUserId) : 0,
                    userFname: receiverFname,
                    userMname: null,
                    userLname: receiverLnameParts.join(" "),
                },
            },
            details: selectedRows.map((row) => ({
                id: row.id,
                documentTransmittalId: 0,
                invoiceId: row.invoice_id.invoice_id,
                receivedAt: row.receivedAt || null,
                invoice: {
                    invoiceId: row.invoice_id.invoice_id,
                    orderId: null,
                    customerCode: row.invoice_id.customer_code,
                    customerName: row.invoice_id.customer_name || null,
                    invoiceNo: row.invoice_id.invoice_no,
                    docNo: row.post_dispatch_plan_id?.doc_no || null,
                    salesmanId: null,
                    branchId: null,
                    invoiceDate: row.invoice_id.invoice_date,
                    dispatchDate: null,
                    dueDate: null,
                    paymentTerms: null,
                    transactionStatus: null,
                    paymentStatus: null,
                    totalAmount: null,
                    salesType: null,
                    invoiceType: null,
                    priceType: null,
                    vatAmount: null,
                    grossAmount: null,
                    discountAmount: null,
                    netAmount: row.invoice_id.net_amount,
                    createdBy: null,
                    createdDate: null,
                    modifiedBy: null,
                    modifiedDate: null,
                    postedBy: null,
                    postedDate: null,
                    remarks: null,
                    isReceipt: null,
                    isPosted: null,
                    isDispatched: null,
                    isRemitted: null,
                    isReplaced: null,
                },
            })),
        });
    };

    const columns: ColumnDef<PendingDetail>[] = React.useMemo(
        () => [
            {
                id: "select",
                header: ({ table }) => (
                    <Checkbox
                        checked={
                            table.getIsAllPageRowsSelected() ||
                            (table.getIsSomePageRowsSelected() && "indeterminate")
                        }
                        onCheckedChange={(value) => {
                            table.toggleAllPageRowsSelected(!!value);
                            if (value) {
                                setSelectedRows(table.getRowModel().rows.map((row) => row.original));
                            } else {
                                setSelectedRows([]);
                            }
                        }}
                        aria-label="Select all"
                    />
                ),
                cell: ({ row }) => (
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => {
                            row.toggleSelected(!!value);
                            if (value) {
                                setSelectedRows((prev) => [...prev, row.original]);
                            } else {
                                setSelectedRows((prev) => prev.filter((r) => r.id !== row.original.id));
                            }
                        }}
                        aria-label="Select row"
                    />
                ),
                enableSorting: false,
                enableHiding: false,
            },
            {
                accessorKey: "invoice_id.invoice_no",
                id: "invoice_no_or_doc_no",
                header: "Invoice No.",
                filterFn: (row, _columnId, filterValue: string) => {
                    if (!filterValue) return true;
                    const search = filterValue.toLowerCase();
                    const invoiceNo = row.original.invoice_id?.invoice_no?.toLowerCase() || "";
                    const docNo = row.original.post_dispatch_plan_id?.doc_no?.toLowerCase() || "";
                    const customerName = row.original.invoice_id?.customer_name?.toLowerCase() || "";
                    const customerCode = row.original.invoice_id?.customer_code?.toLowerCase() || "";
                    return (
                        invoiceNo.includes(search) ||
                        docNo.includes(search) ||
                        customerName.includes(search) ||
                        customerCode.includes(search)
                    );
                },
            },
            {
                accessorKey: "post_dispatch_plan_id.doc_no",
                header: "Doc No.",
                cell: ({ row }) => (
                    <span className="font-medium text-muted-foreground">
                        {row.original.post_dispatch_plan_id?.doc_no || "N/A"}
                    </span>
                ),
            },
            {
                accessorKey: "invoice_id.invoice_date",
                header: "Invoice Date",
                cell: ({ row }) => formatDateOnly(row.original.invoice_id.invoice_date, timeZone),
            },
            {
                accessorKey: "invoice_id.customer_name",
                header: "Store Name",
                cell: ({ row }) =>
                    row.original.invoice_id.customer_name ||
                    row.original.invoice_id.customer_code ||
                    "WALK-IN",
            },
            {
                accessorKey: "invoice_id.net_amount",
                header: "Amount",
                cell: ({ row }) => {
                    const amount = parseFloat(row.original.invoice_id.net_amount.toString() || "0");
                    return `₱${amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}`;
                },
            },
        ],
        [timeZone]
    );

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[1200px] max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden bg-background border-border/40 shadow-2xl">
                <DialogHeader className="p-6 pb-4 border-b border-border/40 bg-muted/20">
                    <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />
                        Manage Your Pending Receipts
                    </DialogTitle>
                    <DialogDescription>
                        Acknowledge or reassign invoices currently assigned to you.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-auto p-6 space-y-6">
                    <div className="space-y-4">
                        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex flex-col gap-4">
                            <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="h-4 w-4 text-primary" />
                                </div>
                                <div className="space-y-0.5">
                                    <h4 className="text-sm font-bold leading-none">Who will acknowledge?</h4>
                                    <p className="text-[10px] text-muted-foreground uppercase font-medium">
                                        Select the user who will take ownership of these receipts
                                    </p>
                                </div>
                            </div>
                            <Combobox
                                options={availableUsers}
                                value={selectedUserId}
                                onValueChange={setSelectedUserId}
                                placeholder="Search system users..."
                                className="w-full"
                            />
                        </div>

                        <DataTable
                            columns={columns}
                            data={pendingDetails}
                            isLoading={isLoading}
                            searchKey="invoice_no_or_doc_no"
                            emptyTitle="No pending invoices"
                            emptyDescription="The pending queue is currently empty."
                        />
                    </div>
                </div>

                <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-muted/20 sm:justify-between items-center">
                    <div className="text-sm text-muted-foreground">
                        {selectedRows.length} invoice(s) selected
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="secondary"
                            disabled={selectedRows.length === 0}
                            onClick={handlePrint}
                            className="gap-2"
                        >
                            <Printer className="h-4 w-4" />
                            Print
                        </Button>
                        <Button
                            disabled={selectedRows.length === 0 || !selectedUserId || isAcknowledging}
                            onClick={handleConfirm}
                            className="font-bold min-w-[200px]"
                        >
                            {isAcknowledging ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <CheckSquare className="mr-2 h-4 w-4" />
                            )}
                            Confirm & Acknowledge
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>

            {printData && (
                <TransmittalPrintModal
                    open
                    onOpenChange={(open) => {
                        if (!open) setPrintData(null);
                    }}
                    header={printData.header}
                    details={printData.details}
                    currentUser={currentUser}
                />
            )}
        </Dialog>
    );
};
