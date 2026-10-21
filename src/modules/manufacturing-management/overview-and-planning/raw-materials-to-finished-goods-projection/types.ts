export type MaterialClassification = "RAW_MATERIAL" | "PACKAGING" | "SUB_ASSEMBLY" | "UNKNOWN";

export type FeasibilityStatus = "PRODUCIBLE" | "NOT_PRODUCIBLE" | "INCOMPLETE_DATA";

export type CapacityCalculationMode = "WHOLE_UNITS" | "FULL_BATCHES_ONLY";

export interface DensityFactorItem {
    id: number | string;
    name: string;
    density: number; // in kg/L or g/mL
    description?: string | null;
}

export interface UOMScaleConversion {
    fromUnit: string;
    toUnit: string;
    multiplier: number; // toUnit = fromUnit * multiplier
}

export interface ConversionContext {
    densityFactors?: DensityFactorItem[];
    customScales?: UOMScaleConversion[];
}

export interface BOMComponentDefinition {
    id: number | string;
    productId: number;
    productName: string;
    productCode?: string;
    classification: MaterialClassification;
    quantityRequired: number; // Quantity required for one full gross recipe batch (baseQuantity)
    unitOfMeasurement: {
        id: number;
        name: string;
        code?: string;
    };
    wastageFactorPercentage: number;
    costPerUnit?: number;
    // If classification is SUB_ASSEMBLY, this links to its approved BOM version
    subAssemblyBOM?: BOMDefinition | null;
}

export interface BOMDefinition {
    versionId: number;
    versionName: string;
    productId: number;
    productName: string;
    productCode?: string;
    baseQuantity: number; // Gross batch output produced by one run
    expectedYieldPercentage: number; // Net yield % (e.g. 95% = 0.95 net recovery)
    stepBatchSize?: number; // Operational route batch size (defaults to baseQuantity)
    uom: {
        id: number;
        name: string;
        code?: string;
    };
    status: string; // Must be 'Active'
    components: BOMComponentDefinition[];
}

export interface StockInventoryItem {
    productId: number;
    productName?: string;
    onHandQuantity: number;
    activeReservations: number;
    availableQuantity: number; // onHandQuantity - activeReservations
    uom: {
        id: number;
        name: string;
        code?: string;
    };
    convertiblePackagingSummary?: string;
}

export interface SubAssemblyCapacityBreakdown {
    intermediateStockAvailable: number;
    intermediateStockUnitCapacity: number;
    rawMaterialCompoundingBatches: number;
    rawMaterialCompoundingUnitCapacity: number;
    limitingRawMaterialId?: number;
    limitingRawMaterialName?: string;
}

export interface FeasibilityComponentResult {
    productId: number;
    productName: string;
    productCode?: string;
    classification: MaterialClassification;
    // Requirements
    baseQuantityRequired?: number; // Base BOM recipe quantity before wastage
    requiredPerNetFgUnit: number; // Effective gross requirement after wastage
    recipeUomName: string;
    wastageFactorPercentage: number;
    // Stock
    eligibleOnHandStock: number;
    activeReservationsDeducted: number;
    netAvailableStock: number;
    stockUomName: string;
    // Capacity & Bottleneck
    capacityInFgUnits: number;
    isLimiting: boolean;
    shortageUnits?: number; // Missing quantity if target or 0
    // Multi-level breakdown if sub-assembly
    subAssemblyBreakdown?: SubAssemblyCapacityBreakdown;
    // Packaging conversion context (e.g. "+3,000 Bag from 100 CSE")
    convertiblePackagingSummary?: string;
    // Diagnostic error if conversion or data missing
    diagnostic?: string;
}

export interface FeasibilityResult {
    status: FeasibilityStatus;
    mode: CapacityCalculationMode;
    // Primary outputs
    maxFgUnits: number; // Theoretical whole units supported
    fullBatches: number; // Complete production batches supported
    batchRemainderUnits: number; // Units above the full batch boundary
    batchSize: number; // Sizing batch multiple used
    fgUomName: string;
    // Limiting component / bottleneck
    limitingComponent: FeasibilityComponentResult | null;
    bottleneckReason?: string;
    // Detailed component grid
    components: FeasibilityComponentResult[];
    // Diagnostics & warnings
    diagnostics: string[];
    isFeasible: boolean;
}
