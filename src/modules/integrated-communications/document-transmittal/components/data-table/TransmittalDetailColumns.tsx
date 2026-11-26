"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DocumentTransmittalDetail } from "@/modules/integrated-communications/document-transmittal/types/document-transmittal.types";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle2, Clock } from "lucide-react";

/**
 * Column definitions for the invoice list inside the transmittal detail modal.
 */
export const getTransmittalDetailColumns = (
    formatDateTime: (value: unknown) => string
): ColumnDef<DocumentTransmittalDetail>[] => [
    {
        id: "select",
        header: ({ table }) => {
            const rows = table.getRowModel().rows;
            const selectableRows = rows.filter((row) => row.original.receivedAt === null);
            const isAllSelected =
                selectableRows.length > 0 && selectableRows.every((row) => row.getIsSelected());
            const isSomeSelected =
                selectableRows.some((row) => row.getIsSelected()) && !isAllSelected;

            return (
                <Checkbox
                    checked={isAllSelected ? true : isSomeSelected ? "indeterminate" : false}
                    onCheckedChange={(value) => {
                        selectableRows.forEach((row) => row.toggleSelected(!!value));
                    }}
                    disabled={selectableRows.length === 0}
                    aria-label="Select all"
                />
            );
        },
        cell: ({ row }) => (
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                disabled={row.original.receivedAt !== null}
                aria-label="Select row"
            />
        ),
        enableSorting: false,
        enableHiding: false,
    },
    {
        accessorKey: "invoice.invoiceNo",
        id: "invoice_no_or_doc_no",
        header: "Invoice No.",
        cell: ({ row }) => (
            <span className="font-medium text-foreground">
                {row.original.invoice.invoiceNo || "N/A"}
            </span>
        ),
        filterFn: (row, _columnId, filterValue: string) => {
            if (!filterValue) return true;
            const search = filterValue.toLowerCase();
            const invoiceNo = row.original.invoice.invoiceNo?.toLowerCase() || "";
            const docNo = row.original.invoice.docNo?.toLowerCase() || "";
            const customerName = row.original.invoice.customerName?.toLowerCase() || "";
            const customerCode = row.original.invoice.customerCode?.toLowerCase() || "";
            return (
                invoiceNo.includes(search) ||
                docNo.includes(search) ||
                customerName.includes(search) ||
                customerCode.includes(search)
            );
        },
    },
    {
        accessorKey: "invoice.docNo",
        id: "docNo",
        header: "Doc No.",
        cell: ({ row }) => (
            <span className="font-medium text-muted-foreground">
                {row.original.invoice.docNo || "N/A"}
            </span>
        ),
    },
    {
        accessorKey: "invoice.customerName",
        header: "Store Name",
        cell: ({ row }) => {
            const { customerName } = row.original.invoice;
            return (
                <div className="flex flex-col">
                    <span className="text-xs">{customerName || "N/A"}</span>
                </div>
            );
        },
    },
    {
        accessorKey: "invoice.netAmount",
        header: "Amount",
        cell: ({ row }) => formatCurrency(row.original.invoice.netAmount || 0),
    },
    {
        accessorKey: "receivedAt",
        header: "Acknowledgment",
        cell: ({ row }) => {
            const receivedAt = row.getValue("receivedAt") as string | null;
            if (receivedAt) {
                return (
                    <div className="flex items-center gap-2 text-green-600 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-xs">{formatDateTime(receivedAt)}</span>
                    </div>
                );
            }
            return (
                <div className="flex items-center gap-2 text-muted-foreground/50">
                    <Clock className="h-4 w-4" />
                    <span className="text-xs italic text-gray-500">Pending Receipt</span>
                </div>
            );
        },
    },
];
