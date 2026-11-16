"use client";

import React from "react";
import { UserCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";

export const SignatoriesCard: React.FC = () => {
    const { currentProject, updateProject } = useBidComparisonStore();
    if (!currentProject) return null;

    return (
        <Card className="shadow-xs border-border/80">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <UserCheck className="h-4 w-4 text-primary" />
                    1.8 Evaluation Signatories
                </CardTitle>
                <CardDescription className="text-xs">
                    Official signature lines for the Abstract of Bids document.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Prepared By */}
                <div className="space-y-2 p-3 border rounded-lg bg-card">
                    <span className="text-xs font-bold text-muted-foreground block uppercase tracking-wider">
                        Prepared by
                    </span>
                    <div className="space-y-1">
                        <Label className="text-[11px]">Full Name</Label>
                        <Input
                            value={currentProject.preparedBy}
                            onChange={(e) => updateProject((prev) => ({ ...prev, preparedBy: e.target.value }))}
                            placeholder="e.g. Maria Santos"
                            className="h-7 text-xs"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[11px]">Position / Title</Label>
                        <Input
                            value={currentProject.preparedByTitle}
                            onChange={(e) => updateProject((prev) => ({ ...prev, preparedByTitle: e.target.value }))}
                            placeholder="Procurement Officer"
                            className="h-7 text-xs"
                        />
                    </div>
                </div>

                {/* Reviewed By */}
                <div className="space-y-2 p-3 border rounded-lg bg-card">
                    <span className="text-xs font-bold text-muted-foreground block uppercase tracking-wider">
                        Reviewed by
                    </span>
                    <div className="space-y-1">
                        <Label className="text-[11px]">Full Name</Label>
                        <Input
                            value={currentProject.reviewedBy}
                            onChange={(e) => updateProject((prev) => ({ ...prev, reviewedBy: e.target.value }))}
                            placeholder="e.g. Juan dela Cruz"
                            className="h-7 text-xs"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[11px]">Position / Title</Label>
                        <Input
                            value={currentProject.reviewedByTitle}
                            onChange={(e) => updateProject((prev) => ({ ...prev, reviewedByTitle: e.target.value }))}
                            placeholder="BAC Member / Lead Canvasser"
                            className="h-7 text-xs"
                        />
                    </div>
                </div>

                {/* Approved By */}
                <div className="space-y-2 p-3 border rounded-lg bg-card">
                    <span className="text-xs font-bold text-muted-foreground block uppercase tracking-wider">
                        Approved by
                    </span>
                    <div className="space-y-1">
                        <Label className="text-[11px]">Full Name</Label>
                        <Input
                            value={currentProject.approvedBy}
                            onChange={(e) => updateProject((prev) => ({ ...prev, approvedBy: e.target.value }))}
                            placeholder="e.g. Engr. Roberto Tan"
                            className="h-7 text-xs"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[11px]">Position / Title</Label>
                        <Input
                            value={currentProject.approvedByTitle}
                            onChange={(e) => updateProject((prev) => ({ ...prev, approvedByTitle: e.target.value }))}
                            placeholder="Plant Operations Director"
                            className="h-7 text-xs"
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
