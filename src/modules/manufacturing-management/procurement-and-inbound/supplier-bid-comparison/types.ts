export type Incoterm =
    | "DELIVERED"
    | "PICK_UP"
    | "EXW"
    | "FCA"
    | "FOB"
    | "CFR"
    | "CPT"
    | "CIF"
    | "CIP"
    | "DAP"
    | "DPU"
    | "DDP";

export type SupplierType = "LOCAL" | "INTERNATIONAL";

export type FreightBasis = "LUMP_SUM" | "PER_CBM" | "PER_KG" | "PCT_GOODS";

export type InsuranceBasis = "PCT_GOODS_AND_FREIGHT" | "FIXED_AMOUNT";

export type DutyMode = "PER_ITEM" | "FTA" | "ONE_RATE";

export type ShipmentType = "AUTO" | "FCL" | "LCL" | "AIR";

export type ProjectStatus = "Draft" | "Submitted" | "Approved" | "Rejected";

export type CriterionType = "SCORED" | "PASS_FAIL";

export type PassFailResult = "PASS" | "FAIL" | "NOT_CHECKED";

export type StorageSyncStatus =
    | "SHARED_LIVE"
    | "SHARED_VIEW_ONLY"
    | "SAVED_LOCAL"
    | "OFFLINE_ERROR";

export type AwardStrategy =
    | "ALL_RECOMMENDED"
    | "LOWEST_TOTAL_OPTIMIZED"
    | "CHEAPEST_PER_ITEM"
    | "MANUAL";

export interface RequestedItem {
    id: string; // client temporary ID or stringified int
    dbId?: number;
    productId?: number | null;
    itemTemplateId?: number | null;
    itemVariantId?: number | null;
    itemName: string;
    specifications: string;
    quantity: number;
    uom: string;
    targetUnitPrice: number;
    hsCode: string;
    dutyPct: number;
    weightPerUnitKg: number;
    cbmPerUnit: number;
    sortOrder: number;
}

export interface QualityCriterion {
    id: string;
    dbId?: number;
    criterionType: CriterionType;
    criterionName: string;
    weightPct: number; // For scored criteria
    sortOrder: number;
}

export interface ExchangeRateEntry {
    currencyCode: string;
    rateToComparison: number;
}

export interface CustomsChargesConfig {
    cdsCompCurr: number; // default 100
    birDstCompCurr: number; // default 30
    containerSecurityUsd: number; // default 5
    arrastre20ftCompCurr: number; // default 4738
    arrastre40ftCompCurr: number; // default 10869
    wharfage20ftCompCurr: number; // default 519.35
    wharfage40ftCompCurr: number; // default 779.05
    lclArrastrePerRtCompCurr: number; // default 149
    lclWharfagePerRtCompCurr: number; // default 30.55
    lcBankChargePct: number; // default 0.1250% (stored as 0.1250)
}

export interface IpcBracket {
    id?: string;
    bracketOrder: number;
    maxDutiableValueCompCurr: number | null; // null for highest bracket
    chargeCompCurr: number;
}

export interface PriceBreak {
    id: string;
    dbId?: number;
    minQuantity: number;
    unitPrice: number;
}

export interface ItemQuotation {
    id: string;
    dbId?: number;
    rfqItemId: string;
    discountPct: number;
    priceBreaks: PriceBreak[];
}

export interface BidAttachment {
    id: string;
    dbId?: number;
    directusFileId: string;
    fileName: string;
    mimeType?: string;
    fileSize?: number;
    documentType: string;
    uploadedBy?: number;
    uploadedAt?: string;
    fileUrl?: string;
    dataUrl?: string;
}

export interface SupplierBid {
    id: string;
    dbId?: number;
    supplierId?: number | null;
    supplierName: string;
    supplierType: SupplierType;
    country: string;
    contactPerson: string;
    contactEmail: string;
    contactPhone: string;
    quoteCurrency: string;
    quotationRef: string;
    quoteDate: string;
    validUntil: string;
    leadTimeDays: number;
    notes: string;
    incoterm: Incoterm;
    vatPct: number;
    pricesIncludeVat: boolean;
    inlandTruckingCompCurr: number;
    freightBasis: FreightBasis;
    freightRate: number;
    freightMinimum: number;
    freightCurrency: string;
    insuranceBasis: InsuranceBasis;
    insuranceRateOrAmount: number;
    insuranceCurrency: string;
    dutyMode: DutyMode;
    ftaAgreementName?: string;
    ftaDutyPct?: number;
    singleDutyPct?: number;
    brokerageCompCurr: number;
    otherPortChargesCompCurr: number;
    shipmentType: ShipmentType;
    containers20ft: number;
    containers40ft: number;
    declarationsCount: number;
    paidByLc: boolean;
    downPaymentPct: number;
    balanceDueDays: number;
    earlyPayDiscountPct: number;
    earlyPayDiscountDays: number;
    takeEarlyPayDiscount: boolean;
    bankFeePerPaymentCompCurr: number;
    quotations: Record<string, ItemQuotation>; // keyed by rfqItemId
    scores: Record<string, {
        passFailResult: PassFailResult;
        score: number | null;
        evidenceRemarks: string;
    }>; // keyed by criterionId
    attachments: BidAttachment[];
}

export interface ItemAward {
    id?: string;
    dbId?: number;
    rfqItemId: string;
    rfqBidId: string;
    awardedSupplierId?: number | null;
    awardedLandedUnitCost: number;
    awardedLandedTotal: number;
    purchaseOrderId?: number | null;
}

export interface ApprovalHistoryEntry {
    id?: string;
    dbId?: number;
    action: "SUBMIT" | "APPROVE" | "REJECT" | "WITHDRAW" | "REOPEN";
    fromStatus: ProjectStatus;
    toStatus: ProjectStatus;
    actorId?: number | null;
    actorName: string;
    comment: string;
    createdAt: string;
}

export interface RfqProject {
    id: string;
    dbId?: number;
    rfqTitle: string;
    rfqReference: string;
    parentRfqId?: number | null;
    roundNo: number;
    comparisonCurrency: string; // default "PHP"
    budget: number | null;
    notes: string;
    fxRiskBufferPct: number; // default 3.00
    costOfMoneyPctPerYear: number; // default 8.00
    defaultVatPct: number; // default 12.00
    countVatAsCost: boolean; // default true
    calcCustomsAuto: boolean; // default true
    scoringWeightPricePct: number; // default 50.00
    scoringWeightQualityPct: number; // default 35.00
    scoringWeightLeadTimePct: number; // default 15.00
    status: ProjectStatus;
    version: number;
    preparedBy: string;
    preparedByTitle: string;
    reviewedBy: string;
    reviewedByTitle: string;
    approvedBy: string;
    approvedByTitle: string;
    justification: string;
    approvalRemarks?: string;
    rejectionReason?: string;
    awardStrategy?: AwardStrategy;
    targetDate?: string;
    createdBy?: number | null;
    createdAt?: string;
    updatedBy?: number | null;
    updatedAt?: string;
    deletedAt?: string | null;
    items: RequestedItem[];
    qualityCriteria: QualityCriterion[];
    exchangeRates: ExchangeRateEntry[];
    customsRates: CustomsChargesConfig;
    ipcBrackets: IpcBracket[];
    bids: SupplierBid[];
    awards: ItemAward[];
    approvalHistory: ApprovalHistoryEntry[];
}

// Calculation Results
export interface ItemLandedCostBreakdown {
    rfqItemId: string;
    quotedUnitPrice: number;
    appliedUnitPriceForeign: number;
    discountPct: number;
    unitPriceDiscountedForeign: number;
    goodsForeign: number;
    goodsCompCurr: number;
    freightCompCurr: number;
    insuranceCompCurr: number;
    cifCompCurr: number;
    fxBufferCompCurr: number;
    dutyRatePct: number;
    dutyCompCurr: number;
    vatCompCurr: number;
    fixedChargesCompCurr: number; // share of customs, port, inland, bank, payment financing
    totalLandedCompCurr: number;
    landedUnitCostCompCurr: number;
    targetPriceCompCurr: number;
    varianceVsTargetCompCurr: number;
    varianceVsTargetPct: number;
    isBelowMoq: boolean;
    nextBreakUnitsNeeded: number | null;
    nextBreakSavingsCompCurr: number | null;
    hasQuote: boolean;
}

export interface SupplierLandedCostResult {
    bidId: string;
    supplierName: string;
    isValid: boolean; // not expired & passed all pass/fail
    isDisqualified: boolean;
    isExpired: boolean;
    expiresInDays: number;
    isFullBid: boolean;
    quotedItemCount: number;
    totalItemCount: number;
    goodsQuotedCompCurr: number;
    discountTotalCompCurr: number;
    goodsAfterDiscountCompCurr: number;
    totalWeightKg: number;
    totalVolumeM3: number;
    revenueTons: number;
    estimatedContainers20ft: number;
    estimatedContainers40ft: number;
    teuCount: number;
    freightCompCurr: number;
    insuranceCompCurr: number;
    cifDutiableValueCompCurr: number;
    fxBufferCompCurr: number;
    dutyCompCurr: number;
    brokerageCompCurr: number;
    ipcCompCurr: number;
    cdsCompCurr: number;
    birDstCompCurr: number;
    arrastreCompCurr: number;
    wharfageCompCurr: number;
    containerSecurityCompCurr: number;
    lcBankChargeCompCurr: number;
    otherPortChargesCompCurr: number;
    customsAndPortTotalCompCurr: number;
    vatBaseCompCurr: number;
    vatCompCurr: number;
    inlandTruckingCompCurr: number;
    bankFeesCompCurr: number;
    downPaymentCompCurr: number;
    balanceDueCompCurr: number;
    earlyPayDiscountAmountCompCurr: number;
    paymentTermsCostCompCurr: number;
    totalLandedCostCompCurr: number;
    items: Record<string, ItemLandedCostBreakdown>; // keyed by rfqItemId
    // Quality & Scores
    qualityScore: number;
    priceScore: number;
    leadTimeScore: number;
    overallScore: number;
    ranking: number;
    isRecommended: boolean;
    isLowest: boolean;
    isTopQuality: boolean;
    isFastest: boolean;
    warnings: string[];
    blockingIssues: string[];
}

export interface ComparisonSummary {
    recommendedBidId: string | null;
    lowestSingleBidId: string | null;
    lowestSingleTotalCompCurr: number | null;
    lowestSingleVsAveragePct: number | null;
    optimizedAwardTotalCompCurr: number | null;
    optimizedAwardBidIds: string[];
    bestLocalBidId: string | null;
    bestLocalTotalCompCurr: number | null;
    bestInternationalBidId: string | null;
    bestInternationalTotalCompCurr: number | null;
    bestLocalVsIntDifferenceCompCurr: number | null;
    bestLocalVsIntPct: number | null;
    budgetVarianceCompCurr: number | null;
    isBudgetOver: boolean;
    results: Record<string, SupplierLandedCostResult>; // keyed by bidId
}
