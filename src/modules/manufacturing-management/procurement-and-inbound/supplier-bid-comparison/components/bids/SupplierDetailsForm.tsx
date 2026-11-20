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
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { SupplierBid } from "../../types";

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
    const { currentProject, updateProject, lookups } = useBidComparisonStore();

    const isLocal = bid.supplierType === "LOCAL";

    // Auto-generate quotation ref if missing, and sync local country/currency
    React.useEffect(() => {
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
    }, [bid.id, bid.country, bid.quoteCurrency, bid.quotationRef, isLocal, currentProject?.bids, updateProject]);

    const supplierOptions: ComboboxOption[] = React.useMemo(() => {
        return (lookups.suppliers || []).map((s) => ({
            value: s.supplierName,
            label: s.supplierName,
            subLabel: `${s.country || "PH"} · ${s.currency || "PHP"}`,
            extra: s,
        }));
    }, [lookups.suppliers]);

    const handleUpdate = (patch: Partial<SupplierBid>) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => (b.id === bid.id ? { ...b, ...patch } : b)),
        }));
    };

    const handleSelectExistingSupplier = (selectedName: string, option?: ComboboxOption) => {
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
            handleUpdate({
                supplierName: selectedName,
                supplierId: s.id,
                country: s.country || (s.isForeign ? "China" : "Philippines"),
                supplierType: s.isForeign ? "INTERNATIONAL" : "LOCAL",
                quoteCurrency: s.currency || (s.isForeign ? "USD" : "PHP"),
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
            {/* Top Toolbar: Supplier Name, Type & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                    {bid.supplierType === "LOCAL" ? (
                        <Building2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    ) : (
                        <Globe className="h-5 w-5 text-blue-600 shrink-0" />
                    )}
                    <div className="flex-1">
                        <Label className="text-[11px] text-muted-foreground block mb-0.5">Supplier Name</Label>
                        <ComboboxSelect
                            options={supplierOptions}
                            value={bid.supplierName}
                            onChange={(val, opt) => handleSelectExistingSupplier(val, opt)}
                            searchPlaceholder="Search, Select or Enter supplier..."
                            className="h-8 text-xs font-semibold"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* <Select
                        value={bid.supplierType}
                        onValueChange={(v: SupplierType) => handleTypeChange(v)}
                    >
                        <SelectTrigger className="h-8 text-xs w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="LOCAL" className="text-xs">Local (Philippines)</SelectItem>
                            <SelectItem value="INTERNATIONAL" className="text-xs">International (Overseas)</SelectItem>
                        </SelectContent>
                    </Select> */}

                    <Button variant="outline" size="sm" onClick={onDuplicate} className="h-8 text-xs gap-1.5">
                        <Copy className="h-3.5 w-3.5" />
                        Duplicate
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRemove}
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 gap-1.5"
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
                        <span>Country</span>
                        {isLocal && <span className="text-[9px] text-muted-foreground font-mono">PH (Locked)</span>}
                    </Label>
                    <Input
                        value={isLocal ? (bid.country || "Philippines") : bid.country}
                        onChange={(e) => handleUpdate({ country: e.target.value })}
                        placeholder="e.g. Philippines / China"
                        disabled={isLocal}
                        className="h-7 text-xs disabled:opacity-80 disabled:bg-muted/40 disabled:cursor-not-allowed"
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px] flex items-center justify-between">
                        <span>Quote Currency</span>
                        {isLocal && <span className="text-[9px] text-muted-foreground font-mono">PHP (Locked)</span>}
                    </Label>
                    <Input
                        value={isLocal ? "PHP" : bid.quoteCurrency}
                        onChange={(e) => handleUpdate({ quoteCurrency: e.target.value.toUpperCase() })}
                        placeholder="PHP"
                        maxLength={5}
                        disabled={isLocal}
                        className="h-7 text-xs font-mono uppercase disabled:opacity-80 disabled:bg-muted/40 disabled:cursor-not-allowed"
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
                        value={bid.quoteDate}
                        onChange={(e) => handleUpdate({ quoteDate: e.target.value })}
                        className="h-7 text-xs font-mono"
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px]">Valid Until</Label>
                    <Input
                        type="date"
                        min="2000-01-01"
                        max="2099-12-31"
                        value={bid.validUntil}
                        onChange={(e) => handleUpdate({ validUntil: e.target.value })}
                        className="h-7 text-xs font-mono"
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px]">Lead Time (Days)</Label>
                    <NumericInputField
                        value={bid.leadTimeDays}
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
                        onChange={(e) => handleUpdate({ contactPerson: e.target.value })}
                        placeholder="Name"
                        className="h-7 text-xs"
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px]">Contact Email</Label>
                    <Input
                        type="email"
                        value={bid.contactEmail}
                        onChange={(e) => handleUpdate({ contactEmail: e.target.value })}
                        placeholder="email@supplier.com"
                        className="h-7 text-xs"
                    />
                </div>

                <div className="space-y-1">
                    <Label className="text-[11px]">Contact Phone</Label>
                    <Input
                        value={bid.contactPhone}
                        onChange={(e) => handleUpdate({ contactPhone: e.target.value })}
                        placeholder="+63 / +86 ..."
                        className="h-7 text-xs"
                    />
                </div>

                <div className="space-y-1 sm:col-span-3">
                    <Label className="text-[11px]">Supplier Notes &amp; Terms</Label>
                    <Input
                        value={bid.notes}
                        onChange={(e) => handleUpdate({ notes: e.target.value })}
                        placeholder="Special warranties, certifications, MOQ notes"
                        className="h-7 text-xs"
                    />
                </div>
            </div>
        </div>
    );
};
