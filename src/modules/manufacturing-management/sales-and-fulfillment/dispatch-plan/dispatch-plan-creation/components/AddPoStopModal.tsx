"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Search, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PurchaseOrderOption } from "../../shared.types";
import { formatCurrency } from "../../shared.utils";

interface AddPoStopModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (stop: {
    po_id: number;
    po_no: string;
    supplier_name?: string;
    distance: number;
  }) => void;
  existingPoIds?: number[];
  branchId?: number | null;
}

export const AddPoStopModal: React.FC<AddPoStopModalProps> = ({
  open,
  onOpenChange,
  onAdd,
  existingPoIds = [],
  branchId,
}) => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPoId, setSelectedPoId] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | string>(0);

  const loadPOs = useCallback(async (q = "") => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("query", q.trim());
      if (branchId) qs.set("branchId", String(branchId));

      const res = await fetch(
        `/api/manufacturing/sales-and-fulfillment/dispatch-plan/purchase-orders?${qs.toString()}`
      );
      if (!res.ok) throw new Error("Failed to load POs");
      const json = await res.json();
      const list: PurchaseOrderOption[] = json.data || [];
      const filtered = list.filter((p) => !existingPoIds.includes(p.purchase_order_id));
      setPurchaseOrders(filtered);
    } catch {
      toast.error("Failed to load purchase orders");
    } finally {
      setIsLoading(false);
    }
  }, [existingPoIds, branchId]);

  useEffect(() => {
    if (open) {
      setSelectedPoId(null);
      setSearch("");
      setDistance(0);
      loadPOs();
    }
  }, [open, loadPOs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPoId) {
      toast.error("Purchase Order Required", {
        description: "Please select a Purchase Order for this stop.",
      });
      return;
    }

    const targetPo = purchaseOrders.find((p) => p.purchase_order_id === selectedPoId);
    if (!targetPo) return;

    const distNum = typeof distance === "string" ? parseFloat(distance) || 0 : distance || 0;

    onAdd({
      po_id: targetPo.purchase_order_id,
      po_no: targetPo.purchase_order_no,
      supplier_name: targetPo.supplier_name ? String(targetPo.supplier_name) : undefined,
      distance: distNum,
    });

    onOpenChange(false);
  };

  const filteredPOs = purchaseOrders.filter((po) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      po.purchase_order_no.toLowerCase().includes(q) ||
      (po.supplier_name && String(po.supplier_name).toLowerCase().includes(q))
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Package className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-bold">Add Purchase Order Stop</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* PO Search & Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Select Purchase Order <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search PO number or supplier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>

            <div className="border rounded-lg max-h-48 overflow-y-auto divide-y mt-1.5 bg-background">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading purchase orders...
                </div>
              ) : filteredPOs.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No eligible purchase orders found.
                </div>
              ) : (
                filteredPOs.map((po) => {
                  const isSelected = po.purchase_order_id === selectedPoId;
                  return (
                    <button
                      key={po.purchase_order_id}
                      type="button"
                      onClick={() => setSelectedPoId(po.purchase_order_id)}
                      className={cn(
                        "w-full text-left p-2.5 transition-colors flex items-center justify-between text-xs hover:bg-muted/50",
                        isSelected && "bg-primary/5 font-semibold text-primary"
                      )}
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="font-mono font-bold flex items-center gap-1.5">
                          <span>{po.purchase_order_no}</span>
                          <span className="text-[10px] font-sans font-normal px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                            {po.inventory_status || "Not Fulfilled"}
                          </span>
                        </div>
                        {po.supplier_name && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            Supplier: {String(po.supplier_name)}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <span className="font-mono text-xs text-foreground">
                          {formatCurrency(po.total_amount)}
                        </span>
                        {isSelected && <Check className="h-4 w-4 text-primary ml-auto mt-0.5" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Distance */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Estimated Distance (KM)</Label>
            <Input
              type="number"
              min={0}
              step="any"
              value={distance}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setDistance(e.target.value)}
              placeholder="0"
              className="text-xs h-9"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!selectedPoId}>
              Add Stop
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
