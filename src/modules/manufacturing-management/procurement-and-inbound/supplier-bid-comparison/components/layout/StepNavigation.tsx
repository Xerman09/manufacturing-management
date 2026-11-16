"use client";

import React from "react";
import { Check, Sliders, Users, BarChart3, Award, FileSpreadsheet } from "lucide-react";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { evaluateAndCompareSuppliers } from "../../engine/scoring-engine";
import { cn } from "@/lib/utils";

export const StepNavigation: React.FC = () => {
    const { currentProject, currentStep, setCurrentStep } = useBidComparisonStore();

    if (!currentProject) return null;

    const summary = evaluateAndCompareSuppliers(currentProject);
    const recSupplier = summary.recommendedBidId
        ? currentProject.bids.find((b) => b.id === summary.recommendedBidId)?.supplierName
        : null;

    const awardedCount = currentProject.awards?.length || 0;
    const totalItems = currentProject.items?.length || 0;

    const steps = [
        {
            num: 1,
            title: "Setup",
            subtitle: `${totalItems} items · ${currentProject.comparisonCurrency || "PHP"}`,
            icon: Sliders,
            hasContent: totalItems > 0,
        },
        {
            num: 2,
            title: "Bids",
            subtitle: `${currentProject.bids.length} suppliers`,
            icon: Users,
            hasContent: currentProject.bids.length > 0,
        },
        {
            num: 3,
            title: "Compare",
            subtitle: recSupplier ? `Rec: ${recSupplier}` : "Evaluate bids",
            icon: BarChart3,
            hasContent: currentProject.bids.length > 0 && totalItems > 0,
        },
        {
            num: 4,
            title: "Award & Approval",
            subtitle: `${awardedCount}/${totalItems} awarded · ${currentProject.status}`,
            icon: Award,
            hasContent: awardedCount > 0,
        },
        {
            num: 5,
            title: "Abstract of Bids",
            subtitle: "Audit Summary & Sign",
            icon: FileSpreadsheet,
            hasContent: currentProject.status === "Approved" || awardedCount > 0,
        },
    ];

    return (
        <div className="w-full bg-muted/40 border-b p-2 print:hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {steps.map((s) => {
                    const isActive = currentStep === s.num;
                    const Icon = s.icon;
                    return (
                        <button
                            key={s.num}
                            onClick={() => setCurrentStep(s.num)}
                            className={cn(
                                "flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all relative overflow-hidden",
                                isActive
                                    ? "bg-card text-foreground border-primary shadow-xs ring-1 ring-primary/20"
                                    : "bg-background/80 text-muted-foreground border-border hover:bg-card hover:text-foreground hover:border-border/80"
                            )}
                        >
                            <div
                                className={cn(
                                    "flex items-center justify-center h-7 w-7 rounded-md text-xs font-semibold shrink-0 transition-colors",
                                    isActive
                                        ? "bg-primary text-primary-foreground"
                                        : s.hasContent
                                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                            : "bg-muted text-muted-foreground"
                                )}
                            >
                                {s.hasContent ? (
                                    <Check className="h-4 w-4" />
                                ) : (
                                    <span>{s.num}</span>
                                )}
                            </div>

                            <div className="flex flex-col min-w-0 flex-1">
                                <span className={cn("text-xs font-medium truncate", isActive && "font-bold text-primary")}>
                                    {s.title}
                                </span>
                                <span className="text-[10px] text-muted-foreground truncate">
                                    {s.subtitle}
                                </span>
                            </div>

                            <Icon className={cn("h-4 w-4 shrink-0 opacity-40 hidden xl:block", isActive && "opacity-80 text-primary")} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
