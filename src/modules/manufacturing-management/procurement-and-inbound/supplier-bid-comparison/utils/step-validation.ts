import { RfqProject } from "../types";

export interface StepValidationResult {
    isValid: boolean;
    errors: Record<string, string>;
    messages: string[];
    firstFocusBidId?: string | null;
}

export function validateStepForNext(step: number, project: RfqProject): StepValidationResult {
    const errors: Record<string, string> = {};
    const messages: string[] = [];

    if (step === 1) {
        if (!project.rfqTitle || !project.rfqTitle.trim()) {
            errors["setup.rfqTitle"] = "Project / RFQ title is required.";
            messages.push("Project / RFQ title");
        }
        if (!project.targetDate || !project.targetDate.trim()) {
            errors["setup.targetDate"] = "Target date is required.";
            messages.push("Target date");
        }
        if (!project.comparisonCurrency || !project.comparisonCurrency.trim()) {
            errors["setup.comparisonCurrency"] = "Compare in currency is required.";
            messages.push("Compare in currency");
        }
        if (project.budget === null || project.budget === undefined || Number(project.budget) <= 0) {
            errors["setup.budget"] = "Budget must be greater than 0.";
            messages.push("Budget");
        }

        const items = project.items || [];
        if (items.length === 0) {
            errors["setup.items"] = "At least one requested item is required.";
            messages.push("At least 1 requested item");
        } else {
            items.forEach((item, idx) => {
                const rowNum = idx + 1;
                if (!item.itemName || !item.itemName.trim()) {
                    errors[`item.${item.id}.itemName`] = `Item #${rowNum}: Name is required.`;
                    messages.push(`Item #${rowNum} Name`);
                }
                if (!item.quantity || Number(item.quantity) <= 0) {
                    errors[`item.${item.id}.quantity`] = `Item #${rowNum}: Quantity must be > 0.`;
                    messages.push(`Item #${rowNum} Qty`);
                }
                if (!item.uom || !item.uom.trim()) {
                    errors[`item.${item.id}.uom`] = `Item #${rowNum}: UOM is required.`;
                    messages.push(`Item #${rowNum} UOM`);
                }
                if (item.targetUnitPrice === null || item.targetUnitPrice === undefined || Number(item.targetUnitPrice) <= 0) {
                    errors[`item.${item.id}.targetUnitPrice`] = `Item #${rowNum}: Target Unit Price must be > 0.`;
                    messages.push(`Item #${rowNum} Target Unit Price`);
                }
            });
        }

        return {
            isValid: Object.keys(errors).length === 0,
            errors,
            messages,
        };
    }

    if (step === 2) {
        const bids = project.bids || [];
        const items = project.items || [];
        let firstFocusBidId: string | null = null;

        if (bids.length === 0) {
            errors["bids.none"] = "Add at least one supplier bid before comparing.";
            messages.push("At least 1 supplier quotation");
            return { isValid: false, errors, messages, firstFocusBidId: null };
        }

        for (const bid of bids) {
            const label = bid.supplierName?.trim() || "Unnamed Supplier";
            let bidHasError = false;

            if (!bid.supplierName || !bid.supplierName.trim()) {
                errors[`bid.${bid.id}.supplierName`] = `${label}: Supplier name is required.`;
                messages.push(`${label} (Supplier Name)`);
                bidHasError = true;
            }
            if (!bid.country || !bid.country.trim()) {
                errors[`bid.${bid.id}.country`] = `${label}: Country is required.`;
                messages.push(`${label} (Country)`);
                bidHasError = true;
            }
            if (!bid.quoteCurrency || !bid.quoteCurrency.trim() || bid.quoteCurrency.trim() === "-") {
                errors[`bid.${bid.id}.quoteCurrency`] = `${label}: Quote currency is required.`;
                messages.push(`${label} (Quote Currency)`);
                bidHasError = true;
            }

            if (items.length > 0) {
                let validQuotedCount = 0;
                for (const item of items) {
                    const quote = bid.quotations?.[item.id];
                    if (quote && Array.isArray(quote.priceBreaks) && quote.priceBreaks.length > 0) {
                        const hasPositivePrice = quote.priceBreaks.some((pb) => Number(pb.unitPrice) > 0);
                        if (!hasPositivePrice) {
                            errors[`bid.${bid.id}.quote.${item.id}`] = `${label}: Quoted price for "${item.itemName || "item"}" must be > 0.`;
                            messages.push(`${label} (${item.itemName || "Item"} unit price)`);
                            bidHasError = true;
                        } else {
                            validQuotedCount++;
                        }
                    }
                }

                if (validQuotedCount === 0) {
                    errors[`bid.${bid.id}.quotes`] = `${label}: Enter at least one item quotation.`;
                    messages.push(`${label} (Item quotations)`);
                    bidHasError = true;
                }
            }

            if (bidHasError && !firstFocusBidId) {
                firstFocusBidId = bid.id;
            }
        }

        return {
            isValid: Object.keys(errors).length === 0,
            errors,
            messages,
            firstFocusBidId,
        };
    }

    return {
        isValid: true,
        errors: {},
        messages: [],
    };
}
