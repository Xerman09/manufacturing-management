"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NumericInputField } from "../shared/NumericInputField";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";

export const CustomsAndPortChargesCard: React.FC = () => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    const rates = currentProject.customsRates;
    const brackets = currentProject.ipcBrackets || [];

    const handleUpdateRate = (field: keyof typeof rates, val: number) => {
        updateProject((prev) => ({
            ...prev,
            customsRates: {
                ...prev.customsRates,
                [field]: val,
            },
        }));
    };

    const handleUpdateBracketCharge = (order: number, val: number) => {
        updateProject((prev) => ({
            ...prev,
            ipcBrackets: prev.ipcBrackets.map((b) =>
                b.bracketOrder === order ? { ...b, chargeCompCurr: val } : b
            ),
        }));
    };

    const handleUpdateBracketLimit = (order: number, val: number | null) => {
        updateProject((prev) => ({
            ...prev,
            ipcBrackets: prev.ipcBrackets.map((b) =>
                b.bracketOrder === order ? { ...b, maxDutiableValueCompCurr: val } : b
            ),
        }));
    };

    return (
        <Card className="shadow-xs border-border/80 w-full bg-card">
            <CardHeader className="py-3 px-4 border-b bg-muted/10 space-y-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                        PH
                    </span>
                    <span>Philippine customs &amp; port charges</span>
                </CardTitle>

                {/* Automatic calculation toggle */}
                <div className="flex items-center space-x-2 pt-0.5">
                    <Checkbox
                        id="auto-customs-calc"
                        checked={currentProject.calcCustomsAuto}
                        onCheckedChange={(checked) =>
                            updateProject((prev) => ({ ...prev, calcCustomsAuto: Boolean(checked) }))
                        }
                    />
                    <label
                        htmlFor="auto-customs-calc"
                        className="text-xs text-foreground font-medium cursor-pointer select-none"
                    >
                        Calculate Bureau of Customs and port charges automatically for international suppliers
                    </label>
                </div>
            </CardHeader>

            <CardContent className="p-4 space-y-5">
                {/* Two-Column Grid matching reference UI */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-8 items-start">
                    {/* LEFT COLUMN: Import Processing Charge Brackets & Customs Stamps */}
                    <div className="space-y-4">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                            Import Processing Charge · Per Goods Declaration
                        </div>

                        {/* Brackets Table */}
                        <div className="border rounded-md overflow-hidden bg-background">
                            <div className="grid grid-cols-2 py-1.5 px-3 bg-muted/30 border-b text-[11px] font-semibold text-muted-foreground">
                                <span>Dutiable Value Up To (₱)</span>
                                <span className="text-right">Charge (₱)</span>
                            </div>
                            <div className="divide-y divide-border/60">
                                {brackets.map((b) => (
                                    <div
                                        key={b.bracketOrder}
                                        className="grid grid-cols-2 items-center py-1.5 px-3 gap-3 hover:bg-muted/10"
                                    >
                                        <div className="text-xs font-mono">
                                            {b.maxDutiableValueCompCurr !== null ? (
                                                <NumericInputField
                                                    value={b.maxDutiableValueCompCurr}
                                                    onChange={(val) =>
                                                        handleUpdateBracketLimit(b.bracketOrder, val)
                                                    }
                                                    className="h-7 text-xs font-mono"
                                                />
                                            ) : (
                                                <span className="text-xs text-muted-foreground italic pl-1">
                                                    Above the last bracket
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex justify-end">
                                            <div className="w-28">
                                                <NumericInputField
                                                    value={b.chargeCompCurr}
                                                    onChange={(val) =>
                                                        handleUpdateBracketCharge(b.bracketOrder, val)
                                                    }
                                                    className="h-7 text-xs font-mono text-right"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 4 Inputs Row: CDS, DST, Container Security, LC Bank Charge */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground font-medium leading-tight block">
                                    Customs documentary stamp (₱)
                                </Label>
                                <NumericInputField
                                    value={rates.cdsCompCurr}
                                    onChange={(v) => handleUpdateRate("cdsCompCurr", v)}
                                    className="h-8 text-xs font-mono bg-background"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground font-medium leading-tight block">
                                    BIR documentary stamp tax (₱)
                                </Label>
                                <NumericInputField
                                    value={rates.birDstCompCurr}
                                    onChange={(v) => handleUpdateRate("birDstCompCurr", v)}
                                    className="h-8 text-xs font-mono bg-background"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground font-medium leading-tight block">
                                    Container security (US$ / TEU)
                                </Label>
                                <NumericInputField
                                    value={rates.containerSecurityUsd}
                                    onChange={(v) => handleUpdateRate("containerSecurityUsd", v)}
                                    className="h-8 text-xs font-mono bg-background"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground font-medium leading-tight block">
                                    LC bank charge (% of dutiable value)
                                </Label>
                                <NumericInputField
                                    value={rates.lcBankChargePct}
                                    onChange={(v) => handleUpdateRate("lcBankChargePct", v)}
                                    precision={4}
                                    className="h-8 text-xs font-mono bg-background"
                                />
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Port Charges (Arrastre & Wharfage) */}
                    <div className="space-y-4">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                            Port Charges · Defaults for Manila (MICT / South Harbor)
                        </div>

                        {/* Row 1: FCL Arrastre & Wharfage */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground font-medium block">
                                    Arrastre 20&apos; (₱/box)
                                </Label>
                                <NumericInputField
                                    value={rates.arrastre20ftCompCurr}
                                    onChange={(v) => handleUpdateRate("arrastre20ftCompCurr", v)}
                                    className="h-8 text-xs font-mono bg-background"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground font-medium block">
                                    Arrastre 40&apos; (₱/box)
                                </Label>
                                <NumericInputField
                                    value={rates.arrastre40ftCompCurr}
                                    onChange={(v) => handleUpdateRate("arrastre40ftCompCurr", v)}
                                    className="h-8 text-xs font-mono bg-background"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground font-medium block">
                                    Wharfage 20&apos; (₱/box)
                                </Label>
                                <NumericInputField
                                    value={rates.wharfage20ftCompCurr}
                                    onChange={(v) => handleUpdateRate("wharfage20ftCompCurr", v)}
                                    className="h-8 text-xs font-mono bg-background"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground font-medium block">
                                    Wharfage 40&apos; (₱/box)
                                </Label>
                                <NumericInputField
                                    value={rates.wharfage40ftCompCurr}
                                    onChange={(v) => handleUpdateRate("wharfage40ftCompCurr", v)}
                                    className="h-8 text-xs font-mono bg-background"
                                />
                            </div>
                        </div>

                        {/* Row 2: LCL Arrastre & Wharfage */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground font-medium block">
                                    LCL arrastre (₱/revenue ton)
                                </Label>
                                <NumericInputField
                                    value={rates.lclArrastrePerRtCompCurr}
                                    onChange={(v) => handleUpdateRate("lclArrastrePerRtCompCurr", v)}
                                    className="h-8 text-xs font-mono bg-background"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground font-medium block">
                                    LCL wharfage (₱/revenue ton)
                                </Label>
                                <NumericInputField
                                    value={rates.lclWharfagePerRtCompCurr}
                                    onChange={(v) => handleUpdateRate("lclWharfagePerRtCompCurr", v)}
                                    className="h-8 text-xs font-mono bg-background"
                                />
                            </div>
                        </div>

                        {/* Terminal Notice */}
                        <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                            Arrastre and wharfage differ by port and terminal — update them for Batangas, Cebu, Subic, etc. LCL is charged per revenue ton (the larger of m³ or metric tons).
                        </p>
                    </div>
                </div>

                {/* Full-width Footnote */}
                <p className="text-[10px] text-muted-foreground leading-relaxed pt-3 border-t border-border/60">
                    Defaults: import processing charge brackets, ₱100 CDS and ₱30 BIR DST under BOC CAO 02-2024 (amended by CAO 02-2025); container security charge US$5/TEU (EO 635); arrastre per PPA MC 011-2023; wharfage per CMO 07-2014. Brokerage, arrastre, wharfage, the processing charge, CDS and LC bank charges go into the import VAT base, following BOC landed-cost practice. Rates change — confirm with your customs broker.
                </p>
            </CardContent>
        </Card>
    );
};
