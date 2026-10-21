"use client";

import React from "react";
import {
    Calculator,
    Sparkles,
} from "lucide-react";
import { useCalculator } from "./hooks/useCalculator";
import { TargetEntryCard } from "./components/TargetEntryCard";
import { CalculationSummaryBanner } from "./components/CalculationSummaryBanner";
import { RequirementsGrid } from "./components/RequirementsGrid";
import { AssumptionsDrawer } from "./components/AssumptionsDrawer";

export default function RawMaterialsCalculatorModule() {
    const {
        products,
        branches,
        units,
        versions,
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
    } = useCalculator();

    return (
        <div className="space-y-5 max-w-7xl mx-auto pb-12">
            {/* 1. Header Cockpit Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card border border-border/70 p-4.5 rounded-xl shadow-xs">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                        <h1 className="text-xl font-bold tracking-tight text-foreground">
                            Raw Materials Requirement Calculator
                        </h1>
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            <Calculator className="h-3.5 w-3.5" /> Planning Simulation
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Simulate component and packaging materials required for a target Finished Goods output against live eligible inventory.
                    </p>
                </div>
            </div>

            {/* 2. Target Entry Form */}
            <TargetEntryCard
                products={products}
                versions={versions}
                branches={branches}
                units={units}
                selectedProductId={selectedProductId}
                selectedVersionId={selectedVersionId}
                selectedBranchId={selectedBranchId}
                targetQuantity={targetQuantity}
                selectedUomId={selectedUomId}
                isLoadingVersions={isLoadingVersions}
                isCalculating={isCalculating}
                onProductChange={handleProductChange}
                onVersionChange={handleVersionChange}
                onBranchChange={setSelectedBranchId}
                onTargetQuantityChange={setTargetQuantity}
                onUomChange={setSelectedUomId}
                onCalculate={handleCalculate}
                onReset={handleReset}
            />

            {/* 3. Output Section */}
            {calculationResult ? (
                <div className="space-y-4 animate-in fade-in duration-300">
                    {/* Summary Banner */}
                    <CalculationSummaryBanner
                        result={calculationResult}
                        onOpenAssumptions={() => setIsAssumptionsOpen(true)}
                    />

                    {/* Requirements Results Table */}
                    <RequirementsGrid
                        components={calculationResult.components}
                        finishedGoodName={calculationResult.finishedGood.productName}
                        targetQuantity={calculationResult.targetQuantity}
                        targetUom={calculationResult.targetUomShortcut}
                        branchName={calculationResult.branch.branchName}
                    />
                </div>
            ) : (
                /* Empty / Awaiting Calculation Prompt */
                <div className="bg-card/60 border border-dashed border-border rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Sparkles className="h-6 w-6" />
                    </div>
                    <div className="max-w-md">
                        <h3 className="text-sm font-semibold text-foreground">
                            Ready to Calculate Component Requirements
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            Choose a Finished Good product, select the desired BOM version and branch, enter your target quantity, and click{" "}
                            <span className="font-semibold text-foreground">Calculate Requirements</span> to view nominal requirements and inventory shortages.
                        </p>
                    </div>
                </div>
            )}

            {/* 4. Slide-out Assumptions Drawer */}
            <AssumptionsDrawer
                isOpen={isAssumptionsOpen}
                onClose={() => setIsAssumptionsOpen(false)}
                result={calculationResult}
            />
        </div>
    );
}
