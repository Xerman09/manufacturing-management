"use client";

import React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useBidComparisonStore, isRfqProjectLocked } from "../../hooks/useBidComparisonState";
import { validateStepForNext } from "../../utils/step-validation";

const STEP_LABELS: Record<number, string> = {
    1: "Setup",
    2: "Bids",
    3: "Compare",
    4: "Award & Approval",
    5: "Abstract of Bids",
};

export const StepFooterNavigation: React.FC = () => {
    const {
        currentProject,
        currentStep,
        setCurrentStep,
        setActiveBidId,
        setValidationErrors,
        clearValidationErrors,
    } = useBidComparisonStore();

    if (!currentProject) return null;

    const isLocked = isRfqProjectLocked(currentProject);
    const totalSteps = 5;

    const scrollToTop = () => {
        if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "smooth" });
            document.querySelectorAll("main").forEach((el) => {
                el.scrollTo({ top: 0, behavior: "smooth" });
            });
        }
    };

    const handlePrevious = () => {
        if (currentStep <= 1) return;
        clearValidationErrors();
        setCurrentStep(currentStep - 1);
        scrollToTop();
    };

    const handleNext = () => {
        if (currentStep >= totalSteps) return;

        if (!isLocked) {
            const result = validateStepForNext(currentStep, currentProject);
            if (!result.isValid) {
                setValidationErrors(result.errors);
                if (result.firstFocusBidId) {
                    setActiveBidId(result.firstFocusBidId);
                }
                const preview = result.messages.slice(0, 4).join(", ");
                const remaining = result.messages.length > 4 ? ` (+${result.messages.length - 4} more)` : "";
                toast.error(`Please complete required fields before continuing: ${preview}${remaining}`);
                return;
            }
        }

        clearValidationErrors();
        setCurrentStep(currentStep + 1);
        scrollToTop();
    };

    const prevLabel = STEP_LABELS[currentStep - 1];
    const nextLabel = STEP_LABELS[currentStep + 1];

    return (
        <div className="mt-8 pt-4 border-t border-border/80 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={currentStep <= 1}
                className="h-9 px-4 text-xs gap-2 font-medium"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                {prevLabel ? `Previous: ${prevLabel}` : "Previous"}
            </Button>

            <span className="text-xs text-muted-foreground font-medium">
                Step {currentStep} of {totalSteps} · <strong className="text-foreground">{STEP_LABELS[currentStep]}</strong>
            </span>

            {currentStep < totalSteps ? (
                <Button
                    type="button"
                    size="sm"
                    onClick={handleNext}
                    className="h-9 px-4 text-xs gap-2 font-semibold bg-primary text-primary-foreground shadow-xs"
                >
                    <span>Next: {nextLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                </Button>
            ) : (
                <div className="w-32 hidden sm:block" />
            )}
        </div>
    );
};
