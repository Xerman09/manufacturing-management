"use client";

import React from "react";
import {
    X,
    Info,
    Scale,
    Layers,
    AlertCircle,
    Building2,
} from "lucide-react";
import { CalculationResult } from "../types";

interface AssumptionsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    result: CalculationResult | null;
}

export const AssumptionsDrawer: React.FC<AssumptionsDrawerProps> = ({
    isOpen,
    onClose,
    result,
}) => {
    if (!isOpen || !result) return null;

    const { finishedGood, assumptions, branch, targetQuantity, targetUomShortcut } = result;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur-xs transition-opacity animate-in fade-in">
            <div
                className="w-full max-w-md bg-card border-l border-border h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200"
            >
                {/* Header */}
                <div className="p-4 border-b border-border/80 flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-semibold text-foreground">
                            Recipe & Calculation Assumptions
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
                    {/* Finished Good Profile */}
                    <div className="space-y-2 bg-muted/30 p-3.5 rounded-xl border border-border/60">
                        <div className="flex items-center gap-2 font-semibold text-foreground">
                            <Layers className="h-4 w-4 text-primary" />
                            <span>Finished Good Recipe Profile</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1 text-muted-foreground">
                            <div>
                                <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                                    Product
                                </span>
                                <span className="text-foreground font-medium">
                                    {finishedGood.productName}
                                </span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                                    Product Code
                                </span>
                                <span className="text-foreground font-mono">
                                    {finishedGood.productCode}
                                </span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                                    Recipe Version
                                </span>
                                <span className="text-foreground font-medium">
                                    {finishedGood.versionName}
                                </span>
                            </div>
                            <div>
                                <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                                    BOM Base Quantity
                                </span>
                                <span className="text-foreground font-mono font-bold">
                                    {finishedGood.baseQuantity.toLocaleString()} {finishedGood.baseUomShortcut}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Mathematical Assumptions */}
                    <div className="space-y-2 bg-muted/30 p-3.5 rounded-xl border border-border/60">
                        <div className="flex items-center gap-2 font-semibold text-foreground">
                            <Scale className="h-4 w-4 text-primary" />
                            <span>Applied Mathematical Factors</span>
                        </div>
                        <div className="space-y-2 pt-1 text-muted-foreground">
                            <div className="flex items-center justify-between">
                                <span>Target Output:</span>
                                <span className="font-semibold text-foreground">
                                    {targetQuantity.toLocaleString()} {targetUomShortcut}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>Derived Scaling Factor:</span>
                                <span className="font-mono font-semibold text-foreground">
                                    {assumptions.scalingFactor}×
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>Recipe Expected Yield:</span>
                                <span className="font-semibold text-foreground">
                                    {finishedGood.expectedYieldPercentage}%
                                </span>
                            </div>
                            {assumptions.appliedDensityFactor && (
                                <div className="flex items-center justify-between">
                                    <span>Applied Density Factor:</span>
                                    <span className="font-mono font-semibold text-foreground">
                                        {assumptions.appliedDensityFactor} kg/L
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Facility & Execution */}
                    <div className="space-y-2 bg-muted/30 p-3.5 rounded-xl border border-border/60">
                        <div className="flex items-center gap-2 font-semibold text-foreground">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span>Stock Comparison Scope</span>
                        </div>
                        <div className="space-y-1.5 pt-1 text-muted-foreground">
                            <div className="flex items-center justify-between">
                                <span>Selected Facility:</span>
                                <span className="font-semibold text-foreground">
                                    {branch.branchName}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span>Calculation Timestamp:</span>
                                <span className="font-mono text-[11px] text-foreground">
                                    {new Date(assumptions.calculationTimestamp).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Legal / Operational Notice */}
                    <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold">
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span>Operational Disclaimer</span>
                        </div>
                        <p className="text-[11px] leading-relaxed">
                            {assumptions.disclaimer}
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border/80 bg-muted/20 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
