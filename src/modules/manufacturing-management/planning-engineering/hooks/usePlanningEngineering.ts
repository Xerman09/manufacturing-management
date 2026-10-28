/* eslint-disable */
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { isJobOrderStatus, JOB_ORDER_STATUS, normalizeJobOrderStatus } from "../../job-order-status";
import { Branch, SalesOrder, SalesOrderDetail, NetRequirementItem } from "../types";
import { cancelPendingSalesOrderRequests, fetchBranches, fetchSalesOrders, fetchNetRequirementsRaw, releaseJobOrder, releaseMultipleJobOrders, directAllocate } from "../services/planning-api";
import { buildSalesOrderDemandGroups, buildSalesOrderReleaseGroups, canCreateReplacementJobOrder, isPlanningDemandSalesOrder, isSchedulableSalesOrderLine, remainingQuantity } from "../utils/demand-groups";
import { DEFAULT_PRODUCTION_SHIFT_HOURS, normalizeProductionOutputQuantity } from "../utils/production-timing";
import { createInventoryRefreshScheduler, isRelevantInventoryMovement } from "../utils/inventory-movement-refresh";
import { addCalendarDaysToDateInput, getPhtDateInputValue } from "../../shared/pht-date";

function salesOrderDateValue(value: string | undefined): number {
    const timestamp = Date.parse(value || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareNewestSalesOrders(left: SalesOrder, right: SalesOrder): number {
    const createdDateDifference = salesOrderDateValue(right.created_date) - salesOrderDateValue(left.created_date);
    if (createdDateDifference !== 0) return createdDateDifference;

    const orderDateDifference = salesOrderDateValue(right.order_date) - salesOrderDateValue(left.order_date);
    if (orderDateDifference !== 0) return orderDateDifference;

    return Number(right.order_id) - Number(left.order_id);
}

function parseValidBranchId(value: unknown): number | null {
    const branchId = Number(value);
    return Number.isSafeInteger(branchId) && branchId > 0 ? branchId : null;
}

const EMPTY_SUBASSEMBLY_MAPPING: Record<number, any[]> = {};

function splitJobOrderQueues(data: any[]) {
    return {
        queuedJobs: data.filter((jobOrder: any) => normalizeJobOrderStatus(jobOrder.status) !== null
            && !isJobOrderStatus(
                jobOrder.status,
                JOB_ORDER_STATUS.CANCELLED
            )),
        cancelledJobs: data.filter((jobOrder: any) => isJobOrderStatus(
            jobOrder.status,
            JOB_ORDER_STATUS.CANCELLED
        ))
    };
}

export function usePlanningEngineering() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestedDeepLinkJo = searchParams.get("jo");

    // UI State
    const [loadingBranches, setLoadingBranches] = useState(true);
    const [branchesError, setBranchesError] = useState<string | null>(null);
    const [branchesLastUpdatedAt, setBranchesLastUpdatedAt] = useState<string | null>(null);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [ordersError, setOrdersError] = useState<string | null>(null);
    const [ordersLastUpdatedAt, setOrdersLastUpdatedAt] = useState<string | null>(null);
    const [loadingRequirements, setLoadingRequirements] = useState(false);
    const [requirementsError, setRequirementsError] = useState<string | null>(null);
    const [requirementsLastUpdatedAt, setRequirementsLastUpdatedAt] = useState<string | null>(null);
    const [releasingJO, setReleasingJO] = useState(false);
    const [directAllocating, setDirectAllocating] = useState(false);
    const [versionStock, setVersionStock] = useState<number | null>(null);
    const [loadingVersionStock, setLoadingVersionStock] = useState(false);
    const [isDirectAllocDialogOpen, setIsDirectAllocDialogOpen] = useState(false);
    const [allocationProgress, setAllocationProgress] = useState<number>(0);
    const [allocationStatus, setAllocationStatus] = useState<string>("");

    // Master Data & Lists
    const [branches, setBranches] = useState<Branch[]>([]);
    const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
    const [detailsMap, setDetailsMap] = useState<Record<number, SalesOrderDetail[]>>({});
    const [productionSalesOrders, setProductionSalesOrders] = useState<SalesOrder[]>([]);
    const [productionDetailsMap, setProductionDetailsMap] = useState<Record<number, SalesOrderDetail[]>>({});
    const [loadingProductionOrders, setLoadingProductionOrders] = useState(true);
    const [productionOrdersError, setProductionOrdersError] = useState<string | null>(null);
    const [productionOrdersLastUpdatedAt, setProductionOrdersLastUpdatedAt] = useState<string | null>(null);
    const [netRequirements, setNetRequirements] = useState<NetRequirementItem[]>([]);
    const [subAssemblyMapping, setSubAssemblyMapping] = useState<Record<number, any[]>>({});
    const [subAssemblyLookupState, setSubAssemblyLookupState] = useState<{
        productIdsKey: string;
        status: "loading" | "ready" | "error";
        error: string | null;
    }>({ productIdsKey: "", status: "ready", error: null });
    const [subAssemblyLookupRetryCount, setSubAssemblyLookupRetryCount] = useState(0);

    // Selected Targets
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
    const [selectedDetailIds, setSelectedDetailIds] = useState<number[]>([]);

    // Clear selected detail IDs when changing branches to prevent invalid operations
    useEffect(() => {
        setSelectedDetailIds([]);
    }, [selectedBranchId]);

    // Release Modal state
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [targetQuantity, setTargetQuantity] = useState<number>(0);
    const [plannedDate, setPlannedDate] = useState<string>(getPhtDateInputValue());
    const [dueDate, setDueDate] = useState<string>("");
    const [shiftOption, setShiftOption] = useState<string>(String(DEFAULT_PRODUCTION_SHIFT_HOURS));
    const [priority, setPriority] = useState<number>(0);
    const [remarks, setRemarks] = useState<string>("");
    const [joNumber, setJoNumber] = useState<string>("");
    const [assignments, setAssignments] = useState<Record<number, number[]>>({});

    const [rawUnreleasedJobs, setRawUnreleasedJobs] = useState<any[]>([]);
    const [rawCancelledJobs, setRawCancelledJobs] = useState<any[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(true);
    const [jobOrdersError, setJobOrdersError] = useState<string | null>(null);
    const [jobOrdersLastUpdatedAt, setJobOrdersLastUpdatedAt] = useState<string | null>(null);
    const [releasingDraftId, setReleasingDraftId] = useState<string | null>(null);
    const [pendingDeepLinkJo, setPendingDeepLinkJo] = useState<string | null>(null);
    const [deepLinkJo, setDeepLinkJo] = useState<any | null>(null);
    const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);
    const productionRequestIdRef = useRef(0);
    const branchRequestIdRef = useRef(0);
    const planningOrdersRequestIdRef = useRef(0);
    const jobOrdersRequestIdRef = useRef(0);
    const isMountedRef = useRef(false);
    const netRequirementsRequestIdRef = useRef(0);
    const netRequirementsAbortControllerRef = useRef<AbortController | null>(null);
    const netRequirementsScopeRef = useRef<string | null>(null);
    const subAssemblyScopeRef = useRef<string | null>(null);
    const inventoryRefreshContextRef = useRef({ branchId: null as number | null, productIds: new Set<number>() });
    const refreshNetRequirementsRef = useRef<() => Promise<void>>(async () => undefined);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            productionRequestIdRef.current += 1;
            cancelPendingSalesOrderRequests();
        };
    }, []);

    // Filter unreleased jobs based on selected branch
    const unreleasedJobs = useMemo(() => {
        if (selectedBranchId === null) return [];
        return rawUnreleasedJobs.filter(
            (jo) => jo.branch_id !== undefined && jo.branch_id !== null && Number(jo.branch_id) === Number(selectedBranchId)
        );
    }, [rawUnreleasedJobs, selectedBranchId]);

    const cancelledJobs = useMemo(() => {
        if (selectedBranchId === null) return [];
        return rawCancelledJobs.filter(
            (jo) => jo.branch_id !== undefined && jo.branch_id !== null && Number(jo.branch_id) === Number(selectedBranchId)
        );
    }, [rawCancelledJobs, selectedBranchId]);

    const loadBranches = async () => {
        const requestId = ++branchRequestIdRef.current;
        setLoadingBranches(true);
        setBranchesError(null);
        try {
            const activeBranches = await fetchBranches();
            if (!isMountedRef.current || requestId !== branchRequestIdRef.current) return;
            setBranches(activeBranches);
            setBranchesLastUpdatedAt(new Date().toISOString());
        } catch (err) {
            if (!isMountedRef.current || requestId !== branchRequestIdRef.current) return;
            const message = err instanceof Error ? err.message : "Failed to load branches.";
            console.error("Error loading branches:", err);
            setBranchesError(message);
        } finally {
            if (isMountedRef.current && requestId === branchRequestIdRef.current) setLoadingBranches(false);
        }
    };

    const loadPlanningOrders = async () => {
        const requestId = ++planningOrdersRequestIdRef.current;
        setLoadingOrders(true);
        setOrdersError(null);
        setRequirementsError(null);
        try {
            const soResult = await fetchSalesOrders("planning");
            if (!isMountedRef.current || requestId !== planningOrdersRequestIdRef.current) return;
            setSalesOrders(soResult.data || []);
            setDetailsMap(soResult.detailsMap || {});
            setOrdersLastUpdatedAt(new Date().toISOString());
        } catch (err) {
            if (!isMountedRef.current || requestId !== planningOrdersRequestIdRef.current
                || (err instanceof Error && err.name === "AbortError")) return;
            const message = err instanceof Error ? err.message : "Failed to load schedulable Sales Order demand.";
            console.error("Error loading schedulable Sales Order demand:", err);
            setOrdersError(message);
        } finally {
            if (isMountedRef.current && requestId === planningOrdersRequestIdRef.current) setLoadingOrders(false);
        }
    };

    const loadJobOrders = async () => {
        const requestId = ++jobOrdersRequestIdRef.current;
        setLoadingJobs(true);
        setJobOrdersError(null);
        try {
            const res = await fetch("/api/manufacturing/planning-engineering", { cache: "no-store" });
            const payload = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(typeof payload?.error === "string" ? payload.error : "Failed to load Job Order queue.");
            }
            if (!Array.isArray(payload)) throw new Error("Job Order queue returned an invalid response.");
            if (!isMountedRef.current || requestId !== jobOrdersRequestIdRef.current) return;

            // Keep released Job Orders visible so users can see where they moved.
            const { queuedJobs, cancelledJobs } = splitJobOrderQueues(payload);
            setRawUnreleasedJobs(queuedJobs);
            setRawCancelledJobs(cancelledJobs);
            setJobOrdersLastUpdatedAt(new Date().toISOString());
        } catch (err) {
            if (!isMountedRef.current || requestId !== jobOrdersRequestIdRef.current) return;
            const message = err instanceof Error ? err.message : "Failed to load Job Order queue.";
            console.error("Error loading Job Order queue:", err);
            setJobOrdersError(message);
        } finally {
            if (isMountedRef.current && requestId === jobOrdersRequestIdRef.current) setLoadingJobs(false);
        }
    };

    const handleReleaseDraftFromPlanning = async (joId: string | number): Promise<boolean> => {
        setReleasingDraftId(String(joId));
        try {
            const res = await fetch("/api/manufacturing/planning-engineering", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "initialize",
                    joId,
                    usePhysicalOnHand: true
                })
            });
            const data = await res.json();
            if (!res.ok || data.success === false) {
                const errorMsg = data.error || "Failed to release job order.";
                // Only material shortfalls offer the force-release escape hatch;
                // other failures (e.g. wrong status, missing branch) must not
                // prompt for a forced release that cannot succeed.
                const isShortfall = data.code === "MATERIAL_SHORTAGE" || /Still insufficient raw materials|material reservations are short/i.test(errorMsg);
                if (!isShortfall) {
                    toast.error(errorMsg);
                    return false;
                }
                if (window.confirm(`${errorMsg}\n\nDo you want to forcibly release this Job Order anyway?`)) {
                    const forceRes = await fetch("/api/manufacturing/planning-engineering", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "initialize",
                            joId,
                            usePhysicalOnHand: true,
                            force: true,
                            overrideReason: "Authorized planning shortage override"
                        })
                    });
                    const forceData = await forceRes.json();
                    const forceWarnings = Array.isArray(forceData.warnings)
                        ? forceData.warnings
                        : Array.isArray(forceData.data?.warnings) ? forceData.data.warnings : [];
                    if (!forceRes.ok || forceData.success === false) {
                        throw new Error(forceData.error || "Failed to forcibly release job order.");
                    }
                    if (forceWarnings.length > 0) toast.warning(forceWarnings.join(" "));
                    const forceMessage = "Job Order forcibly released. It stays in the queue ? next step: stage materials.";
                    if (forceWarnings.length > 0) toast.warning(`${forceMessage} ${forceWarnings.join(" ")}`);
                    else toast.success(forceMessage);
                    await loadInitialData();
                    return true;
                }
                return false;
            }
            const warnings = Array.isArray(data.warnings)
                ? data.warnings
                : Array.isArray(data.data?.warnings) ? data.data.warnings : [];
            toast.success("Job Order initialized. Next step: stage its materials on the shop floor.");
            if (warnings.length > 0) toast.warning(warnings.join(" "));
            await loadInitialData();
            return true;
        } catch (err: any) {
            console.error("Failed to release Draft JO:", err);
            toast.error(err.message || "Failed to release job order.");
            return false;
        } finally {
            setReleasingDraftId(null);
        }
    };

    const loadInProductionSalesOrders = async () => {
        const requestId = ++productionRequestIdRef.current;
        setLoadingProductionOrders(true);
        setProductionOrdersError(null);
        try {
            const result = await fetchSalesOrders("in-production");
            if (requestId !== productionRequestIdRef.current) return;
            setProductionSalesOrders(result.data || []);
            setProductionDetailsMap(result.detailsMap || {});
            setProductionOrdersError(null);
            setProductionOrdersLastUpdatedAt(new Date().toISOString());
        } catch (err) {
            if (requestId !== productionRequestIdRef.current || (err instanceof Error && err.name === "AbortError")) return;
            const message = err instanceof Error ? err.message : "Failed to load Sales Orders in production.";
            console.error("Error loading Sales Orders in production:", err);
            setProductionOrdersError(message);
        } finally {
            if (isMountedRef.current && requestId === productionRequestIdRef.current) {
                setLoadingProductionOrders(false);
            }
        }
    };

    // Load independently so one failed endpoint cannot turn another source into a false empty result.
    const loadInitialData = async () => {
        await Promise.all([
            loadBranches(),
            loadPlanningOrders(),
            loadJobOrders(),
            loadInProductionSalesOrders()
        ]);
    };

    useEffect(() => {
        loadInitialData();
    }, []);

    const openCreatedJobOrder = async (jobOrderNo: string) => {
        const normalizedJobOrderNo = String(jobOrderNo || "").trim();
        if (!normalizedJobOrderNo) {
            throw new Error("The created Job Order did not return a valid reference.");
        }

        await loadInitialData();
        setDeepLinkNotice(null);
        setPendingDeepLinkJo(normalizedJobOrderNo);
        router.replace(`/mm/planning-engineering?jo=${encodeURIComponent(normalizedJobOrderNo)}`, { scroll: false });
    };

    // Deep link support: /mm/planning-engineering?jo=JO-XXXX selects the
    // Job Order's branch and opens its planning details. This also reacts to
    // redirects that update the query string while the page is mounted.
    useEffect(() => {
        setPendingDeepLinkJo(requestedDeepLinkJo);
        if (requestedDeepLinkJo) {
            setDeepLinkNotice(null);
        } else {
            setDeepLinkJo(null);
        }
    }, [requestedDeepLinkJo]);

    useEffect(() => {
        if (!pendingDeepLinkJo || loadingJobs || loadingBranches) return;
        const requestedReference = pendingDeepLinkJo.trim().toLowerCase();
        const match = rawUnreleasedJobs.find((jo: any) => [jo.jo_id, jo.job_order_no]
            .some((reference) => String(reference ?? "").trim().toLowerCase() === requestedReference));
        if (match) {
            const persistedBranchId = parseValidBranchId(match.branch_id);
            const isActiveBranch = persistedBranchId !== null
                && branches.some((branch) => Number(branch.id) === persistedBranchId);
            if (isActiveBranch) {
                setSelectedBranchId(persistedBranchId);
                setDeepLinkJo(match);
            } else {
                setDeepLinkNotice(`Job Order ${pendingDeepLinkJo} has no active target branch and cannot be opened in a branch-scoped planning view.`);
            }
        } else {
            setDeepLinkNotice(`Job Order ${pendingDeepLinkJo} is not in the planning queue. It may be cancelled, belong to another branch, or does not exist.`);
        }
        setPendingDeepLinkJo(null);
    }, [pendingDeepLinkJo, rawUnreleasedJobs, loadingJobs, loadingBranches, branches]);

    // Establish Realtime SSE (Server-Sent Events) Connection for inventory movements
    useEffect(() => {
        let eventSource: EventSource | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let isDisposed = false;
        let reconnectAttempts = 0;
        let needsResync = false;
        const movementRefreshScheduler = createInventoryRefreshScheduler(
            () => isDisposed ? Promise.resolve() : refreshNetRequirementsRef.current(),
            { debounceMs: 500, maxWaitMs: 3000 }
        );

        function scheduleReconnect() {
            needsResync = true;
            if (isDisposed || reconnectTimeout !== null) return;

            reconnectAttempts = Math.min(reconnectAttempts + 1, 5);
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            reconnectTimeout = setTimeout(() => {
                reconnectTimeout = null;
                connectSSE();
            }, delay);
        }

        function connectSSE() {
            if (isDisposed || eventSource) return;
            try {
                const source = new EventSource("/api/manufacturing/inventory/movements/stream");
                eventSource = source;

                source.addEventListener("open", () => {
                    if (isDisposed || eventSource !== source) return;
                    reconnectAttempts = 0;
                    if (needsResync) {
                        needsResync = false;
                        movementRefreshScheduler.schedule();
                    }
                });

                source.addEventListener("movement", (event) => {
                    if (isDisposed || eventSource !== source) return;
                    try {
                        const movement = JSON.parse(event.data);
                        const { branchId, productIds } = inventoryRefreshContextRef.current;
                        if (!isRelevantInventoryMovement(movement, branchId, productIds)) return;

                        console.log(`[Planning Realtime SSE] Relevant inventory movement detected (ID: ${movement.movement_id}). Refreshing net requirements...`);
                        movementRefreshScheduler.schedule();
                    } catch (e) {
                        console.error("[Planning Realtime SSE] Error parsing movement event data:", e);
                    }
                });

                source.onerror = () => {
                    if (isDisposed || eventSource !== source) return;
                    source.close();
                    eventSource = null;
                    scheduleReconnect();
                };

            } catch (err) {
                console.error("[Planning Realtime SSE] Error initializing EventSource:", err);
                scheduleReconnect();
            }
        }

        connectSSE();

        return () => {
            isDisposed = true;
            if (eventSource) {
                eventSource.close();
            }
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
            movementRefreshScheduler.dispose();
        };
    }, []);

    // Flatten all sales order details for list display, filtered by selectedBranchId
    const salesOrderLines = useMemo(() => {
        if (selectedBranchId === null) return [];
        const lines: SalesOrderDetail[] = [];
        [...salesOrders].sort(compareNewestSalesOrders).forEach((so) => {
            if (!isPlanningDemandSalesOrder(so)) return;
            if (so.branch_id === undefined || so.branch_id === null || Number(so.branch_id) !== Number(selectedBranchId)) {
                return;
            }
            const details = detailsMap[so.order_id] || [];
            details.forEach((det) => {
                lines.push({
                    ...det,
                    order_no: so.order_no,
                    customer_name: so.customer_name || so.customer_code
                });
            });
        });
        return lines;
    }, [salesOrders, detailsMap, selectedBranchId]);

    // Keep every line in the grouped demand view so scheduled/fulfilled lines
    // remain visible as read-only context. Only schedulable lines flow into
    // planning, selection, and Job Order creation.
    const salesOrderGroups = useMemo(() => {
        const orderById = new Map(salesOrders.map((order) => [Number(order.order_id), order]));
        const grouped = new Map<number, SalesOrderDetail[]>();
        for (const line of salesOrderLines) {
            const orderLines = grouped.get(line.order_id) || [];
            orderLines.push(line);
            grouped.set(line.order_id, orderLines);
        }

        return [...grouped.entries()].map(([orderId, lines]) => ({
            order: orderById.get(orderId) || {
                order_id: orderId,
                order_no: lines[0]?.order_no || `SO #${orderId}`,
                customer_code: lines[0]?.customer_name || "",
                order_date: "",
                order_status: lines[0]?.parent_order_status || "",
                total_amount: 0,
                net_amount: 0,
                remarks: "",
                created_date: "",
                branch_id: selectedBranchId
            },
            lines,
            selectableLines: lines.filter(isSchedulableSalesOrderLine)
        }));
    }, [salesOrders, salesOrderLines, selectedBranchId]);

    const productionSalesOrderGroups = useMemo(
        () => buildSalesOrderDemandGroups(
            productionSalesOrders.filter((order) => order.order_status === "In Production"),
            productionDetailsMap,
            selectedBranchId
        ),
        [productionSalesOrders, productionDetailsMap, selectedBranchId]
    );

    const planningLines = useMemo(
        () => salesOrderLines.filter(isSchedulableSalesOrderLine),
        [salesOrderLines]
    );

    // Fetch BOM components for all unique product IDs in sales orders to find sub-assemblies
    const subAssemblyProductIds = useMemo(() => {
        return Array.from(new Set(
            planningLines
                .map((line) => line.product_id?.product_id)
                .filter((productId): productId is number => typeof productId === "number" && Number.isSafeInteger(productId) && productId > 0)
        )).sort((left, right) => left - right);
    }, [planningLines]);
    const subAssemblyProductIdsKey = subAssemblyProductIds.join(",");
    const subAssemblyLookupStatus: "loading" | "ready" | "error" = subAssemblyProductIds.length === 0
        ? "ready"
        : subAssemblyLookupState.productIdsKey === subAssemblyProductIdsKey
            ? subAssemblyLookupState.status
            : "loading";
    const subAssemblyLookupError = subAssemblyLookupState.productIdsKey === subAssemblyProductIdsKey
        ? subAssemblyLookupState.error
        : null;
    const currentSubAssemblyMapping = subAssemblyLookupState.productIdsKey === subAssemblyProductIdsKey
        ? subAssemblyMapping
        : EMPTY_SUBASSEMBLY_MAPPING;

    useEffect(() => {
        const uniqueProductIds = subAssemblyProductIdsKey
            ? subAssemblyProductIdsKey.split(",").map(Number)
            : [];
        if (uniqueProductIds.length === 0) {
            subAssemblyScopeRef.current = subAssemblyProductIdsKey;
            setSubAssemblyMapping({});
            setSubAssemblyLookupState({ productIdsKey: subAssemblyProductIdsKey, status: "ready", error: null });
            return;
        }

        const controller = new AbortController();
        let isDisposed = false;
        const isNewScope = subAssemblyScopeRef.current !== subAssemblyProductIdsKey;
        subAssemblyScopeRef.current = subAssemblyProductIdsKey;
        setSubAssemblyLookupState({ productIdsKey: subAssemblyProductIdsKey, status: "loading", error: null });
        if (isNewScope) {
            setSubAssemblyMapping({});
            setNetRequirements([]);
            setRequirementsError(null);
            setRequirementsLastUpdatedAt(null);
        }
        if (isNewScope || netRequirements.length === 0) setLoadingRequirements(true);
        const loadSubAssemblyBoms = async () => {
            try {
                const productIds = encodeURIComponent(uniqueProductIds.join(","));
                const response = await fetch(
                    `/api/manufacturing/planning-engineering?action=sub-assembly-bom-components&productIds=${productIds}`,
                    { signal: controller.signal }
                );
                if (!response.ok) {
                    throw new Error(`Sub-assembly BOM lookup failed (${response.status})`);
                }
                const data = await response.json();
                if (isDisposed) return;
                const componentsByProductId = data?.componentsByProductId;
                if (!componentsByProductId || typeof componentsByProductId !== "object" || Array.isArray(componentsByProductId)
                    || uniqueProductIds.some((productId) => !Array.isArray(componentsByProductId[String(productId)]))) {
                    throw new Error("Sub-assembly BOM lookup returned incomplete product data.");
                }

                const mappings: Record<number, any[]> = {};
                uniqueProductIds.forEach((productId) => {
                    const components = componentsByProductId[String(productId)];
                    const subComponents = components.filter((component: any) =>
                        component.component_product_id?.product_type === 388 || component.component_product_id?.is_finished_good
                    );
                    if (subComponents.length > 0) mappings[productId] = subComponents;
                });
                setSubAssemblyMapping(mappings);
                setSubAssemblyLookupState({ productIdsKey: subAssemblyProductIdsKey, status: "ready", error: null });
                setRequirementsError(null);
            } catch (error) {
                if (isDisposed || controller.signal.aborted) return;
                console.error("Failed to load sub-assembly BOM components", error);
                setLoadingRequirements(false);
                setRequirementsError(error instanceof Error ? error.message : "Unable to load sub-assembly BOM components.");
                setSubAssemblyLookupState({
                    productIdsKey: subAssemblyProductIdsKey,
                    status: "error",
                    error: error instanceof Error ? error.message : "Unable to load sub-assembly BOM components."
                });
            }
        };

        void loadSubAssemblyBoms();
        return () => {
            isDisposed = true;
            controller.abort();
        };
    }, [subAssemblyProductIdsKey, subAssemblyLookupRetryCount]);

    const retrySubAssemblyLookup = () => {
        setSubAssemblyLookupState({ productIdsKey: subAssemblyProductIdsKey, status: "loading", error: null });
        setRequirementsError(null);
        setSubAssemblyLookupRetryCount((count) => count + 1);
    };

    // Gather unique product IDs across loaded demand lines (mapping directly to SKU product IDs)
    const demandProductIds = useMemo(() => {
        const ids = new Set<number>();
        planningLines.forEach((line) => {
            const pInfo = line.product_id;
            if (pInfo && pInfo.product_id) {
                ids.add(pInfo.product_id);
            }
        });
        
        // Also add sub-assembly product IDs!
        Object.values(currentSubAssemblyMapping).forEach((comps) => {
            comps.forEach((c) => {
                const scId = c.component_product_id?.product_id;
                if (scId) ids.add(scId);
            });
        });

        return Array.from(ids);
    }, [planningLines, currentSubAssemblyMapping]);

    const netRequirementsScopeKey = [
        selectedBranchId ?? "no-branch",
        planningLines.map((line) => `${line.detail_id}:${line.product_id?.product_id ?? ""}:${line.ordered_quantity}`).join(","),
        JSON.stringify(currentSubAssemblyMapping)
    ].join("|");

    inventoryRefreshContextRef.current = {
        branchId: parseValidBranchId(selectedBranchId),
        productIds: subAssemblyLookupStatus === "ready"
            ? new Set(demandProductIds.map(Number).filter((productId) => Number.isSafeInteger(productId) && productId > 0))
            : new Set<number>()
    };

    // Fetch On-Hand & Safety Stock for the Net Requirements Calculation Grid
    const runFetchNetRequirements = async () => {
        const requestId = ++netRequirementsRequestIdRef.current;
        netRequirementsAbortControllerRef.current?.abort();
        netRequirementsAbortControllerRef.current = null;

        if (netRequirementsScopeRef.current !== netRequirementsScopeKey) {
            netRequirementsScopeRef.current = netRequirementsScopeKey;
            setNetRequirements([]);
            setRequirementsError(null);
            setRequirementsLastUpdatedAt(null);
        }

        const branchId = parseValidBranchId(selectedBranchId);
        if (branchId === null) {
            setNetRequirements([]);
            setRequirementsError(null);
            setRequirementsLastUpdatedAt(null);
            setLoadingRequirements(false);
            return;
        }

        if (loadingOrders) {
            setLoadingRequirements(true);
            return;
        }

        if (ordersError) {
            setRequirementsError(`Demand data could not be refreshed: ${ordersError}`);
            setLoadingRequirements(false);
            return;
        }

        if (subAssemblyLookupStatus === "error") {
            setLoadingRequirements(false);
            return;
        }

        if (subAssemblyLookupStatus === "loading") {
            setLoadingRequirements(true);
            return;
        }

        if (demandProductIds.length === 0) {
            setNetRequirements([]);
            setRequirementsError(null);
            setRequirementsLastUpdatedAt(new Date().toISOString());
            setLoadingRequirements(false);
            return;
        }

        const controller = new AbortController();
        netRequirementsAbortControllerRef.current = controller;
        setLoadingRequirements(true);
        setRequirementsError(null);

        try {
            const data = await fetchNetRequirementsRaw(demandProductIds, branchId, controller.signal);
            if (controller.signal.aborted || requestId !== netRequirementsRequestIdRef.current) return;

            // Group gross demands from all outstanding lines, grouping by SKU product_id directly
            const grossDemandMap: Record<number, number> = {};
            const parentProductIds = new Set<number>();
            const planningLinesByProductId = new Map<number, SalesOrderDetail[]>();
            planningLines.forEach((line) => {
                const pInfo = line.product_id;
                if (pInfo?.product_id !== undefined) {
                    parentProductIds.add(pInfo.product_id);
                    const productLines = planningLinesByProductId.get(pInfo.product_id) || [];
                    productLines.push(line);
                    planningLinesByProductId.set(pInfo.product_id, productLines);
                }
                if (pInfo && pInfo.product_id) {
                    const pId = pInfo.product_id;
                    const qty = Number(line.ordered_quantity || 0);
                    grossDemandMap[pId] = (grossDemandMap[pId] || 0) + qty;
                }
            });

            const toSalesOrderSource = (line: SalesOrderDetail) => ({
                order_id: line.order_id,
                order_no: line.order_no || `Sales Order #${line.order_id}`,
                detail_id: line.detail_id,
                customer_name: line.customer_name || null,
                ordered_quantity: Number(line.ordered_quantity || 0)
            });

            const subAssemblyParentsByComponentId = new Map<number, { parentId: number; quantityRequired: number }[]>();
            Object.entries(currentSubAssemblyMapping).forEach(([parentIdStr, components]) => {
                const parentId = Number(parentIdStr);
                const indexedComponentIds = new Set<number>();
                components.forEach((component) => {
                    const componentProductId = component.component_product_id?.product_id;
                    if (indexedComponentIds.has(componentProductId)) return;
                    indexedComponentIds.add(componentProductId);

                    const parents = subAssemblyParentsByComponentId.get(componentProductId) || [];
                    parents.push({
                        parentId,
                        quantityRequired: Number(component.quantity_required || 0)
                    });
                    subAssemblyParentsByComponentId.set(componentProductId, parents);
                });
            });

            const calculated: NetRequirementItem[] = [];

            // 1. First pass: calculate parent products requirements
            const parentShortfalls: Record<number, number> = {};
            data.forEach((item: any) => {
                const pId = Number(item.product_id);
                const isParent = parentProductIds.has(pId);
                if (isParent) {
                    const grossDemand = grossDemandMap[pId] || 0;
                    const onHand = Number(item.on_hand || 0);
                    const safetyStock = Number(item.safety_stock || 0);
                    const netShortfall = Math.max(0, grossDemand - (onHand - safetyStock));

                    parentShortfalls[pId] = netShortfall;

                    calculated.push({
                        product_id: pId,
                        product_name: item.product_name,
                        product_code: item.product_code,
                        uom_id: item.uom_id ?? null,
                        uom_name: item.uom_name ?? null,
                        uom_shortcut: item.uom_shortcut ?? null,
                        unit_of_measurement: item.unit_of_measurement ?? null,
                        gross_demand: grossDemand,
                        on_hand: onHand,
                        safety_stock: safetyStock,
                        net_shortfall: netShortfall,
                        contributing_sales_order_lines: (planningLinesByProductId.get(pId) || []).map(toSalesOrderSource)
                    });
                }
            });

            // 2. Second pass: calculate sub-assembly requirements based on parent shortfalls
            data.forEach((item: any) => {
                const pId = Number(item.product_id);
                const isParent = parentProductIds.has(pId);
                if (!isParent) {
                    const derivedParentDemands = (subAssemblyParentsByComponentId.get(pId) || []).map(({ parentId, quantityRequired }) => {
                        const parentShortfall = parentShortfalls[parentId] || 0;
                        return {
                            parent_product_id: parentId,
                            parent_product_name: planningLinesByProductId.get(parentId)?.[0]?.product_id?.product_name || `Product #${parentId}`,
                            quantity_required: quantityRequired,
                            parent_shortfall: parentShortfall,
                            derived_demand: parentShortfall * quantityRequired,
                            sales_order_lines: (planningLinesByProductId.get(parentId) || []).map(toSalesOrderSource)
                        };
                    });
                    const subAssemblyGrossDemand = derivedParentDemands.reduce((total, source) => total + source.derived_demand, 0);
                    const associatedParentNames = derivedParentDemands.map((source) => source.parent_product_name);

                    const onHand = Number(item.on_hand || 0);
                    const safetyStock = Number(item.safety_stock || 0);
                    const netShortfall = Math.max(0, subAssemblyGrossDemand - (onHand - safetyStock));

                    calculated.push({
                        product_id: pId,
                        product_name: item.product_name + (associatedParentNames.length > 0 ? ` (BOM component for ${associatedParentNames.join(", ")})` : ""),
                        product_code: item.product_code,
                        uom_id: item.uom_id ?? null,
                        uom_name: item.uom_name ?? null,
                        uom_shortcut: item.uom_shortcut ?? null,
                        unit_of_measurement: item.unit_of_measurement ?? null,
                        gross_demand: subAssemblyGrossDemand,
                        on_hand: onHand,
                        safety_stock: safetyStock,
                        net_shortfall: netShortfall,
                        is_sub_assembly: true,
                        derived_parent_demands: derivedParentDemands
                    });
                }
            });

            if (requestId === netRequirementsRequestIdRef.current) {
                setNetRequirements(calculated);
                setRequirementsLastUpdatedAt(new Date().toISOString());
                setRequirementsError(null);
            }
        } catch (err: any) {
            if (!controller.signal.aborted && requestId === netRequirementsRequestIdRef.current) {
                console.error("Error fetching net requirements:", err);
                setRequirementsError(err instanceof Error ? err.message : "Failed to calculate net requirements.");
            }
        } finally {
            if (requestId === netRequirementsRequestIdRef.current) {
                netRequirementsAbortControllerRef.current = null;
                setLoadingRequirements(false);
            }
        }
    };

    refreshNetRequirementsRef.current = () => runFetchNetRequirements();

    useEffect(() => {
        void runFetchNetRequirements();
        return () => {
            netRequirementsRequestIdRef.current += 1;
            netRequirementsAbortControllerRef.current?.abort();
            netRequirementsAbortControllerRef.current = null;
        };
    }, [selectedBranchId, demandProductIds, planningLines, currentSubAssemblyMapping, subAssemblyLookupStatus, loadingOrders, ordersError, netRequirementsScopeKey]);

    const retryNetRequirements = () => {
        if (ordersError) {
            setRequirementsError(null);
            void loadPlanningOrders();
            return;
        }
        if (subAssemblyLookupStatus === "error") {
            retrySubAssemblyLookup();
            return;
        }
        void runFetchNetRequirements();
    };

    const selectableLinesByDetailId = useMemo(() => {
        const linesByDetailId = new Map<number, SalesOrderDetail>();
        Object.values(productionDetailsMap).flat().forEach((line) => linesByDetailId.set(line.detail_id, line));
        salesOrderLines.forEach((line) => linesByDetailId.set(line.detail_id, line));
        return linesByDetailId;
    }, [productionDetailsMap, salesOrderLines]);

    // Helper: currently selected details, including lines launched from the In Production tab.
    const selectedLines = useMemo(() => {
        const selectedIds = new Set(selectedDetailIds);
        const lines = salesOrderLines.filter((line) => selectedIds.has(line.detail_id) && isSchedulableSalesOrderLine(line));
        const resolvedIds = new Set(lines.map((line) => line.detail_id));
        selectedDetailIds.forEach((detailId) => {
            if (resolvedIds.has(detailId)) return;
            const line = selectableLinesByDetailId.get(detailId);
            if (line && isSchedulableSalesOrderLine(line)) lines.push(line);
        });
        return lines;
    }, [salesOrderLines, selectedDetailIds, selectableLinesByDetailId]);

    const releaseGroups = useMemo(
        () => buildSalesOrderReleaseGroups(selectedLines),
        [selectedLines]
    );

    // Validation checks for merging selected lines
    const mergeValidation = useMemo(() => {
        if (selectedLines.length === 0) {
            return { isValid: false, reason: "Select sales order lines to begin." };
        }

        const hasInvalidIdentity = selectedLines.some((line) =>
            !Number.isInteger(Number(line.product_id?.product_id))
            || Number(line.product_id?.product_id) <= 0
            || !Number.isInteger(Number(line.bom_version_id))
            || Number(line.bom_version_id) <= 0
        );
        if (hasInvalidIdentity || releaseGroups.length !== new Set(selectedLines.map((line) => `${line.product_id?.product_id}:${line.bom_version_id}`)).size) {
            return {
                isValid: false,
                reason: "Cannot release: every selected line must have a valid product and active recipe version."
            };
        }

        return { isValid: releaseGroups.length > 0, reason: "" };
    }, [selectedLines, releaseGroups]);

    // Handle toggling select-all
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedDetailIds(salesOrderLines.filter(isSchedulableSalesOrderLine).map((l) => l.detail_id));
        } else {
            setSelectedDetailIds([]);
        }
    };

    // Handle toggling single line
    const handleSelectLine = (detailId: number, checked: boolean) => {
        if (checked) {
            const line = salesOrderLines.find((candidate) => candidate.detail_id === detailId);
            if (!line || !isSchedulableSalesOrderLine(line)) return;
            setSelectedDetailIds((prev) => prev.includes(detailId) ? prev : [...prev, detailId]);
        } else {
            setSelectedDetailIds((prev) => prev.filter((id) => id !== detailId));
        }
    };

    const handleSelectLines = (detailIds: number[], checked: boolean) => {
        const selectableIds = new Set(detailIds.filter((detailId) => {
            const line = selectableLinesByDetailId.get(detailId);
            return line && isSchedulableSalesOrderLine(line);
        }));
        if (selectableIds.size === 0) return;

        setSelectedDetailIds((previousIds) => {
            if (!checked) return previousIds.filter((detailId) => !selectableIds.has(detailId));

            const nextIds = new Set(previousIds);
            selectableIds.forEach((detailId) => nextIds.add(detailId));
            return Array.from(nextIds);
        });
    };

    const validateReleaseBranch = () => {
        if (parseValidBranchId(selectedBranchId) === null) {
            toast.error("Please select a target branch before releasing a Job Order.");
            return false;
        }
        return true;
    };

    const openReleaseDialog = (linesToRelease: SalesOrderDetail[], isReplacement: boolean) => {
        // Sum total demand
        // Sales-Order-linked JO quantity is authoritative: it is the sum of
        // each selected line's remaining unfulfilled quantity. Net
        // requirements may inform planning, but must not change this link.
        const totalRemaining = linesToRelease.reduce((sum, line) => sum + remainingQuantity(line), 0);
        if (totalRemaining <= 0) {
            toast.error("The selected Sales Order lines have no remaining quantity to schedule.");
            return;
        }

        // Auto generate a JO ID code
        const code = `JO-${Math.floor(100000 + Math.random() * 900000)}`;

        setTargetQuantity(totalRemaining);
        setJoNumber(code);
        const phtToday = getPhtDateInputValue();
        setPlannedDate(phtToday);
        setDueDate(addCalendarDaysToDateInput(phtToday, 7));
        setShiftOption(String(DEFAULT_PRODUCTION_SHIFT_HOURS));
        setPriority(0);
        setRemarks(`${isReplacement ? "Replacement production run" : "Production run"} for: ${linesToRelease.map(l => l.order_no).join(", ")}`);
        setIsConfirmOpen(true);
    };

    // Open the standard release flow for selected schedulable demand.
    const handleInitiateRelease = () => {
        if (!validateReleaseBranch() || !mergeValidation.isValid) return;
        openReleaseDialog(selectedLines, false);
    };

    // Replacement releases must identify and revalidate a single eligible line.
    const handleInitiateReplacementRelease = (replacementDetailId: number) => {
        if (!validateReleaseBranch()) return;

        const line = selectableLinesByDetailId.get(replacementDetailId);
        if (!line || !canCreateReplacementJobOrder(line)) {
            toast.error("This Sales Order line no longer has eligible residual demand. Refresh the In Production list and try again.");
            return;
        }
        const productId = Number(line.product_id?.product_id);
        const bomVersionId = Number(line.bom_version_id);
        if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(bomVersionId) || bomVersionId <= 0) {
            toast.error("Cannot release: the selected line must have a valid product and active recipe version.");
            return;
        }

        setSelectedDetailIds([replacementDetailId]);
        openReleaseDialog([line], true);
    };

    // Release JO Submit
    const handleConfirmRelease = async (
        selectedSubAssemblyVersions?: Record<number, number>,
        groupConfigurations?: Record<string, { subAssemblyVersions: Record<number, number>; assignments: Record<number, number[]> }>,
        initialize = false,
        materialTargetQuantity?: number,
        timingTargetQuantity?: number,
        groupProductionTargets?: Record<string, number>,
        groupMaterialTargets?: Record<string, number>
    ) => {
        const branchId = parseValidBranchId(selectedBranchId);
        if (branchId === null) {
            toast.error("Please select a target branch before creating a Job Order.");
            return;
        }
        if (selectedLines.length === 0) return;

        const maxAvailableQuantity = selectedLines.reduce((sum, line) => sum + remainingQuantity(line), 0);
        const outputUom = (selectedLines[0]?.product_id as any)?.uom_name
            || selectedLines[0]?.product_id?.uom
            || (selectedLines[0] as any)?.unit_of_measurement;
        const requiredOutputQuantity = normalizeProductionOutputQuantity(maxAvailableQuantity, outputUom);
        const operationalTargetQuantity = Number(
            timingTargetQuantity ?? normalizeProductionOutputQuantity(targetQuantity, outputUom)
        );
        if (releaseGroups.length === 1 && (!Number.isFinite(operationalTargetQuantity) || operationalTargetQuantity <= 0)) {
            toast.error("Enter a valid Job Order target quantity.");
            return;
        }
        if (releaseGroups.length === 1 && operationalTargetQuantity < requiredOutputQuantity - 0.000001) {
            toast.error(`The requested Job Order quantity (${operationalTargetQuantity}) is less than the required Sales Order quantity (${requiredOutputQuantity}). Job Order quantity cannot be less than Sales Order quantity.`);
            return;
        }
        if (releaseGroups.length > 1 && releaseGroups.some((group) => {
            const quantity = Number(groupProductionTargets?.[group.key]);
            return !Number.isFinite(quantity) || quantity <= 0;
        })) {
            toast.error("Recipe batch targets are still loading. Please wait and try again.");
            return;
        }

        setReleasingJO(true);
        try {
            let createdJobOrderNo = "";
            if (releaseGroups.length > 1) {
                const result = await releaseMultipleJobOrders({
                    action: "release-multiple",
                    initialize,
                    usePhysicalOnHand: initialize,
                    baseJoNumber: joNumber,
                    shared: { branchId, plannedDate, dueDate, priority, shiftOption, remarks },
                    jobs: releaseGroups.map((group) => {
                        const configuration = groupConfigurations?.[group.key];
                        const groupTarget = Number(groupProductionTargets?.[group.key]);
                        return {
                            productId: group.productId,
                            productName: group.productName,
                            bomVersionId: group.bomVersionId,
                            quantity: groupTarget,
                            timingTargetQuantity: groupTarget,
                            materialTargetQuantity: Number(groupMaterialTargets?.[group.key]),
                            salesOrderIds: group.salesOrderIds,
                            salesOrderDetailIds: group.salesOrderDetailIds,
                            subAssemblyVersionMap: configuration?.subAssemblyVersions || {},
                            assignments: configuration?.assignments || {}
                        };
                    })
                });
                const firstCreatedJob = result.jobs?.[0];
                createdJobOrderNo = String(firstCreatedJob?.jo_id || firstCreatedJob?.job_order_no || "").trim();
                if (!createdJobOrderNo) {
                    throw new Error("The created Job Orders did not return a valid Job Order reference.");
                }
                const successMessage = initialize
                    ? `${result.jobs?.length || releaseGroups.length} Job Orders initialized and ready for material picking.`
                    : `${result.jobs?.length || releaseGroups.length} Job Orders saved as Draft.`;
                if (result.warnings?.length) toast.warning(`${successMessage} ${result.warnings.join(" ")}`);
                else toast.success(successMessage);
            } else {
                const firstLine = selectedLines[0];
                const targetProductId = firstLine.product_id?.product_id;
                const targetProductName = firstLine.product_id?.product_name;
                const uniqueSalesOrderIds = Array.from(new Set(selectedLines.map((l) => l.order_id)));
                const result = await releaseJobOrder({
                    jo: {
                        jo_id: joNumber,
                        product_id: targetProductId,
                        product_name: targetProductName,
                        quantity: operationalTargetQuantity,
                        requested_quantity: operationalTargetQuantity,
                        due_date: dueDate,
                        start_date: plannedDate,
                        uom_id: Number((firstLine.product_id as any)?.uom_id || 0) || null,
                        priority,
                        status: JOB_ORDER_STATUS.DRAFT,
                        is_batched: selectedLines.length > 1,
                        branch_id: branchId,
                        shiftOption,
                        remarks,
                        bom: { version_id: firstLine.bom_version_id },
                        subAssemblyVersionMap: selectedSubAssemblyVersions || {},
                        assignments,
                        products: [{
                            product_id: targetProductId,
                            product_name: targetProductName,
                            quantity: operationalTargetQuantity,
                            requested_quantity: operationalTargetQuantity,
                            material_target_quantity: materialTargetQuantity,
                            timing_target_quantity: timingTargetQuantity ?? operationalTargetQuantity,
                            bom: { version_id: firstLine.bom_version_id }
                        }]
                    },
                    salesOrderIds: uniqueSalesOrderIds,
                    salesOrderDetailIds: selectedLines.map((line) => line.detail_id),
                    initialize,
                    usePhysicalOnHand: initialize
                });
                createdJobOrderNo = String(result.jo_id || result.job_order_no || joNumber).trim();

                const successMessage = !initialize
                    ? `Job Order ${joNumber} saved as Draft. Initialize it from the Job Order Queue when ready.`
                    : `Job Order ${joNumber} initialized and ready for material picking.`;
                if (result.warnings?.length) toast.warning(`${successMessage} ${result.warnings.join(" ")}`);
                else toast.success(successMessage);
            }
            setIsConfirmOpen(false);
            setSelectedDetailIds([]);
            // Refresh the queue before redirecting so the deep-link resolver
            // can open the newly created JO and select its persisted branch.
            await openCreatedJobOrder(createdJobOrderNo);
        } catch (err: any) {
            console.error("Error releasing job order:", err);
            toast.error(err.message || "An error occurred during Job Order explosion & release.");
        } finally {
            setReleasingJO(false);
        }
    };

    // Direct Allocate Submit
    const handleConfirmDirectAllocate = async () => {
        const branchId = parseValidBranchId(selectedBranchId);
        if (branchId === null) {
            toast.error("Please select a target branch before direct allocation.");
            return;
        }
        if (selectedLines.length === 0) return;
        if (releaseGroups.length !== 1) {
            toast.error("Direct allocation is available only when one product and recipe version group is selected.");
            return;
        }
 
        setDirectAllocating(true);
        setAllocationProgress(10);
        setAllocationStatus("Step 1/4: Validating stock levels & sorting FIFO lots...");
        try {
            const firstLine = selectedLines[0];
            const targetProductId = firstLine.product_id?.product_id;
            const targetVersionId = firstLine.bom_version_id;
 
            if (!targetProductId || !targetVersionId) {
                throw new Error("Invalid product or version ID.");
            }
 
            const payload = {
                branchId,
                productId: targetProductId,
                recipeVersionId: targetVersionId,
                lines: selectedLines.map(l => ({
                    detail_id: l.detail_id,
                    ordered_quantity: remainingQuantity(l)
                }))
            };
 
            await new Promise(r => setTimeout(r, 600));
            setAllocationProgress(40);
            setAllocationStatus("Step 2/4: Deducting physical inventory lots...");

            // Trigger allocation call
            const callPromise = directAllocate(payload);

            await new Promise(r => setTimeout(r, 600));
            setAllocationProgress(70);
            setAllocationStatus("Step 3/4: Writing inventory ledger movements...");

            await new Promise(r => setTimeout(r, 600));
            setAllocationProgress(90);
            setAllocationStatus("Step 4/4: Updating Sales Order detail lines & transition statuses...");

            await callPromise;

            setAllocationProgress(100);
            setAllocationStatus("Allocation Complete!");
            await new Promise(r => setTimeout(r, 400));
 
            toast.success(`Direct allocation successful! Stock deducted and order lines ready for invoicing.`);
            setIsDirectAllocDialogOpen(false);
            setSelectedDetailIds([]);
            loadInitialData();
        } catch (err: any) {
            console.error("Error during direct allocation:", err);
            toast.error(err.message || "An error occurred during direct allocation.");
        } finally {
            setDirectAllocating(false);
            setAllocationProgress(0);
            setAllocationStatus("");
        }
    };

    // Load available version stock when selected lines change
    useEffect(() => {
        if (parseValidBranchId(selectedBranchId) === null || !mergeValidation.isValid || releaseGroups.length !== 1 || selectedLines.length === 0) {
            setVersionStock(null);
            return;
        }

        const firstLine = selectedLines[0];
        const pId = firstLine.product_id?.product_id;
        const versionId = firstLine.bom_version_id;

        if (!pId || !versionId) {
            setVersionStock(null);
            return;
        }

        const fetchVersionStock = async () => {
            setLoadingVersionStock(true);
            try {
                const res = await fetch(`/api/manufacturing/planning-engineering?action=version-stock&productId=${pId}&branchId=${selectedBranchId}`);
                if (res.ok) {
                    const stockMap = await res.json();
                    const stock = stockMap[versionId] || 0;
                    setVersionStock(stock);
                } else {
                    setVersionStock(0);
                }
            } catch (err) {
                console.error("Failed to load version stock:", err);
                setVersionStock(0);
            } finally {
                setLoadingVersionStock(false);
            }
        };

        fetchVersionStock();
    }, [selectedBranchId, selectedLines, releaseGroups, mergeValidation.isValid]);

    return {
        loadingBranches,
        branchesError,
        branchesLastUpdatedAt,
        loadingOrders,
        ordersError,
        ordersLastUpdatedAt,
        loadingRequirements,
        requirementsError,
        requirementsLastUpdatedAt,
        requirementsScopeIsCurrent: netRequirementsScopeRef.current === netRequirementsScopeKey,
        retryNetRequirements,
        subAssemblyLookupStatus,
        subAssemblyLookupError,
        retrySubAssemblyLookup,
        releasingJO,
        branches,
        salesOrders,
        netRequirements,
        selectedBranchId,
        setSelectedBranchId,
        selectedDetailIds,
        allocationProgress,
        allocationStatus,
        isConfirmOpen,
        setIsConfirmOpen,
        targetQuantity,
        setTargetQuantity,
        plannedDate,
        setPlannedDate,
        dueDate,
        setDueDate,
        shiftOption,
        setShiftOption,
        priority,
        setPriority,
        remarks,
        setRemarks,
        joNumber,
        setJoNumber,
        loadInitialData,
        openCreatedJobOrder,
        deepLinkJo,
        clearDeepLinkJo: () => setDeepLinkJo(null),
        closeJobOrderEditor: () => {
            setPendingDeepLinkJo(null);
            setDeepLinkJo(null);
            router.replace("/mm/planning-engineering", { scroll: false });
        },
        deepLinkNotice,
        setDeepLinkNotice,
        salesOrderLines,
        salesOrderGroups,
        productionSalesOrderGroups,
        loadingProductionOrders,
        productionOrdersError,
        productionOrdersLastUpdatedAt,
        loadInProductionSalesOrders,
        selectedLines,
        releaseGroups,
        mergeValidation,
        handleSelectAll,
        handleSelectLine,
        handleSelectLines,
        handleInitiateRelease,
        handleInitiateReplacementRelease,
        handleConfirmRelease,
        assignments,
        setAssignments,
        directAllocating,
        versionStock,
        loadingVersionStock,
        isDirectAllocDialogOpen,
        setIsDirectAllocDialogOpen,
        handleConfirmDirectAllocate,
        unreleasedJobs,
        cancelledJobs,
        loadingJobs,
        jobOrdersError,
        jobOrdersLastUpdatedAt,
        releasingDraftId,
        loadBranches,
        loadPlanningOrders,
        loadJobOrders,
        handleReleaseDraftFromPlanning
    };
}
