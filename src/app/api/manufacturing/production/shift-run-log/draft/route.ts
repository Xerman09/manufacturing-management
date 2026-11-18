import { isDeepStrictEqual } from "node:util";
import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { JOB_ORDER_MODULE_PATHS, JobOrderModuleAccessError, requireJobOrderModuleAccess } from "@/app/api/manufacturing/job-orders/_module-access";

const collection = "manufacturing_shift_draft_revisions";
type Draft = {
    id: string;
    session_key: string;
    job_order_id: number;
    operator_id: number;
    revision: number;
    saved_at: string;
    payload: Record<string, unknown>;
};

async function directus(path: string, body?: Draft) {
    return fetch(`${DIRECTUS_URL}/items/${path}`, {
        headers, cache: "no-store", signal: AbortSignal.timeout(8000),
        ...(body ? { method: "POST", body: JSON.stringify(body) } : {})
    });
}

async function rows<T>(collection: string, filters: Record<string, string>): Promise<T[]> {
    const response = await directus(`${collection}?${new URLSearchParams(filters)}`);
    if (!response.ok) throw new Error(`Draft lookup failed with HTTP ${response.status}`);
    const { data } = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid draft lookup response");
    return data;
}

function replyError(error: unknown) {
    if (error instanceof JobOrderModuleAccessError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Shift draft request failed", error);
    return NextResponse.json({ error: "Shift drafts are temporarily unavailable. Retry before closing." }, { status: 503 });
}

function validId(value: number) {
    return Number.isSafeInteger(value) && value > 0;
}

async function recordedSessions(jobOrderId: number) {
    const ledger = await rows<{ session_key: string }>("manufacturing_job_order_yield_ledger", {
        "filter[job_order_id][_eq]": String(jobOrderId),
        "filter[commit_status][_in]": "COMMITTED,PENDING,CANCELLED",
        fields: "session_key", limit: "-1"
    });
    return new Set(ledger.map(row => row.session_key));
}

function publicDraft(draft: Draft) {
    return { sessionKey: draft.session_key, revision: draft.revision, savedAt: draft.saved_at, payload: draft.payload };
}

export async function GET(request: Request) {
    try {
        const { userId } = await requireJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
        const jobOrderId = Number(new URL(request.url).searchParams.get("jobOrderId"));
        if (!validId(jobOrderId)) return NextResponse.json({ error: "Invalid Job Order." }, { status: 400 });
        const [drafts, recorded] = await Promise.all([
            rows<Draft>(collection, {
                "filter[job_order_id][_eq]": String(jobOrderId),
                "filter[operator_id][_eq]": String(userId),
                sort: "-saved_at,-revision", limit: "-1"
            }),
            recordedSessions(jobOrderId)
        ]);
        const draft = drafts.find(row => !recorded.has(row.session_key));
        return NextResponse.json({ draft: draft ? publicDraft(draft) : null });
    } catch (error) {
        return replyError(error);
    }
}

export async function POST(request: Request) {
    try {
        const { userId } = await requireJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
        const body = await request.json().catch(() => null);
        const jobOrderId = Number(body?.jobOrderId);
        const revision = body?.revision;
        const sessionKey = body?.sessionKey;
        const payload = body?.payload;
        const fields = ["shiftName", "productionDay", "productionDate", "good", "rejected", "reasonId", "rejectionRemarks", "remarks", "varianceReason"];
        if (!validId(jobOrderId) || !Number.isSafeInteger(revision) || revision < 0 ||
            typeof sessionKey !== "string" || !/^[a-zA-Z0-9-]{10,80}$/.test(sessionKey) ||
            !payload || typeof payload !== "object" || Array.isArray(payload) ||
            fields.some(key => typeof payload[key] !== "string" || payload[key].length > 5000) ||
            !payload.quantities || typeof payload.quantities !== "object" || Array.isArray(payload.quantities) ||
            Object.values(payload.quantities).some(value => typeof value !== "string" || value.length > 64) ||
            JSON.stringify(payload).length > 128000) {
            return NextResponse.json({ error: "Invalid shift draft." }, { status: 400 });
        }
        const [orders, revisions, recorded] = await Promise.all([
            rows("manufacturing_job_orders", { "filter[job_order_id][_eq]": String(jobOrderId), fields: "job_order_id", limit: "1" }),
            rows<Draft>(collection, { "filter[session_key][_eq]": sessionKey, sort: "-revision", limit: "1" }),
            recordedSessions(jobOrderId)
        ]);
        const latest = revisions[0];
        if (!orders.length || (latest && (Number(latest.operator_id) !== userId || Number(latest.job_order_id) !== jobOrderId))) {
            return NextResponse.json({ error: "Shift draft not found." }, { status: 404 });
        }
        const conflict = () => NextResponse.json({ error: "This shift has a newer save or has started recording. Reopen the Job Order to load its latest state." }, { status: 409 });
        if (recorded.has(sessionKey)) return conflict();
        const matchesRetry = (row: Draft) => Number(row.operator_id) === userId &&
            Number(row.job_order_id) === jobOrderId && isDeepStrictEqual(row.payload, payload);
        if (latest && Number(latest.revision) === revision + 1 && matchesRetry(latest)) {
            return NextResponse.json({ draft: publicDraft(latest) });
        }
        if (Number(latest?.revision ?? 0) !== revision) return conflict();
        const draft: Draft = {
            id: `${sessionKey}:${revision + 1}`, session_key: sessionKey, job_order_id: jobOrderId,
            operator_id: userId, revision: revision + 1, saved_at: new Date().toISOString(), payload
        };
        const response = await directus(collection, draft);
        if (!response.ok) {
            const [winner] = await rows<Draft>(collection, { "filter[id][_eq]": draft.id, limit: "1" });
            if (winner) return matchesRetry(winner)
                ? NextResponse.json({ draft: publicDraft(winner) })
                : conflict();
            throw new Error(`Draft save failed with HTTP ${response.status}`);
        }
        return NextResponse.json({ draft: publicDraft(draft) });
    } catch (error) {
        return replyError(error);
    }
}
