"use client";

import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Route,
  MapPin,
  FileText,
  Plus,
  Package,
  GripVertical,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { UnifiedRouteStop, EligibleInvoice } from "../../shared.types";
import { formatCurrency, getOrderStatusBadgeStyle } from "../../shared.utils";
import { AddManualStopModal } from "./AddManualStopModal";
import { AddPoStopModal } from "./AddPoStopModal";

export type RouteStopItem = UnifiedRouteStop;

interface RouteSequencePanelProps {
  stops: UnifiedRouteStop[];
  onReorder?: (newStops: UnifiedRouteStop[]) => void;
  onRemoveStop?: (stopId: string) => void;
  onAddManualStop?: (stop: {
    remarks: string;
    distance: number;
    latitude: number | null;
    longitude: number | null;
  }) => void;
  onAddPoStop?: (stop: {
    po_id: number;
    po_no: string;
    supplier_name?: string;
    distance: number;
  }) => void;
  branchId?: number | null;
  vehicleCapacity?: number;
  readOnly?: boolean;
}

interface DraggableStopRowProps {
  stop: UnifiedRouteStop;
  index: number;
  onRemove?: (stopId: string) => void;
  readOnly?: boolean;
}

const DraggableStopRow: React.FC<DraggableStopRowProps> = ({
  stop,
  index,
  onRemove,
  readOnly,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id, disabled: readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isDelivery = stop.type === "DELIVERY";
  const isManual = stop.type === "MANUAL";
  const isPO = stop.type === "PO";

  const invCount = stop.invoices?.length || 0;
  const statusBadge = getOrderStatusBadgeStyle(stop.order_status || "Not Fulfilled");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border bg-card p-3 shadow-xs space-y-2 transition-shadow group overflow-hidden relative",
        isDragging && "shadow-lg ring-1 ring-primary/40 opacity-80 z-20",
        isManual && "border-primary/30 bg-primary/[0.02]",
        isPO && "border-amber-400/40 bg-amber-500/[0.02]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-foreground shrink-0 tabular-nums">
            {index + 1}
          </span>

          {!readOnly && (
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
              {...attributes}
              {...listeners}
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}

          {isPO && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <Badge
                variant="outline"
                className="text-[10px] font-semibold bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300"
              >
                Not Fulfilled
              </Badge>
            </div>
          )}

          {isManual && (
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <Badge
                variant="outline"
                className="text-[10px] font-semibold bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300"
              >
                Manual Stop
              </Badge>
            </div>
          )}

          {isDelivery && (
            <Badge
              variant="outline"
              className={cn("text-[10px] font-semibold", statusBadge.className)}
            >
              {statusBadge.label}
            </Badge>
          )}
        </div>

        {!readOnly && onRemove && (
          <button
            type="button"
            onClick={() => onRemove(stop.id)}
            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
            title="Remove stop"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Main Info */}
      <div>
        {isDelivery && (
          <>
            <p className="text-xs font-bold uppercase text-foreground truncate">
              {stop.store_name || stop.customer_name}
            </p>
            <p className="text-[11px] font-mono text-muted-foreground truncate">
              {stop.order_no}
            </p>
          </>
        )}

        {isManual && (
          <>
            <p className="text-xs font-bold text-foreground truncate">
              {stop.remarks || "Manual Location"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Manual Stop · {stop.distance ?? 0} km
            </p>
          </>
        )}

        {isPO && (
          <>
            <p className="text-xs font-bold font-mono text-foreground truncate">
              {stop.po_no || "Purchase Order"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Purchase Order · {stop.distance ?? 0} km
              {stop.supplier_name ? ` · ${stop.supplier_name}` : ""}
            </p>
          </>
        )}
      </div>

      {/* Delivery-specific amount + invoices + city */}
      {isDelivery && (
        <>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
            <span className="text-muted-foreground text-[11px]">
              {invCount > 0 ? `${invCount} ${invCount === 1 ? "Invoice" : "Invoices"}` : "1 Order"}
            </span>
            <span className="font-mono font-bold text-foreground">
              {formatCurrency(stop.amount)}
            </span>
          </div>

          {invCount > 0 && stop.invoices && (
            <div className="flex flex-wrap gap-1">
              {stop.invoices.map((inv: EligibleInvoice) => (
                <span
                  key={inv.invoice_id}
                  className="inline-flex items-center gap-1 text-[10px] font-mono bg-muted/70 px-1.5 py-0.5 rounded"
                >
                  <FileText className="h-2.5 w-2.5 text-muted-foreground" />
                  {inv.invoice_no}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1 border-t">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate uppercase">{stop.city || "-"}</span>
          </div>
        </>
      )}
    </div>
  );
};

export const RouteSequencePanel: React.FC<RouteSequencePanelProps> = ({
  stops,
  onReorder,
  onRemoveStop,
  onAddManualStop,
  onAddPoStop,
  branchId,
  vehicleCapacity = 0,
  readOnly = false,
}) => {
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;

    const oldIndex = stops.findIndex((s) => s.id === active.id);
    const newIndex = stops.findIndex((s) => s.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const moved = arrayMove(stops, oldIndex, newIndex).map((s, idx) => ({
        ...s,
        sequence: idx + 1,
      }));
      onReorder(moved);
    }
  };

  const totalValue = stops.reduce(
    (sum, s) => sum + (s.type === "DELIVERY" ? Number(s.amount || 0) : 0),
    0
  );

  const totalInvoices = stops.reduce((sum, s) => {
    if (s.type !== "DELIVERY") return sum;
    return sum + (s.invoices && s.invoices.length > 0 ? s.invoices.length : 1);
  }, 0);

  const totalWeight = stops.reduce(
    (sum, s) => sum + (s.type === "DELIVERY" ? Number(s.weight || 0) : 0),
    0
  );

  const weightPercent =
    vehicleCapacity > 0
      ? Math.min(100, Math.round((totalWeight / vehicleCapacity) * 100))
      : 0;

  const existingPoIds = stops
    .filter((s) => s.type === "PO" && s.po_id)
    .map((s) => s.po_id as number);

  return (
    <>
      <div className="flex flex-col h-full min-h-0 border-l bg-muted/10">
        {/* Header matching Image 1: ShoppingCart ROUTE SEQUENCE + Package icon buttons */}
        <div className="p-4 border-b flex items-center justify-between bg-background/60 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingCart className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-foreground block truncate">
                Route Sequence
              </span>
              <span className="text-[11px] text-muted-foreground block">
                {stops.length} {stops.length === 1 ? "stop" : "stops"} in route
              </span>
            </div>
          </div>

          {!readOnly && (
            <div className="flex items-center gap-1 shrink-0">
              {onAddManualStop && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsManualModalOpen(true)}
                  className="h-8 w-8 text-primary hover:bg-primary/10 hover:text-primary"
                  title="Add Manual Stop"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              {onAddPoStop && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsPoModalOpen(true)}
                  className="h-8 w-8 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600 dark:text-amber-400"
                  title="Add Purchase Order Stop"
                >
                  <Package className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Stops List with Draggable Reordering */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-2.5">
            {stops.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed rounded-xl text-muted-foreground gap-1.5">
                <Route className="h-6 w-6 opacity-40" />
                <p className="text-xs font-medium text-foreground">No Delivery Stops</p>
                <p className="text-[11px]">
                  Select Sales Orders on the left, or click + / PO above to add route stops.
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={stops.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {stops.map((stop, index) => (
                    <DraggableStopRow
                      key={stop.id}
                      stop={stop}
                      index={index}
                      onRemove={onRemoveStop}
                      readOnly={readOnly}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </ScrollArea>

        {/* Bottom Summary: Vehicle Capacity + Selected Route Value (matching Image 1) */}
        <div className="p-4 border-t bg-background space-y-3 shrink-0">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                Vehicle Capacity
              </span>
              <span className="font-mono font-medium text-foreground">
                {totalWeight.toFixed(2)} / {vehicleCapacity > 0 ? vehicleCapacity.toFixed(2) : "0.00"} KG
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  weightPercent > 100 ? "bg-destructive" : "bg-primary"
                )}
                style={{ width: `${Math.min(100, weightPercent)}%` }}
              />
            </div>
            <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">
              {vehicleCapacity > 0
                ? `• ${weightPercent}% USED`
                : "• 0% USED (3rd Party Logistics)"}
            </p>
          </div>

          <div className="rounded-lg border bg-primary/[0.04] p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Selected Route Value
              </p>
              <p className="font-mono text-base font-black text-foreground">
                {formatCurrency(totalValue)}
              </p>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {totalInvoices} {totalInvoices === 1 ? "Invoice" : "Invoices"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Sub-modals for adding manual & PO stops */}
      {!readOnly && onAddManualStop && (
        <AddManualStopModal
          open={isManualModalOpen}
          onOpenChange={setIsManualModalOpen}
          onAdd={onAddManualStop}
        />
      )}

      {!readOnly && onAddPoStop && (
        <AddPoStopModal
          open={isPoModalOpen}
          onOpenChange={setIsPoModalOpen}
          onAdd={onAddPoStop}
          existingPoIds={existingPoIds}
          branchId={branchId}
        />
      )}
    </>
  );
};
