"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function ReportPulseSkeletonLoader() {
    return (
        <div className="space-y-5 animate-pulse">
            {/* KPI Cards Skeleton */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="shadow-sm">
                        <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-4 w-12 rounded-full" />
                            </div>
                            <Skeleton className="h-7 w-24" />
                            <Skeleton className="h-3 w-32" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Tabs & Table Skeleton */}
            <div className="space-y-3">
                <div className="flex gap-2">
                    <Skeleton className="h-9 w-36 rounded-md" />
                    <Skeleton className="h-9 w-44 rounded-md" />
                </div>
                <div className="rounded-lg border bg-card p-4 space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-8 w-60 rounded-md" />
                    </div>
                    {Array.from({ length: 6 }).map((_, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 border-b last:border-b-0">
                            <div className="space-y-1">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-2.5 w-24" />
                            </div>
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                            <Skeleton className="h-4 w-20" />
                            <Skeleton className="h-6 w-20 rounded-md" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
