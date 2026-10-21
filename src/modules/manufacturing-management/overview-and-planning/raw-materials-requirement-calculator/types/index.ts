export interface ProductOption {
    productId: number;
    productName: string;
    productCode: string;
    unitId: number;
    unitShortcut?: string;
    densityFactor?: number | null;
    categoryName?: string;
    brandName?: string;
}

export interface BomVersionOption {
    versionId: number;
    productId: number;
    versionName: string;
    baseQuantity: number;
    uomId: number;
    uomShortcut?: string;
    expectedYieldPercentage: number;
    status: string;
    isPrimary: boolean;
    remarks?: string;
}

export interface BranchOption {
    id: number;
    branchName: string;
    branchCode?: string;
}

export interface UnitOption {
    unitId: number;
    unitName: string;
    unitShortcut: string;
}

export interface DensityOption {
    id: number;
    name: string;
    density: number;
}

export interface CalculatorBootstrapData {
    products: ProductOption[];
    branches: BranchOption[];
    units: UnitOption[];
    densities: DensityOption[];
}

export type FeasibilityVerdict = "Sufficient" | "Shortage" | "Incomplete Data";

export interface ComponentRequirementRow {
    bomItemId: number;
    productId: number;
    productName: string;
    productCode: string;
    materialType: "RAW_MATERIALS" | "PACKAGING" | "OTHER";
    routeSequence: number;
    operationName: string;
    unitId: number;
    unitShortcut: string;
    quantityPerBatch: number;
    wastagePercentage: number;
    requiredQuantity: number;
    availableQuantity: number;
    shortageQuantity: number;
    status: "Sufficient" | "Shortage" | "No Stock";
}

export interface CalculationResult {
    verdict: FeasibilityVerdict;
    targetQuantity: number;
    targetUomId: number;
    targetUomShortcut: string;
    finishedGood: {
        productId: number;
        productName: string;
        productCode: string;
        baseQuantity: number;
        baseUomShortcut: string;
        expectedYieldPercentage: number;
        versionName: string;
        versionId: number;
    };
    branch: {
        id: number;
        branchName: string;
    };
    assumptions: {
        scalingFactor: number;
        appliedDensityFactor?: number;
        expectedYieldPercentage: number;
        calculationTimestamp: string;
        disclaimer: string;
    };
    summary: {
        totalComponents: number;
        rawMaterialsCount: number;
        packagingCount: number;
        shortageCount: number;
        sufficientCount: number;
        readinessPercentage: number;
    };
    components: ComponentRequirementRow[];
}

export interface CalculationRequestPayload {
    productId: number;
    versionId: number;
    branchId: number;
    targetQuantity: number;
    targetUomId?: number;
}
