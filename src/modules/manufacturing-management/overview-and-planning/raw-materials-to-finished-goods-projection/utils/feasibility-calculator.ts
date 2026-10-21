import type {
    BOMDefinition,
    BOMComponentDefinition,
    StockInventoryItem,
    ConversionContext,
    CapacityCalculationMode,
    FeasibilityResult,
    FeasibilityComponentResult,
    SubAssemblyCapacityBreakdown
} from "../types";
import { convertUomQuantity } from "./feasibility-conversions";
import { calculateComponentPerUnitRequirement } from "./feasibility-requirements";

interface EvaluatedComponentDemand {
    productId: number;
    productName: string;
    productCode?: string;
    classification: BOMComponentDefinition["classification"];
    recipeUomName: string;
    stockUomName: string;
    eligibleOnHandStock: number;
    activeReservationsDeducted: number;
    netAvailableStock: number;
    wastageFactorPercentage: number;
    baseQuantityRequired: number;
    // Quantity of this component needed per 1 net FG unit (in stock UOM)
    directReqPerNetFgUnit: number;
    isSubAssembly: boolean;
    subAssemblyBOM?: BOMDefinition | null;
    convertiblePackagingSummary?: string;
    diagnostic?: string;
}

interface SubAssemblyCompoundingSpec {
    subProductId: number;
    subProductName: string;
    baseQuantity: number; // Gross batch
    expectedYieldPercentage: number;
    netBatchOutput: number; // baseQuantity * yield%
    stepBatchSize: number;
    subUomName: string;
    // Raw materials required to produce 1 full gross batch of this sub-assembly
    childRequirements: Array<{
        productId: number;
        productName: string;
        quantityRequiredInStockUom: number;
        wastageFactorPercentage: number;
    }>;
}

/**
 * Detects cycles in multi-level BOMs using Depth First Search.
 */
function detectBOMCycles(bom: BOMDefinition, visited = new Set<number>()): string | null {
    if (visited.has(bom.productId)) {
        return `Cyclic BOM dependency detected involving product "${bom.productName}" (ID ${bom.productId}).`;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(bom.productId);

    for (const comp of bom.components) {
        if (comp.subAssemblyBOM) {
            const cycleError = detectBOMCycles(comp.subAssemblyBOM, nextVisited);
            if (cycleError) return cycleError;
        }
    }

    return null;
}

/**
 * Pure Production Feasibility Engine
 * Calculates maximum feasible finished goods without database mutations.
 */
export function calculateProductionFeasibility(
    bom: BOMDefinition,
    stockItems: StockInventoryItem[],
    options: {
        mode?: CapacityCalculationMode;
        conversionContext?: ConversionContext;
        isBomQuantityPerUnit?: boolean;
    } = {}
): FeasibilityResult {
    const mode = options.mode || "WHOLE_UNITS";
    const context = options.conversionContext || {};
    const diagnostics: string[] = [];

    // 1. Initial BOM validation
    if (!bom || !bom.productId || !Array.isArray(bom.components) || bom.components.length === 0) {
        return {
            status: "INCOMPLETE_DATA",
            mode,
            maxFgUnits: 0,
            fullBatches: 0,
            batchRemainderUnits: 0,
            batchSize: 0,
            fgUomName: bom?.uom?.name || "units",
            limitingComponent: null,
            bottleneckReason: "The selected BOM version has no defined components or invalid header data.",
            components: [],
            diagnostics: ["The selected BOM version has no defined components."],
            isFeasible: false
        };
    }

    if (bom.status && bom.status.toLowerCase() !== "active") {
        return {
            status: "INCOMPLETE_DATA",
            mode,
            maxFgUnits: 0,
            fullBatches: 0,
            batchRemainderUnits: 0,
            batchSize: bom.stepBatchSize || bom.baseQuantity || 1,
            fgUomName: bom.uom.name,
            limitingComponent: null,
            bottleneckReason: `Selected BOM version "${bom.versionName}" is in status "${bom.status}". Only Active approved BOM versions can be evaluated.`,
            components: [],
            diagnostics: [`BOM version status is "${bom.status}". Active version required.`],
            isFeasible: false
        };
    }

    // 2. Cycle detection
    const cycleError = detectBOMCycles(bom);
    if (cycleError) {
        return {
            status: "INCOMPLETE_DATA",
            mode,
            maxFgUnits: 0,
            fullBatches: 0,
            batchRemainderUnits: 0,
            batchSize: bom.stepBatchSize || bom.baseQuantity || 1,
            fgUomName: bom.uom.name,
            limitingComponent: null,
            bottleneckReason: cycleError,
            components: [],
            diagnostics: [cycleError],
            isFeasible: false
        };
    }

    // Build quick stock map: productId -> StockInventoryItem
    const stockMap = new Map<number, StockInventoryItem>();
    stockItems.forEach((item) => {
        stockMap.set(item.productId, item);
    });

    // 3. Process direct FG BOM components and check conversions
    const evaluatedDemands: EvaluatedComponentDemand[] = [];
    const subAssemblySpecs = new Map<number, SubAssemblyCompoundingSpec>();

    for (const comp of bom.components) {
        const stockItem = stockMap.get(comp.productId);
        const stockUomName = stockItem?.uom.name || comp.unitOfMeasurement.name;
        const eligibleOnHand = stockItem?.onHandQuantity ?? 0;
        const activeReservations = stockItem?.activeReservations ?? 0;
        const netAvailable = stockItem ? Math.max(0, stockItem.availableQuantity) : 0;

        // Calculate requirement per net FG unit in recipe UOM
        const reqResult = calculateComponentPerUnitRequirement(
            bom.baseQuantity,
            bom.expectedYieldPercentage,
            comp.quantityRequired,
            comp.wastageFactorPercentage,
            options.isBomQuantityPerUnit ?? false
        );

        if (!reqResult.ok || reqResult.requiredPerNetFgUnit === undefined) {
            diagnostics.push(reqResult.diagnostic || `Failed calculating requirement for ${comp.productName}.`);
            continue;
        }

        // Convert requirement from recipe UOM to stock UOM
        const convResult = convertUomQuantity(
            reqResult.requiredPerNetFgUnit,
            comp.unitOfMeasurement.name,
            stockUomName,
            comp.productName,
            context
        );

        if (!convResult.ok || convResult.convertedValue === undefined) {
            diagnostics.push(convResult.diagnostic || `Cannot convert ${comp.unitOfMeasurement.name} to ${stockUomName} for ${comp.productName}.`);
            continue;
        }

        const directReqInStockUom = convResult.convertedValue;

        // If component is a sub-assembly, validate and index its compounding spec
        if (comp.classification === "SUB_ASSEMBLY" && comp.subAssemblyBOM) {
            const subBom = comp.subAssemblyBOM;
            const netSubBatchOutput = subBom.baseQuantity * (subBom.expectedYieldPercentage / 100);

            if (netSubBatchOutput <= 0) {
                diagnostics.push(`Sub-assembly "${comp.productName}" has invalid yield or base quantity.`);
                continue;
            }

            const childRequirements: SubAssemblyCompoundingSpec["childRequirements"] = [];
            let subAssemblyValid = true;

            for (const childComp of subBom.components) {
                const childStockItem = stockMap.get(childComp.productId);
                const childStockUomName = childStockItem?.uom.name || childComp.unitOfMeasurement.name;

                // Child quantity needed for 1 full gross batch of sub-assembly
                const childGrossBatchReq = childComp.quantityRequired * (1 + (childComp.wastageFactorPercentage || 0) / 100);

                const childConvResult = convertUomQuantity(
                    childGrossBatchReq,
                    childComp.unitOfMeasurement.name,
                    childStockUomName,
                    childComp.productName,
                    context
                );

                if (!childConvResult.ok || childConvResult.convertedValue === undefined) {
                    diagnostics.push(
                        childConvResult.diagnostic ||
                        `Cannot convert UOM for sub-assembly component "${childComp.productName}" from ${childComp.unitOfMeasurement.name} to ${childStockUomName}.`
                    );
                    subAssemblyValid = false;
                    break;
                }

                childRequirements.push({
                    productId: childComp.productId,
                    productName: childComp.productName,
                    quantityRequiredInStockUom: childConvResult.convertedValue,
                    wastageFactorPercentage: childComp.wastageFactorPercentage || 0
                });
            }

            if (subAssemblyValid) {
                subAssemblySpecs.set(comp.productId, {
                    subProductId: comp.productId,
                    subProductName: comp.productName,
                    baseQuantity: subBom.baseQuantity,
                    expectedYieldPercentage: subBom.expectedYieldPercentage,
                    netBatchOutput: netSubBatchOutput,
                    stepBatchSize: subBom.stepBatchSize || subBom.baseQuantity,
                    subUomName: subBom.uom.name,
                    childRequirements
                });
            }
        }

        evaluatedDemands.push({
            productId: comp.productId,
            productName: comp.productName,
            productCode: comp.productCode,
            classification: comp.classification,
            recipeUomName: comp.unitOfMeasurement.name,
            stockUomName,
            eligibleOnHandStock: eligibleOnHand,
            activeReservationsDeducted: activeReservations,
            netAvailableStock: netAvailable,
            wastageFactorPercentage: comp.wastageFactorPercentage,
            baseQuantityRequired: comp.quantityRequired,
            directReqPerNetFgUnit: directReqInStockUom,
            isSubAssembly: comp.classification === "SUB_ASSEMBLY" && Boolean(comp.subAssemblyBOM),
            subAssemblyBOM: comp.subAssemblyBOM,
            convertiblePackagingSummary: stockItem?.convertiblePackagingSummary
        });
    }

    // If any conversion or configuration error occurred, halt with INCOMPLETE_DATA
    if (diagnostics.length > 0) {
        return {
            status: "INCOMPLETE_DATA",
            mode,
            maxFgUnits: 0,
            fullBatches: 0,
            batchRemainderUnits: 0,
            batchSize: bom.stepBatchSize || bom.baseQuantity || 1,
            fgUomName: bom.uom.name,
            limitingComponent: null,
            bottleneckReason: diagnostics[0],
            components: evaluatedDemands.map((ed) => ({
                productId: ed.productId,
                productName: ed.productName,
                productCode: ed.productCode,
                classification: ed.classification,
                baseQuantityRequired: ed.baseQuantityRequired,
                requiredPerNetFgUnit: ed.directReqPerNetFgUnit,
                recipeUomName: ed.recipeUomName,
                wastageFactorPercentage: ed.wastageFactorPercentage,
                eligibleOnHandStock: ed.eligibleOnHandStock,
                activeReservationsDeducted: ed.activeReservationsDeducted,
                netAvailableStock: ed.netAvailableStock,
                stockUomName: ed.stockUomName,
                capacityInFgUnits: 0,
                isLimiting: false,
                convertiblePackagingSummary: ed.convertiblePackagingSummary,
                diagnostic: ed.diagnostic
            })),
            diagnostics,
            isFeasible: false
        };
    }

    // 4. Aggregate Demand Function & Resource Evaluation
    // This evaluates whether Q finished goods can be produced given all intermediate stock
    // and raw materials, strictly aggregating demand to avoid double-counting shared components.
    function evaluateFeasibilityForTarget(Q: number): {
        feasible: boolean;
        failingProductId?: number;
        failingProductName?: string;
    } {
        if (Q <= 0) return { feasible: true };

        // Track total consumed quantity per productId at target Q
        const totalConsumedByProduct = new Map<number, number>();

        // A. Direct Non-SubAssembly Component Demand
        for (const comp of evaluatedDemands) {
            if (!comp.isSubAssembly) {
                const consumed = comp.directReqPerNetFgUnit * Q;
                const prev = totalConsumedByProduct.get(comp.productId) || 0;
                totalConsumedByProduct.set(comp.productId, prev + consumed);
            }
        }

        // B. Multi-Level Sub-Assembly Demand with Intermediate Stock Allocation
        for (const comp of evaluatedDemands) {
            if (comp.isSubAssembly) {
                const subSpec = subAssemblySpecs.get(comp.productId);
                if (!subSpec) continue;

                // Total intermediate units of sub-assembly needed for Q finished goods
                const totalSubNeeded = comp.directReqPerNetFgUnit * Q;

                // Existing intermediate stock available
                const intermediateStockAvailable = comp.netAvailableStock;

                if (intermediateStockAvailable >= totalSubNeeded) {
                    // Fully covered by existing intermediate stock! No compounding needed.
                    // Intermediate stock consumed:
                    const prev = totalConsumedByProduct.get(comp.productId) || 0;
                    totalConsumedByProduct.set(comp.productId, prev + totalSubNeeded);
                } else {
                    // Intermediate stock covers what it can
                    const prev = totalConsumedByProduct.get(comp.productId) || 0;
                    totalConsumedByProduct.set(comp.productId, prev + intermediateStockAvailable);

                    // Deficit that must be compounded from raw materials
                    const deficit = totalSubNeeded - intermediateStockAvailable;

                    // Complete compounding batches needed to satisfy deficit
                    const batchesNeeded = Math.ceil(deficit / subSpec.netBatchOutput);

                    // Explode into child raw materials
                    for (const child of subSpec.childRequirements) {
                        const childConsumed = batchesNeeded * child.quantityRequiredInStockUom;
                        const prevChild = totalConsumedByProduct.get(child.productId) || 0;
                        totalConsumedByProduct.set(child.productId, prevChild + childConsumed);
                    }
                }
            }
        }

        // C. Check total consumed against available stock for every touched material
        for (const [prodId, totalConsumed] of Array.from(totalConsumedByProduct.entries())) {
            const stock = stockMap.get(prodId)?.availableQuantity ?? 0;
            // Epsilon tolerance for floating-point comparison
            if (totalConsumed > stock + 1e-9) {
                const name = stockMap.get(prodId)?.productName ||
                    evaluatedDemands.find((d) => d.productId === prodId)?.productName ||
                    `Product #${prodId}`;
                return {
                    feasible: false,
                    failingProductId: prodId,
                    failingProductName: name
                };
            }
        }

        return { feasible: true };
    }

    // 5. Compute Upper Bound for Search
    // An upper bound is the minimum standalone capacity of direct packaging/raw materials
    let upperBound = Number.MAX_SAFE_INTEGER;
    for (const comp of evaluatedDemands) {
        if (!comp.isSubAssembly && comp.directReqPerNetFgUnit > 0) {
            const individualCapacity = Math.floor(comp.netAvailableStock / comp.directReqPerNetFgUnit);
            if (individualCapacity < upperBound) {
                upperBound = individualCapacity;
            }
        }
    }

    // If upper bound remains untouched (e.g. only sub-assemblies), establish a reasonable bound
    if (upperBound === Number.MAX_SAFE_INTEGER) {
        upperBound = 1_000_000;
    }

    // 6. Binary Search for Exact Max Feasible FG (Whole Units)
    let low = 0;
    let high = Math.max(0, upperBound);
    let maxWholeUnits = 0;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const evalResult = evaluateFeasibilityForTarget(mid);

        if (evalResult.feasible) {
            maxWholeUnits = mid;
            low = mid + 1; // Try higher
        } else {
            high = mid - 1; // Try lower
        }
    }

    // 7. Batch Boundaries and Sizing
    const recipeBatchSize = bom.stepBatchSize || bom.baseQuantity || 1;
    let effectiveFgUnits = maxWholeUnits;

    if (mode === "FULL_BATCHES_ONLY") {
        const fullBatchesCount = Math.floor(maxWholeUnits / recipeBatchSize);
        effectiveFgUnits = fullBatchesCount * recipeBatchSize;
    }

    const fullBatches = Math.floor(effectiveFgUnits / recipeBatchSize);
    const batchRemainderUnits = effectiveFgUnits - (fullBatches * recipeBatchSize);

    // 8. Identify Bottleneck Limiting Component at (maxWholeUnits + 1)
    const bottleneckEval = evaluateFeasibilityForTarget(maxWholeUnits + 1);
    const bottleneckProductId = bottleneckEval.failingProductId;

    // 9. Build Detailed Component Breakdown Grid
    const componentResults: FeasibilityComponentResult[] = [];

    for (const comp of evaluatedDemands) {
        let individualCapacity = 0;
        let subBreakdown: SubAssemblyCapacityBreakdown | undefined;

        if (comp.isSubAssembly) {
            const subSpec = subAssemblySpecs.get(comp.productId);
            const stockCapacity = comp.directReqPerNetFgUnit > 0
                ? Math.floor(comp.netAvailableStock / comp.directReqPerNetFgUnit)
                : 0;

            let compoundingBatches = 0;
            let compoundingCapacity = 0;
            let limitingChildId: number | undefined;
            let limitingChildName: string | undefined;

            if (subSpec && subSpec.childRequirements.length > 0) {
                let minChildBatches = Number.MAX_SAFE_INTEGER;

                for (const child of subSpec.childRequirements) {
                    const childStock = stockMap.get(child.productId)?.availableQuantity ?? 0;
                    const batchesSupported = child.quantityRequiredInStockUom > 0
                        ? Math.floor(childStock / child.quantityRequiredInStockUom)
                        : 0;

                    if (batchesSupported < minChildBatches) {
                        minChildBatches = batchesSupported;
                        limitingChildId = child.productId;
                        limitingChildName = child.productName;
                    }
                }

                compoundingBatches = minChildBatches === Number.MAX_SAFE_INTEGER ? 0 : minChildBatches;
                const totalCompoundedSubUnits = compoundingBatches * subSpec.netBatchOutput;
                compoundingCapacity = comp.directReqPerNetFgUnit > 0
                    ? Math.floor(totalCompoundedSubUnits / comp.directReqPerNetFgUnit)
                    : 0;
            }

            individualCapacity = stockCapacity + compoundingCapacity;

            subBreakdown = {
                intermediateStockAvailable: comp.netAvailableStock,
                intermediateStockUnitCapacity: stockCapacity,
                rawMaterialCompoundingBatches: compoundingBatches,
                rawMaterialCompoundingUnitCapacity: compoundingCapacity,
                limitingRawMaterialId: limitingChildId,
                limitingRawMaterialName: limitingChildName
            };
        } else {
            individualCapacity = comp.directReqPerNetFgUnit > 0
                ? Math.floor(comp.netAvailableStock / comp.directReqPerNetFgUnit)
                : 0;
        }

        const isLimiting = comp.productId === bottleneckProductId ||
            (maxWholeUnits === 0 && individualCapacity === 0);

        componentResults.push({
            productId: comp.productId,
            productName: comp.productName,
            productCode: comp.productCode,
            classification: comp.classification,
            baseQuantityRequired: comp.baseQuantityRequired,
            requiredPerNetFgUnit: comp.directReqPerNetFgUnit,
            recipeUomName: comp.recipeUomName,
            wastageFactorPercentage: comp.wastageFactorPercentage,
            eligibleOnHandStock: comp.eligibleOnHandStock,
            activeReservationsDeducted: comp.activeReservationsDeducted,
            netAvailableStock: comp.netAvailableStock,
            stockUomName: comp.stockUomName,
            capacityInFgUnits: individualCapacity,
            isLimiting,
            subAssemblyBreakdown: subBreakdown,
            convertiblePackagingSummary: comp.convertiblePackagingSummary
        });
    }

    // 10. Formulate Limiting Component & Explanation
    const limitingComponent = componentResults.find((c) => c.isLimiting) ||
        (componentResults.length > 0 ? componentResults.reduce((min, c) => c.capacityInFgUnits < min.capacityInFgUnits ? c : min, componentResults[0]) : null);

    let bottleneckReason: string | undefined;
    if (effectiveFgUnits === 0) {
        if (limitingComponent) {
            bottleneckReason = `Production is not feasible because limiting component "${limitingComponent.productName}" has insufficient eligible stock (${limitingComponent.netAvailableStock} ${limitingComponent.stockUomName} available vs ${limitingComponent.requiredPerNetFgUnit} required per unit).`;
        } else {
            bottleneckReason = "Production is not feasible due to insufficient material stock.";
        }
    } else if (limitingComponent) {
        bottleneckReason = `Maximum output is constrained to ${effectiveFgUnits} ${bom.uom.name} by "${limitingComponent.productName}" (supports ${limitingComponent.capacityInFgUnits} units).`;
    }

    const status: FeasibilityResult["status"] = effectiveFgUnits > 0 ? "PRODUCIBLE" : "NOT_PRODUCIBLE";

    return {
        status,
        mode,
        maxFgUnits: effectiveFgUnits,
        fullBatches,
        batchRemainderUnits,
        batchSize: recipeBatchSize,
        fgUomName: bom.uom.name,
        limitingComponent,
        bottleneckReason,
        components: componentResults,
        diagnostics,
        isFeasible: effectiveFgUnits > 0
    };
}
