import React, { useEffect, useMemo, useState } from "react";
import { Layers, Info, Filter, ArrowDownUp, ChevronDown } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Branch, NetRequirementItem } from "../types";
import { PlanningPaginationControls, type PlanningPaginationState } from "./PlanningPaginationControls";
import { getUnitOfMeasureLabel } from "../utils/unit-of-measure";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanningDataStatus } from "./PlanningDataStatus";

type SubAssemblyLookupStatus = "loading" | "ready" | "error";

function formatRequirementQuantity(value: number): string {
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

interface NetRequirementsTableProps {
    loadingRequirements: boolean;
    requirementsError: string | null;
    requirementsLastUpdatedAt: string | null;
    hasSchedulableDemand: boolean;
    onRetryRequirements: () => void;
    subAssemblyLookupStatus: SubAssemblyLookupStatus;
    subAssemblyLookupError: string | null;
    netRequirements: NetRequirementItem[];
    selectedBranchId: number | null;
    branches: Branch[];
    pagination: PlanningPaginationState;
}

export function NetRequirementsTable({
    loadingRequirements,
    requirementsError,
    requirementsLastUpdatedAt,
    hasSchedulableDemand,
    onRetryRequirements,
    subAssemblyLookupStatus,
    subAssemblyLookupError,
    netRequirements,
    selectedBranchId,
    branches,
    pagination
}: NetRequirementsTableProps) {
    const [showShortfallsOnly, setShowShortfallsOnly] = useState(false);
    const [shortfallsFirst, setShortfallsFirst] = useState(false);
    const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
    const selectedBranch = branches.find(b => b.id === selectedBranchId);
    const requestedPage = pagination.page;
    const pageSize = pagination.pageSize;
    const onPageChange = pagination.onPageChange;
    const shortfallCount = useMemo(
        () => netRequirements.filter(item => item.net_shortfall > 0).length,
        [netRequirements]
    );
    const displayedRequirements = useMemo(() => {
        const filtered = showShortfallsOnly
            ? netRequirements.filter(item => item.net_shortfall > 0)
            : netRequirements;

        if (!shortfallsFirst) return filtered;

        return filtered
            .map((item, index) => ({ item, index }))
            .sort((left, right) => {
                const shortfallOrder = Number(right.item.net_shortfall > 0) - Number(left.item.net_shortfall > 0);
                return shortfallOrder || left.index - right.index;
            })
            .map(({ item }) => item);
    }, [netRequirements, showShortfallsOnly, shortfallsFirst]);
    const totalPages = Math.max(1, Math.ceil(displayedRequirements.length / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const visibleRequirements = displayedRequirements.slice((page - 1) * pageSize, page * pageSize);

    useEffect(() => {
        if (requestedPage !== page) onPageChange(page);
    }, [requestedPage, onPageChange, page]);

    return (
        <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/10">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
                            <Layers className="h-5 w-5 text-primary" />
                            Net Requirements Calculator
                        </CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">
                            Branch-scoped demand and inventory for schedulable Sales Order products and mapped BOM components.
                        </CardDescription>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                        {selectedBranchId && selectedBranch
                            ? selectedBranch.branch_name
                            : "No Branch Selected"}
                    </Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <section className="min-w-0 rounded-lg border bg-background px-3 py-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Calculation scope</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="outline" className="text-[10px]">Sales Order products</Badge>
                            <Badge variant="outline" className="text-[10px]">Mapped BOM components</Badge>
                            <Badge variant="secondary" className="border border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
                                Raw materials excluded
                            </Badge>
                        </div>
                    </section>
                    <section className="min-w-0 rounded-lg border bg-muted/20 px-3 py-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Shortfall formula</h3>
                        <code className="mt-2 block whitespace-normal break-words rounded-md bg-background px-2 py-1.5 text-[11px] leading-relaxed text-foreground">
                            max(0, gross demand - (on hand - safety stock))
                        </code>
                    </section>
                </div>
                <Collapsible className="mt-2">
                    <CollapsibleTrigger asChild>
                        <Button type="button" variant="ghost" className="group h-auto w-full justify-between rounded-lg border bg-background px-3 py-2.5 text-left hover:bg-muted/40">
                            <span className="min-w-0">
                                <span className="block text-xs font-semibold text-foreground">Calculation basis</span>
                                <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">Demand, safety stock, and on-hand details</span>
                            </span>
                            <ChevronDown className="ml-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                        <div className="grid gap-2 md:grid-cols-3">
                            <div className="rounded-lg border bg-background px-3 py-2.5 text-xs leading-relaxed">
                                <h4 className="font-semibold text-foreground">Demand</h4>
                                <p className="mt-1 text-muted-foreground">Gross demand sums ordered quantities from schedulable Sales Order lines. Mapped component demand is derived from parent-product shortfalls multiplied by BOM quantities.</p>
                            </div>
                            <div className="rounded-lg border bg-background px-3 py-2.5 text-xs leading-relaxed">
                                <h4 className="font-semibold text-foreground">Safety stock</h4>
                                <p className="mt-1 text-muted-foreground">Uses the product maintaining quantity.</p>
                            </div>
                            <div className="rounded-lg border bg-background px-3 py-2.5 text-xs leading-relaxed">
                                <h4 className="font-semibold text-foreground">On hand</h4>
                                <p className="mt-1 text-muted-foreground">Branch movement-ledger stock from Passed or Partially Accepted lots. Existing product-specific reservation treatment applies, so this is not a uniform available-to-promise figure.</p>
                            </div>
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </CardHeader>
            <CardContent className="p-0">
                {selectedBranchId === null ? (
                    <div className="flex flex-col items-center justify-center px-4 py-16 text-center text-muted-foreground">
                        <Info className="mb-2 h-8 w-8 text-muted-foreground/60" />
                        <span className="text-sm font-semibold">Select a target branch first.</span>
                        <span className="mt-1 max-w-sm text-xs">Branch-scoped on-hand and safety-stock calculations load after branch selection.</span>
                    </div>
                ) : (loadingRequirements || subAssemblyLookupStatus === "loading") && !requirementsLastUpdatedAt && netRequirements.length === 0 ? (
                    <div role="status" aria-busy="true" aria-label={subAssemblyLookupStatus === "loading" ? "Loading sub-assembly BOMs" : "Calculating net requirements"} className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/5">
                                <TableRow>
                                    <TableHead><Skeleton className="h-4 w-32" /></TableHead>
                                    {Array.from({ length: 4 }, (_, index) => (
                                        <TableHead key={index} className="text-right"><Skeleton className="ml-auto h-4 w-20" /></TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Array.from({ length: 5 }, (_, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="py-3"><Skeleton className="mb-2 h-4 w-3/4" /><Skeleton className="h-3 w-1/3" /></TableCell>
                                        {Array.from({ length: 4 }, (_, column) => (
                                            <TableCell key={column} className="text-right"><Skeleton className="ml-auto h-4 w-20" /></TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (requirementsError || subAssemblyLookupError) && !requirementsLastUpdatedAt && netRequirements.length === 0 ? (
                    <PlanningDataStatus
                        label="net requirements"
                        loading={loadingRequirements || subAssemblyLookupStatus === "loading"}
                        error={requirementsError || subAssemblyLookupError}
                        lastUpdatedAt={requirementsLastUpdatedAt}
                        onRetry={onRetryRequirements}
                    />
                ) : netRequirements.length === 0 ? (
                    <>
                        <PlanningDataStatus
                            label="net requirements"
                            loading={loadingRequirements || subAssemblyLookupStatus === "loading"}
                            error={requirementsError || subAssemblyLookupError}
                            lastUpdatedAt={requirementsLastUpdatedAt}
                            onRetry={onRetryRequirements}
                        />
                        <div className="flex flex-col items-center justify-center px-4 py-16 text-center text-muted-foreground">
                            <Info className="mb-2 h-8 w-8 text-muted-foreground/60" />
                            <span className="text-sm font-semibold">{hasSchedulableDemand ? "No net requirement rows were returned." : "No schedulable demand to calculate."}</span>
                            <span className="mt-1 max-w-sm text-xs">
                                {hasSchedulableDemand ? "The request completed, but no inventory requirement rows were returned for the selected demand." : "Add or approve Sales Orders to create production requirements."}
                            </span>
                        </div>
                    </>
                ) : (
                    <>
                    <PlanningDataStatus
                        label="net requirements"
                        loading={loadingRequirements || subAssemblyLookupStatus === "loading"}
                        error={requirementsError || subAssemblyLookupError}
                        lastUpdatedAt={requirementsLastUpdatedAt}
                        onRetry={onRetryRequirements}
                    />
                    <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground" aria-live="polite">
                            {shortfallCount.toLocaleString()} of {netRequirements.length.toLocaleString()} product/component rows have a net shortfall
                        </p>
                        <Button
                            type="button"
                            variant={showShortfallsOnly ? "default" : "outline"}
                            size="sm"
                            aria-pressed={showShortfallsOnly}
                            aria-label={`Show only Sales Order products and mapped components with a net shortfall. ${shortfallCount} ${shortfallCount === 1 ? "row" : "rows"}.`}
                            onClick={() => {
                                setShowShortfallsOnly(value => !value);
                                onPageChange(1);
                            }}
                            className="gap-2 self-start sm:self-auto"
                        >
                            <Filter className="h-3.5 w-3.5" />
                            Shortfalls only
                            <Badge variant={showShortfallsOnly ? "secondary" : "outline"} className="px-1.5 py-0 text-[10px]">
                                {shortfallCount.toLocaleString()}
                            </Badge>
                        </Button>
                    </div>
                    {showShortfallsOnly && displayedRequirements.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center text-muted-foreground">
                            <Info className="h-8 w-8 text-green-600" />
                            <span className="text-sm font-semibold text-foreground">No products or mapped components have a net shortfall.</span>
                            <span className="max-w-sm text-xs">All listed requirement rows currently meet their net requirements.</span>
                            <Button type="button" variant="outline" size="sm" onClick={() => setShowShortfallsOnly(false)}>
                                Show all requirement rows
                            </Button>
                        </div>
                    ) : (
                    <>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/5">
                                <TableRow>
                                    <TableHead className="font-bold text-xs">Product Details</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Gross Demand</TableHead>
                                    <TableHead className="font-bold text-xs text-right">On Hand</TableHead>
                                    <TableHead className="font-bold text-xs text-right">Safety Stock</TableHead>
                                    <TableHead className="text-right font-bold text-xs" aria-sort={shortfallsFirst ? "descending" : "none"}>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            aria-label={shortfallsFirst ? "Reset Net Shortfall grouping" : "Group rows with shortfalls first"}
                                            aria-pressed={shortfallsFirst}
                                            title="Group rows with shortfalls before sufficient rows; quantities are not compared across units."
                                            onClick={() => setShortfallsFirst(value => !value)}
                                            className="h-8 gap-1 px-2 text-xs font-bold"
                                        >
                                            Net Shortfall
                                            <ArrowDownUp className="h-3.5 w-3.5" />
                                        </Button>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-border">
                                {visibleRequirements.map((item) => {
                                    const hasShortfall = item.net_shortfall > 0;
                                    const uomLabel = getUnitOfMeasureLabel(item);
                                    const isExpanded = expandedProductId === item.product_id;
                                    const detailsId = `net-requirement-details-${item.product_id}`;
                                    return (
                                        <React.Fragment key={item.product_id}>
                                            <TableRow
                                                className={
                                                    item.is_sub_assembly
                                                        ? "bg-muted/40 hover:bg-muted/60 border-l-2 border-l-sky-500"
                                                        : (hasShortfall ? "bg-red-50/5 hover:bg-red-50/10" : "")
                                                }
                                            >
                                                <TableCell className="py-3">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge variant="outline" className="text-[8px] uppercase tracking-wider">
                                                            {item.is_sub_assembly ? "Mapped BOM component" : "Sales Order product"}
                                                        </Badge>
                                                        <span className="font-bold text-sm text-foreground">{item.product_name}</span>
                                                        <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                                                            {uomLabel}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 flex items-center justify-between gap-2">
                                                        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                                                            {item.product_code}
                                                        </span>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            aria-expanded={isExpanded}
                                                            aria-controls={detailsId}
                                                            aria-label={`${isExpanded ? "Hide" : "Explain"} calculation and Sales Order sources for ${item.product_name}`}
                                                            onClick={() => setExpandedProductId(isExpanded ? null : item.product_id)}
                                                            className="h-7 shrink-0 gap-1 px-2 text-[10px]"
                                                        >
                                                            {isExpanded ? "Hide details" : "Explain"}
                                                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold text-sm">
                                                    <span className="tabular-nums">{item.gross_demand.toLocaleString()} <span className="text-[10px] font-normal text-muted-foreground">{uomLabel}</span></span>
                                                </TableCell>
                                                <TableCell className="text-right text-sm">
                                                    <span className="tabular-nums">{item.on_hand.toLocaleString()} <span className="text-[10px] text-muted-foreground">{uomLabel}</span></span>
                                                </TableCell>
                                                <TableCell className="text-right text-sm text-muted-foreground">
                                                    <span className="tabular-nums">{item.safety_stock.toLocaleString()} <span className="text-[10px]">{uomLabel}</span></span>
                                                </TableCell>
                                                <TableCell className="text-right py-3">
                                                    {hasShortfall ? (
                                                        item.is_sub_assembly ? (
                                                            <Badge variant="outline" className="font-bold font-mono px-2 py-0.5 text-xs text-sky-400 border-sky-500/30 bg-sky-500/5">
                                                                {item.net_shortfall.toLocaleString()} {uomLabel} Short
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="destructive" className="font-bold font-mono px-2 py-0.5 text-xs">
                                                                {item.net_shortfall.toLocaleString()} {uomLabel} Short
                                                            </Badge>
                                                        )
                                                    ) : (
                                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50/10 font-mono px-2 py-0.5 text-xs">
                                                            Sufficient
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                            <TableRow id={detailsId} hidden={!isExpanded} className="bg-muted/10">
                                                <TableCell colSpan={5} className="px-4 py-4">
                                                    {isExpanded && (
                                                        <div className="space-y-4">
                                                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                                                {[
                                                                    ["Gross demand", item.gross_demand],
                                                                    ["On hand", item.on_hand],
                                                                    ["Safety stock", item.safety_stock],
                                                                    ["Net shortfall", item.net_shortfall]
                                                                ].map(([label, value]) => (
                                                                    <div key={String(label)} className="rounded-md border bg-background px-3 py-2">
                                                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
                                                                        <div className="mt-1 text-sm font-bold tabular-nums">{formatRequirementQuantity(Number(value))} {uomLabel}</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">
                                                                Shortfall = max(0, gross demand - (on hand - safety stock)). The demand and stock basis follow the scope shown above.
                                                            </p>
                                                            {item.is_sub_assembly ? (
                                                                <div className="space-y-3">
                                                                    <div>
                                                                        <h3 className="text-xs font-bold text-foreground">Parent products and contributing Sales Orders</h3>
                                                                        <p className="text-[11px] text-muted-foreground">Component demand is derived from each parent-product shortfall and its BOM quantity. Sales Order references identify the source demand; component demand remains aggregated by parent product.</p>
                                                                    </div>
                                                                    {item.derived_parent_demands?.length ? item.derived_parent_demands.map((source) => {
                                                                        const sourceOrders = [...new Map(source.sales_order_lines.map((line) => [line.order_id, line])).values()];
                                                                        return (
                                                                            <div key={source.parent_product_id} className="rounded-md border bg-background px-3 py-2 text-xs">
                                                                                <div className="font-semibold">{source.parent_product_name}</div>
                                                                                <div className="mt-1 text-muted-foreground">
                                                                                    {formatRequirementQuantity(source.parent_shortfall)} parent units x {formatRequirementQuantity(source.quantity_required)} {uomLabel} per parent = {formatRequirementQuantity(source.derived_demand)} {uomLabel}
                                                                                </div>
                                                                                <div className="mt-2 text-[11px]">
                                                                                    <span className="font-semibold">Sales Orders: </span>
                                                                                    {sourceOrders.length
                                                                                        ? sourceOrders.map((line) => line.order_no).join(", ")
                                                                                        : "No source Sales Order references were returned."}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    }) : (
                                                                        <p className="text-xs text-muted-foreground">No parent-product demand sources were returned for this component.</p>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    <h3 className="text-xs font-bold text-foreground">Contributing Sales Order lines</h3>
                                                                    {item.contributing_sales_order_lines?.length ? (
                                                                        <ul className="mt-2 space-y-1 text-xs">
                                                                            {item.contributing_sales_order_lines.map((line) => (
                                                                                <li key={`${line.order_id}-${line.detail_id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md border bg-background px-3 py-2">
                                                                                    <span>
                                                                                        <span className="font-semibold">{line.order_no}</span>
                                                                                        {line.customer_name ? <span className="text-muted-foreground"> - {line.customer_name}</span> : null}
                                                                                        <span className="text-muted-foreground"> - Line {line.detail_id}</span>
                                                                                    </span>
                                                                                    <span className="font-medium tabular-nums">Ordered quantity: {formatRequirementQuantity(line.ordered_quantity)} {uomLabel}</span>
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    ) : (
                                                                        <p className="mt-2 text-xs text-muted-foreground">No contributing Sales Order lines were returned for this product.</p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        </React.Fragment>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    <PlanningPaginationControls
                        {...pagination}
                        page={page}
                        totalItems={displayedRequirements.length}
                        itemLabel="requirement rows"
                    />
                    </>
                    )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
