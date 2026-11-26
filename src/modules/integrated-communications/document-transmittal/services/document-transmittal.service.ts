import { DocumentTransmittalRepo, PendingTransmittalRow } from "./document-transmittal.repo";
import {
    mapHeaderToListItem,
    deriveTransmittalStatus,
    getNextTransmittalNo,
    DirectusHeaderRaw,
    DirectusDetailRaw,
} from "./document-transmittal.helpers";
import {
    AcknowledgeSchema,
    ReassignSchema,
} from "@/modules/integrated-communications/document-transmittal/types/document-transmittal.schema";
import {
    DocumentTransmittalHeader,
    DocumentTransmittalDetail,
    DocumentTransmittalListItem,
    TransmittalStatus,
} from "@/modules/integrated-communications/document-transmittal/types/document-transmittal.types";
import { z } from "zod";

/**
 * src/modules/integrated-communications/document-transmittal/services/document-transmittal.service.ts
 * Orchestration layer for the Document Transmittal module (Directus).
 */
export class DocumentTransmittalService {
    /**
     * Retrieves the master list of transmittals with server-side filtering.
     */
    static async getTransmittalList(filters: {
        receiverId?: number;
        senderId?: string | null;
        selectedReceiverId?: string | null;
        status?: TransmittalStatus[];
        dateFrom?: string | null;
        dateTo?: string | null;
    }): Promise<DocumentTransmittalListItem[]> {
        const [headerRes, allDetailsData] = await Promise.all([
            DocumentTransmittalRepo.fetchAllTransmittals(filters),
            DocumentTransmittalRepo.fetchAllDetailStatuses(),
        ]);

        const rawHeaders: DirectusHeaderRaw[] = headerRes.data || [];
        const allDetails: Array<{ document_transmittal_id: number; receivedAt: string | null }> =
            allDetailsData.data || [];

        const totalMap = new Map<number, number>();
        const ackMap = new Map<number, number>();

        for (const d of allDetails) {
            const hId = d.document_transmittal_id;
            totalMap.set(hId, (totalMap.get(hId) || 0) + 1);
            if (d.receivedAt) {
                ackMap.set(hId, (ackMap.get(hId) || 0) + 1);
            }
        }

        const mappedTransmittals = rawHeaders.map((header: DirectusHeaderRaw) =>
            mapHeaderToListItem(
                header,
                totalMap.get(header.id) || 0,
                ackMap.get(header.id) || 0
            )
        );

        if (filters.status && filters.status.length > 0) {
            return mappedTransmittals.filter((t: DocumentTransmittalListItem) =>
                filters.status!.includes(t.status)
            );
        }

        return mappedTransmittals;
    }

    /**
     * Retrieves full detail for a single transmittal.
     */
    static async getTransmittalDetail(id: number) {
        const [headerRes, detailsRes] = await Promise.all([
            DocumentTransmittalRepo.fetchHeaderById(id),
            DocumentTransmittalRepo.fetchDetailsByHeaderId(id),
        ]);

        const rawHeader: DirectusHeaderRaw | undefined = headerRes.data;
        const rawDetails: DirectusDetailRaw[] = detailsRes.data || [];

        if (!rawHeader) throw new Error("Transmittal not found");

        const header: DocumentTransmittalHeader = {
            id: rawHeader.id,
            documentTransmittalNo: rawHeader.document_transmittal_no,
            senderId:
                (typeof rawHeader.sender_id === "object" && rawHeader.sender_id !== null
                    ? rawHeader.sender_id.user_id
                    : (rawHeader.sender_id as number)) || 0,
            receiverId:
                (typeof rawHeader.receiver_id === "object" && rawHeader.receiver_id !== null
                    ? rawHeader.receiver_id.user_id
                    : (rawHeader.receiver_id as number)) || 0,
            createdAt: rawHeader.createdAt,
            receivedAt: rawHeader.receivedAt,
            sender:
                typeof rawHeader.sender_id === "object" && rawHeader.sender_id !== null
                    ? {
                          userId: rawHeader.sender_id.user_id,
                          userFname: rawHeader.sender_id.user_fname,
                          userMname: rawHeader.sender_id.user_mname,
                          userLname: rawHeader.sender_id.user_lname,
                      }
                    : { userId: 0, userFname: "Not specified", userMname: null, userLname: "" },
            receiver:
                typeof rawHeader.receiver_id === "object" && rawHeader.receiver_id !== null
                    ? {
                          userId: rawHeader.receiver_id.user_id,
                          userFname: rawHeader.receiver_id.user_fname,
                          userMname: rawHeader.receiver_id.user_mname,
                          userLname: rawHeader.receiver_id.user_lname,
                      }
                    : { userId: 0, userFname: "Not specified", userMname: null, userLname: "" },
        };

        const customerCodes = Array.from(
            new Set(
                rawDetails
                    .map((d) => (d.invoice_id as Record<string, unknown>)?.customer_code as string)
                    .filter(Boolean)
            )
        );

        const invoiceInputs = rawDetails
            .map((d) => {
                const inv = d.invoice_id as Record<string, unknown> | null;
                if (inv && inv.invoice_id) {
                    return {
                        invoice_id: Number(inv.invoice_id),
                        order_id: (inv.order_id as string | number | null) ?? null,
                    };
                }
                if (typeof d.invoice_id === "number") {
                    return { invoice_id: d.invoice_id, order_id: null };
                }
                return null;
            })
            .filter((x): x is { invoice_id: number; order_id: string | number | null } => x !== null);

        const [customers, docNoMap] = await Promise.all([
            DocumentTransmittalRepo.fetchCustomersByCodes(customerCodes),
            DocumentTransmittalRepo.fetchDispatchNosByInvoices(invoiceInputs),
        ]);

        const customerMap: Record<string, string> = {};
        customers.forEach((c) => {
            customerMap[c.customer_code] = c.store_name || c.customer_name;
        });

        const details: DocumentTransmittalDetail[] = rawDetails.map((d) => {
            const inv = d.invoice_id as Record<string, unknown> | null;
            const code = (inv?.customer_code as string) ?? null;

            return {
                id: d.id,
                documentTransmittalId: d.document_transmittal_id,
                invoiceId: (inv?.invoice_id as number) ?? (d.invoice_id as number),
                receivedAt: d.receivedAt,
                invoice: inv
                    ? {
                          invoiceId: inv.invoice_id as number,
                          orderId: (inv.order_id as string) ?? null,
                          customerCode: code,
                          customerName: customerMap[code || ""] || null,
                          invoiceNo: (inv.invoice_no as string) ?? null,
                          docNo: docNoMap[inv.invoice_id as number] ?? null,
                          salesmanId: (inv.salesman_id as number) ?? null,
                          branchId: (inv.branch_id as number) ?? null,
                          invoiceDate: (inv.invoice_date as string) ?? null,
                          dispatchDate: (inv.dispatch_date as string) ?? null,
                          dueDate: (inv.due_date as string) ?? null,
                          paymentTerms: (inv.payment_terms as number) ?? null,
                          transactionStatus: (inv.transaction_status as string) ?? null,
                          paymentStatus: (inv.payment_status as string) ?? null,
                          totalAmount: (inv.total_amount as number) ?? null,
                          salesType: (inv.sales_type as number) ?? null,
                          invoiceType: (inv.invoice_type as number) ?? null,
                          priceType: (inv.price_type as string) ?? null,
                          vatAmount: (inv.vat_amount as number) ?? null,
                          grossAmount: (inv.gross_amount as number) ?? null,
                          discountAmount: (inv.discount_amount as number) ?? null,
                          netAmount: (inv.net_amount as number) ?? null,
                          createdBy: null,
                          createdDate: null,
                          modifiedBy: null,
                          modifiedDate: null,
                          postedBy: null,
                          postedDate: null,
                          remarks: (inv.remarks as string) ?? null,
                          isReceipt: null,
                          isPosted: null,
                          isDispatched: null,
                          isRemitted: null,
                          isReplaced: null,
                      }
                    : {
                          invoiceId: d.invoice_id as number,
                          orderId: null,
                          customerCode: null,
                          invoiceNo: null,
                          docNo: docNoMap[d.invoice_id as number] ?? null,
                          salesmanId: null,
                          branchId: null,
                          invoiceDate: null,
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
                          netAmount: null,
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
            };
        });

        const acknowledgedCount = details.filter((d) => d.receivedAt !== null).length;
        const status = deriveTransmittalStatus(header.receivedAt, details.length, acknowledgedCount);

        return { header, details, status };
    }

    /**
     * Fetches pending invoices for a specific user (fresh cleared + acknowledged held), resolving customer names.
     */
    static async getPendingInvoices(userId: number) {
        const response = await DocumentTransmittalRepo.fetchPendingDetails(userId);
        const rawData = response.data || [];

        const customerCodes = Array.from(
            new Set(
                rawData
                    .map((d: PendingTransmittalRow) => d.invoice_id?.customer_code)
                    .filter(Boolean)
            )
        );

        const customers = await DocumentTransmittalRepo.fetchCustomersByCodes(customerCodes);
        const customerMap: Record<string, string> = {};
        customers.forEach((c) => {
            customerMap[c.customer_code] = c.store_name || c.customer_name;
        });

        return rawData.map((d: PendingTransmittalRow) => {
            const invoice = d.invoice_id;
            if (invoice) {
                invoice.customer_name = customerMap[invoice.customer_code] || null;
            }
            return d;
        });
    }

    /**
     * Handles invoice acknowledgment OR reassignment depending on the target user.
     */
    static async acknowledgeTransmittal(
        id: number,
        detailIds: number[],
        targetUserId?: number,
        performingUserId?: number
    ) {
        try {
            AcknowledgeSchema.parse({ detailIds });

            let targetHeaderId = id;
            let wasReassigned = false;

            if (targetUserId) {
                const headerRes = await DocumentTransmittalRepo.fetchHeaderById(id);
                const header = headerRes.data;
                if (header) {
                    const currentReceiverId =
                        typeof header.receiver_id === "object" && header.receiver_id !== null
                            ? header.receiver_id.user_id
                            : (header.receiver_id as number) || 0;

                    if (currentReceiverId !== targetUserId) {
                        const reassignRes = await this.reassignTransmittal(
                            id,
                            detailIds,
                            targetUserId,
                            performingUserId
                        );
                        if (!reassignRes.success || !reassignRes.newHeaderId) {
                            throw new Error(reassignRes.message || "Failed to reassign invoices");
                        }
                        targetHeaderId = reassignRes.newHeaderId;
                        wasReassigned = true;
                    }
                }
            }

            if (!wasReassigned) {
                await DocumentTransmittalRepo.acknowledgeDetails(detailIds);

                const updated = await this.getTransmittalDetail(targetHeaderId);
                const allDone = updated.details.every((d) => d.receivedAt !== null);

                if (allDone) {
                    await DocumentTransmittalRepo.stampHeaderReceived(targetHeaderId);
                }

                return { success: true, message: "Invoices acknowledged successfully", targetHeaderId };
            }

            return {
                success: true,
                message: "Invoices reassigned successfully. The new receiver must acknowledge them.",
                targetHeaderId,
            };
        } catch (error) {
            if (error instanceof z.ZodError) {
                return {
                    success: false,
                    message: "Validation failed: " + error.issues.map((e: z.ZodIssue) => e.message).join(", "),
                };
            }
            console.error(`[DocumentTransmittalService] Acknowledge/Reassign error:`, error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "An unexpected error occurred",
            };
        }
    }

    /**
     * Splits a transmittal by reassigning selected unacknowledged details to a new user.
     */
    static async reassignTransmittal(
        originalHeaderId: number,
        detailIds: number[],
        newUserId: number,
        performingUserId?: number
    ) {
        try {
            ReassignSchema.parse({ detailIds, newUserId });

            const originalHeaderRes = await DocumentTransmittalRepo.fetchHeaderById(originalHeaderId);
            const originalHeader = originalHeaderRes.data;

            if (!originalHeader) throw new Error("Original transmittal not found");

            const newSenderId =
                performingUserId ||
                (typeof originalHeader.sender_id === "object" && originalHeader.sender_id !== null
                    ? originalHeader.sender_id.user_id
                    : (originalHeader.sender_id as number) || 0);

            const latestNo = await DocumentTransmittalRepo.fetchLatestTransmittalNo();
            const nextNo = getNextTransmittalNo(latestNo);

            const newHeaderRes = await DocumentTransmittalRepo.createHeader({
                sender_id: newSenderId,
                receiver_id: newUserId,
                document_transmittal_no: nextNo,
            });

            const newHeaderId = newHeaderRes.data.id;

            await DocumentTransmittalRepo.reassignDetails(detailIds, newHeaderId);

            return {
                success: true,
                message: "Invoices reassigned successfully",
                newHeaderId,
            };
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : "An unexpected error occurred during reassignment";
            console.error("[Service] Error reassigning transmittal:", error);
            return { success: false, message };
        }
    }

    /**
     * Creates a new transmittal handover (or processes existing unacknowledged reassignments)
     * from Manage Your Pending Receipts.
     */
    static async bulkAcknowledgeWithUser(
        details: { id: number; headerId: number | null; salesInvoiceId?: number }[],
        targetUserId: number,
        performingUserId?: number
    ) {
        try {
            const existingDetails = details.filter(
                (d): d is { id: number; headerId: number; salesInvoiceId?: number } => d.headerId !== null
            );
            const handoverInvoices = details.filter(
                (d): d is { id: number; headerId: null; salesInvoiceId: number } =>
                    d.headerId === null && d.salesInvoiceId !== undefined
            );

            const groupedExisting = existingDetails.reduce((acc, curr) => {
                if (!acc[curr.headerId]) acc[curr.headerId] = [];
                acc[curr.headerId].push(curr.id);
                return acc;
            }, {} as Record<number, number[]>);

            for (const [headerIdStr, detailIds] of Object.entries(groupedExisting)) {
                const headerId = parseInt(headerIdStr);
                const ackRes = await this.acknowledgeTransmittal(
                    headerId,
                    detailIds,
                    targetUserId,
                    performingUserId
                );
                if (!ackRes.success) throw new Error(`Failed to process existing transmittal: ${ackRes.message}`);
            }

            if (handoverInvoices.length > 0) {
                const latestNo = await DocumentTransmittalRepo.fetchLatestTransmittalNo();
                const nextNo = getNextTransmittalNo(latestNo);

                const newHeaderRes = await DocumentTransmittalRepo.createHeader({
                    sender_id: performingUserId || 0,
                    receiver_id: targetUserId,
                    document_transmittal_no: nextNo,
                });

                const newHeaderId = newHeaderRes.data.id;

                const detailPayload = handoverInvoices.map((inv) => ({
                    document_transmittal_id: newHeaderId,
                    invoice_id: inv.salesInvoiceId,
                }));
                await DocumentTransmittalRepo.createDetails(detailPayload);
            }

            return { success: true, message: "Handover completed successfully" };
        } catch (error: unknown) {
            console.error(`[DocumentTransmittalService] Bulk Acknowledge error:`, error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "An unexpected error occurred during handover",
            };
        }
    }
}
