"use client";

import React from "react";
import { History, Send, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";

export const ApprovalHistoryAudit: React.FC = () => {
    const { currentProject, currentUser } = useBidComparisonStore();
    if (!currentProject) return null;

    const history = currentProject.approvalHistory || [];
    const currentFallbackName = (currentUser?.name && currentUser.name !== "-") 
        ? currentUser.name 
        : (currentUser?.email || "-");

    const getActionBadge = (action: string) => {
        switch (action) {
            case "SUBMIT":
                return (
                    <Badge variant="outline" className="text-[10px] text-amber-700 bg-amber-50 dark:bg-amber-950 border-amber-300 gap-1">
                        <Send className="h-2.5 w-2.5" /> SUBMITTED
                    </Badge>
                );
            case "APPROVE":
                return (
                    <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950 border-emerald-300 gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" /> APPROVED
                    </Badge>
                );
            case "REJECT":
                return (
                    <Badge variant="destructive" className="text-[10px] gap-1">
                        <XCircle className="h-2.5 w-2.5" /> REJECTED
                    </Badge>
                );
            case "WITHDRAW":
                return (
                    <Badge variant="outline" className="text-[10px] text-slate-700 bg-slate-50 border-slate-300 gap-1">
                        <RotateCcw className="h-2.5 w-2.5" /> WITHDRAWN
                    </Badge>
                );
            case "REOPEN":
                return (
                    <Badge variant="outline" className="text-[10px] text-blue-700 bg-blue-50 dark:bg-blue-950 border-blue-300 gap-1">
                        <RotateCcw className="h-2.5 w-2.5" /> REOPENED
                    </Badge>
                );
            default:
                return <Badge variant="outline">{action}</Badge>;
        }
    };

    return (
        <Card className="shadow-xs border-border/80  max-h-[80vh]">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <History className="h-4 w-4 text-primary" />
                    4.3 Approval History &amp; Audit Trail ({history.length})
                </CardTitle>
                <CardDescription className="text-xs">
                    Immutable chronological record of submissions, approvals, rejections, and reopenings.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 overflow-y-auto max-h-[80vh]">
                {history.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                        No approval actions logged yet. Actions taken on this award will appear here.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {[...history].reverse().map((entry, idx) => {
                            const isLegacyPlaceholder =
                                entry.actorName === "Juan Dela Cruz" ||
                                entry.actorName === "Authorized User" ||
                                entry.actorName === "System User";
                            const displayActor =
                                !entry.actorName || isLegacyPlaceholder
                                    ? currentFallbackName
                                    : entry.actorName;

                            return (
                                <div
                                    key={entry.id || idx}
                                    className="p-3 rounded-lg border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            {getActionBadge(entry.action)}
                                            <span className="font-semibold text-foreground">
                                                {displayActor || "-"}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">
                                                ({entry.fromStatus} &rarr; {entry.toStatus})
                                            </span>
                                        </div>
                                        {entry.comment && (
                                            <p className="text-xs text-muted-foreground pl-0.5">
                                                &ldquo;{entry.comment}&rdquo;
                                            </p>
                                        )}
                                    </div>

                                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                                        {(() => {
                                            if (!entry.createdAt) return "-";
                                            const d = new Date(entry.createdAt);
                                            return isNaN(d.getTime()) ? "-" : d.toLocaleString();
                                        })()}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
