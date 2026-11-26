import {
    DocumentTransmittalListItem,
    TransmittalStatus,
} from "@/modules/integrated-communications/document-transmittal/types/document-transmittal.types";

/**
 * src/modules/integrated-communications/document-transmittal/services/document-transmittal.helpers.ts
 * Pure TypeScript utility functions for the Document Transmittal module.
 */

export interface DirectusUserJoin {
    user_id: number;
    user_fname: string;
    user_mname: string | null;
    user_lname: string;
}

export interface DirectusHeaderRaw {
    id: number;
    document_transmittal_no: string | null;
    sender_id: DirectusUserJoin | number | null;
    receiver_id: DirectusUserJoin | number | null;
    createdAt: string | null;
    receivedAt: string | null;
}

export interface DirectusDetailRaw {
    id: number;
    document_transmittal_id: number;
    invoice_id: Record<string, unknown> | number | null;
    receivedAt: string | null;
}

export function formatUserFullName(user: DirectusUserJoin | number | null): string {
    if (!user || typeof user === "number") return "Not specified";
    const parts = [user.user_fname, user.user_mname, user.user_lname];
    return parts
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .join(" ");
}

export function deriveTransmittalStatus(
    headerReceivedAt: string | null,
    totalDetails: number,
    acknowledgedCount: number
): TransmittalStatus {
    if (totalDetails > 0) {
        if (acknowledgedCount === totalDetails) return "Fully Received";
        if (acknowledgedCount > 0) return "Partially Received";
    }

    if (headerReceivedAt) return "Fully Received";
    return "Pending";
}

export function mapHeaderToListItem(
    header: DirectusHeaderRaw,
    totalInvoices: number,
    acknowledgedInvoices: number
): DocumentTransmittalListItem {
    const getUserId = (user: DirectusUserJoin | number | null) =>
        user && typeof user === "object" ? user.user_id : typeof user === "number" ? user : null;

    return {
        id: header.id,
        documentTransmittalNo: header.document_transmittal_no || "-",
        senderId: getUserId(header.sender_id),
        receiverId: getUserId(header.receiver_id),
        senderName: formatUserFullName(header.sender_id as DirectusUserJoin | number | null),
        receiverName: formatUserFullName(header.receiver_id as DirectusUserJoin | number | null),
        createdAt: header.createdAt,
        receivedAt: header.receivedAt,
        totalInvoices,
        acknowledgedInvoices,
        status: deriveTransmittalStatus(header.receivedAt, totalInvoices, acknowledgedInvoices),
    };
}

export function getNextTransmittalNo(currentNo: string | null): string {
    const DEFAULT_NO = "DT-00001";
    if (!currentNo) return DEFAULT_NO;

    const parts = currentNo.split("-");
    if (parts.length < 2) return DEFAULT_NO;

    const prefix = parts[0];
    const numericPart = parseInt(parts[1]);

    if (isNaN(numericPart)) return DEFAULT_NO;

    const nextNumeric = numericPart + 1;
    const paddedNumeric = nextNumeric.toString().padStart(5, "0");

    return `${prefix}-${paddedNumeric}`;
}
