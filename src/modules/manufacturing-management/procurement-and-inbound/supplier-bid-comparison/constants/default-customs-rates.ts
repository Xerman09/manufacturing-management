import { CustomsChargesConfig, IpcBracket } from "../types";

export const DEFAULT_CUSTOMS_RATES: CustomsChargesConfig = {
    cdsCompCurr: 100.0,
    birDstCompCurr: 30.0,
    containerSecurityUsd: 5.0,
    arrastre20ftCompCurr: 4738.0,
    arrastre40ftCompCurr: 10869.0,
    wharfage20ftCompCurr: 519.35,
    wharfage40ftCompCurr: 779.05,
    lclArrastrePerRtCompCurr: 149.0,
    lclWharfagePerRtCompCurr: 30.55,
    lcBankChargePct: 0.125, // 0.1250% = 0.00125 of dutiable value
};

export const DEFAULT_IPC_BRACKETS: IpcBracket[] = [
    { bracketOrder: 1, maxDutiableValueCompCurr: 25000, chargeCompCurr: 250 },
    { bracketOrder: 2, maxDutiableValueCompCurr: 50000, chargeCompCurr: 500 },
    { bracketOrder: 3, maxDutiableValueCompCurr: 250000, chargeCompCurr: 750 },
    { bracketOrder: 4, maxDutiableValueCompCurr: 500000, chargeCompCurr: 1000 },
    { bracketOrder: 5, maxDutiableValueCompCurr: 750000, chargeCompCurr: 1500 },
    { bracketOrder: 6, maxDutiableValueCompCurr: null, chargeCompCurr: 2000 },
];

export const DEFAULT_QUALITY_CRITERIA = [
    { criterionName: "Meets technical specifications", weightPct: 30 },
    { criterionName: "Certifications and standards", weightPct: 20 },
    { criterionName: "Warranty and after-sales", weightPct: 15 },
    { criterionName: "Sample / test result", weightPct: 20 },
    { criterionName: "Track record and reliability", weightPct: 15 },
];

export const DEFAULT_PASS_FAIL_REQUIREMENTS = [
    { requirementDescription: "Complete eligibility documents" },
    { requirementDescription: "Meets all mandatory specifications" },
];
