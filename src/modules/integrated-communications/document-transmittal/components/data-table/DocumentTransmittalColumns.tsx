"use client";

import { ColumnDef } from "@tanstack/react-table";
import { DocumentTransmittalListItem } from "@/modules/integrated-communications/document-transmittal/types/document-transmittal.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "./DataTableColumnHeader";

/**
 * Column definitions for the Document Transmittal master list table.
 */
export const getDocumentTransmittalColumns = (
    onView: (id: number) => void,
    formatDateTime: (value: unknown) => string
): ColumnDef<DocumentTransmittalListItem>[] => [
    {
        accessorKey: "documentTransmittalNo",
        header: ({ column }) => <DataTableColumnHeader column={column} label="Transmittal No." />,
        cell: ({ row }) => (
            <span className="font-mono font-bold text-foreground">
                {row.getValue("documentTransmittalNo")}
            </span>
        ),
    },
    {
        accessorKey: "senderName",
        header: ({ column }) => <DataTableColumnHeader column={column} label="Sender" />,
    },
    {
        accessorKey: "receiverName",
        header: ({ column }) => <DataTableColumnHeader column={column} label="Receiver" />,
    },
    {
        accessorKey: "createdAt",
        header: ({ column }) => <DataTableColumnHeader column={column} label="Created" />,
        cell: ({ row }) => formatDateTime(row.getValue("createdAt")),
    },
    {
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
        cell: ({ row }) => {
            const status = row.getValue("status") as string;

            let variant: "destructive" | "secondary" | "default" | "outline" = "outline";
            if (status === "Pending") variant = "destructive";
            else if (status === "Partially Received") variant = "secondary";
            else if (status === "Fully Received") variant = "default";

            return <Badge variant={variant}>{status}</Badge>;
        },
    },
    {
        id: "actions",
        header: () => <div className="text-right pr-4">Actions</div>,
        cell: ({ row }) => (
            <div className="flex justify-end pr-2">
                <Button
                    variant="default"
                    size="sm"
                    className="h-8 px-3 font-semibold shadow-sm"
                    onClick={() => onView(row.original.id)}
                >
                    View Details
                </Button>
            </div>
        ),
    },
];
