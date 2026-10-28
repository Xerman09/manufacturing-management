import React, { useEffect, useMemo, useState } from "react";
import { Activity, Plus } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { SalesOrderDemandGroup, SalesOrderDetail } from "../types";
import { displayJobOrderStatus } from "../../job-order-status";
import { canCreateReplacementJobOrder, linkedJobOrderQuantityTotals, remainingQuantity, SALES_ORDER_QUANTITY_GUIDANCE } from "../utils/demand-groups";
import { getUnitOfMeasureLabel } from "../utils/unit-of-measure";
import { PlanningPaginationControls, type PlanningPaginationState } from "./PlanningPaginationControls";
import { PlanningTableSearchBar } from "./PlanningTableSearchBar";
import { PlanningDataStatus } from "./PlanningDataStatus";

interface InProductionSalesOrdersTableProps {
    loadingOrders: boolean;
    error?: string | null;
    lastUpdatedAt: string | null;
    hasBranchSelected: boolean;
    salesOrderGroups: SalesOrderDemandGroup[];
    onRetry: () => void;
    onCreateJobOrder: (detailId: number) => void;
    pagination: PlanningPaginationState;
}

function lineSearchText(line: SalesOrderDetail): string {
    return [
        line.order_no,
        line.customer_name,
        line.product_id?.product_name,
        line.product_id?.product_code,
        line.parent_order_status,
        ...(line.linkedJobOrders || []).flatMap((jobOrder) => [jobOrder.jobOrderNo, jobOrder.status])
    ].filter(Boolean).join(" ").toLowerCase();
}

function LineStack({ lines, render }: { lines: SalesOrderDetail[]; render: (line: SalesOrderDetail) => React.ReactNode }) {
    return <div className="space-y-2">{lines.map((line) => <div key={line.detail_id}>{render(line)}</div>)}</div>;
}

function ProductionTableSkeleton() {
    return (
        <div role="status" aria-busy="true" aria-label="Loading Sales Orders in production">
            <div className="2xl:hidden space-y-3 p-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="space-y-3 rounded-lg border p-3 animate-pulse">
                        <div className="flex items-center justify-between gap-3">
                            <div className="h-5 w-36 rounded bg-muted" />
                            <div className="h-5 w-24 rounded-full bg-muted" />
                        </div>
                        <div className="h-4 w-2/3 rounded bg-muted" />
                        <div className="space-y-2 border-t pt-3">
                            <div className="h-4 w-3/4 rounded bg-muted" />
                            <div className="grid grid-cols-3 gap-2">
                                <div className="h-12 rounded bg-muted" />
                                <div className="h-12 rounded bg-muted" />
                                <div className="h-12 rounded bg-muted" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="hidden 2xl:block space-y-3 p-6">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="grid grid-cols-10 gap-4 animate-pulse">
                        {Array.from({ length: 10 }).map((__, cellIndex) => (
                            <div key={cellIndex} className="h-10 rounded-md bg-muted" />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function InProductionSalesOrdersTable({
    loadingOrders,
    error,
    lastUpdatedAt,
    hasBranchSelected,
    salesOrderGroups,
    onRetry,
    onCreateJobOrder,
    pagination
}: InProductionSalesOrdersTableProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const filteredGroups = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return salesOrderGroups;

        return salesOrderGroups.filter((group) =>
            [group.order.order_no, group.order.customer_name, group.order.customer_code, group.order.order_status]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(query)
            || group.lines.some((line) => lineSearchText(line).includes(query))
        );
    }, [salesOrderGroups, searchQuery]);

    const requestedPage = pagination.page;
    const pageSize = pagination.pageSize;
    const onPageChange = pagination.onPageChange;
    const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const visibleGroups = filteredGroups.slice((page - 1) * pageSize, page * pageSize);

    useEffect(() => {
        if (requestedPage !== page) onPageChange(page);
    }, [requestedPage, onPageChange, page]);

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3">
                <div>
                    <CardTitle className="flex items-center gap-2 text-xl font-bold tracking-tight">
                        <Activity className="h-5 w-5 text-sky-600" />
                        Sales Orders in Production
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                        Monitor Sales Orders in production and create replacement Job Orders for eligible terminated runs.
                    </CardDescription>
                    <p className="mt-2 text-xs text-muted-foreground">{SALES_ORDER_QUANTITY_GUIDANCE}</p>
                </div>
            </CardHeader>
            <div className="px-6 pb-4">
                <PlanningTableSearchBar
                    searchQuery={searchQuery}
                    onSearchQueryChange={(query) => {
                        setSearchQuery(query);
                        onPageChange(1);
                    }}
                    placeholder="Search SO, customer, product, JO..."
                    filteredCount={filteredGroups.length}
                    totalCount={salesOrderGroups.length}
                    itemLabel="Sales Orders"
                />
            </div>
            <CardContent className="p-0">
                {!hasBranchSelected ? (
                    <div className="px-6 py-12 text-center text-sm text-muted-foreground">Select a target branch to view branch-scoped production orders.</div>
                ) : loadingOrders && !lastUpdatedAt ? (
                    <ProductionTableSkeleton />
                ) : error && !lastUpdatedAt ? (
                    <PlanningDataStatus label="Sales Orders in production" loading={loadingOrders} error={error} lastUpdatedAt={lastUpdatedAt} onRetry={onRetry} />
                ) : (
                    <>
                        <PlanningDataStatus label="Sales Orders in production" loading={loadingOrders} error={error || null} lastUpdatedAt={lastUpdatedAt} onRetry={onRetry} />
                        {filteredGroups.length === 0 ? (
                            <div role="status" className="px-6 py-16 text-center text-xs font-semibold text-muted-foreground">
                                {searchQuery ? "No In Production Sales Orders match your search." : "No Sales Orders are currently In Production."}
                            </div>
                        ) : (
                            <>
                        <div className="2xl:hidden max-h-[50vh] space-y-3 overflow-y-auto p-3">
                            {visibleGroups.map((group) => (
                                <article key={group.order.order_id} className="rounded-lg border bg-card p-3 shadow-sm">
                                    <header className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="break-all font-mono text-sm font-bold text-foreground">{group.order.order_no}</div>
                                            <div className="mt-1 break-words text-xs text-muted-foreground">
                                                <span className="font-semibold">Customer: </span>{group.order.customer_name || group.order.customer_code || "Not specified"}
                                            </div>
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                                {group.lines.length} product line{group.lines.length === 1 ? "" : "s"}
                                            </div>
                                        </div>
                                        <Badge variant="outline" className="max-w-full border-sky-500/30 bg-sky-500/10 font-bold text-sky-700 dark:text-sky-300">
                                            {group.order.order_status}
                                        </Badge>
                                    </header>

                                    <div className="mt-3 space-y-3">
                                        {group.lines.map((line) => (
                                            <section key={line.detail_id} className="space-y-3 border-t pt-3">
                                                <div className="min-w-0 space-y-2">
                                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Product / BOM Version</div>
                                                    <div className="space-y-1.5">
                                                        <div className="break-words text-sm font-semibold leading-snug text-foreground">{line.product_id?.product_name || "Unknown product"}</div>
                                                        <div>
                                                            <span className="inline-flex max-w-full whitespace-normal break-words rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold leading-snug text-primary">
                                                                {getUnitOfMeasureLabel(line.product_id)}
                                                            </span>
                                                        </div>
                                                        <div className="break-words text-[11px] font-medium leading-snug text-primary">BOM version: {line.bom_version_name || "No Version"}</div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Connected Job Orders</div>
                                                    {line.linkedJobOrders && line.linkedJobOrders.length > 0 ? (
                                                        <div className="mt-1 space-y-2">
                                                            {line.linkedJobOrders.map((jobOrder) => (
                                                                <div key={jobOrder.jobOrderId} className="rounded-md bg-muted/30 p-2">
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        <span className="break-all font-mono text-xs font-semibold text-foreground">{jobOrder.jobOrderNo}</span>
                                                                        {jobOrder.isTerminated && (
                                                                            <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 px-1.5 py-0 text-[9px] text-orange-700 dark:text-orange-300">
                                                                                Terminated
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                                                                        <span>{displayJobOrderStatus(jobOrder.status)}</span>
                                                                        <span>{jobOrder.allocatedQuantity.toLocaleString()} {getUnitOfMeasureLabel(line.product_id)} allocated</span>
                                                                        <span>{jobOrder.producedQuantity.toLocaleString()} {getUnitOfMeasureLabel(line.product_id)} produced</span>
                                                                        <span>{jobOrder.qaAcceptedQuantity.toLocaleString()} {getUnitOfMeasureLabel(line.product_id)} QA accepted</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : <div className="mt-1 text-xs text-muted-foreground">No connected Job Order</div>}
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                    <div className="rounded-md bg-muted/30 p-2">
                                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ordered</div>
                                                        <div className="mt-1 text-right text-xs font-bold tabular-nums text-foreground">{Number(line.ordered_quantity || 0).toLocaleString()} {getUnitOfMeasureLabel(line.product_id)}</div>
                                                    </div>
                                                    <div className="rounded-md bg-muted/30 p-2">
                                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Active planned</div>
                                                        <div className="mt-1 text-right text-xs font-bold tabular-nums text-amber-700">{Number(line.planned_quantity || 0).toLocaleString()} {getUnitOfMeasureLabel(line.product_id)}</div>
                                                    </div>
                                                    <div className="rounded-md bg-muted/30 p-2">
                                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Produced</div>
                                                        <div className="mt-1 text-right text-xs font-bold tabular-nums text-foreground">{linkedJobOrderQuantityTotals(line).producedQuantity.toLocaleString()} {getUnitOfMeasureLabel(line.product_id)}</div>
                                                    </div>
                                                    <div className="rounded-md bg-muted/30 p-2">
                                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">QA accepted</div>
                                                        <div className="mt-1 text-right text-xs font-bold tabular-nums text-sky-700">{linkedJobOrderQuantityTotals(line).qaAcceptedQuantity.toLocaleString()} {getUnitOfMeasureLabel(line.product_id)}</div>
                                                    </div>
                                                    <div className="rounded-md bg-muted/30 p-2">
                                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Remaining to plan</div>
                                                        <div className="mt-1 text-right text-xs font-bold tabular-nums text-emerald-700">{remainingQuantity(line).toLocaleString()} {getUnitOfMeasureLabel(line.product_id)}</div>
                                                    </div>
                                                </div>

                                                <div>
                                                    {canCreateReplacementJobOrder(line) ? (
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className="min-h-10 w-full gap-1.5"
                                                            onClick={() => onCreateJobOrder(line.detail_id)}
                                                            aria-label={`Create replacement Job Order for ${group.order.order_no}, ${line.product_id?.product_name || "product"}`}
                                                        >
                                                            <Plus className="h-3.5 w-3.5" />
                                                            Create JO
                                                        </Button>
                                                    ) : <div className="text-xs text-muted-foreground">No action available</div>}
                                                </div>
                                            </section>
                                        ))}
                                    </div>
                                </article>
                            ))}
                        </div>
                        <div className="hidden 2xl:block max-h-[50vh] overflow-x-auto overflow-y-auto">
                            <Table>
                            <TableHeader className="sticky top-0 z-10 bg-muted/5">
                                <TableRow>
                                    <TableHead className="min-w-[170px] font-bold text-xs">Sales Order</TableHead>
                                    <TableHead className="min-w-[240px] font-bold text-xs">Products / BOM Versions</TableHead>
                                    <TableHead className="min-w-[180px] font-bold text-xs">Connected JO</TableHead>
                                    <TableHead className="min-w-[130px] font-bold text-xs">Status</TableHead>
                                    <TableHead className="min-w-[110px] text-right font-bold text-xs">Ordered</TableHead>
                                    <TableHead className="min-w-[120px] text-right font-bold text-xs">Active planned</TableHead>
                                    <TableHead className="min-w-[110px] text-right font-bold text-xs">Produced</TableHead>
                                    <TableHead className="min-w-[110px] text-right font-bold text-xs">QA accepted</TableHead>
                                    <TableHead className="min-w-[130px] text-right font-bold text-xs">Remaining to plan</TableHead>
                                    <TableHead className="min-w-[155px] font-bold text-xs">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border">
                                {visibleGroups.map((group) => (
                                    <TableRow key={group.order.order_id} className="align-top hover:bg-muted/5">
                                        <TableCell className="min-w-[170px] py-3 text-xs">
                                            <div className="font-bold text-foreground">{group.order.order_no}</div>
                                            <div className="max-w-[180px] truncate text-[10px] text-muted-foreground">
                                                {group.order.customer_name || group.order.customer_code}
                                            </div>
                                            <div className="mt-1 text-[10px] text-muted-foreground">
                                                {group.lines.length} product line{group.lines.length === 1 ? "" : "s"}
                                            </div>
                                        </TableCell>
                                        <TableCell className="min-w-[240px] py-3 text-xs">
                                            <LineStack lines={group.lines} render={(line) => (
                                                <div className="min-w-0 space-y-2">
                                                    <div className="break-words font-semibold leading-snug text-foreground">
                                                        {line.product_id?.product_name || "Unknown product"}
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <div>
                                                            <span className="inline-flex max-w-full whitespace-normal break-words rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold leading-snug text-primary">
                                                                {getUnitOfMeasureLabel(line.product_id)}
                                                            </span>
                                                        </div>
                                                        <div className="break-words text-[10px] font-medium leading-snug text-primary">Ver: {line.bom_version_name || "No Version"}</div>
                                                    </div>
                                                </div>
                                            )} />
                                        </TableCell>
                                        <TableCell className="min-w-[180px] py-3 text-xs">
                                            <LineStack lines={group.lines} render={(line) => line.linkedJobOrders && line.linkedJobOrders.length > 0 ? (
                                                <div className="space-y-1">
                                                    {line.linkedJobOrders.map((jobOrder) => (
                                                        <div key={jobOrder.jobOrderId}>
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className="font-mono font-semibold text-foreground">{jobOrder.jobOrderNo}</span>
                                                                {jobOrder.isTerminated && (
                                                                    <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 px-1.5 py-0 text-[9px] text-orange-700 dark:text-orange-300">
                                                                        Terminated
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                                                <span>{displayJobOrderStatus(jobOrder.status)}</span>
                                                                <span>· {jobOrder.allocatedQuantity.toLocaleString()} {getUnitOfMeasureLabel(line.product_id)} allocated</span>
                                                                <span>· {jobOrder.producedQuantity.toLocaleString()} {getUnitOfMeasureLabel(line.product_id)} produced</span>
                                                                <span>· {jobOrder.qaAcceptedQuantity.toLocaleString()} {getUnitOfMeasureLabel(line.product_id)} QA accepted</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : <span className="text-muted-foreground">—</span>} />
                                        </TableCell>
                                        <TableCell className="min-w-[130px] py-3 text-xs">
                                            <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 font-bold text-sky-700 dark:text-sky-300">
                                                {group.order.order_status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="min-w-[110px] py-3 text-right text-xs font-bold">
                                            <LineStack lines={group.lines} render={(line) => (
                                                <span className="tabular-nums">{Number(line.ordered_quantity || 0).toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{getUnitOfMeasureLabel(line.product_id)}</span></span>
                                            )} />
                                        </TableCell>
                                        <TableCell className="min-w-[120px] py-3 text-right text-xs font-semibold text-amber-700">
                                            <LineStack lines={group.lines} render={(line) => <span className="tabular-nums">{Number(line.planned_quantity || 0).toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{getUnitOfMeasureLabel(line.product_id)}</span></span>} />
                                        </TableCell>
                                        <TableCell className="min-w-[110px] py-3 text-right text-xs font-semibold text-foreground">
                                            <LineStack lines={group.lines} render={(line) => <span className="tabular-nums">{linkedJobOrderQuantityTotals(line).producedQuantity.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{getUnitOfMeasureLabel(line.product_id)}</span></span>} />
                                        </TableCell>
                                        <TableCell className="min-w-[110px] py-3 text-right text-xs font-semibold text-sky-700">
                                            <LineStack lines={group.lines} render={(line) => <span className="tabular-nums">{linkedJobOrderQuantityTotals(line).qaAcceptedQuantity.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{getUnitOfMeasureLabel(line.product_id)}</span></span>} />
                                        </TableCell>
                                        <TableCell className="min-w-[130px] py-3 text-right text-xs font-bold text-emerald-700">
                                            <LineStack lines={group.lines} render={(line) => (
                                                <span className="tabular-nums">{remainingQuantity(line).toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{getUnitOfMeasureLabel(line.product_id)}</span></span>
                                            )} />
                                        </TableCell>
                                        <TableCell className="min-w-[155px] py-3 text-xs">
                                            <LineStack lines={group.lines} render={(line) => canCreateReplacementJobOrder(line) ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 gap-1.5 whitespace-nowrap"
                                                    onClick={() => onCreateJobOrder(line.detail_id)}
                                                    aria-label={`Create replacement Job Order for ${group.order.order_no}, ${line.product_id?.product_name || "product"}`}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Create JO
                                                </Button>
                                            ) : <span className="text-muted-foreground">—</span>} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            </Table>
                        </div>
                        <PlanningPaginationControls
                            {...pagination}
                            page={page}
                            totalItems={filteredGroups.length}
                            itemLabel="Sales Orders"
                        />
                            </>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
