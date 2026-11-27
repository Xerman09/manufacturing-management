import type { PurchaseOrderPaymentMode } from "@/modules/manufacturing-management/procurement/types";

export const PURCHASE_ORDER_DELIVERY_TERMS = [
    { value: "Delivery", label: "Local Delivery" },
    { value: "FOB (Free on Board)", label: "FOB (Free on Board)" },
    { value: "EXW (Ex Works)", label: "EXW (Ex Works)" },
    { value: "CIF (Cost, Insurance & Freight)", label: "CIF (Cost, Insurance & Freight)" },
    { value: "DDP (Delivered Duty Paid)", label: "DDP (Delivered Duty Paid)" },
    { value: "FOB / Delivery", label: "FOB / Delivery" }
] as const;

type PaymentTerm = {
    id: number;
    payment_name: string;
    payment_days?: number | null;
};

function normalizeTerm(value: string | null | undefined): string {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function hasNumericPaymentDays(term: PaymentTerm): boolean {
    return term.payment_days !== null
        && term.payment_days !== undefined
        && String(term.payment_days).trim() !== ""
        && Number.isFinite(Number(term.payment_days));
}

export function resolveSupplierPaymentTermId(
    profileValue: string | number | null | undefined,
    paymentTerms: PaymentTerm[]
): number | null {
    if (!profileValue || !Array.isArray(paymentTerms) || paymentTerms.length === 0) return null;

    const trimmedValue = String(profileValue).trim();
    if (!trimmedValue) return null;

    // 1. Direct ID match if profileValue is or contains a valid numeric term id
    const numericDirect = Number(trimmedValue);
    if (Number.isSafeInteger(numericDirect) && numericDirect > 0) {
        const idMatch = paymentTerms.find(term => term.id === numericDirect);
        if (idMatch) return idMatch.id;
    }

    const normalizedProfile = normalizeTerm(trimmedValue);
    if (!normalizedProfile) return null;

    // 2. Exact normalized name match
    const exactMatch = paymentTerms.find(term => normalizeTerm(term.payment_name) === normalizedProfile);
    if (exactMatch) return exactMatch.id;

    // 3. Match by number of days (e.g. "Net 30 Days", "30 Days", "30")
    const profileDays = normalizedProfile.match(/\b(\d+)\b/);
    if (profileDays) {
        const days = Number(profileDays[1]);
        const dayMatch = paymentTerms.find(term => hasNumericPaymentDays(term) && Number(term.payment_days) === days);
        if (dayMatch) return dayMatch.id;

        // Also check if any payment_name has the same days
        const nameDayMatch = paymentTerms.find(term => {
            const termMatch = normalizeTerm(term.payment_name).match(/\b(\d+)\b/);
            return termMatch ? Number(termMatch[1]) === days : false;
        });
        if (nameDayMatch) return nameDayMatch.id;
    }

    // 4. Cash on delivery / COD match
    if (normalizedProfile.includes("cash on delivery") || normalizedProfile === "cod" || normalizedProfile.includes("cash")) {
        const cashMatch = paymentTerms.find(term => {
            const name = normalizeTerm(term.payment_name);
            return name.includes("cash on delivery") || name === "cod" || name.includes("cash");
        });
        if (cashMatch) return cashMatch.id;

        const zeroDayMatch = paymentTerms.find(term => hasNumericPaymentDays(term) && Number(term.payment_days) === 0);
        if (zeroDayMatch) return zeroDayMatch.id;
    }

    // 5. Substring / partial match fallback
    const partialMatch = paymentTerms.find(term => {
        const normName = normalizeTerm(term.payment_name);
        return normName.includes(normalizedProfile) || normalizedProfile.includes(normName);
    });
    if (partialMatch) return partialMatch.id;

    return null;
}

export function defaultPurchaseOrderPaymentModeId(paymentModes: PurchaseOrderPaymentMode[]): number | null {
    const activeModes = paymentModes
        .filter(mode => mode.is_active === undefined || mode.is_active === true || Number(mode.is_active) === 1)
        .slice()
        .sort((left, right) => {
            const orderDifference = Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0);
            return orderDifference || left.mode_name.localeCompare(right.mode_name);
        });
    return activeModes[0]?.id ?? null;
}
