// note to ai agent do not uncomment the commented code

"use client";

import React from "react";
import { 
    Copy, 
    Trash2, 
    Building2, 
    Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
 
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComboboxSelect, ComboboxOption } from "../shared/ComboboxSelect";
import { NumericInputField } from "../shared/NumericInputField";
import { useBidComparisonStore, isRfqProjectLocked } from "../../hooks/useBidComparisonState";
import { SupplierBid, CountryLookup } from "../../types";
import { cn } from "@/lib/utils";

interface SupplierDetailsFormProps {
    bid: SupplierBid;
    onDuplicate: () => void;
    onRemove: () => void;
}

export const SupplierDetailsForm: React.FC<SupplierDetailsFormProps> = ({
    bid,
    onDuplicate,
    onRemove,
}) => {
    const {
        currentProject,
        updateProject,
        lookups,
        countries,
        fetchCountries,
        validationErrors,
        clearValidationError,
    } = useBidComparisonStore();

    const isLocal = bid.supplierType === "LOCAL";
    const isLocked = isRfqProjectLocked(currentProject);

    // Fetch standardized country list from Flagdex API
    React.useEffect(() => {
        fetchCountries();
    }, [fetchCountries]);

    // Auto-generate quotation ref if missing, and sync local country/currency
    React.useEffect(() => {
        if (isLocked) return;
        const patch: Partial<SupplierBid> = {};
        if (isLocal) {
            if (!bid.country || bid.country === "PH") patch.country = "Philippines";
            if (!bid.quoteCurrency || bid.quoteCurrency !== "PHP") patch.quoteCurrency = "PHP";
        }
        if (!bid.quotationRef) {
            const currentYear = new Date().getFullYear();
            const prefix = `QT-${currentYear}-`;
            const otherBids = currentProject?.bids.filter((b) => b.id !== bid.id) || [];
            let maxSeq = 0;
            for (const b of otherBids) {
                if (b.quotationRef && b.quotationRef.startsWith(prefix)) {
                    const num = parseInt(b.quotationRef.slice(prefix.length), 10);
                    if (!isNaN(num) && num > maxSeq) maxSeq = num;
                }
            }
            patch.quotationRef = `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
        }
        if (Object.keys(patch).length > 0) {
            updateProject((prev) => ({
                ...prev,
                bids: prev.bids.map((b) => (b.id === bid.id ? { ...b, ...patch } : b)),
            }));
        }
    }, [bid.id, bid.country, bid.quoteCurrency, bid.quotationRef, isLocal, isLocked, currentProject?.bids, updateProject]);

    const supplierOptions: ComboboxOption[] = React.useMemo(() => {
        return (lookups.suppliers || []).map((s) => ({
            value: s.supplierName,
            label: s.supplierName,
            subLabel: `${s.country || "PH"} · ${s.currency || "PHP"}`,
            extra: s,
        }));
    }, [lookups.suppliers]);

    const countryOptions: ComboboxOption[] = React.useMemo(() => {
        return (countries || []).map((c) => {
            const primaryCurr = c.currencies?.[0]?.code || "-";
            return {
                value: c.name,
                label: c.name,
                subLabel: `${c.iso2} · Currency: ${primaryCurr}`,
                extra: { country: c },
            };
        });
    }, [countries]);

    // Normalize legacy 2-letter ISO code (e.g. "CN" -> "China") if present in loaded bid
    const resolvedCountryValue = React.useMemo(() => {
        if (isLocal) return bid.country || "Philippines";
        const raw = (bid.country || "").trim();
        if (!raw) return "";
        const byCode = countries.find((c) => c.iso2.toUpperCase() === raw.toUpperCase() || c.iso3.toUpperCase() === raw.toUpperCase());
        if (byCode) return byCode.name;
        const byName = countries.find((c) => c.name.toLowerCase() === raw.toLowerCase());
        return byName ? byName.name : raw;
    }, [bid.country, countries, isLocal]);

    const handleUpdate = (patch: Partial<SupplierBid>) => {
        if (isLocked) return;
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => (b.id === bid.id ? { ...b, ...patch } : b)),
        }));
    };

    const handleCountryChange = (selectedCountryName: string, option?: ComboboxOption) => {
        clearValidationError(`bid.${bid.id}.country`);
        const extraCountry = (option?.extra as { country?: CountryLookup } | undefined)?.country
            || countries.find((c) => c.name.toLowerCase() === selectedCountryName.toLowerCase());

        if (extraCountry) {
            const primaryCurrency = extraCountry.currencies?.[0]?.code || "-";
            clearValidationError(`bid.${bid.id}.quoteCurrency`);
            handleUpdate({
                country: extraCountry.name,
                quoteCurrency: primaryCurrency,
            });
        } else {
            handleUpdate({ country: selectedCountryName });
        }
    };

    const handleSelectExistingSupplier = (selectedName: string, option?: ComboboxOption) => {
        clearValidationError(`bid.${bid.id}.supplierName`);
        if (option && option.extra) {
            const s = option.extra as {
                id?: number;
                country?: string;
                isForeign?: boolean;
                currency?: string;
                contactPerson?: string;
                emailAddress?: string;
                phoneNumber?: string;
            };
            const matchedCountry = countries.find(
                (c) =>
                    c.name.toLowerCase() === (s.country || "").toLowerCase() ||
                    c.iso2.toUpperCase() === (s.country || "").toUpperCase()
            );
            const resolvedCountryName = matchedCountry?.name || s.country || (s.isForeign ? "" : "Philippines");
            const resolvedCurrency = s.currency || matchedCountry?.currencies?.[0]?.code || (s.isForeign ? "" : "PHP");

            clearValidationError(`bid.${bid.id}.country`);
            clearValidationError(`bid.${bid.id}.quoteCurrency`);
            handleUpdate({
                supplierName: selectedName,
                supplierId: s.id,
                country: resolvedCountryName,
                supplierType: s.isForeign ? "INTERNATIONAL" : "LOCAL",
                quoteCurrency: resolvedCurrency,
                contactPerson: s.contactPerson || "",
                contactEmail: s.emailAddress || "",
                contactPhone: s.phoneNumber || "",
                incoterm: s.isForeign ? "FOB" : "DELIVERED",
            });
        } else {
            handleUpdate({ supplierName: selectedName });
        }
    };

    return (
        <div className="p-4 border rounded-xl bg-card space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    {bid.supplierType === "LOCAL" ? (
                        <Building2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                        <Globe className="h-4 w-4 text-blue-600 shrink-0" />
                    )}
                    <span>2.1 Supplier Details</span>
                </h3>
                <span className="text-[11px] text-muted-foreground font-mono">
                    {bid.supplierType === "LOCAL" ? "Local Supplier" : "International Supplier"}
                </span>
            </div>

            {/* Top Toolbar: Supplier Name, Type & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                    <div className="flex-1">
                        <Label className="text-[11px] text-muted-foreground block mb-0.5">
                            Supplier Name <span className="text-destructive">*</span>
                        </Label>
                        <ComboboxSelect
                            options={supplierOptions}
                            value={bid.supplierName}
                            disabled={isLocked}
                            onChange={(val, opt) => handleSelectExistingSupplier(val, opt)}
                            searchPlaceholder="Search, Select or Enter supplier..."
                            className={cn(
                                "h-8 text-xs font-semibold",
                                validationErrors[`bid.${bid.id}.supplierName`] && "border-destructive ring-1 ring-destructive/40"
                            )}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" disabled={isLocked} onClick={onDuplicate} className="h-8 text-xs gap-1.5">
                        <Copy className="h-3.5 w-3.5" />
                        Duplicate
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={isLocked}
                        onClick={onRemove}
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 gap-1.5 disabled:opacity-40"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                    </Button>
                </div>
            </div>

            {/* Form Fields Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="space-y-1">
                    <Label className="text-[11px] flex items-center justify-between">
                        <span>
                            Country <span className="text-destructive">*</span>
                        </span>
                        {isLocal && <span className="text-[9px] text-muted-foreground font-mono">PH (Locked)</span>}
                    </Label>
                    {isLocal ? (
                        <Input
                            value={bid.country || "Philippines"}
                            disabled
                            className="h-7 text-xs disabled:opacity-80 disabled:bg-muted/40 disabled:cursor-not-allowed"
                        />
                    ) : (
                        <ComboboxSelect
                            options={countryOptions}
                            value={resolvedCountryValue}
                            disabled={isLocked}
                            onChange={handleCountryChange}
                            placeholder="Select country..."
                            searchPlaceholder="Search country..."
                            emptyText="No countries found."
                            allowAdHoc={false}
                            className={cn(
                                "h-7 text-xs bg-background",
                                validationErrors[`bid.${bid.id}.country`] && "border-destructive ring-1 ring-destructive/40"
                            )}
                        />
                    )}
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px] flex items-center justify-between">
                        <span>
                            Quote Currency <span className="text-destructive">*</span>
                        </span>
                        {isLocal && <span className="text-[9px] text-muted-foreground font-mono">PHP (Locked)</span>}
                    </Label>
                    <Input
                        value={isLocal ? "PHP" : bid.quoteCurrency}
                        onChange={(e) => {
                            clearValidationError(`bid.${bid.id}.quoteCurrency`);
                            handleUpdate({ quoteCurrency: e.target.value.toUpperCase() });
                        }}
                        placeholder="-"
                        maxLength={5}
                        disabled={isLocal || isLocked}
                        className={cn(
                            "h-7 text-xs font-mono uppercase disabled:opacity-80 disabled:bg-muted/40 disabled:cursor-not-allowed",
                            validationErrors[`bid.${bid.id}.quoteCurrency`] && "border-destructive ring-1 ring-destructive/40"
                        )}
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px] flex items-center justify-between">
                        <span>Quotation Reference</span>
                        <span className="text-[9px] text-muted-foreground font-mono">Auto (Locked)</span>
                    </Label>
                    <Input
                        value={bid.quotationRef || ""}
                        disabled
                        placeholder="QT-2026-001"
                        className="h-7 text-xs font-mono disabled:opacity-80 disabled:bg-muted/40 disabled:cursor-not-allowed"
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px]">Quote Date</Label>
                    <Input
                        type="date"
                        min="2000-01-01"
                        max="2099-12-31"
                        disabled={isLocked}
                        value={bid.quoteDate}
                        onChange={(e) => handleUpdate({ quoteDate: e.target.value })}
                        className="h-7 text-xs font-mono disabled:opacity-75 disabled:bg-muted/40 disabled:cursor-not-allowed"
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px]">Valid Until</Label>
                    <Input
                        type="date"
                        min="2000-01-01"
                        max="2099-12-31"
                        disabled={isLocked}
                        value={bid.validUntil}
                        onChange={(e) => handleUpdate({ validUntil: e.target.value })}
                        className="h-7 text-xs font-mono disabled:opacity-75 disabled:bg-muted/40 disabled:cursor-not-allowed"
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px]">Lead Time (Days)</Label>
                    <NumericInputField
                        value={bid.leadTimeDays}
                        disabled={isLocked}
                        onChange={(val) => handleUpdate({ leadTimeDays: val })}
                        min={0}
                        suffix="days"
                        className="h-7 text-xs font-mono"
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px]">Contact Person</Label>
                    <Input
                        value={bid.contactPerson}
                        disabled={isLocked}
                        onChange={(e) => handleUpdate({ contactPerson: e.target.value })}
                        placeholder="Name"
                        className="h-7 text-xs disabled:opacity-75 disabled:bg-muted/40 disabled:cursor-not-allowed"
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px]">Contact Email</Label>
                    <Input
                        type="email"
                        disabled={isLocked}
                        value={bid.contactEmail}
                        onChange={(e) => handleUpdate({ contactEmail: e.target.value })}
                        placeholder="email@supplier.com"
                        className="h-7 text-xs disabled:opacity-75 disabled:bg-muted/40 disabled:cursor-not-allowed"
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px]">Contact Phone</Label>
                    <Input
                        value={bid.contactPhone}
                        disabled={isLocked}
                        onChange={(e) => handleUpdate({ contactPhone: e.target.value })}
                        placeholder="+63 / +86 ..."
                        className="h-7 text-xs disabled:opacity-75 disabled:bg-muted/40 disabled:cursor-not-allowed"
                    />
                </div>

                <div className="space-y-1 sm:col-span-3">
                    <Label className="text-[11px]">Supplier Notes &amp; Terms</Label>
                    <Input
                        value={bid.notes}
                        disabled={isLocked}
                        onChange={(e) => handleUpdate({ notes: e.target.value })}
                        placeholder="Special warranties, certifications, MOQ notes"
                        className="h-7 text-xs disabled:opacity-75 disabled:bg-muted/40 disabled:cursor-not-allowed"
                    />
                </div>
            </div>
        </div>
    );
};
