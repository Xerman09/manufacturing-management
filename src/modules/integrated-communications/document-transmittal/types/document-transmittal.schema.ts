import { z } from "zod";

/**
 * src/modules/integrated-communications/document-transmittal/types/document-transmittal.schema.ts
 * Zod validation schemas for the Document Transmittal module.
 */

/** Schema for individual invoice acknowledgement */
export const AcknowledgeSchema = z.object({
    detailIds: z.array(z.number().int().positive()).min(1, "At least one invoice must be selected"),
});

export type AcknowledgeInput = z.infer<typeof AcknowledgeSchema>;

/** Schema for reassigning invoices to a new user */
export const ReassignSchema = z.object({
    detailIds: z.array(z.number().int().positive()).min(1, "At least one invoice must be selected"),
    newUserId: z.number().int().positive("A valid user must be selected"),
});

export type ReassignInput = z.infer<typeof ReassignSchema>;

/** Basic User Info Schema */
export const TransmittalUserInfoSchema = z.object({
    userId: z.number(),
    userFname: z.string(),
    userMname: z.string().nullable(),
    userLname: z.string(),
});

/** Basic Invoice Schema (Partial for validation/parsing) */
export const SalesInvoiceSchema = z.object({
    invoiceId: z.number(),
    invoiceNo: z.string().nullable(),
    docNo: z.string().nullable().optional(),
    totalAmount: z.number().nullable(),
    customerCode: z.string().nullable(),
}).passthrough();

/** Document Transmittal Detail Schema */
export const DocumentTransmittalDetailSchema = z.object({
    id: z.number(),
    documentTransmittalId: z.number(),
    invoiceId: z.number(),
    receivedAt: z.string().nullable(),
    invoice: SalesInvoiceSchema,
});

/** Document Transmittal Header Schema */
export const DocumentTransmittalHeaderSchema = z.object({
    id: z.number(),
    documentTransmittalNo: z.string().nullable(),
    senderId: z.number(),
    receiverId: z.number(),
    createdAt: z.string().nullable(),
    receivedAt: z.string().nullable(),
    sender: TransmittalUserInfoSchema,
    receiver: TransmittalUserInfoSchema,
    details: z.array(DocumentTransmittalDetailSchema).optional(),
});
