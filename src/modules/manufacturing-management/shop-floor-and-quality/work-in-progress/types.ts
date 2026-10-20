export type WipMaterialStatus =
    | "RESERVED"
    | "ISSUED_TO_PRODUCTION"
    | "PARTIALLY_CONSUMED"
    | "CONSUMED"
    | "RETURNED"
    | "EXCEPTION_OVER_CONSUMED";

export interface WipLotReservation {
    reservationId: number;
    joMaterialId: number;
    jobOrderId: number;
    productId: number;
    productName: string;
    productCode: string;
    branchId: number;
    branchName: string;
    batchNo: string;
    lotNo: string | null;
    productDescription: string | null;
    mmLotId: number | null;
    inventoryLotId: number | null;
    uomId: number | null;
    uomShortcut: string;
    stagingBin: string | null;
    stagingBinCode?: string | null;
    expiryDate: string | null;
    reservationStatus: string;
    reservedQuantity: number;
    stagedQuantity: number;
    issuedToWipQuantity: number;
    actualUsedQuantity: number;
    returnedQuantity: number;
    remainingWipQuantity: number;
    wipStartedAt: string | null;
    isPackaging: boolean;
    isExpired: boolean;
}

export interface WipShiftConsumption {
    consumageId: number;
    ledgerId: number;
    jobOrderId: number;
    shiftName: string;
    productId: number;
    productName: string;
    quantityConsumed: number;
    theoreticalQuantity: number;
    varianceQuantity: number;
    varianceReason: string | null;
    batchNo: string | null;
    uomShortcut: string;
    loggedAt: string | null;
    loggedBy: number | null;
    qaStatus: string | null;
}

export interface WipInventoryMovement {
    movementKey: string;
    transactionType: string;
    movementDirection: string;
    quantityIn: number;
    quantityOut: number;
    batchNo: string | null;
    transactionDate: string | null;
    postedAt: string | null;
    remarks: string | null;
    productName: string;
}

export interface WipMaterialItem {
    id: string; // jo_id + "_" + material_id
    jobOrderId: number;
    jobOrderNo: string;
    jobOrderStatus: string;
    targetProductId: number;
    targetProductName: string;
    targetProductCode: string;
    targetProductDescription?: string | null;
    branchId: number;
    branchName: string;
    materialId: number;
    materialName: string;
    materialCode: string;
    uomId: number | null;
    uomShortcut: string;
    isPackaging: boolean;
    allocatedQuantity: number;
    reservedQuantity: number;
    stagedQuantity: number;
    issuedQuantity: number;
    consumedQuantity: number;
    returnedQuantity: number;
    lossQuantity: number;
    remainingWipQuantity: number;
    status: WipMaterialStatus;
    hasDiscrepancy: boolean;
    discrepancyNote?: string | null;
    lots: WipLotReservation[];
    consumptions: WipShiftConsumption[];
    movements: WipInventoryMovement[];
    startDate: string | null;
    endDate: string | null;
}

export interface WipSummaryMetrics {
    totalActiveJobOrders: number;
    totalMaterialsTracked: number;
    totalReservedQuantity: number;
    totalIssuedQuantity: number;
    totalConsumedQuantity: number;
    totalReturnedQuantity: number;
    totalLossQuantity: number;
    totalRemainingWipQuantity: number;
    totalExceptionsCount: number;
}

export interface WipFilterState {
    jobOrderId: string;
    branchId: string;
    materialId: string;
    status: string;
    search: string;
    dateFrom: string;
    dateTo: string;
}

export interface WipApiResponse {
    items: WipMaterialItem[];
    metrics: WipSummaryMetrics;
    jobOrderOptions: { id: number; no: string; productName: string; status: string }[];
    branchOptions: { id: number; name: string; code: string }[];
    materialOptions: { id: number; name: string; code: string }[];
}
