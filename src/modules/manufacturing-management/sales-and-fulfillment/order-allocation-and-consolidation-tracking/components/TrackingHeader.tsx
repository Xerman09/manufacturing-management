// src/modules/manufacturing-management/sales-and-fulfillment/order-allocation-and-consolidation-tracking/components/TrackingHeader.tsx

import React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Layers } from "lucide-react";

interface TrackingHeaderProps {
    onRefresh: () => void;
    isRefreshing: boolean;
}

export const TrackingHeader: React.FC<TrackingHeaderProps> = ({ onRefresh, isRefreshing }) => {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
            <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                        <Layers className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                            Consolidation & Dispatch Tracking
                        </h1>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Tracking of order consolidation, warehouse dispatch, and delivery completion.
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    title="Refresh sales orders, lot reservations, and consolidation pick tracking data"
                    className="h-9 px-3 text-xs font-semibold flex items-center gap-2 rounded-xl"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
                    <span>{isRefreshing ? "Refreshing..." : "Refresh Data"}</span>
                </Button>
            </div>
        </div>
    );
};
