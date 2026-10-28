"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OffsettingLineDetail, OffsettingPairing } from "../types";
import { normalizeOffsetPairings } from "../utils/offset-pairings";

interface OffsetPairEditorProps {
    pair: OffsettingPairing;
    pairings: OffsettingPairing[];
    details: OffsettingLineDetail[];
    reasons: readonly string[];
    trigger: HTMLElement | null;
    onApply: (pairings: OffsettingPairing[]) => void;
    onClose: () => void;
}

export default function OffsetPairEditor({ pair, pairings, details, reasons, trigger, onApply, onClose }: OffsetPairEditorProps) {
    const [quantity, setQuantity] = useState(String(pair.offset_pieces ?? pair.offset_qty));
    const [reason, setReason] = useState(pair.reason_code);
    const [notes, setNotes] = useState(pair.notes || "");
    const [error, setError] = useState<string | null>(null);
    const crossProduct = pair.shortage_product_id !== pair.surplus_product_id;
    const shortage = details.find(row => Number(row.physical_inventory_detail_id || row.id) === Number(pair.shortage_detail_id));
    const surplus = details.find(row => Number(row.physical_inventory_detail_id || row.id) === Number(pair.surplus_detail_id));
    const otherAllocated = (id: number) => pairings.filter(other => other.id !== pair.id && (other.shortage_detail_id === id || other.surplus_detail_id === id))
        .reduce((total, other) => total + Number(other.offset_pieces ?? other.offset_qty), 0);
    const maximum = shortage && surplus ? Math.max(0, Math.min(
        (Number(shortage.system_count) - Number(shortage.physical_count)) * Number(pair.shortage_uom_count || 1) - otherAllocated(pair.shortage_detail_id),
        (Number(surplus.physical_count) - Number(surplus.system_count)) * Number(pair.surplus_uom_count || 1) - otherAllocated(pair.surplus_detail_id)
    )) : 0;
    const fieldClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600";

    return (
        <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={event => { event.preventDefault(); trigger?.focus(); }}>
                <DialogHeader>
                    <DialogTitle>Edit offset pair</DialogTitle>
                    <DialogDescription>Apply changes here, then use Save audit record to persist them.</DialogDescription>
                </DialogHeader>
                <div className="rounded-md bg-muted p-3 text-sm space-y-2">
                    <p><strong>Shortage:</strong> {pair.shortage_product_name} · {pair.shortage_lot_name || pair.shortage_lot_id} · {pair.shortage_batch_no || "No batch"}</p>
                    <p><strong>Surplus:</strong> {pair.surplus_product_name} · {pair.surplus_lot_name || pair.surplus_lot_id} · {pair.surplus_batch_no || "No batch"}</p>
                </div>
                <form className="space-y-4" onSubmit={event => {
                    event.preventDefault();
                    try {
                        const updated = { ...pair, offset_qty: Number(quantity), offset_pieces: Number(quantity), reason_code: reason, notes };
                        onApply(normalizeOffsetPairings(pairings.map(other => other.id === pair.id ? updated : other), details));
                        onClose();
                    } catch (failure) {
                        setError(failure instanceof Error ? failure.message : "The pair could not be updated.");
                    }
                }}>
                    <div className="space-y-1">
                        <label htmlFor="edit-offset-quantity" className="text-sm font-semibold">Offset quantity (pcs)</label>
                        <input id="edit-offset-quantity" type="number" step="any" required value={quantity} onChange={event => setQuantity(event.target.value)} aria-describedby="edit-offset-maximum" className={fieldClass} />
                        <p id="edit-offset-maximum" className="text-xs text-muted-foreground">Available for this pair: {maximum.toLocaleString()} pcs. Other pairs keep their allocations.</p>
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="edit-offset-reason" className="text-sm font-semibold">Reason code{crossProduct ? " (required)" : ""}</label>
                        <select id="edit-offset-reason" value={reason} required={crossProduct} onChange={event => setReason(event.target.value)} className={fieldClass}>
                            <option value="">Select a reason</option>
                            {[...new Set([...reasons, ...(pair.reason_code ? [pair.reason_code] : [])])].map(value => <option key={value} value={value}>{value}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="edit-offset-note" className="text-sm font-semibold">Auditor note{crossProduct ? " (required)" : ""}</label>
                        <textarea id="edit-offset-note" rows={3} value={notes} required={crossProduct} onChange={event => setNotes(event.target.value)} className={fieldClass} />
                    </div>
                    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm focus-visible:outline-2">Cancel</button>
                        <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2">Apply changes</button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
