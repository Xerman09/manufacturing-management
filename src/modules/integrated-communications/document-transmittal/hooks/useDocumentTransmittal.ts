"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { nowUtcSql } from "@/lib/datetime";
import {
    DocumentTransmittalListItem,
    DocumentTransmittalHeader,
    DocumentTransmittalDetail,
    TransmittalStatus,
} from "@/modules/integrated-communications/document-transmittal/types/document-transmittal.types";
import { useDocumentTransmittalFilter } from "../context/DocumentTransmittalFilterContext";

/**
 * src/modules/integrated-communications/document-transmittal/hooks/useDocumentTransmittal.ts
 * Main hook for the Document Transmittal module UI.
 */
export const useDocumentTransmittal = () => {
    const [transmittals, setTransmittals] = useState<DocumentTransmittalListItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [allUsers, setAllUsers] = useState<{ label: string; value: string }[]>([]);

    const { senderId, receiverId, status, dateRange } = useDocumentTransmittalFilter();

    const [selectedTransmittal, setSelectedTransmittal] = useState<DocumentTransmittalHeader | null>(null);
    const [selectedDetails, setSelectedDetails] = useState<DocumentTransmittalDetail[]>([]);
    const [transmittalStatus, setTransmittalStatus] = useState<TransmittalStatus | null>(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [isDetailModalOpen, setDetailModalOpen] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

    const [isAcknowledging, setIsAcknowledging] = useState(false);
    const [isBulkAcknowledging, setIsBulkAcknowledging] = useState(false);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (senderId) params.append("senderId", senderId);
            if (receiverId) params.append("receiverId", receiverId);

            if (status && status.length > 0) {
                status.forEach((s) => params.append("status", s));
            }

            if (dateRange?.from) {
                const fromUtc = nowUtcSql(dateRange.from);
                if (fromUtc) params.append("dateFrom", fromUtc);
            }
            if (dateRange?.to) {
                const toUtc = nowUtcSql(dateRange.to);
                if (toUtc) params.append("dateTo", toUtc);
            }

            const response = await fetch(`/api/ic/document-transmittal?${params.toString()}`);
            const result = await response.json();

            if (response.ok && result.success) {
                setTransmittals(result.data);
            } else {
                const msg = result.message || "Failed to load transmittals";
                setError(msg);
                toast.error("Error", { description: msg });
            }
        } catch (err) {
            console.error("[useDocumentTransmittal] List fetch error:", err);
            const msg = "A network error occurred while loading the list.";
            setError(msg);
            toast.error("Network Error", { description: msg });
        } finally {
            setIsLoading(false);
        }
    }, [senderId, receiverId, status, dateRange]);

    const fetchAllUsers = useCallback(async () => {
        try {
            const response = await fetch(`/api/ic/document-transmittal/users`);
            const result = await response.json();
            if (response.ok && result.success) {
                const formatted = result.data.map(
                    (u: { user_fname: string; user_lname: string; user_id: number }) => ({
                        label: `${u.user_fname} ${u.user_lname}`,
                        value: u.user_id.toString(),
                    })
                );
                setAllUsers(formatted);
            } else {
                toast.error("Error", { description: result.message || "Failed to load users." });
            }
        } catch (err) {
            console.error("[useDocumentTransmittal] User fetch error:", err);
            toast.error("Network Error", { description: "Failed to load system users." });
        }
    }, []);

    const availableSenders = useMemo(() => {
        const map = new Map<number, string>();
        transmittals.forEach((t) => {
            if (t.senderId) map.set(t.senderId, t.senderName);
        });
        return Array.from(map.entries())
            .map(([id, name]) => ({ label: name, value: id.toString() }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [transmittals]);

    const availableReceivers = useMemo(() => {
        const map = new Map<number, string>();
        transmittals.forEach((t) => {
            if (t.receiverId) map.set(t.receiverId, t.receiverName);
        });
        return Array.from(map.entries())
            .map(([id, name]) => ({ label: name, value: id.toString() }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [transmittals]);

    const fetchDetail = useCallback(async (id: number) => {
        setIsDetailLoading(true);
        try {
            const response = await fetch(`/api/ic/document-transmittal/${id}`);
            const result = await response.json();

            if (response.ok && result.success) {
                setSelectedTransmittal(result.data.header);
                setSelectedDetails(result.data.details);
                setTransmittalStatus(result.data.status);
                setDetailModalOpen(true);
            } else {
                toast.error("Error", { description: result.message || "Failed to load details" });
            }
        } catch (err) {
            console.error("[useDocumentTransmittal] Detail fetch error:", err);
            toast.error("Network Error", { description: "Failed to connect to the server." });
        } finally {
            setIsDetailLoading(false);
        }
    }, []);

    const handleAcknowledge = useCallback(
        async (id: number, detailIds: number[], assignedUserId?: number) => {
            if (detailIds.length === 0) return false;

            setIsAcknowledging(true);
            try {
                const ackRes = await fetch(`/api/ic/document-transmittal/${id}?action=acknowledge`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ detailIds, assignedUserId }),
                });

                const ackResult = await ackRes.json();

                if (ackRes.ok && ackResult.success) {
                    toast.success("Success", {
                        description: ackResult.message || "Operation completed successfully.",
                    });

                    await fetchDetail(id);
                    refresh();

                    return true;
                } else {
                    toast.error("Acknowledge Failed", {
                        description: ackResult.message || "Failed to acknowledge invoices",
                    });
                    return false;
                }
            } catch (err) {
                console.error("[useDocumentTransmittal] Acknowledge error:", err);
                toast.error("Error", { description: "A network error occurred. Please try again." });
                return false;
            } finally {
                setIsAcknowledging(false);
            }
        },
        [fetchDetail, refresh]
    );

    const handleBulkAcknowledge = useCallback(
        async (
            details: { id: number; headerId: number | null; salesInvoiceId?: number }[],
            assignedUserId?: number
        ) => {
            if (details.length === 0) return false;

            setIsBulkAcknowledging(true);
            try {
                const response = await fetch(`/api/ic/document-transmittal/bulk-acknowledge`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ details, assignedUserId }),
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    toast.success("Success", {
                        description: result.message || "Operation completed successfully.",
                    });
                    refresh();
                    return true;
                } else {
                    toast.error("Bulk Acknowledge Failed", {
                        description: result.message || "Failed to acknowledge invoices",
                    });
                    return false;
                }
            } catch (err) {
                console.error("[useDocumentTransmittal] Bulk Acknowledge error:", err);
                toast.error("Error", { description: "A network error occurred. Please try again." });
                return false;
            } finally {
                setIsBulkAcknowledging(false);
            }
        },
        [refresh]
    );

    useEffect(() => {
        refresh();
        fetchAllUsers();
    }, [refresh, fetchAllUsers]);

    return {
        transmittals,
        isLoading,
        error,
        refresh,
        availableSenders,
        availableReceivers,
        allUsers,
        selectedTransmittal,
        selectedDetails,
        transmittalStatus,
        isDetailLoading,
        fetchDetail,
        handleAcknowledge,
        isAcknowledging,
        handleBulkAcknowledge,
        isBulkAcknowledging,
        isDetailModalOpen,
        setDetailModalOpen,
        isBulkModalOpen,
        setIsBulkModalOpen,
    };
};
