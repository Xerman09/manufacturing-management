import { cookies } from "next/headers";

export interface WipRawMovement {
    movementKey?: string | null;
    movement_key?: string | null;
    movementId?: number | null;
    movement_id?: number | null;
    transactionType?: string | null;
    transaction_type?: string | null;
    movementDirection?: string | null;
    movement_direction?: string | null;
    sourceModule?: string | null;
    source_module?: string | null;
    referenceId?: number | null;
    reference_id?: number | null;
    source_document_id?: number | null;
    referenceNo?: string | null;
    reference_no?: string | null;
    source_document_no?: string | null;
    productId?: number | null;
    product_id?: number | null;
    productName?: string | null;
    product_name?: string | null;
    batchNo?: string | null;
    batch_no?: string | null;
    quantityIn?: number | null;
    quantity_in?: number | null;
    quantityOut?: number | null;
    quantity_out?: number | null;
    transactionDate?: string | null;
    transaction_date?: string | null;
    postedAt?: string | null;
    posted_at?: string | null;
    remarks?: string | null;
}

export interface WipMovementsFilter {
    sourceModule?: string | null;
    branch?: number | null;
    jobOrderId?: number | null;
    productId?: number | null;
}

/**
 * Fetch movements from Spring Boot API backed by manu_dummy_system.v_mm_inventory_movements.
 * Strictly self-contained inside the Work In Progress module folder.
 */
export async function fetchWipInventoryMovements(
    filters: WipMovementsFilter = {}
): Promise<WipRawMovement[]> {
    const springBaseUrl = process.env.SPRING_API_BASE_URL?.trim().replace(/\/+$/, "");
    if (!springBaseUrl) {
        return [];
    }

    // Extract auth token and cookie header from request cookies
    let token = "";
    const cookiePairs: string[] = [];
    try {
        const cookieStore = await cookies();
        for (const cookieName of ["springboot_token", "vos_access_token", "token"]) {
            const value = cookieStore.get(cookieName)?.value?.trim();
            if (value) {
                cookiePairs.push(`${cookieName}=${value}`);
                if (!token) token = value;
            }
        }
    } catch {
        // Fallback if called outside cookie context
    }

    if (!token) {
        return [];
    }

    const params = new URLSearchParams();
    if (filters.sourceModule) params.set("sourceModule", filters.sourceModule);
    if (filters.branch && filters.branch > 0) params.set("branch", String(filters.branch));
    if (filters.productId && filters.productId > 0) params.set("product", String(filters.productId));
    if (filters.jobOrderId && filters.jobOrderId > 0) params.set("referenceId", String(filters.jobOrderId));

    const endpoint = params.size > 0 ? "/api/mm-inventory-movements/filter" : "/api/mm-inventory-movements/all";
    const targetUrl = `${springBaseUrl}${endpoint}${params.size > 0 ? `?${params.toString()}` : ""}`;

    const requestHeaders: Record<string, string> = {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
    };
    if (cookiePairs.length > 0) {
        requestHeaders.Cookie = cookiePairs.join("; ");
    }

    try {
        const res = await fetch(targetUrl, {
            headers: requestHeaders,
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
            return [];
        }

        const body = await res.json();
        const list: unknown[] = Array.isArray(body)
            ? body
            : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).data)
            ? (body as { data: unknown[] }).data
            : [];

        return list.filter((row): row is WipRawMovement => Boolean(row && typeof row === "object"));
    } catch (e) {
        console.warn("[WIP Movement Service] Failed to load inventory movements:", e);
        return [];
    }
}
