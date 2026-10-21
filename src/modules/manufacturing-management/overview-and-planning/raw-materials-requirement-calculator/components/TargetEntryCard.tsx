"use client";

import React, { useMemo } from "react";
import {
    Calculator,
    Building2,
    Package,
    Layers,
    RotateCcw,
    Scale,
    Sparkles,
} from "lucide-react";
import {
    ProductOption,
    BomVersionOption,
    BranchOption,
    UnitOption,
} from "../types";
import {
    SearchableSelect,
    SearchableSelectOption,
} from "@/modules/manufacturing-management/shared/components/SearchableSelect";

interface TargetEntryCardProps {
    products: ProductOption[];
    versions: BomVersionOption[];
    branches: BranchOption[];
    units: UnitOption[];
    selectedProductId: string;
    selectedVersionId: string;
    selectedBranchId: string;
    targetQuantity: string;
    selectedUomId: string;
    isLoadingVersions: boolean;
    isCalculating: boolean;
    onProductChange: (id: string) => void;
    onVersionChange: (id: string) => void;
    onBranchChange: (id: string) => void;
    onTargetQuantityChange: (qty: string) => void;
    onUomChange: (uomId: string) => void;
    onCalculate: () => void;
    onReset: () => void;
}

export const TargetEntryCard: React.FC<TargetEntryCardProps> = ({
    products,
    versions,
    branches,
    units,
    selectedProductId,
    selectedVersionId,
    selectedBranchId,
    targetQuantity,
    selectedUomId,
    isLoadingVersions,
    isCalculating,
    onProductChange,
    onVersionChange,
    onBranchChange,
    onTargetQuantityChange,
    onUomChange,
    onCalculate,
    onReset,
}) => {
    // 1. Finished Goods Dropdown Options
    const productOptions: SearchableSelectOption[] = useMemo(() => {
        return products.map((p) => ({
            value: String(p.productId),
            label: `${p.productCode ? `[${p.productCode}] ` : ""}${p.productName}`,
        }));
    }, [products]);

    // 2. BOM Version Dropdown Options
    const versionOptions: SearchableSelectOption[] = useMemo(() => {
        return versions.map((v) => ({
            value: String(v.versionId),
            label: `${v.versionName} (Base: ${v.baseQuantity} ${v.uomShortcut || ""}${v.isPrimary ? " - Primary" : ""})`,
        }));
    }, [versions]);

    // 3. Branch Dropdown Options
    const branchOptions: SearchableSelectOption[] = useMemo(() => {
        return branches.map((b) => ({
            value: String(b.id),
            label: b.branchCode ? `[${b.branchCode}] ${b.branchName}` : b.branchName,
        }));
    }, [branches]);

    // 4. Units Dropdown Options
    const unitOptions: SearchableSelectOption[] = useMemo(() => {
        return units.map((u) => ({
            value: String(u.unitId),
            label: `${u.unitName} (${u.unitShortcut})`,
        }));
    }, [units]);

    const canCalculate =
        Boolean(selectedProductId) &&
        Boolean(selectedVersionId) &&
        Boolean(selectedBranchId) &&
        Number(targetQuantity) > 0;

    return (
        <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Scale className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-foreground tracking-tight">
                            Simulation Target & Parameters
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            Specify target output, BOM recipe version, and branch to evaluate component stock sufficiency.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                        type="button"
                        onClick={onReset}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-medium text-foreground transition-all cursor-pointer"
                    >
                        <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Reset</span>
                    </button>
                    <button
                        type="button"
                        onClick={onCalculate}
                        disabled={!canCalculate || isCalculating}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <Calculator className={`h-3.5 w-3.5 ${isCalculating ? "animate-spin" : ""}`} />
                        <span>{isCalculating ? "Calculating..." : "Calculate Requirements"}</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* 1. Finished Good Product */}
                <div className="min-w-0 space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">Finished Good Product</span>
                        <span className="text-destructive">*</span>
                    </label>
                    <div className="w-full min-w-0">
                        <SearchableSelect
                            options={productOptions}
                            value={selectedProductId}
                            onValueChange={onProductChange}
                            placeholder="Select Finished Good..."
                            searchPlaceholder="Search product by name or code..."
                            className="h-9 text-xs w-full"
                        />
                    </div>
                </div>

                {/* 2. BOM Version */}
                <div className="min-w-0 space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">BOM Version</span>
                        <span className="text-destructive">*</span>
                    </label>
                    <div className="w-full min-w-0">
                        <SearchableSelect
                            options={versionOptions}
                            value={selectedVersionId}
                            onValueChange={onVersionChange}
                            placeholder={isLoadingVersions ? "Loading versions..." : "Select Recipe..."}
                            searchPlaceholder="Search BOM version..."
                            disabled={!selectedProductId || isLoadingVersions}
                            className="h-9 text-xs w-full"
                        />
                    </div>
                </div>

                {/* 3. Branch / Warehouse Location */}
                <div className="min-w-0 space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">Branch / Plant Stock</span>
                        <span className="text-destructive">*</span>
                    </label>
                    <div className="w-full min-w-0">
                        <SearchableSelect
                            options={branchOptions}
                            value={selectedBranchId}
                            onValueChange={onBranchChange}
                            placeholder="Select Branch..."
                            searchPlaceholder="Search branch..."
                            className="h-9 text-xs w-full"
                        />
                    </div>
                </div>

                {/* 4. Target Output Quantity & UOM */}
                <div className="min-w-0 space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate">Target Output</span>
                        <span className="text-destructive">*</span>
                    </label>
                    <div className="flex items-center gap-1.5 min-w-0 w-full">
                        <input
                            type="number"
                            min="0.0001"
                            step="any"
                            value={targetQuantity}
                            onChange={(e) => onTargetQuantityChange(e.target.value)}
                            placeholder="e.g. 100"
                            className="min-w-0 flex-1 h-9 rounded-md border border-input bg-background px-2.5 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <div className="w-24 shrink-0">
                            <SearchableSelect
                                options={unitOptions}
                                value={selectedUomId}
                                onValueChange={onUomChange}
                                placeholder="UOM"
                                className="h-9 text-xs w-full"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
