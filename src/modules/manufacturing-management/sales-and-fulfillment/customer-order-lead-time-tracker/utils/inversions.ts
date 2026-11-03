import type { CustomerOrderLeadTimeItem } from "../types";
export function inversionDetails(order: CustomerOrderLeadTimeItem) {
    return order.stages.filter(stage => stage.isNegative).map(stage => {
        const from = order.milestones.find(item => item.stage === stage.fromStage);
        const to = order.milestones.find(item => item.stage === stage.toStage);
        const format = (value: string | null | undefined) => {
            if (!value) return "Not recorded";
            const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value.replace(" ", "T") + "+08:00");
            return Number.isFinite(date.getTime()) ? date.toLocaleString("en-PH", { timeZone: "Asia/Manila" }) + " PHT" : "Invalid timestamp";
        };
        return { ...stage, key: `${stage.fromStage}-${stage.toStage}`, explanation: `${to?.stageName || stage.toStage} was recorded before ${from?.stageName || stage.fromStage}.`, timestamps: `${from?.stageName}: ${format(from?.timestamp)}; ${to?.stageName}: ${format(to?.timestamp)}.` };
    });
}
