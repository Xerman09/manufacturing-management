"use client";

import React from "react";
import { SlidersHorizontal, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";

interface ScoringWeightsControlsProps {
    supplierFilter: "ALL" | "LOCAL" | "INTERNATIONAL";
    onFilterChange: (val: "ALL" | "LOCAL" | "INTERNATIONAL") => void;
}

export const ScoringWeightsControls: React.FC<ScoringWeightsControlsProps> = ({
    supplierFilter,
    onFilterChange,
}) => {
    const { currentProject, updateProject } = useBidComparisonStore();

    const wP = currentProject?.scoringWeightPricePct ?? 50;
    const wQ = currentProject?.scoringWeightQualityPct ?? 35;
    const wL = currentProject?.scoringWeightLeadTimePct ?? 15;

    // Local transient states for instantaneous 60fps/120fps slider movement
    const [localWP, setLocalWP] = React.useState(wP);
    const [localWQ, setLocalWQ] = React.useState(wQ);
    const [localWL, setLocalWL] = React.useState(wL);

    React.useEffect(() => {
        setLocalWP(wP);
    }, [wP]);

    React.useEffect(() => {
        setLocalWQ(wQ);
    }, [wQ]);

    React.useEffect(() => {
        setLocalWL(wL);
    }, [wL]);

    const rafRef = React.useRef<number | null>(null);

    if (!currentProject) return null;

    const scheduleUpdate = (field: "scoringWeightPricePct" | "scoringWeightQualityPct" | "scoringWeightLeadTimePct", val: number) => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            updateProject((prev) => ({
                ...prev,
                [field]: val,
            }));
        });
    };

    const handleCommit = (field: "scoringWeightPricePct" | "scoringWeightQualityPct" | "scoringWeightLeadTimePct", val: number) => {
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        updateProject((prev) => ({
            ...prev,
            [field]: val,
        }));
    };

    const sum = localWP + localWQ + localWL;
    const normP = sum > 0 ? Math.round((localWP / sum) * 100) : 0;
    const normQ = sum > 0 ? Math.round((localWQ / sum) * 100) : 0;
    const normL = sum > 0 ? Math.round((localWL / sum) * 100) : 0;

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                                <SlidersHorizontal className="h-4 w-4 text-primary" />
                                Scoring weights
                            </CardTitle>
                            {sum === 100 ? (
                                <Badge variant="outline" className="text-[11px] font-normal py-0 h-5 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                                    Total: 100%
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-[11px] font-normal py-0 h-5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800">
                                    Total: {sum}% (Effective: {normP}% / {normQ}% / {normL}%)
                                </Badge>
                            )}
                        </div>
                        <CardDescription className="text-xs">
                            Price score compares each supplier&apos;s landed cost per item against the lowest; items they didn&apos;t bid on score zero. Disqualified or expired bids can&apos;t be recommended. Quality score comes from the weighted criteria.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Weight Sliders */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Price Slider */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                            <Label className="font-semibold text-emerald-600 dark:text-emerald-400">
                                Price Weight: {localWP}%
                            </Label>
                            
                        </div>
                        <Slider
                            value={[localWP]}
                            onValueChange={([val]) => {
                                setLocalWP(val);
                                scheduleUpdate("scoringWeightPricePct", val);
                            }}
                            onValueCommit={([val]) => {
                                setLocalWP(val);
                                handleCommit("scoringWeightPricePct", val);
                            }}
                            min={0}
                            max={100}
                            step={1}
                            className="w-full"
                        />
                    </div>

                    {/* Quality Slider */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                            <Label className="font-semibold text-amber-600 dark:text-amber-400">
                                Quality Weight: {localWQ}%
                            </Label>
                             
                        </div>
                        <Slider
                            value={[localWQ]}
                            onValueChange={([val]) => {
                                setLocalWQ(val);
                                scheduleUpdate("scoringWeightQualityPct", val);
                            }}
                            onValueCommit={([val]) => {
                                setLocalWQ(val);
                                handleCommit("scoringWeightQualityPct", val);
                            }}
                            min={0}
                            max={100}
                            step={1}
                            className="w-full"
                        />
                    </div>

                    {/* Lead Time Slider */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                            <Label className="font-semibold text-blue-600 dark:text-blue-400">
                                Lead Time Weight: {localWL}%
                            </Label>
                             
                        </div>
                        <Slider
                            value={[localWL]}
                            onValueChange={([val]) => {
                                setLocalWL(val);
                                scheduleUpdate("scoringWeightLeadTimePct", val);
                            }}
                            onValueCommit={([val]) => {
                                setLocalWL(val);
                                handleCommit("scoringWeightLeadTimePct", val);
                            }}
                            min={0}
                            max={100}
                            step={1}
                            className="w-full"
                        />
                    </div>
                </div>

                {/* Filter Selector */}
                <div className="flex items-center gap-2 shrink-0 md:border-l md:pl-4">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={supplierFilter} onValueChange={onFilterChange}>
                        <SelectTrigger className="h-8 text-xs w-40">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL" className="text-xs">All Suppliers</SelectItem>
                            <SelectItem value="LOCAL" className="text-xs">Local Only</SelectItem>
                            <SelectItem value="INTERNATIONAL" className="text-xs">International Only</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
};
