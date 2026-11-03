import type { OrderAssessment } from "../utils/assessment";
export function AssessmentBadge({ assessment }: { assessment: OrderAssessment }) {
    const color = assessment.status.startsWith("Overdue") ? "text-red-700 bg-red-500/10" : assessment.status === "Approval Bottleneck" ? "text-amber-700 bg-amber-500/10" : assessment.status === "On Track" ? "text-emerald-700 bg-emerald-500/10" : "text-muted-foreground bg-muted";
    return <span title={assessment.reasons.join(" ")} className={`inline-flex rounded px-2 py-1 text-xs font-medium ${color}`}>{assessment.status}</span>;
}
