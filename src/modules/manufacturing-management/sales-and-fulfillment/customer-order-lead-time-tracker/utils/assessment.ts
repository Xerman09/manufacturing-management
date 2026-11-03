export type AssessmentStatus = "On Track" | "Approval Bottleneck" | "Overdue - Delivery date breached" | "Assessment incomplete" | "Completed" | "Cancelled";
export interface OrderAssessment { status: AssessmentStatus; reasons: string[]; approvalElapsedHours: number | null; approvalSlaHours: number; assessedAt: string }
export function assessOrder(input: { status: string; deliveryDate: string | null; approvalAt: string | null; completed: boolean; cancelled: boolean; dataQualityProblem: boolean }, now: Date): OrderAssessment {
    const result: OrderAssessment = { status: "Assessment incomplete", reasons: [], approvalElapsedHours: null, approvalSlaHours: 8, assessedAt: now.toISOString() };
    if (input.cancelled || input.completed) return { ...result, status: input.cancelled ? "Cancelled" : "Completed" };
    const date = input.deliveryDate?.slice(0, 10) ?? "";
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const overdue = validDate && today > date;
    if (!validDate) result.reasons.push("Delivery date is missing or invalid.");
    const awaiting = ["for approval", "submitted for approval"].includes(input.status.trim().toLowerCase());
    if (awaiting) {
        const value = input.approvalAt || "";
        const timestamp = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(" ", "T") + "+08:00");
        if (!Number.isFinite(timestamp) || timestamp > now.getTime()) result.reasons.push("Active approval timestamp is missing, invalid, or future-dated.");
        else result.approvalElapsedHours = (now.getTime() - timestamp) / 3600000;
    }
    const bottleneck = result.approvalElapsedHours !== null && result.approvalElapsedHours > 8;
    if (overdue) result.reasons.unshift("The delivery date has passed and the order remains open.");
    if (bottleneck) result.reasons.push("Approval waiting exceeds eight continuous elapsed hours.");
    if (input.dataQualityProblem) result.reasons.push("Milestone data-quality warnings require review.");
    result.status = overdue ? "Overdue - Delivery date breached" : bottleneck ? "Approval Bottleneck" : result.reasons.length ? "Assessment incomplete" : "On Track";
    return result;
}
