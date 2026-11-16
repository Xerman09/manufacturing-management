"use client";

import React from "react";
import { Ship, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumericInputField } from "../shared/NumericInputField";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { SupplierBid, Incoterm, FreightBasis, InsuranceBasis, DutyMode, ShipmentType } from "../../types";
import { INCOTERMS_CONFIG } from "../../constants/incoterms";
import { calculateSupplierLandedCost } from "../../engine/landed-cost-calculator";

interface DeliveryTermsCardProps {
    bid: SupplierBid;
}

const INCOTERM_EXPLANATIONS: Record<string, string> = {
    EXW: "Ex Works — buyer arranges and pays for all transport, export clearance, and delivery from the supplier factory.",
    FCA: "Free Carrier — supplier delivers cleared goods to a nominated carrier; buyer pays onward freight and insurance.",
    FOB: "Free On Board — supplier loads at the origin port; you pay sea freight onward.",
    CFR: "Cost & Freight — supplier pays sea freight to destination port; you pay cargo insurance and import clearance.",
    CPT: "Carriage Paid To — supplier pays carriage to destination; buyer covers cargo insurance.",
    CIF: "Cost, Insurance & Freight — supplier pays ocean freight and marine cargo insurance to destination port.",
    CIP: "Carriage & Insurance Paid — supplier pays carriage and comprehensive cargo insurance to destination.",
    DAP: "Delivered at Place — supplier delivers to destination without unloading; buyer handles import customs & VAT.",
    DPU: "Delivered at Place Unloaded — supplier delivers and unloads goods; buyer handles import customs & VAT.",
    DDP: "Delivered Duty Paid — supplier covers all freight, insurance, customs duties, import VAT, and door delivery.",
    DELIVERED: "Delivered (Local) — door delivery to warehouse; no separate freight or customs duty.",
    PICK_UP: "Pick-up (Local) — buyer provides own trucking to collect from supplier facility.",
};

const TRADE_AGREEMENTS = [
    { code: "ACFTA", name: "ACFTA (China) – Form E" },
    { code: "AJCEP", name: "AJCEP (Japan) – Form AJ" },
    { code: "AKFTA", name: "AKFTA (Korea) – Form AK" },
    { code: "AIFTA", name: "AIFTA (India) – Form AI" },
    { code: "ATIGA", name: "ATIGA (ASEAN) – Form D" },
    { code: "RCEP", name: "RCEP – Regional Comprehensive Economic Partnership" },
    { code: "NONE", name: "None / Standard WTO Rates" },
];

export const DeliveryTermsCard: React.FC<DeliveryTermsCardProps> = ({ bid }) => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const items = currentProject.items || [];
    const isLocal = bid.supplierType === "LOCAL";
    const incoterm = bid.incoterm || (isLocal ? "DELIVERED" : "FOB");
    const incotermConfig = INCOTERMS_CONFIG[incoterm] || INCOTERMS_CONFIG.DELIVERED;
    const landedResult = calculateSupplierLandedCost(currentProject, items, bid);

    const handleUpdate = (patch: Partial<SupplierBid>) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) => (b.id === bid.id ? { ...b, ...patch } : b)),
        }));
    };

    const explanation = INCOTERM_EXPLANATIONS[incoterm] || "Choose Incoterm to define cost responsibilities.";
    const currency = bid.quoteCurrency || "USD";

    // Container and dutiable estimation
    const declCount = Math.max(bid.declarationsCount || 1, 1);
    const dutiablePerDecl = Math.round(landedResult.cifDutiableValueCompCurr / declCount);
    let containerSummary = "LCL / Courier";
    if (landedResult.estimatedContainers40ft > 0) {
        containerSummary = `${landedResult.estimatedContainers40ft}×40'`;
    } else if (landedResult.estimatedContainers20ft > 0) {
        containerSummary = `${landedResult.estimatedContainers20ft}×20'`;
    }

    // Dynamic label for freight rate
    let freightRateLabel = `Rate per m³ (${bid.freightCurrency || currency})`;
    if (bid.freightBasis === "LUMP_SUM") {
        freightRateLabel = `Lump sum amount (${bid.freightCurrency || currency})`;
    } else if (bid.freightBasis === "PER_KG") {
        freightRateLabel = `Rate per kg (${bid.freightCurrency || currency})`;
    } else if (bid.freightBasis === "PCT_GOODS") {
        freightRateLabel = `Freight rate (% of goods)`;
    }

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <Ship className="h-4 w-4 text-primary" />
                    Delivery terms &amp; import costs
                </CardTitle>
                <CardDescription className="text-xs">
                    Choose the Incoterm. Costs borne by the supplier are automatically grayed out so only buyer-paid expenses are computed.
                </CardDescription>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
                {/* 1. Incoterm Selection & Contextual Explanation */}
                <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Incoterm</Label>
                    <Select
                        value={incoterm}
                        onValueChange={(val: Incoterm) => handleUpdate({ incoterm: val })}
                    >
                        <SelectTrigger className="h-8 text-xs font-medium w-full max-w-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {isLocal ? (
                                <>
                                    <SelectItem value="DELIVERED" className="text-xs">DELIVERED – Delivered to Warehouse</SelectItem>
                                    <SelectItem value="PICK_UP" className="text-xs">PICK_UP – Buyer Pick-up at Facility</SelectItem>
                                </>
                            ) : (
                                <>
                                    <SelectItem value="FOB" className="text-xs">FOB – Free On Board (Most Common)</SelectItem>
                                    <SelectItem value="EXW" className="text-xs">EXW – Ex Works (Buyer pays all)</SelectItem>
                                    <SelectItem value="FCA" className="text-xs">FCA – Free Carrier</SelectItem>
                                    <SelectItem value="CFR" className="text-xs">CFR – Cost &amp; Freight</SelectItem>
                                    <SelectItem value="CPT" className="text-xs">CPT – Carriage Paid To</SelectItem>
                                    <SelectItem value="CIF" className="text-xs">CIF – Cost, Insurance &amp; Freight</SelectItem>
                                    <SelectItem value="CIP" className="text-xs">CIP – Carriage &amp; Insurance Paid</SelectItem>
                                    <SelectItem value="DAP" className="text-xs">DAP – Delivered at Place</SelectItem>
                                    <SelectItem value="DPU" className="text-xs">DPU – Delivered at Place Unloaded</SelectItem>
                                    <SelectItem value="DDP" className="text-xs">DDP – Delivered Duty Paid (Supplier covers all)</SelectItem>
                                </>
                            )}
                        </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground pt-0.5">
                        {explanation}
                    </p>
                </div>

                {/* Local Fields Layout */}
                {isLocal ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 border-t border-border/50 items-end">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">VAT Rate (%)</Label>
                            <NumericInputField
                                value={bid.vatPct}
                                onChange={(val) => handleUpdate({ vatPct: val })}
                                suffix="%"
                                className="h-8 text-xs font-mono"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center space-x-2 h-8 px-1">
                                <Checkbox
                                    id="local-prices-incl-vat"
                                    checked={bid.pricesIncludeVat}
                                    onCheckedChange={(checked) => handleUpdate({ pricesIncludeVat: Boolean(checked) })}
                                />
                                <Label htmlFor="local-prices-incl-vat" className="text-xs cursor-pointer whitespace-nowrap font-medium">
                                    Prices include VAT
                                </Label>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Inland trucking (PHP)</Label>
                            {incotermConfig.buyerPaysInlandTrucking ? (
                                <NumericInputField
                                    value={bid.inlandTruckingCompCurr}
                                    onChange={(val) => handleUpdate({ inlandTruckingCompCurr: val })}
                                    prefix="₱"
                                    className="h-8 text-xs font-mono font-medium"
                                />
                            ) : (
                                <div className="h-8 flex items-center px-2.5 rounded-md border border-dashed text-xs text-muted-foreground bg-muted/20">
                                    Included by supplier
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* International 3-Column Grid Matching Mockup Image 2 */
                    <div className="space-y-3.5 pt-1 border-t border-border/50">
                        {/* Row 1: Freight Charged | Rate per basis | Minimum charge */}
                        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${!incotermConfig.buyerPaysFreight ? "opacity-50 pointer-events-none" : ""}`}>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Freight charged</Label>
                                <Select
                                    value={bid.freightBasis || "PER_CBM"}
                                    onValueChange={(val: FreightBasis) => handleUpdate({ freightBasis: val })}
                                    disabled={!incotermConfig.buyerPaysFreight}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PER_CBM" className="text-xs">Per m³ (CBM)</SelectItem>
                                        <SelectItem value="LUMP_SUM" className="text-xs">Lump Sum</SelectItem>
                                        <SelectItem value="PER_KG" className="text-xs">Per kg (Air / Courier)</SelectItem>
                                        <SelectItem value="PCT_GOODS" className="text-xs">% of goods value</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium truncate">{freightRateLabel}</Label>
                                <NumericInputField
                                    value={bid.freightRate}
                                    onChange={(val) => handleUpdate({ freightRate: val })}
                                    disabled={!incotermConfig.buyerPaysFreight}
                                    className="h-8 text-xs font-mono"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium truncate">Minimum charge ({bid.freightCurrency || currency})</Label>
                                <NumericInputField
                                    value={bid.freightMinimum}
                                    onChange={(val) => handleUpdate({ freightMinimum: val })}
                                    disabled={!incotermConfig.buyerPaysFreight}
                                    className="h-8 text-xs font-mono"
                                />
                            </div>
                        </div>

                        {/* Row 2: Freight/insurance currency | Insurance | Insurance rate % */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Freight/insurance currency</Label>
                                <Select
                                    value={bid.freightCurrency || currency}
                                    onValueChange={(val) => handleUpdate({ freightCurrency: val, insuranceCurrency: val })}
                                >
                                    <SelectTrigger className="h-8 text-xs font-mono">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={currency} className="text-xs font-mono">Same as quote ({currency})</SelectItem>
                                        <SelectItem value="USD" className="text-xs font-mono">USD</SelectItem>
                                        <SelectItem value="PHP" className="text-xs font-mono">PHP</SelectItem>
                                        <SelectItem value="CNY" className="text-xs font-mono">CNY</SelectItem>
                                        <SelectItem value="EUR" className="text-xs font-mono">EUR</SelectItem>
                                        <SelectItem value="JPY" className="text-xs font-mono">JPY</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className={`space-y-1.5 ${!incotermConfig.buyerPaysInsurance ? "opacity-50 pointer-events-none" : ""}`}>
                                <Label className="text-xs font-medium">Insurance</Label>
                                <Select
                                    value={bid.insuranceBasis || "PCT_GOODS_AND_FREIGHT"}
                                    onValueChange={(val: InsuranceBasis) => handleUpdate({ insuranceBasis: val })}
                                    disabled={!incotermConfig.buyerPaysInsurance}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PCT_GOODS_AND_FREIGHT" className="text-xs">% of goods + freight</SelectItem>
                                        <SelectItem value="FIXED_AMOUNT" className="text-xs">Fixed Amount</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className={`space-y-1.5 ${!incotermConfig.buyerPaysInsurance ? "opacity-50 pointer-events-none" : ""}`}>
                                <Label className="text-xs font-medium">
                                    {bid.insuranceBasis === "FIXED_AMOUNT" ? `Insurance amount (${bid.insuranceCurrency || currency})` : "Insurance rate %"}
                                </Label>
                                <NumericInputField
                                    value={bid.insuranceRateOrAmount}
                                    onChange={(val) => handleUpdate({ insuranceRateOrAmount: val })}
                                    disabled={!incotermConfig.buyerPaysInsurance}
                                    suffix={bid.insuranceBasis === "PCT_GOODS_AND_FREIGHT" ? "%" : undefined}
                                    className="h-8 text-xs font-mono"
                                />
                            </div>
                        </div>

                        {/* Row 3: Import duty rate | Trade agreement | Preferential duty % (Context-Aware) */}
                        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${!incotermConfig.buyerPaysDutyAndVat ? "opacity-50 pointer-events-none" : ""}`}>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Import duty rate</Label>
                                <Select
                                    value={bid.dutyMode || "PER_ITEM"}
                                    onValueChange={(val: DutyMode) => handleUpdate({ dutyMode: val })}
                                    disabled={!incotermConfig.buyerPaysDutyAndVat}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PER_ITEM" className="text-xs">Per item (HS Code from Setup)</SelectItem>
                                        <SelectItem value="FTA" className="text-xs">FTA preferential rate</SelectItem>
                                        <SelectItem value="ONE_RATE" className="text-xs">Single duty rate for all items</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {bid.dutyMode === "FTA" && (
                                <>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">Trade agreement</Label>
                                        <Select
                                            value={bid.ftaAgreementName || "ACFTA"}
                                            onValueChange={(val) => handleUpdate({ ftaAgreementName: val })}
                                            disabled={!incotermConfig.buyerPaysDutyAndVat}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TRADE_AGREEMENTS.map((ta) => (
                                                    <SelectItem key={ta.code} value={ta.code} className="text-xs">
                                                        {ta.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">Preferential duty %</Label>
                                        <NumericInputField
                                            value={bid.ftaDutyPct ?? 0}
                                            onChange={(val) => handleUpdate({ ftaDutyPct: val })}
                                            disabled={!incotermConfig.buyerPaysDutyAndVat}
                                            suffix="%"
                                            className="h-8 text-xs font-mono"
                                        />
                                    </div>
                                </>
                            )}

                            {bid.dutyMode === "ONE_RATE" && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium">Import duty %</Label>
                                    <NumericInputField
                                        value={bid.singleDutyPct ?? 0}
                                        onChange={(val) => handleUpdate({ singleDutyPct: val })}
                                        disabled={!incotermConfig.buyerPaysDutyAndVat}
                                        suffix="%"
                                        className="h-8 text-xs font-mono"
                                    />
                                </div>
                            )}

                            {(!bid.dutyMode || bid.dutyMode === "PER_ITEM") && (
                                <div className="sm:col-span-2 flex items-center h-8 mt-auto text-xs text-muted-foreground bg-muted/20 px-3 rounded-md border border-dashed">
                                    <span>Per-item HS codes and MFN duty rates from Setup are applied.</span>
                                </div>
                            )}
                        </div>

                        {/* Row 4: Import VAT % | Brokerage (PHP) | Other port charges (PHP) */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className={`space-y-1.5 ${!incotermConfig.buyerPaysDutyAndVat ? "opacity-50 pointer-events-none" : ""}`}>
                                <Label className="text-xs font-medium">Import VAT %</Label>
                                <NumericInputField
                                    value={bid.vatPct ?? 12}
                                    onChange={(val) => handleUpdate({ vatPct: val })}
                                    disabled={!incotermConfig.buyerPaysDutyAndVat}
                                    suffix="%"
                                    className="h-8 text-xs font-mono"
                                />
                            </div>

                            <div className={`space-y-1.5 ${!incotermConfig.buyerPaysBrokerageAndCustoms ? "opacity-50 pointer-events-none" : ""}`}>
                                <Label className="text-xs font-medium">Brokerage (PHP)</Label>
                                <NumericInputField
                                    value={bid.brokerageCompCurr}
                                    onChange={(val) => handleUpdate({ brokerageCompCurr: val })}
                                    disabled={!incotermConfig.buyerPaysBrokerageAndCustoms}
                                    className="h-8 text-xs font-mono"
                                />
                            </div>

                            <div className={`space-y-1.5 ${!incotermConfig.buyerPaysBrokerageAndCustoms ? "opacity-50 pointer-events-none" : ""}`}>
                                <Label className="text-xs font-medium truncate">Other port charges — storage, D/O, etc. (PHP)</Label>
                                <NumericInputField
                                    value={bid.otherPortChargesCompCurr}
                                    onChange={(val) => handleUpdate({ otherPortChargesCompCurr: val })}
                                    disabled={!incotermConfig.buyerPaysBrokerageAndCustoms}
                                    className="h-8 text-xs font-mono"
                                />
                            </div>
                        </div>

                        {/* Row 5: Shipment type | 20' & 40' Containers (FCL) | Shipments | Paid by LC */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Shipment type</Label>
                                <Select
                                    value={bid.shipmentType || "AUTO"}
                                    onValueChange={(val: ShipmentType) => handleUpdate({ shipmentType: val })}
                                >
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AUTO" className="text-xs">Auto — from volume</SelectItem>
                                        <SelectItem value="FCL" className="text-xs">FCL (Full Container Load)</SelectItem>
                                        <SelectItem value="LCL" className="text-xs">LCL (Less than Container Load)</SelectItem>
                                        <SelectItem value="AIR" className="text-xs">Air Cargo</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {bid.shipmentType === "FCL" ? (
                                <>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">20&apos; containers</Label>
                                        <NumericInputField
                                            value={bid.containers20ft ?? landedResult.estimatedContainers20ft}
                                            onChange={(val) => handleUpdate({ containers20ft: Math.max(0, Math.round(val)) })}
                                            className="h-8 text-xs font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">40&apos; containers</Label>
                                        <NumericInputField
                                            value={bid.containers40ft ?? landedResult.estimatedContainers40ft}
                                            onChange={(val) => handleUpdate({ containers40ft: Math.max(0, Math.round(val)) })}
                                            className="h-8 text-xs font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">Shipments (goods declarations)</Label>
                                        <NumericInputField
                                            value={bid.declarationsCount || 1}
                                            onChange={(val) => handleUpdate({ declarationsCount: Math.max(1, Math.round(val)) })}
                                            className="h-8 text-xs font-mono"
                                        />
                                    </div>
                                    <div className="flex items-center space-x-2 h-8 pb-1">
                                        <Checkbox
                                            id="bid-paid-by-lc"
                                            checked={bid.paidByLc}
                                            onCheckedChange={(checked) => handleUpdate({ paidByLc: Boolean(checked) })}
                                        />
                                        <Label htmlFor="bid-paid-by-lc" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                                            Paid by letter of credit
                                        </Label>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">Shipments (goods declarations)</Label>
                                        <NumericInputField
                                            value={bid.declarationsCount || 1}
                                            onChange={(val) => handleUpdate({ declarationsCount: Math.max(1, Math.round(val)) })}
                                            className="h-8 text-xs font-mono"
                                        />
                                    </div>

                                    <div className="flex items-center space-x-2 h-8 pb-1">
                                        <Checkbox
                                            id="bid-paid-by-lc"
                                            checked={bid.paidByLc}
                                            onCheckedChange={(checked) => handleUpdate({ paidByLc: Boolean(checked) })}
                                        />
                                        <Label htmlFor="bid-paid-by-lc" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                                            Paid by letter of credit
                                        </Label>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Informational Shipment Estimation Banner */}
                        <div className="p-2.5 rounded-md bg-muted/40 border border-border/60 text-xs text-muted-foreground flex items-center gap-2">
                            <Info className="h-4 w-4 text-primary shrink-0" />
                            <span>
                                Shipment: <strong className="text-foreground">{landedResult.totalVolumeM3.toFixed(3)} m³</strong>, <strong className="text-foreground">{landedResult.totalWeightKg.toLocaleString()} kg</strong> → <strong className="text-foreground">{containerSummary}</strong> (estimated; 20&apos; ≈ 28 m³, 40&apos; ≈ 58 m³ usable) · dutiable value per declaration <strong className="text-foreground">₱{dutiablePerDecl.toLocaleString()}</strong>.
                            </span>
                        </div>

                        {/* Row 6: Inland Trucking */}
                        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${!incotermConfig.buyerPaysInlandTrucking ? "opacity-50 pointer-events-none" : ""}`}>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Inland trucking (PHP)</Label>
                                <NumericInputField
                                    value={bid.inlandTruckingCompCurr}
                                    onChange={(val) => handleUpdate({ inlandTruckingCompCurr: val })}
                                    disabled={!incotermConfig.buyerPaysInlandTrucking}
                                    className="h-8 text-xs font-mono"
                                />
                            </div>
                        </div>

                        {/* Clarifying Footnote */}
                        <p className="text-[11px] text-muted-foreground pt-1 leading-relaxed">
                            Greyed-out fields are paid by the supplier under {incoterm}. Duty is on the CIF value (goods + freight + insurance) per item; import VAT on CIF + duty + fees. Lump-sum freight and fixed fees are charged in full even if only some items are awarded.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
