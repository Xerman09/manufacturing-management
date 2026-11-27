"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import IncomingShipments from "@/modules/manufacturing-management/procurement/components/IncomingShipments";
import { usePurchaseOrder, type PurchaseOrderViewMode } from "./hooks/usePurchaseOrder";
import type { PurchaseOrderDraftResponse } from "./types";

export default function PurchaseOrderModule({
    mode = "queue",
    shipmentId,
    backHref
}: {
    mode?: PurchaseOrderViewMode;
    shipmentId?: number;
    backHref?: string;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const baseRoute = backHref || pathname;
    const handleCreated = useCallback((result: PurchaseOrderDraftResponse) => {
        if (mode === "create") {
            router.replace(`${baseRoute}?shipmentId=${encodeURIComponent(String(result.purchaseOrderId))}`);
        }
    }, [baseRoute, mode, router]);
    const handleExitCreate = useCallback(() => {
        router.push(baseRoute);
    }, [baseRoute, router]);
    const purchaseOrder = usePurchaseOrder({
        mode,
        shipmentId,
        onCreated: mode === "create" ? handleCreated : undefined
    });
    return (
        <div className="flex w-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden space-y-4">
            <IncomingShipments
                shipments={purchaseOrder.shipments}
                suppliers={purchaseOrder.suppliers}
                rawMaterials={purchaseOrder.rawMaterials}
                supplierLinkedProducts={purchaseOrder.supplierLinkedProducts}
                selectedShipment={purchaseOrder.selectedShipment}
                setSelectedShipment={purchaseOrder.setSelectedShipment}
                lines={purchaseOrder.selectedShipmentLines}
                isModalOpen={purchaseOrder.isShipmentModalOpen}
                setIsModalOpen={purchaseOrder.setIsShipmentModalOpen}
                shipmentForm={purchaseOrder.shipmentForm}
                setShipmentForm={purchaseOrder.setShipmentForm}
                linesForm={purchaseOrder.shipmentLinesForm}
                setLinesForm={purchaseOrder.setShipmentLinesForm}
                onCreateShipment={purchaseOrder.handleCreateShipment}
                onEditShipment={purchaseOrder.handleEditShipment}
                onCancelRejectedPurchaseOrder={purchaseOrder.handleCancelRejectedShipment}
                onTriggerAllocation={() => undefined}
                loading={purchaseOrder.loading}
                listLoading={purchaseOrder.listLoading}
                detailLoading={purchaseOrder.detailLoading}
                listError={purchaseOrder.listError}
                detailError={purchaseOrder.detailError}
                referenceError={purchaseOrder.referenceError}
                onRetryList={purchaseOrder.retryList}
                onRetryDetail={purchaseOrder.retryDetail}
                serverList={{
                    total: purchaseOrder.listMeta.total,
                    totalPages: purchaseOrder.listMeta.totalPages,
                    onQueryChange: purchaseOrder.loadShipments
                }}
                canonicalDrafting
                branches={purchaseOrder.branches}
                paymentTypes={purchaseOrder.paymentTypes}
                paymentModes={purchaseOrder.paymentModes}
                priceTypeRules={purchaseOrder.priceTypeRules}
                paymentTerms={purchaseOrder.paymentTerms}
                jobOrders={purchaseOrder.jobOrders}
                displayMode={mode}
                backHref={backHref}
                onExitCreate={mode === "create" ? handleExitCreate : undefined}
            />
        </div>
    );
}
