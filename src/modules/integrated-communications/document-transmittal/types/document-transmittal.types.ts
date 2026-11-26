/**
 * src/modules/integrated-communications/document-transmittal/types/document-transmittal.types.ts
 * Pure TypeScript interfaces for the Document Transmittal module.
 */

/** User info for Sender and Receiver (Joined from user table) */
export interface TransmittalUserInfo {
    userId: number;
    userFname: string;
    userMname: string | null;
    userLname: string;
}

/**
 * Sales Invoice - Comprehensive mapping of the sales_invoice table.
 */
export interface SalesInvoice {
    invoiceId: number;
    orderId: string | null;
    customerCode: string | null;
    customerName?: string | null;
    invoiceNo: string | null;
    docNo?: string | null;
    salesmanId: number | null;
    branchId: number | null;
    invoiceDate: string | null;
    dispatchDate: string | null;
    dueDate: string | null;
    paymentTerms: number | null;
    transactionStatus: string | null;
    paymentStatus: string | null;
    totalAmount: number | null;
    salesType: number | null;
    invoiceType: number | null;
    priceType: string | null;
    vatAmount: number | null;
    grossAmount: number | null;
    discountAmount: number | null;
    netAmount: number | null;
    createdBy: number | null;
    createdDate: string | null;
    modifiedBy: number | null;
    modifiedDate: string | null;
    postedBy: number | null;
    postedDate: string | null;
    remarks: string | null;
    isReceipt: boolean | null;
    isPosted: boolean | null;
    isDispatched: boolean | null;
    isRemitted: boolean | null;
    isReplaced: boolean | null;
}

/** Document Transmittal Detail (Joined with Sales Invoice) */
export interface DocumentTransmittalDetail {
    id: number;
    documentTransmittalId: number;
    invoiceId: number;
    receivedAt: string | null;
    invoice: SalesInvoice;
}

/** Document Transmittal Header */
export interface DocumentTransmittalHeader {
    id: number;
    documentTransmittalNo: string | null;
    senderId: number;
    receiverId: number;
    createdAt: string | null;
    receivedAt: string | null;
    sender: TransmittalUserInfo;
    receiver: TransmittalUserInfo;
}

/** Status of the transmittal based on acknowledgment progress */
export type TransmittalStatus = "Pending" | "Partially Received" | "Fully Received";

/** Flattened row for the masterlist DataTable */
export interface DocumentTransmittalListItem {
    id: number;
    documentTransmittalNo: string;
    senderId: number | null;
    receiverId: number | null;
    senderName: string;
    receiverName: string;
    createdAt: string | null;
    receivedAt: string | null;
    totalInvoices: number;
    acknowledgedInvoices: number;
    status: TransmittalStatus;
}

/** Request payload for acknowledging invoices */
export interface AcknowledgePayload {
    detailIds: number[];
}
