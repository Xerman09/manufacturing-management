/**
 * src/modules/integrated-communications/document-transmittal/services/document-transmittal.repo.ts
 * Repository layer for the Document Transmittal module.
 * Adapted to manufacturing-management's Clearance (sales_invoice + dispatch_plan) flow.
 */

import { nowUtcSql } from "@/lib/datetime";

function getDirectusConfig() {
    const apiBaseUrl = (process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
    const staticToken = process.env.DIRECTUS_STATIC_TOKEN || "";

    if (!apiBaseUrl) {
        throw new Error("REPO_ERROR: DIRECTUS_URL / NEXT_PUBLIC_API_BASE_URL is not configured.");
    }
    if (!staticToken) {
        throw new Error("REPO_ERROR: DIRECTUS_STATIC_TOKEN is not configured.");
    }

    return { apiBaseUrl, staticToken };
}

function isSoftDeleted(val: unknown): boolean {
    if (val === true || val === 1 || val === "1") return true;
    if (val && typeof val === "object" && "data" in val) {
        const data = (val as { data?: number[] }).data;
        if (Array.isArray(data) && data.length > 0) return data[0] === 1;
    }
    return false;
}

interface DirectusError {
    message: string;
    extensions?: {
        code: string;
    };
}

interface DirectusErrorResponse {
    errors?: DirectusError[];
    message?: string;
}

export interface ClearedInvoiceRecord {
    invoice_id: number;
    order_id: string | number | null;
    invoice_no: string | null;
    invoice_date: string | null;
    net_amount: number | null;
    customer_code: string | null;
    customer_name?: string | null;
    transaction_status?: string | null;
    posted_by?: number | null;
}

export interface PendingTransmittalRow {
    id: number;
    invoiceAt: number;
    status: string;
    receivedAt?: string | null;
    post_dispatch_plan_id: {
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

interface RawDetailCustodyRow {
    id: number;
    invoice_id: number | { invoice_id?: number } | null;
    receivedAt: string | null;
    document_transmittal_id:
        | number
        | {
              id: number;
              document_transmittal_no?: string | null;
              receiver_id?: number | { user_id?: number } | null;
          }
        | null;
}

const CLEARED_INVOICE_STATUSES = [
    "Completed",
    "Completed with Returns",
    "Completed with Concerns",
];

export class DocumentTransmittalRepo {
    /**
     * Fetches document transmittal headers with server-side filtering.
     */
    static async fetchAllTransmittals(filters: {
        receiverId?: number;
        senderId?: string | null;
        selectedReceiverId?: string | null;
        status?: string[] | null;
        dateFrom?: string | null;
        dateTo?: string | null;
    }) {
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const fields = [
            "*",
            "sender_id.user_id", "sender_id.user_fname", "sender_id.user_mname", "sender_id.user_lname",
            "receiver_id.user_id", "receiver_id.user_fname", "receiver_id.user_mname", "receiver_id.user_lname",
        ].join(",");

        let url = `${apiBaseUrl}/items/document_transmittal_header?fields=${fields}&sort=-id&limit=-1`;

        const filterObj: { _and: Record<string, unknown>[] } = { _and: [] };

        if (filters.receiverId) {
            filterObj._and.push({ receiver_id: { _eq: filters.receiverId } });
        }

        if (filters.senderId) {
            filterObj._and.push({ sender_id: { _eq: parseInt(filters.senderId) } });
        }

        if (filters.selectedReceiverId) {
            filterObj._and.push({ receiver_id: { _eq: parseInt(filters.selectedReceiverId) } });
        }

        if (filters.dateFrom) {
            filterObj._and.push({ createdAt: { _gte: filters.dateFrom } });
        }
        if (filters.dateTo) {
            filterObj._and.push({ createdAt: { _lte: filters.dateTo } });
        }

        if (filterObj._and.length > 0) {
            url += `&filter=${encodeURIComponent(JSON.stringify(filterObj))}`;
        }

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${staticToken}`,
            },
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(`REPO_ERROR: Failed to fetch transmittals (${response.status})`);
        }

        return await response.json();
    }

    /**
     * Fetches all transmittal detail status rows for masterlist counting.
     */
    static async fetchAllDetailStatuses() {
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const url = `${apiBaseUrl}/items/document_transmittal_details?fields=document_transmittal_id,receivedAt&limit=-1`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${staticToken}`,
            },
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(`REPO_ERROR: Failed to fetch transmittal detail statuses (${response.status})`);
        }

        return await response.json();
    }

    /**
     * Fetches detail rows for a specific header, joining invoice data.
     */
    static async fetchDetailsByHeaderId(headerId: number) {
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const fields = ["*", "invoice_id.*"].join(",");

        const filter = encodeURIComponent(
            JSON.stringify({
                document_transmittal_id: { _eq: headerId },
            })
        );

        const url = `${apiBaseUrl}/items/document_transmittal_details?fields=${fields}&filter=${filter}&limit=-1`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${staticToken}`,
            },
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(`REPO_ERROR: Failed to fetch details for header ${headerId} (${response.status})`);
        }

        return await response.json();
    }

    /**
     * Fetches a single header by ID with full user joins.
     */
    static async fetchHeaderById(headerId: number) {
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const fields = [
            "*",
            "sender_id.user_id", "sender_id.user_fname", "sender_id.user_mname", "sender_id.user_lname",
            "receiver_id.user_id", "receiver_id.user_fname", "receiver_id.user_mname", "receiver_id.user_lname",
        ].join(",");

        const url = `${apiBaseUrl}/items/document_transmittal_header/${headerId}?fields=${fields}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${staticToken}`,
            },
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(`REPO_ERROR: Failed to fetch header ${headerId} (${response.status})`);
        }

        return await response.json();
    }

    /**
     * Batch-updates detail rows to stamp receivedAt in UTC (`YYYY-MM-DD HH:mm:ss`).
     */
    static async acknowledgeDetails(detailIds: number[]) {
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const receivedAtUtc = nowUtcSql();
        if (!receivedAtUtc) {
            throw new Error("REPO_ERROR: Failed to generate UTC timestamp for acknowledgment.");
        }

        const url = `${apiBaseUrl}/items/document_transmittal_details`;

        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${staticToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(
                detailIds.map((id) => ({
                    id,
                    receivedAt: receivedAtUtc,
                }))
            ),
        });

        if (!response.ok) {
            const err = (await response.json().catch(() => ({}))) as DirectusErrorResponse;
            throw new Error(`REPO_ERROR: ${err.errors?.[0]?.message || err.message || "Failed to acknowledge"}`);
        }

        return await response.json();
    }

    /**
     * Stamps the header as fully received in UTC (`YYYY-MM-DD HH:mm:ss`).
     */
    static async stampHeaderReceived(headerId: number) {
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const receivedAtUtc = nowUtcSql();
        if (!receivedAtUtc) {
            throw new Error("REPO_ERROR: Failed to generate UTC timestamp for header receipt.");
        }

        const url = `${apiBaseUrl}/items/document_transmittal_header/${headerId}`;

        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${staticToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                receivedAt: receivedAtUtc,
            }),
        });

        if (!response.ok) {
            const err = (await response.json().catch(() => ({}))) as DirectusErrorResponse;
            throw new Error(`REPO_ERROR: ${err.errors?.[0]?.message || err.message || "Failed to stamp header received"}`);
        }

        return await response.json();
    }

    /**
     * Creates a new document transmittal header.
     */
    static async createHeader(data: { sender_id: number; receiver_id: number; document_transmittal_no: string | null }) {
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const createdAtUtc = nowUtcSql();
        if (!createdAtUtc) {
            throw new Error("REPO_ERROR: Failed to generate UTC timestamp for transmittal creation.");
        }

        const url = `${apiBaseUrl}/items/document_transmittal_header`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${staticToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ...data,
                createdAt: createdAtUtc,
            }),
        });

        if (!response.ok) {
            const err = (await response.json().catch(() => ({}))) as DirectusErrorResponse;
            throw new Error(`REPO_ERROR: ${err.errors?.[0]?.message || err.message || "Failed to create header"}`);
        }

        return await response.json();
    }

    /**
     * Creates new detail rows.
     */
    static async createDetails(details: { document_transmittal_id: number; invoice_id: number }[]) {
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const url = `${apiBaseUrl}/items/document_transmittal_details`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${staticToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(details),
        });

        if (!response.ok) {
            const err = (await response.json().catch(() => ({}))) as DirectusErrorResponse;
            const errorMessage = err.errors?.[0]?.message || err.message || "Failed to create details";
            throw new Error(`REPO_ERROR: ${errorMessage}`);
        }

        return await response.json();
    }

    /**
     * Batch-updates detail rows to point to a new header ID.
     */
    static async reassignDetails(detailIds: number[], newHeaderId: number) {
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const url = `${apiBaseUrl}/items/document_transmittal_details`;

        const response = await fetch(url, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${staticToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                keys: detailIds,
                data: {
                    document_transmittal_id: newHeaderId,
                },
            }),
        });

        if (!response.ok) {
            const err = (await response.json().catch(() => ({}))) as DirectusErrorResponse;
            throw new Error(`REPO_ERROR: ${err.errors?.[0]?.message || err.message || "Failed to reassign details"}`);
        }

        return await response.json();
    }

    /**
     * Resolves `dispatch_plan.dispatch_no` for each sales_invoice using the MM flow:
     * sales_invoice -> order_id (or sales_invoice_details) -> sales_order -> dispatch_plan_details -> dispatch_plan.dispatch_no
     */
    static async fetchDispatchNosByInvoices(
        invoices: Array<{ invoice_id: number; order_id?: string | number | Record<string, unknown> | null }>
    ): Promise<Record<number, string>> {
        if (invoices.length === 0) return {};

        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const directOrderKeyByInvoice = new Map<number, string>();
        const numericOrderIds = new Set<number>();
        const orderNos = new Set<string>();
        const invoicesNeedingSidLookup: number[] = [];

        for (const inv of invoices) {
            const invId = Number(inv.invoice_id);
            if (!invId) continue;

            let rawOrder: string | null = null;
            if (typeof inv.order_id === "object" && inv.order_id !== null) {
                const rel = inv.order_id as Record<string, unknown>;
                rawOrder = String(rel.order_id || rel.id || rel.order_no || "").trim() || null;
            } else if (inv.order_id !== undefined && inv.order_id !== null) {
                rawOrder = String(inv.order_id).trim() || null;
            }

            if (!rawOrder) {
                invoicesNeedingSidLookup.push(invId);
                continue;
            }

            directOrderKeyByInvoice.set(invId, rawOrder);
            const parsedNum = Number(rawOrder);
            if (!Number.isNaN(parsedNum) && parsedNum > 0 && /^\d+$/.test(rawOrder)) {
                numericOrderIds.add(parsedNum);
            } else {
                orderNos.add(rawOrder);
            }
        }

        // Lookup missing order_ids from sales_invoice_details (invoice_no stores invoice_id)
        if (invoicesNeedingSidLookup.length > 0) {
            for (let i = 0; i < invoicesNeedingSidLookup.length; i += 80) {
                const chunk = invoicesNeedingSidLookup.slice(i, i + 80);
                const sidUrl =
                    `${apiBaseUrl}/items/sales_invoice_details?filter=` +
                    encodeURIComponent(JSON.stringify({ invoice_no: { _in: chunk } })) +
                    `&fields=invoice_no,order_id&limit=-1`;
                const sidRes = await fetch(sidUrl, {
                    headers: { Authorization: `Bearer ${staticToken}` },
                    cache: "no-store",
                });
                if (!sidRes.ok) {
                    throw new Error(`Failed to fetch sales_invoice_details for dispatch lookup (${sidRes.status})`);
                }
                const sidData = (await sidRes.json()).data || [];
                for (const row of sidData as Array<{ invoice_no?: number | string; order_id?: number | string | null }>) {
                    const invId = Number(row.invoice_no);
                    const rawOrd = row.order_id ? String(row.order_id).trim() : "";
                    if (!invId || !rawOrd || directOrderKeyByInvoice.has(invId)) continue;
                    directOrderKeyByInvoice.set(invId, rawOrd);
                    const parsedNum = Number(rawOrd);
                    if (!Number.isNaN(parsedNum) && parsedNum > 0 && /^\d+$/.test(rawOrd)) {
                        numericOrderIds.add(parsedNum);
                    } else {
                        orderNos.add(rawOrd);
                    }
                }
            }
        }

        // Resolve string order_nos -> numeric sales_order.order_id
        const orderNoToId = new Map<string, number>();
        const orderNosList = Array.from(orderNos);
        for (let i = 0; i < orderNosList.length; i += 80) {
            const chunk = orderNosList.slice(i, i + 80);
            const soUrl =
                `${apiBaseUrl}/items/sales_order?filter=` +
                encodeURIComponent(JSON.stringify({ order_no: { _in: chunk } })) +
                `&fields=order_id,order_no&limit=-1`;
            const soRes = await fetch(soUrl, {
                headers: { Authorization: `Bearer ${staticToken}` },
                cache: "no-store",
            });
            if (!soRes.ok) {
                throw new Error(`Failed to resolve sales_order numbers (${soRes.status})`);
            }
            const soRows = (await soRes.json()).data || [];
            for (const so of soRows as Array<{ order_id: number; order_no: string }>) {
                if (so.order_no && so.order_id) {
                    const idNum = Number(so.order_id);
                    orderNoToId.set(so.order_no.trim().toLowerCase(), idNum);
                    numericOrderIds.add(idNum);
                }
            }
        }

        const allOrderIds = Array.from(numericOrderIds);
        if (allOrderIds.length === 0) return {};

        // Fetch dispatch_plan_details for those sales_order_ids
        const dispatchIdByOrderId = new Map<number, number>();
        const dispatchIds = new Set<number>();

        for (let i = 0; i < allOrderIds.length; i += 80) {
            const chunk = allOrderIds.slice(i, i + 80);
            const dpdUrl =
                `${apiBaseUrl}/items/dispatch_plan_details?filter=` +
                encodeURIComponent(JSON.stringify({ sales_order_id: { _in: chunk } })) +
                `&fields=detail_id,dispatch_id,sales_order_id&sort=-detail_id&limit=-1`;
            const dpdRes = await fetch(dpdUrl, {
                headers: { Authorization: `Bearer ${staticToken}` },
                cache: "no-store",
            });
            if (!dpdRes.ok) {
                throw new Error(`Failed to fetch dispatch_plan_details (${dpdRes.status})`);
            }
            const dpdRows = (await dpdRes.json()).data || [];
            for (const row of dpdRows as Array<{ dispatch_id: number; sales_order_id: number }>) {
                const soId = Number(row.sales_order_id);
                const dpId = Number(row.dispatch_id);
                if (soId && dpId && !dispatchIdByOrderId.has(soId)) {
                    dispatchIdByOrderId.set(soId, dpId);
                    dispatchIds.add(dpId);
                }
            }
        }

        const allDispatchIds = Array.from(dispatchIds);
        if (allDispatchIds.length === 0) return {};

        const dispatchNoByDispatchId = new Map<number, string>();
        for (let i = 0; i < allDispatchIds.length; i += 80) {
            const chunk = allDispatchIds.slice(i, i + 80);
            const dpUrl =
                `${apiBaseUrl}/items/dispatch_plan?filter=` +
                encodeURIComponent(JSON.stringify({ dispatch_id: { _in: chunk } })) +
                `&fields=dispatch_id,dispatch_no,is_delete&limit=-1`;
            const dpRes = await fetch(dpUrl, {
                headers: { Authorization: `Bearer ${staticToken}` },
                cache: "no-store",
            });
            if (!dpRes.ok) {
                throw new Error(`Failed to fetch dispatch_plan (${dpRes.status})`);
            }
            const dpRows = (await dpRes.json()).data || [];
            for (const dp of dpRows as Array<{ dispatch_id: number; dispatch_no?: string | null; is_delete?: unknown }>) {
                if (!isSoftDeleted(dp.is_delete) && dp.dispatch_no) {
                    dispatchNoByDispatchId.set(Number(dp.dispatch_id), dp.dispatch_no);
                }
            }
        }

        const result: Record<number, string> = {};
        for (const [invId, rawOrder] of directOrderKeyByInvoice.entries()) {
            const parsedNum = /^\d+$/.test(rawOrder) ? Number(rawOrder) : orderNoToId.get(rawOrder.toLowerCase());
            if (!parsedNum) continue;
            const dpId = dispatchIdByOrderId.get(parsedNum);
            if (!dpId) continue;
            const dispatchNo = dispatchNoByDispatchId.get(dpId);
            if (dispatchNo) {
                result[invId] = dispatchNo;
            }
        }

        return result;
    }

    /**
     * Fetches invoices available for the user to transmit/forward in "Manage Your Pending Receipts":
     * 1) Fresh invoices cleared in Fulfillment & Deliveries (`posted_by === userId` and cleared transaction_status)
     *    that have not yet entered `document_transmittal_details`.
     * 2) Already-transmitted invoices whose latest `document_transmittal_details` record has
     *    `receiver_id === userId` and `receivedAt !== null` (acknowledged by this user, ready to forward).
     */
    static async fetchPendingDetails(userId?: number): Promise<{ data: PendingTransmittalRow[] }> {
        if (!userId) return { data: [] };

        const { apiBaseUrl, staticToken } = getDirectusConfig();

        // 1. Fetch all transmittal detail custody history (latest first) + cleared invoices posted by user
        const detailsUrl =
            `${apiBaseUrl}/items/document_transmittal_details?fields=` +
            `id,invoice_id,receivedAt,document_transmittal_id.id,document_transmittal_id.document_transmittal_no,document_transmittal_id.receiver_id` +
            `&sort=-id&limit=-1`;

        const freshUrl =
            `${apiBaseUrl}/items/sales_invoice?filter=` +
            encodeURIComponent(
                JSON.stringify({
                    _and: [
                        { posted_by: { _eq: userId } },
                        { transaction_status: { _in: CLEARED_INVOICE_STATUSES } },
                    ],
                })
            ) +
            `&fields=invoice_id,order_id,invoice_no,invoice_date,net_amount,customer_code,transaction_status,posted_by&sort=-invoice_id&limit=-1`;

        const [detailsRes, freshRes] = await Promise.all([
            fetch(detailsUrl, { headers: { Authorization: `Bearer ${staticToken}` }, cache: "no-store" }),
            fetch(freshUrl, { headers: { Authorization: `Bearer ${staticToken}` }, cache: "no-store" }),
        ]);

        if (!detailsRes.ok) {
            throw new Error(`Failed to fetch transmittal custody history (${detailsRes.status})`);
        }
        if (!freshRes.ok) {
            throw new Error(`Failed to fetch cleared sales invoices (${freshRes.status})`);
        }

        const custodyRows: RawDetailCustodyRow[] = (await detailsRes.json()).data || [];
        const freshInvoices: ClearedInvoiceRecord[] = (await freshRes.json()).data || [];

        const alreadyTransmittedIds = new Set<number>();
        const heldInvoiceLatestDetail = new Map<number, { detailId: number; receivedAt: string | null }>();

        for (const row of custodyRows) {
            const invId =
                typeof row.invoice_id === "object" && row.invoice_id !== null
                    ? Number(row.invoice_id.invoice_id)
                    : Number(row.invoice_id);
            if (!invId) continue;

            // Since sorted by -id, the first row per invoice_id is its latest transmittal state
            if (alreadyTransmittedIds.has(invId)) continue;
            alreadyTransmittedIds.add(invId);

            const hdr = row.document_transmittal_id;
            const receiverId =
                typeof hdr === "object" && hdr !== null
                    ? typeof hdr.receiver_id === "object" && hdr.receiver_id !== null
                        ? Number(hdr.receiver_id.user_id)
                        : Number(hdr.receiver_id)
                    : 0;

            if (receiverId === userId && row.receivedAt !== null) {
                heldInvoiceLatestDetail.set(invId, {
                    detailId: Number(row.id),
                    receivedAt: row.receivedAt,
                });
            }
        }

        // Fetch full sales_invoice records for acknowledged transmittals currently held by userId
        const heldInvoiceIds = Array.from(heldInvoiceLatestDetail.keys());
        const heldInvoices: ClearedInvoiceRecord[] = [];
        for (let i = 0; i < heldInvoiceIds.length; i += 80) {
            const chunk = heldInvoiceIds.slice(i, i + 80);
            const invUrl =
                `${apiBaseUrl}/items/sales_invoice?filter=` +
                encodeURIComponent(JSON.stringify({ invoice_id: { _in: chunk } })) +
                `&fields=invoice_id,order_id,invoice_no,invoice_date,net_amount,customer_code,transaction_status,posted_by&limit=-1`;
            const invRes = await fetch(invUrl, {
                headers: { Authorization: `Bearer ${staticToken}` },
                cache: "no-store",
            });
            if (!invRes.ok) {
                throw new Error(`Failed to fetch held sales invoices (${invRes.status})`);
            }
            const rows: ClearedInvoiceRecord[] = (await invRes.json()).data || [];
            heldInvoices.push(...rows);
        }

        // Combine untransmitted fresh cleared invoices + acknowledged invoices currently held by user
        const candidateMap = new Map<number, ClearedInvoiceRecord>();
        for (const inv of freshInvoices) {
            if (!alreadyTransmittedIds.has(Number(inv.invoice_id))) {
                candidateMap.set(Number(inv.invoice_id), inv);
            }
        }
        for (const inv of heldInvoices) {
            candidateMap.set(Number(inv.invoice_id), inv);
        }

        const combinedInvoices = Array.from(candidateMap.values());
        if (combinedInvoices.length === 0) {
            return { data: [] };
        }

        const dispatchNoMap = await this.fetchDispatchNosByInvoices(combinedInvoices);

        const mapped: PendingTransmittalRow[] = combinedInvoices.map((inv) => {
            const invId = Number(inv.invoice_id);
            const held = heldInvoiceLatestDetail.get(invId);
            const dispatchNo = dispatchNoMap[invId];

            return {
                id: held?.detailId || invId,
                invoiceAt: userId,
                status: inv.transaction_status || "Completed",
                receivedAt: held?.receivedAt ?? null,
                post_dispatch_plan_id: dispatchNo ? { doc_no: dispatchNo } : null,
                invoice_id: {
                    invoice_id: invId,
                    invoice_no: inv.invoice_no || `INV-${invId}`,
                    invoice_date: inv.invoice_date ?? null,
                    net_amount: Number(inv.net_amount ?? 0),
                    customer_code: inv.customer_code || "",
                    customer_name: null,
                },
            };
        });

        return { data: mapped };
    }

    /**
     * Fetches the latest transmittal number to support incrementing.
     */
    static async fetchLatestTransmittalNo() {
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const url = `${apiBaseUrl}/items/document_transmittal_header?sort=-id&limit=1&fields=document_transmittal_no`;

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${staticToken}` },
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch latest transmittal number: ${response.statusText}`);
        }
        const result = await response.json();
        return result.data?.[0]?.document_transmittal_no || null;
    }

    /**
     * Fetches all users from the user table.
     */
    static async fetchAllUsers() {
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const url = `${apiBaseUrl}/items/user?fields=user_id,user_fname,user_lname&limit=-1&sort=user_fname`;

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${staticToken}` },
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch users: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Fetches customer store names by customer_code list.
     */
    static async fetchCustomersByCodes(customerCodes: string[]) {
        if (customerCodes.length === 0) return [];
        const { apiBaseUrl, staticToken } = getDirectusConfig();
        const allCustomers: Array<{ customer_code: string; customer_name: string; store_name: string }> = [];

        for (let i = 0; i < customerCodes.length; i += 80) {
            const chunk = customerCodes.slice(i, i + 80);
            const customerUrl =
                `${apiBaseUrl}/items/customer?filter=` +
                encodeURIComponent(JSON.stringify({ customer_code: { _in: chunk } })) +
                `&fields=customer_code,customer_name,store_name&limit=-1`;

            const response = await fetch(customerUrl, {
                headers: { Authorization: `Bearer ${staticToken}` },
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch customer names (${response.status})`);
            }

            const data = await response.json();
            allCustomers.push(...((data.data || []) as Array<{ customer_code: string; customer_name: string; store_name: string }>));
        }

        return allCustomers;
    }
}
