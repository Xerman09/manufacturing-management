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
    calculateMaterialRequirements,
} from "../services/calculator.service";

export function useCalculator() {
    // Bootstrap data
    const [products, setProducts] = useState<ProductOption[]>([]);
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [units, setUnits] = useState<UnitOption[]>([]);
    const [isLoadingBootstrap, setIsLoadingBootstrap] = useState(true);

    // Form selection state
    const [selectedProductId, setSelectedProductId] = useState("");
    const [versions, setVersions] = useState<BomVersionOption[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState("");
    const [selectedBranchId, setSelectedBranchId] = useState("");
    const [targetQuantity, setTargetQuantity] = useState("100");
    const [selectedUomId, setSelectedUomId] = useState("");
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);

    // Calculation output state
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
                    setUnits(data.units || []);

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

    // When product changes, fetch its BOM versions
    const handleProductChange = useCallback(
        async (productId: string) => {
            setSelectedProductId(productId);
            setSelectedVersionId("");
            setVersions([]);
            setCalculationResult(null);

            if (!productId) return;

            const selectedProd = products.find((p) => String(p.productId) === productId);
            if (selectedProd && selectedProd.unitId) {
                setSelectedUomId(String(selectedProd.unitId));
            }

            try {
                setIsLoadingVersions(true);
                const vers = await fetchProductVersions(Number(productId));
                setVersions(vers);

                // Auto-select primary or first active version
                const primary = vers.find((v) => v.isPrimary) || vers.find((v) => v.status === "Active") || vers[0];
                if (primary) {
                    setSelectedVersionId(String(primary.versionId));
                    if (primary.uomId) {
                        setSelectedUomId(String(primary.uomId));
                    }
                }
            } catch (err) {
                console.error("Error loading versions:", err);
                toast.error("Failed to load recipe versions for selected product.");
            } finally {
                setIsLoadingVersions(false);
            }
        },
        [products]
    );

    // When version changes, sync default UOM
    const handleVersionChange = useCallback(
        (versionId: string) => {
            setSelectedVersionId(versionId);
            setCalculationResult(null);
            const found = versions.find((v) => String(v.versionId) === versionId);
            if (found && found.uomId) {
                setSelectedUomId(String(found.uomId));
            }
        },
        [versions]
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
        units,
        versions,
        isLoadingBootstrap,
        isLoadingVersions,
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
