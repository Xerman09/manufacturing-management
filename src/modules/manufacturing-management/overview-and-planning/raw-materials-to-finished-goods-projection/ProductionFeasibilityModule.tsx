"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
    AlertCircle,
    Info
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    FeasibilityFilterBar,
    type BranchOption,
    type ProductOption,
    type VersionOption
} from "./components/FeasibilityFilterBar";
import { FeasibilitySummaryCards } from "./components/FeasibilitySummaryCards";
import { ComponentCapacityGrid } from "./components/ComponentCapacityGrid";
import { StockBreakdownModal } from "./components/StockBreakdownModal";
import type {
    FeasibilityResult,
    FeasibilityComponentResult,
    CapacityCalculationMode
} from "./types";

const API_BASE = "/api/manufacturing/overview-and-planning/raw-materials-to-finished-goods-projection";

export default function ProductionFeasibilityModule() {
    // Dropdown options
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [products, setProducts] = useState<ProductOption[]>([]);
    const [versions, setVersions] = useState<VersionOption[]>([]);

    // Selected filters
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
    const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
    const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
    const [mode, setMode] = useState<CapacityCalculationMode>("WHOLE_UNITS");

    // Loading & Network states
    const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
    const [isVersionsLoading, setIsVersionsLoading] = useState<boolean>(false);
    const [isCalculating, setIsCalculating] = useState<boolean>(false);
    const [calculationError, setCalculationError] = useState<string | null>(null);

    // Results & Modal
    const [result, setResult] = useState<FeasibilityResult | null>(null);
    const [selectedComponentForLots, setSelectedComponentForLots] = useState<FeasibilityComponentResult | null>(null);
    const [isLotsModalOpen, setIsLotsModalOpen] = useState<boolean>(false);

    // Concurrency control to avoid stale response overwrites
    const activeRequestIdRef = useRef<number>(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Load initial branches and finished goods
    useEffect(() => {
        let isMounted = true;
        const loadInitialData = async () => {
            setIsInitialLoading(true);
            try {
                const [branchesRes, productsRes] = await Promise.all([
                    fetch(`${API_BASE}?action=branches`, { cache: "no-store" }),
                    fetch(`${API_BASE}?action=products`, { cache: "no-store" })
                ]);

                if (!branchesRes.ok) throw new Error(`Failed to load branches (${branchesRes.status})`);
                if (!productsRes.ok) throw new Error(`Failed to load finished goods (${productsRes.status})`);

                const branchesData = await branchesRes.json();
                const productsData = await productsRes.json();

                if (isMounted) {
                    if (branchesData.ok && Array.isArray(branchesData.branches)) {
                        setBranches(branchesData.branches);
                    }
                    if (productsData.ok && Array.isArray(productsData.products)) {
                        setProducts(productsData.products);
                    }
                }
            } catch (err) {
                if (isMounted) {
                    const msg = err instanceof Error ? err.message : String(err);
                    toast.error("Initialization Failed", {
                        description: `Could not load reference data: ${msg}`
                    });
                }
            } finally {
                if (isMounted) {
                    setIsInitialLoading(false);
                }
            }
        };

        loadInitialData();
        return () => {
            isMounted = false;
        };
    }, []);

    // Load approved BOM versions when selected product changes
    const loadVersionsForProduct = useCallback(async (productId: number) => {
        setIsVersionsLoading(true);
        setVersions([]);
        setSelectedVersionId(null);

        try {
            const res = await fetch(
                `${API_BASE}?action=versions&productId=${productId}`,
                { cache: "no-store" }
            );
            const data = await res.json();

            if (!res.ok || !data.ok) {
                const msg = data?.error || `Failed loading BOM versions (${res.status})`;
                toast.error("BOM Versions Error", { description: msg });
                return;
            }

            const versList: VersionOption[] = Array.isArray(data.versions) ? data.versions : [];
            setVersions(versList);

            // Auto-select primary version if available, or first approved version
            if (versList.length > 0) {
                const primary = versList.find((v) => Number(v.is_primary) === 1 || v.is_primary === true);
                if (primary) {
                    setSelectedVersionId(primary.version_id);
                } else {
                    setSelectedVersionId(versList[0].version_id);
                }
            } else {
                toast.warning("No Active BOM", {
                    description: "This finished good does not have an approved active BOM version."
                });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast.error("Network Error", {
                description: `Unable to fetch versions: ${msg}`
            });
        } finally {
            setIsVersionsLoading(false);
        }
    }, []);

    // Handle Product Selection Change
    const handleProductChange = (productId: number) => {
        setSelectedProductId(productId);
        setResult(null);
        setCalculationError(null);
        loadVersionsForProduct(productId);
    };

    // Handle Branch Selection Change
    const handleBranchChange = (branchId: number) => {
        setSelectedBranchId(branchId);
        setResult(null);
        setCalculationError(null);
    };

    // Handle Version Selection Change
    const handleVersionChange = (versionId: number) => {
        setSelectedVersionId(versionId);
        setResult(null);
        setCalculationError(null);
    };

    // Handle Mode Change
    const handleModeChange = (newMode: CapacityCalculationMode) => {
        setMode(newMode);
        // If results already exist, clear so user explicitly recalculates with new mode
        if (result) {
            setResult(null);
        }
    };

    // Reset Filters
    const handleReset = () => {
        setSelectedBranchId(null);
        setSelectedProductId(null);
        setSelectedVersionId(null);
        setVersions([]);
        setResult(null);
        setCalculationError(null);
        toast.info("Selections Reset", {
            description: "Filter parameters have been cleared."
        });
    };

    // Execute Feasibility Calculation
    const handleCalculate = async () => {
        if (!selectedBranchId || !selectedProductId) {
            toast.error("Validation Error", {
                description: "Please select both a production branch and finished good."
            });
            return;
        }

        // Cancel any pending request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const currentRequestId = ++activeRequestIdRef.current;
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsCalculating(true);
        setCalculationError(null);

        try {
            const queryParams = new URLSearchParams({
                branchId: String(selectedBranchId),
                productId: String(selectedProductId),
                mode
            });
            if (selectedVersionId) {
                queryParams.set("versionId", String(selectedVersionId));
            }

            const res = await fetch(`${API_BASE}?${queryParams.toString()}`, {
                signal: controller.signal,
                cache: "no-store"
            });

            const data = await res.json();

            // Ignore stale response if a newer query was launched
            if (currentRequestId !== activeRequestIdRef.current) {
                return;
            }

            if (!res.ok || !data.ok) {
                const errMsg = data?.error || `Calculation failed (${res.status})`;
                setCalculationError(errMsg);
                toast.error("Calculation Error", { description: errMsg });
                setResult(null);
                return;
            }

            const calcResult: FeasibilityResult = data.result;
            setResult(calcResult);

            if (calcResult.status === "PRODUCIBLE") {
                toast.success("Feasibility Calculated", {
                    description: `Producible: ${calcResult.maxFgUnits.toLocaleString()} ${calcResult.fgUomName} (${calcResult.fullBatches} batches).`
                });
            } else if (calcResult.status === "NOT_PRODUCIBLE") {
                toast.warning("Production Constrained", {
                    description: calcResult.bottleneckReason || "Material shortage prevents batch execution."
                });
            } else {
                toast.error("Incomplete Data", {
                    description: calcResult.bottleneckReason || "Missing BOM, conversions, or inventory records."
                });
            }
        } catch (err: unknown) {
            if (err instanceof Error && err.name === "AbortError") {
                return; // User triggered a newer request; safely ignore
            }
            if (currentRequestId === activeRequestIdRef.current) {
                const msg = err instanceof Error ? err.message : String(err);
                setCalculationError(msg);
                toast.error("Network Error", {
                    description: `Failed to execute feasibility calculation: ${msg}`
                });
                setResult(null);
            }
        } finally {
            if (currentRequestId === activeRequestIdRef.current) {
                setIsCalculating(false);
            }
        }
    };

    // Open Lot Breakdown Modal
    const handleViewLots = (component: FeasibilityComponentResult) => {
        setSelectedComponentForLots(component);
        setIsLotsModalOpen(true);
    };

    const selectedBranch = branches.find((b) => b.id === selectedBranchId);

    return (
        <div className="space-y-6 pb-12">
            {/* Header Ribbon */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                            Raw Materials to Finished Goods Projection
                        </h1>
                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                            Read-Only
                        </Badge>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                        Estimate how many finished goods can be produced from live eligible materials using approved recipe versions.
                    </p>
                </div>
            </div>

            {/* Filter Bar */}
            <FeasibilityFilterBar
                branches={branches}
                products={products}
                versions={versions}
                selectedBranchId={selectedBranchId}
                selectedProductId={selectedProductId}
                selectedVersionId={selectedVersionId}
                mode={mode}
                isLoading={isCalculating || isInitialLoading}
                isVersionsLoading={isVersionsLoading}
                onBranchChange={handleBranchChange}
                onProductChange={handleProductChange}
                onVersionChange={handleVersionChange}
                onModeChange={handleModeChange}
                onCalculate={handleCalculate}
                onReset={handleReset}
            />

            {/* Error Notification Alert */}
            {calculationError && (
                <Alert variant="destructive" className="border-rose-500/20 bg-rose-500/5">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-sm font-semibold">Calculation Failure</AlertTitle>
                    <AlertDescription className="text-xs mt-1">
                        {calculationError}
                    </AlertDescription>
                </Alert>
            )}

            {/* Diagnostics Warnings Banner */}
            {result && result.diagnostics.length > 0 && (
                <Alert className="border-amber-500/20 bg-amber-500/5 text-amber-900 dark:text-amber-200">
                    <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertTitle className="text-xs font-semibold">Diagnostics &amp; System Observations</AlertTitle>
                    <AlertDescription className="text-xs mt-1 space-y-1">
                        {result.diagnostics.map((diag, idx) => (
                            <div key={idx} className="flex items-start gap-1">
                                <span>•</span>
                                <span>{diag}</span>
                            </div>
                        ))}
                    </AlertDescription>
                </Alert>
            )}

            {/* Feasibility Summary Cards */}
            <FeasibilitySummaryCards
                result={result}
                isLoading={isCalculating}
            />

            {/* Component Capacity Grid Table */}
            {result && (
                <ComponentCapacityGrid
                    components={result.components}
                    isLoading={isCalculating}
                    onViewLots={handleViewLots}
                    fgUomName={result.fgUomName}
                    batchSize={result.batchSize}
                />
            )}

            {/* Stock Breakdown Modal */}
            <StockBreakdownModal
                isOpen={isLotsModalOpen}
                onClose={() => setIsLotsModalOpen(false)}
                component={selectedComponentForLots}
                branchId={selectedBranchId}
                branchName={selectedBranch?.branch_name}
                batchSize={result?.batchSize}
                fgUomName={result?.fgUomName}
            />
        </div>
    );
}
