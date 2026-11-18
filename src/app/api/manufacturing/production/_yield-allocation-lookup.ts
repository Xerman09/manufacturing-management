type LookupRow = Record<string, unknown>;

export async function readYieldAllocationDependency(
    url: string,
    headers: HeadersInit,
    context: { jobOrderId: number; requestId: string; lookup: string },
    signal = AbortSignal.timeout(8000)
): Promise<LookupRow[] | null> {
    const startedAt = Date.now();
    let upstreamStatus: number | undefined;
    let upstreamCode: string | undefined;
    try {
        const response = await fetch(url, { headers, cache: "no-store", signal });
        upstreamStatus = response.status;
        const body = await response.json();
        const code = body?.errors?.[0]?.extensions?.code;
        if (typeof code === "string") upstreamCode = code;
        if (response.ok && Array.isArray(body?.data) &&
            body.data.every((row: unknown) => row && typeof row === "object" && !Array.isArray(row))) {
            return body.data;
        }
    } catch (error) {
        upstreamCode = signal.aborted ? "TIMEOUT" : error instanceof Error ? error.name : "LOOKUP_ERROR";
    }
    console.warn("Yield allocation dependency unavailable", {
        ...context, upstreamStatus, upstreamCode, durationMs: Date.now() - startedAt
    });
    return null;
}

export function yieldAllocationPath(ledgerIds: number[]): string {
    return `/items/manufacturing_job_order_yield_allocations?filter[ledger_id][_in]=${ledgerIds.join(",")}&limit=-1&sort=sort_order,allocation_id&fields=allocation_id,ledger_id,allocation_type,allocation_key,quantity,mm_lot_id,batch_no,manufacturing_date,expiry_date,rejection_reason_id`;
}
