"use client";

import React, { useMemo } from "react";
import { Loader2, Calculator, RotateCcw, Layers, MapPin, Package, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { SearchableSelect, type SearchableOption } from "./SearchableSelect";
import type { CapacityCalculationMode } from "../types";

export interface BranchOption {
    id: number;
    branch_name: string;
    branch_code?: string;
}

export interface ProductOption {
    product_id: number;
    product_name?: string | null;
    description?: string | null;
    product_code?: string | null;
}

export interface VersionOption {
    version_id: number;
    version_name: string;
    base_quantity: number | string;
    status: string;
    is_primary?: boolean | number;
    valid_from?: string | null;
    valid_to?: string | null;
}

interface FeasibilityFilterBarProps {
    branches: BranchOption[];
    products: ProductOption[];
    versions: VersionOption[];
    selectedBranchId: number | null;
    selectedProductId: number | null;
    selectedVersionId: number | null;
    mode: CapacityCalculationMode;
    isLoading: boolean;
    isVersionsLoading: boolean;
    onBranchChange: (branchId: number) => void;
    onProductChange: (productId: number) => void;
    onVersionChange: (versionId: number) => void;
    onModeChange: (mode: CapacityCalculationMode) => void;
    onCalculate: () => void;
    onReset: () => void;
}

export const FeasibilityFilterBar: React.FC<FeasibilityFilterBarProps> = ({
    branches,
    products,
    versions,
    selectedBranchId,
    selectedProductId,
    selectedVersionId,
    mode,
    isLoading,
    isVersionsLoading,
    onBranchChange,
    onProductChange,
    onVersionChange,
    onModeChange,
    onCalculate,
    onReset
}) => {
    const branchOptions: SearchableOption[] = useMemo(() => {
        const seen = new Set<number>();
        const list: SearchableOption[] = [];
        for (const b of branches) {
            if (!seen.has(b.id)) {
                seen.add(b.id);
                list.push({
                    value: b.id,
                    label: b.branch_name,
                    subLabel: b.branch_code ? `Code: ${b.branch_code}` : undefined
                });
            }
        }
        return list;
    }, [branches]);

    const productOptions: SearchableOption[] = useMemo(() => {
        const seen = new Set<number>();
        const list: SearchableOption[] = [];
        for (const p of products) {
            if (!seen.has(p.product_id)) {
                seen.add(p.product_id);
                list.push({
                    value: p.product_id,
                    label: p.description || p.product_name || `Product #${p.product_id}`,
                    subLabel: p.product_code ? `SKU: ${p.product_code}` : undefined
                });
            }
        }
        return list;
    }, [products]);

    const uniqueVersions = useMemo(() => {
        const seen = new Set<number>();
        return versions.filter((v) => {
            if (seen.has(v.version_id)) return false;
            seen.add(v.version_id);
            return true;
        });
    }, [versions]);

    const isCalculateDisabled = !selectedBranchId || !selectedProductId || isLoading;

    return (
        <Card className="border border-border/80 shadow-xs bg-card">
            <CardContent className="p-4 sm:p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3.5 items-end">
                    {/* 1. Branch Selector */}
                    <div className="xl:col-span-3 space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                            Production Branch <span className="text-destructive">*</span>
                        </label>
                        <SearchableSelect
                            options={branchOptions}
                            value={selectedBranchId}
                            onChange={(val) => onBranchChange(Number(val))}
                            placeholder="Select branch / plant..."
                            searchPlaceholder="Search branch name or code..."
                            emptyText="No good stock branches found."
                            disabled={isLoading}
                        />
                    </div>

                    {/* 2. Finished Good Selector */}
                    <div className="xl:col-span-3 space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 text-primary" />
                            Finished Good <span className="text-destructive">*</span>
                        </label>
                        <SearchableSelect
                            options={productOptions}
                            value={selectedProductId}
                            onChange={(val) => onProductChange(Number(val))}
                            placeholder="Select finished good..."
                            searchPlaceholder="Search product name or SKU..."
                            emptyText="No finished goods with approved BOMs found."
                            disabled={isLoading}
                        />
                    </div>

                    {/* 3. BOM Version Selector */}
                    <div className="xl:col-span-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                                <Layers className="h-3.5 w-3.5 text-primary" />
                                BOM Version
                            </label>
                            {isVersionsLoading && (
                                <span className="flex items-center text-[10px] text-muted-foreground gap-1">
                                    <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading...
                                </span>
                            )}
                        </div>
                        <Select
                            value={selectedVersionId ? String(selectedVersionId) : ""}
                            onValueChange={(val) => onVersionChange(Number(val))}
                            disabled={isLoading || isVersionsLoading || versions.length === 0}
                        >
                            <SelectTrigger className="h-10 text-xs">
                                <SelectValue placeholder={versions.length === 0 ? "No active versions" : "Select approved version..."} />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                                {uniqueVersions.map((ver, idx) => {
                                    const isPrimary = Number(ver.is_primary) === 1 || ver.is_primary === true;
                                    const dateValidity = ver.valid_from && ver.valid_to
                                        ? `(${ver.valid_from} to ${ver.valid_to})`
                                        : ver.valid_from
                                            ? `(From ${ver.valid_from})`
                                            : "";
                                    return (
                                        <SelectItem key={`${ver.version_id}-${idx}`} value={String(ver.version_id)} className="text-xs py-2">
                                            <div className="flex items-center justify-between w-full gap-2">
                                                <span className="font-medium truncate">
                                                    {ver.version_name}{isPrimary ? " (Primary)" : ""}
                                                </span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {isPrimary && (
                                                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-primary/10 text-primary border-primary/20">
                                                            Primary
                                                        </Badge>
                                                    )}
                                                    {dateValidity && (
                                                        <span className="text-[10px] text-muted-foreground">{dateValidity}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 4. Calculation Mode & Actions */}
                    <div className="xl:col-span-3 flex items-end gap-2">
                        <div className="flex-1 space-y-1.5 min-w-[130px]">
                            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                <Settings2 className="h-3 w-3" /> Mode
                            </label>
                            <Select
                                value={mode}
                                onValueChange={(val) => onModeChange(val as CapacityCalculationMode)}
                                disabled={isLoading}
                            >
                                <SelectTrigger className="h-10 text-xs font-medium">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="WHOLE_UNITS" className="text-xs">
                                        Allow Whole Units
                                    </SelectItem>
                                    <SelectItem value="FULL_BATCHES_ONLY" className="text-xs">
                                        Enforce Full Batches
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                                type="button"
                                onClick={onCalculate}
                                disabled={isCalculateDisabled}
                                className="h-10 px-4 font-medium text-xs shadow-xs"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                        Calculating...
                                    </>
                                ) : (
                                    <>
                                        <Calculator className="mr-1.5 h-3.5 w-3.5" />
                                        Calculate
                                    </>
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={onReset}
                                disabled={isLoading}
                                className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
                                title="Reset filter selections"
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
