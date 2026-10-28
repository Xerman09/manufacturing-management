"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
    ProductOption,
    BomVersionOption,
    BranchOption,
    UnitOption,
    CalculationResult,
} from "../types";
import {
    fetchCalculatorBootstrap,
    fetchProductVersions,
    fetchProductUnits,
    calculateMaterialRequirements,
} from "../services/calculator.service";

export function useCalculator() {
    // Bootstrap data
    const [products, setProducts] = useState<ProductOption[]>([]);
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [globalUnits, setGlobalUnits] = useState<UnitOption[]>([]);
    const [productUnits, setProductUnits] = useState<UnitOption[]>([]);
    const [isLoadingBootstrap, setIsLoadingBootstrap] = useState(true);

    // Form selection state
    const [selectedProductId, setSelectedProductId] = useState("");
    const [versions, setVersions] = useState<BomVersionOption[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState("");
    const [selectedBranchId, setSelectedBranchId] = useState("");
    const [targetQuantity, setTargetQuantity] = useState("100");
    const [selectedUomId, setSelectedUomId] = useState("");
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);
    const [isLoadingUnits, setIsLoadingUnits] = useState(false);

    // Calculation output state (only updated on explicit calculate)
    const [calculationResult, setCalculationResult] = useState<CalculationResult | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [isAssumptionsOpen, setIsAssumptionsOpen] = useState(false);

    // Initial load
    useEffect(() => {
        let isMounted = true;
        async function loadBootstrap() {
            try {
                setIsLoadingBootstrap(true);
                const data = await fetchCalculatorBootstrap();
                if (isMounted) {
                    setProducts(data.products || []);
                    setBranches(data.branches || []);
                    setGlobalUnits(data.units || []);

                    // Default branch if available
                    if (data.branches && data.branches.length > 0) {
                        setSelectedBranchId(String(data.branches[0].id));
                    }
                }
            } catch (err) {
                console.error("Failed to load calculator setup:", err);
                toast.error("Could not load products or branch list.");
            } finally {
                if (isMounted) setIsLoadingBootstrap(false);
            }
        }

        loadBootstrap();
        return () => {
            isMounted = false;
        };
    }, []);

    // When product changes, fetch both its BOM versions and its adaptable units
    const handleProductChange = useCallback(
        async (productId: string) => {
            setSelectedProductId(productId);
            setSelectedVersionId("");
            setVersions([]);
            setProductUnits([]);
            setSelectedUomId("");

            if (!productId) return;

            const numericPid = Number(productId);
            const selectedProd = products.find((p) => String(p.productId) === productId);

            try {
                setIsLoadingVersions(true);
                setIsLoadingUnits(true);

                const [vers, uoms] = await Promise.all([
                    fetchProductVersions(numericPid),
                    fetchProductUnits(numericPid)
                ]);

                setVersions(vers);
                setProductUnits(uoms);

                // Auto-select primary or first active version
                const primary = vers.find((v) => v.isPrimary) || vers.find((v) => v.status === "Active") || vers[0];
                if (primary) {
                    setSelectedVersionId(String(primary.versionId));
                }

                // Default unit: strictly lock to selected FG product's unit of measurement
                if (selectedProd?.unitId) {
                    setSelectedUomId(String(selectedProd.unitId));
                } else if (uoms.length > 0) {
                    const base = uoms.find((u) => u.isBase) || uoms[0];
                    setSelectedUomId(String(base.unitId));
                }
            } catch (err) {
                console.error("Error loading product versions or units:", err);
                toast.error("Failed to load recipe details or packaging units.");
            } finally {
                setIsLoadingVersions(false);
                setIsLoadingUnits(false);
            }
        },
        [products]
    );

    // When version changes, update selectedVersionId
    const handleVersionChange = useCallback(
        (versionId: string) => {
            setSelectedVersionId(versionId);
        },
        []
    );

    // Calculate action
    const handleCalculate = useCallback(async () => {
        if (!selectedProductId) {
            toast.warning("Please select a finished good product.");
            return;
        }
        if (!selectedVersionId) {
            toast.warning("Please select a BOM recipe version.");
            return;
        }
        if (!selectedBranchId) {
            toast.warning("Please select a branch.");
            return;
        }
        const qty = Number(targetQuantity);
        if (!Number.isFinite(qty) || qty <= 0) {
            toast.warning("Target quantity must be greater than zero.");
            return;
        }

        try {
            setIsCalculating(true);
            const result = await calculateMaterialRequirements({
                productId: Number(selectedProductId),
                versionId: Number(selectedVersionId),
                branchId: Number(selectedBranchId),
                targetQuantity: qty,
                targetUomId: selectedUomId ? Number(selectedUomId) : undefined,
            });

            setCalculationResult(result);
            if (result.verdict === "Sufficient") {
                toast.success("Calculation complete: All materials are sufficient!");
            } else if (result.verdict === "Shortage") {
                toast.warning(`Shortage detected on ${result.summary.shortageCount} component(s).`);
            } else {
                toast.info("Calculation complete with incomplete recipe indicators.");
            }
        } catch (err) {
            console.error("Calculation error:", err);
            toast.error((err as Error).message || "Calculation failed.");
        } finally {
            setIsCalculating(false);
        }
    }, [selectedProductId, selectedVersionId, selectedBranchId, targetQuantity, selectedUomId]);

    // Reset action
    const handleReset = useCallback(() => {
        setSelectedProductId("");
        setSelectedVersionId("");
        setVersions([]);
        setTargetQuantity("100");
        setSelectedUomId("");
        setCalculationResult(null);
    }, []);

    return {
        products,
        branches,
        units: productUnits.length > 0 ? productUnits : globalUnits,
        versions,
        isLoadingBootstrap,
        isLoadingVersions,
        isLoadingUnits,
        isCalculating,
        selectedProductId,
        selectedVersionId,
        selectedBranchId,
        targetQuantity,
        selectedUomId,
        calculationResult,
        isAssumptionsOpen,
        setIsAssumptionsOpen,
        setSelectedBranchId,
        setTargetQuantity,
        setSelectedUomId,
        handleProductChange,
        handleVersionChange,
        handleCalculate,
        handleReset,
    };
}
