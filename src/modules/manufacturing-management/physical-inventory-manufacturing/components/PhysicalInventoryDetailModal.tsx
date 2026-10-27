"use client";

import React, { useState, useEffect } from "react";
import {
    MmLot,
    MmInventoryBatchOption,
    Product,
    ProductType,
    MmPhysicalInventoryDetail,
    StockType,
} from "../types";
import {
    fetchLotsByBranch,
    fetchBatchesByLotAndProduct,
} from "../services/physical-inventory-manufacturing-api";
import SearchableSelect from "./SearchableSelect";
import { X, Plus, AlertTriangle, Layers } from "lucide-react";
import { formatQty } from "../utils/number-format";
import { matchesProductTypeScope, normalizeProductTypeId } from "../utils/product-scope";

interface Props {
    isOpen: boolean;
    branchId: number;
    physicalInventoryId: number;
    stockType: StockType;
    selectedProductTypeId?: number | null;
    productTypes?: ProductType[];
    editingDetail?: MmPhysicalInventoryDetail | null;
    products: Product[];
    lastCreatedLot?: MmLot | null;
    lastCreatedBatch?: MmInventoryBatchOption | null;
    preselectedLotId?: number;
    existingDetails?: MmPhysicalInventoryDetail[];
    onClose: () => void;
    onSaveDetail: (payload: {
        inventory_lot_id?: number;
        draft_batch_id?: number;
        lot_id: number;
        product_id: number;
        physical_count?: number | null;
        inventory_condition: string;
        remarks?: string;
        batch_no?: string;
        manufacturing_date?: string | null;
        expiry_date?: string | null;
        expiration_date?: string | null;
        unit_cost?: number;
    }) => Promise<void>;
    onOpenCreateLotModal: () => void;
    onOpenCreateBatchModal: (lotId: number, productId: number) => void;
}

const getBatchKey = (batch: MmInventoryBatchOption): string => {
    if (batch.batch_kind === "DRAFT" && batch.draft_batch_id) return `draft:${batch.draft_batch_id}`;
    const inventoryLotId = Number(batch.inventory_lot_id || batch.id || 0);
    return inventoryLotId > 0 ? `master:${inventoryLotId}` : "";
};

export default function PhysicalInventoryDetailModal({
    isOpen,
    branchId,
    physicalInventoryId,
    selectedProductTypeId,
    productTypes = [],
    editingDetail,
    products,
    lastCreatedLot,
    lastCreatedBatch,
    preselectedLotId,
    existingDetails,
    onClose,
    onSaveDetail,
    onOpenCreateLotModal,
    onOpenCreateBatchModal,
}: Props) {
    const isEdit = !!editingDetail;

    const [lots, setLots] = useState<MmLot[]>([]);
    const [selectedLotId, setSelectedLotId] = useState<number>(0);
    const [selectedProductId, setSelectedProductId] = useState<number>(0);
    const [batches, setBatches] = useState<MmInventoryBatchOption[]>([]);
    const [selectedBatchKey, setSelectedBatchKey] = useState<string>("");

    const [loadingLots, setLoadingLots] = useState(false);
    const [loadingBatches, setLoadingBatches] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [physicalCount, setPhysicalCount] = useState<string>("");
    const [inventoryCondition, setInventoryCondition] = useState<string>("GOOD");
    const [remarks, setRemarks] = useState<string>("");

    useEffect(() => {
        if (editingDetail) {
            setPhysicalCount(editingDetail.physical_count !== null && editingDetail.physical_count !== undefined ? String(editingDetail.physical_count) : "");
            setInventoryCondition(editingDetail.inventory_condition || "GOOD");
            setRemarks(editingDetail.remarks || "");
        } else {
            setPhysicalCount("");
            setInventoryCondition("GOOD");
            setRemarks("");
        }
    }, [editingDetail, isOpen]);

    const extractLotBranchId = (lot?: MmLot | null): number => {
        if (!lot || !lot.branch_id) return 0;
        if (typeof lot.branch_id === "object" && lot.branch_id !== null) {
            return Number((lot.branch_id as { id?: number; branch_id?: number }).id || (lot.branch_id as { id?: number; branch_id?: number }).branch_id || 0);
        }
        return Number(lot.branch_id || 0);
    };

    // 1. Load lots for branch when modal opens
    useEffect(() => {
        if (isOpen && branchId) {
            setLoadingLots(true);
            setError(null);
            fetchLotsByBranch(branchId)
                .then((data) => {
                    let combined = data || [];
                    if (lastCreatedLot) {
                        const lBranchId = extractLotBranchId(lastCreatedLot);
                        if (lBranchId === Number(branchId)) {
                            const exists = combined.some((l) => l.lot_id === lastCreatedLot.lot_id);
                            if (!exists) combined = [lastCreatedLot, ...combined];
                        }
                    }
                    setLots(combined);
                    if (editingDetail) {
                        const lId = typeof editingDetail.lot_id === "object" ? editingDetail.lot_id.lot_id : editingDetail.lot_id;
                        setSelectedLotId(lId || 0);
                    } else if (preselectedLotId && preselectedLotId > 0) {
                        setSelectedLotId(preselectedLotId);
                    } else if (lastCreatedLot && extractLotBranchId(lastCreatedLot) === Number(branchId)) {
                        setSelectedLotId(lastCreatedLot.lot_id);
                    }
                })
                .catch((err) => setError(err.message))
                .finally(() => setLoadingLots(false));
        }
    }, [isOpen, branchId, editingDetail, lastCreatedLot, preselectedLotId]);

    // Handle new lot created dynamically
    useEffect(() => {
        if (lastCreatedLot && isOpen) {
            const lBranchId = extractLotBranchId(lastCreatedLot);
            if (lBranchId === Number(branchId)) {
                setLots((prev) => {
                    const exists = prev.some((l) => l.lot_id === lastCreatedLot.lot_id);
                    if (exists) return prev;
                    return [lastCreatedLot, ...prev];
                });
                setSelectedLotId(lastCreatedLot.lot_id);
            }
        }
    }, [lastCreatedLot, isOpen, branchId]);

    // Handle new batch created dynamically
    useEffect(() => {
        if (lastCreatedBatch && isOpen) {
            const batchKey = getBatchKey(lastCreatedBatch);
            if (batchKey) {
                setBatches((prev) => {
                    const exists = prev.some((batch) => getBatchKey(batch) === batchKey);
                    if (exists) return prev;
                    return [lastCreatedBatch, ...prev];
                });
                setSelectedBatchKey(batchKey);
            }
        }
    }, [lastCreatedBatch, isOpen]);

    // 2. Load detail initial values when editing or reset state when opening
    useEffect(() => {
        if (isOpen) {
            setError(null);
            if (editingDetail) {
                const lId = typeof editingDetail.lot_id === "object" ? editingDetail.lot_id.lot_id : editingDetail.lot_id;
                const pId = typeof editingDetail.product_id === "object" ? editingDetail.product_id.product_id : editingDetail.product_id;
                const bId = typeof editingDetail.inventory_lot_id === "object" ? editingDetail.inventory_lot_id.inventory_lot_id : editingDetail.inventory_lot_id;
                if (lId) setSelectedLotId(lId);
                setSelectedProductId(pId || 0);
                setSelectedBatchKey(bId ? `master:${bId}` : "");
            } else if (!editingDetail) {
                if (preselectedLotId && preselectedLotId > 0) {
                    setSelectedLotId(preselectedLotId);
                } else {
                    setSelectedLotId(0);
                }
                setSelectedProductId(0);
                setSelectedBatchKey("");
            }
        }
    }, [isOpen, editingDetail, preselectedLotId]);

    // UOM extraction & filtering logic
    const getLotUnitId = (lot?: MmLot | null): number => {
        if (!lot || !lot.unit_id) return 0;
        if (typeof lot.unit_id === "object") return Number(lot.unit_id.unit_id || 0);
        return Number(lot.unit_id || 0);
    };

    const getLotUnitShortcut = (lot?: MmLot | null): string => {
        if (!lot || !lot.unit_id) return "";
        if (typeof lot.unit_id === "object") return String(lot.unit_id.unit_shortcut || lot.unit_id.unit_name || "").toUpperCase();
        return "";
    };

    const getProductUnitId = (prod?: Product | null): number => {
        if (!prod || !prod.unit_of_measurement) return 0;
        if (typeof prod.unit_of_measurement === "object") return Number(prod.unit_of_measurement.unit_id || 0);
        return Number(prod.unit_of_measurement || 0);
    };

    const getProductUnitShortcut = (prod?: Product | null): string => {
        if (!prod || !prod.unit_of_measurement) return "";
        if (typeof prod.unit_of_measurement === "object") return String(prod.unit_of_measurement.unit_shortcut || "").toUpperCase();
        return "";
    };

    const productTypeScopeId = normalizeProductTypeId(selectedProductTypeId);
    const productTypeScopeName = productTypes.find((pt) => normalizeProductTypeId(pt) === productTypeScopeId)?.name
        || productTypes.find((pt) => normalizeProductTypeId(pt) === productTypeScopeId)?.type_name
        || "";

    const filteredLots = React.useMemo(() => {
        // 1. Strict filter by Branch ID
        let list = lots.filter((l) => {
            const lBranchId = extractLotBranchId(l);
            return lBranchId === Number(branchId);
        });

        // 2. Filter by Product Scope (selectedProductTypeId) if specified
        const targetPtId = productTypeScopeId;
        if (targetPtId > 0 && products && products.length > 0) {
            const scopeProducts = products.filter((p) => {
                const productType = normalizeProductTypeId(p.product_type_id) > 0 ? p.product_type_id : p.product_type;
                return matchesProductTypeScope(targetPtId, productType, productTypeScopeName);
            });

            if (scopeProducts.length > 0) {
                const validUnitIds = new Set(scopeProducts.map((p) => getProductUnitId(p)).filter((id) => id > 0));
                const validShortcuts = new Set(scopeProducts.map((p) => getProductUnitShortcut(p)).filter(Boolean));

                list = list.filter((l) => {
                    const lotUId = getLotUnitId(l);
                    const lotShortcut = getLotUnitShortcut(l);
                    if (lotUId > 0 && validUnitIds.has(lotUId)) return true;
                    if (lotShortcut && validShortcuts.has(lotShortcut)) return true;
                    if (!lotUId && !lotShortcut) return true;
                    return false;
                });
            }
        }

        return list;
    }, [lots, branchId, productTypeScopeId, productTypeScopeName, products]);

    const filteredProducts = React.useMemo(() => {
        let list = products;

        // 1. Filter by Product Type if selected on sheet header
        const targetPtId = productTypeScopeId;
        if (targetPtId > 0) {
            list = list.filter((p) => {
                const productType = normalizeProductTypeId(p.product_type_id) > 0 ? p.product_type_id : p.product_type;
                return matchesProductTypeScope(targetPtId, productType, productTypeScopeName);
            });
        }

        // 2. Filter by Lot UOM compatibility if selectedLotId is set
        if (selectedLotId) {
            const selectedLot = lots.find((l) => l.lot_id === selectedLotId);
            if (selectedLot) {
                const lotUId = getLotUnitId(selectedLot);
                const lotShortcut = getLotUnitShortcut(selectedLot);

                if (lotUId || lotShortcut) {
                    list = list.filter((p) => {
                        const pUId = getProductUnitId(p);
                        const pShortcut = getProductUnitShortcut(p);
                        if (lotUId > 0 && pUId > 0) return lotUId === pUId;
                        if (lotShortcut && pShortcut) return lotShortcut === pShortcut;
                        return true;
                    });
                }
            }
        }

        return list;
    }, [productTypeScopeId, productTypeScopeName, selectedLotId, lots, products]);

    const selectedProductIsEligible = selectedProductId > 0
        && filteredProducts.some((product) => product.product_id === selectedProductId);

    useEffect(() => {
        if (!isOpen || isEdit || selectedProductId <= 0 || products.length === 0 || selectedProductIsEligible) return;

        setSelectedProductId(0);
        setSelectedBatchKey("");
        setBatches([]);
        setError(null);
    }, [isOpen, isEdit, selectedProductId, products.length, selectedProductIsEligible]);

    // 3. Load batches when Lot & Product are selected
    useEffect(() => {
        if (selectedLotId && selectedProductId && physicalInventoryId > 0) {
            let active = true;
            setLoadingBatches(true);
            setError(null);

            fetchBatchesByLotAndProduct(selectedLotId, selectedProductId, physicalInventoryId)
                .then((data) => {
                    if (active) setBatches(data);
                })
                .catch((err) => {
                    if (active) setError(err.message);
                })
                .finally(() => {
                    if (active) setLoadingBatches(false);
                });

            return () => {
                active = false;
            };
        } else {
            setBatches([]);
            setLoadingBatches(false);
        }
    }, [selectedLotId, selectedProductId, physicalInventoryId]);

    // Filter out batches that are ALREADY added to this Physical Inventory sheet
    const availableBatches = React.useMemo(() => {
        if (!existingDetails || existingDetails.length === 0) return batches;
        const addedBatchIds = new Set(
            existingDetails.map((d) => {
                if (typeof d.inventory_lot_id === "object" && d.inventory_lot_id !== null) {
                    return Number((d.inventory_lot_id as { inventory_lot_id?: number; id?: number }).inventory_lot_id || (d.inventory_lot_id as { id?: number }).id || 0);
                }
                return Number(d.inventory_lot_id || 0);
            })
        );
        const addedBatchNumbers = new Set(existingDetails.map((detail) => String(detail.batch_no || "").trim().toUpperCase()).filter(Boolean));
        return batches.filter((batch) => {
            if (batch.batch_kind === "DRAFT") {
                return !addedBatchNumbers.has(String(batch.batch_no || "").trim().toUpperCase());
            }
            const batchId = Number(batch.inventory_lot_id || batch.id || 0);
            if (editingDetail) {
                const editBId = typeof editingDetail.inventory_lot_id === "object"
                    ? Number((editingDetail.inventory_lot_id as { inventory_lot_id?: number; id?: number })?.inventory_lot_id || (editingDetail.inventory_lot_id as { id?: number })?.id || 0)
                    : Number(editingDetail.inventory_lot_id || 0);
                if (editBId === batchId) return true;
            }
            return !addedBatchIds.has(batchId);
        });
    }, [batches, existingDetails, editingDetail]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!selectedLotId) {
            setError("Please select a manufacturing lot.");
            return;
        }
        if (!selectedProductId) {
            setError("Please select a product.");
            return;
        }
        if (!selectedBatchKey) {
            setError("Please select or create an inventory batch.");
            return;
        }

        const selectedBatch = availableBatches.find((batch) => getBatchKey(batch) === selectedBatchKey)
            || (lastCreatedBatch && getBatchKey(lastCreatedBatch) === selectedBatchKey ? lastCreatedBatch : null);
        if (!selectedBatch) {
            setError("The selected batch is no longer available. Refresh the batch list and try again.");
            return;
        }
        const isDraftBatch = selectedBatch.batch_kind === "DRAFT";
        const inventoryLotId = isDraftBatch ? undefined : Number(selectedBatch.inventory_lot_id || selectedBatch.id || 0);
        const draftBatchId = isDraftBatch ? Number(selectedBatch.draft_batch_id || 0) : undefined;
        if ((!isDraftBatch && (!inventoryLotId || inventoryLotId <= 0)) || (isDraftBatch && (!draftBatchId || draftBatchId <= 0))) {
            setError("The selected batch has an invalid inventory reference. Refresh the batch list and try again.");
            return;
        }
        const selectedLot = lots.find((l) => Number(l.lot_id || (l as { id?: number }).id) === selectedLotId) || (lastCreatedLot && Number(lastCreatedLot.lot_id || (lastCreatedLot as { id?: number }).id) === selectedLotId ? lastCreatedLot : null);

        const isDraftLot = selectedLotId < 0 || Boolean(selectedLot?.isActive === 0);

        const countVal = physicalCount.trim() === "" ? null : Number(physicalCount);
        if (countVal !== null && (isNaN(countVal) || countVal < 0)) {
            setError("Physical count cannot be negative.");
            return;
        }

        try {
            setSubmitting(true);
            await onSaveDetail({
                ...(inventoryLotId ? { inventory_lot_id: inventoryLotId } : {}),
                ...(draftBatchId ? { draft_batch_id: draftBatchId } : {}),
                lot_id: selectedLotId,
                product_id: selectedProductId,
                physical_count: countVal,
                inventory_condition: inventoryCondition || "GOOD",
                remarks: remarks.trim(),
                ...(isDraftBatch && selectedBatch
                    ? {
                          batch_no: selectedBatch.batch_no,
                          manufacturing_date: selectedBatch.manufacturing_date || null,
                          expiry_date: selectedBatch.expiry_date || selectedBatch.expiration_date || null,
                          expiration_date: selectedBatch.expiry_date || selectedBatch.expiration_date || null,
                          unit_cost: selectedBatch.unit_cost !== undefined ? Number(selectedBatch.unit_cost) : undefined,
                      }
                    : {}),
                ...(isDraftLot && selectedLot
                    ? {
                          lot_name: selectedLot.lot_name,
                          max_batch_capacity: selectedLot.max_batch_capacity,
                      }
                    : {}),
            });
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to save detail";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const boundLot = lots.find((l) => l.lot_id === (selectedLotId || preselectedLotId));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-2xl min-h-[520px] max-h-[90vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30 shrink-0">
                    <h3 className="text-lg font-bold text-foreground">
                        {isEdit
                            ? "Edit Product Count Detail"
                            : preselectedLotId && preselectedLotId > 0
                            ? `Add Batch Row (${boundLot?.lot_name || `Lot #${preselectedLotId}`})`
                            : "Add Product Count Detail"}
                    </h3>
                    <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    <div className="p-6 space-y-5 overflow-y-auto flex-1">
                        {error && (
                            <div className="flex items-center gap-2 p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg dark:bg-rose-950 dark:text-rose-300">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {preselectedLotId && preselectedLotId > 0 && boundLot && (
                            <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 rounded-lg text-xs font-medium">
                                <Layers className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                <span>Adding new batch row pre-bound to Storage Lot: <strong className="font-semibold">{boundLot.lot_name}</strong></span>
                            </div>
                        )}

                        {/* Lot Selection */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-semibold text-muted-foreground">
                                    Manufacturing Lot {preselectedLotId && preselectedLotId > 0 ? "(Locked to Target Lot)" : "*"}
                                </label>
                                {(!preselectedLotId || preselectedLotId <= 0) && (
                                    <button
                                        type="button"
                                        onClick={onOpenCreateLotModal}
                                        className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                                    >
                                        <Plus className="h-3 w-3" />
                                        New Lot
                                    </button>
                                )}
                            </div>
                            <SearchableSelect
                                options={filteredLots.map((l) => {
                                    const uName = typeof l.unit_id === "object" ? l.unit_id.unit_shortcut || l.unit_id.unit_name : "";
                                    return {
                                        value: l.lot_id,
                                        label: l.lot_name,
                                        sublabel: `UOM: ${uName || "N/A"} | Cap: ${formatQty(l.max_batch_capacity)}`,
                                    };
                                })}
                                value={selectedLotId}
                                onChange={(val) => {
                                    setSelectedLotId(Number(val));
                                    setSelectedProductId(0);
                                    setSelectedBatchKey("");
                                }}
                                placeholder={
                                    loadingLots
                                        ? "Loading lots..."
                                        : filteredLots.length === 0
                                        ? "No lots registered for this branch & scope"
                                        : "Select Lot..."
                                }
                                searchPlaceholder="Search lots..."
                                disabled={isEdit || (!!preselectedLotId && preselectedLotId > 0) || loadingLots || filteredLots.length === 0}
                                required
                            />
                        </div>

                        {/* Product Selection */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-semibold text-muted-foreground">Product *</label>
                                {selectedLotId > 0 && (
                                    <span className="text-[11px] font-semibold text-primary">
                                        Filtered by {productTypeScopeName ? `${productTypeScopeName} · ` : ""}UOM: {getLotUnitShortcut(lots.find((l) => l.lot_id === selectedLotId)) || "Lot UOM"}
                                    </span>
                                )}
                            </div>
                            <SearchableSelect
                                options={filteredProducts.map((p) => {
                                    const uName = typeof p.unit_of_measurement === "object" ? (p.unit_of_measurement?.unit_shortcut || p.unit_of_measurement?.unit_name) : "";
                                    const uCount = Number(p.unit_of_measurement_count || 0);
                                    const countText = uCount > 1 && uName ? ` (${uCount} pcs/${uName.toLowerCase()})` : uCount > 1 ? ` (${uCount} pcs)` : "";
                                    return {
                                        value: p.product_id,
                                        label: `[${p.product_code}] ${p.product_name}`,
                                        sublabel: uName ? `UOM: ${uName}${countText}` : countText ? `UOM: ${countText.trim()}` : undefined,
                                    };
                                })}
                                value={selectedProductId}
                                onChange={(val) => {
                                    setSelectedProductId(Number(val));
                                    setSelectedBatchKey("");
                                }}
                                placeholder={
                                    !selectedLotId
                                        ? "Select Lot first..."
                                        : filteredProducts.length === 0
                                        ? "No products matching Lot UOM"
                                        : "Select Product..."
                                }
                                searchPlaceholder="Search products by code or name..."
                                disabled={isEdit || !selectedLotId || filteredProducts.length === 0}
                                required
                            />
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                Catalog products can be counted in this lot even when no batch is assigned to it yet.
                            </p>
                            {selectedLotId > 0 && filteredProducts.length === 0 && (
                                <p className="mt-1 text-[11px] text-amber-600">
                                    No catalog products match this lot&apos;s UOM and audit scope. Register the product in the product master first, or check its UOM and product type.
                                </p>
                            )}
                        </div>

                        {/* Batch Selection */}
                        {selectedLotId > 0 && selectedProductIsEligible && (
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-semibold text-muted-foreground">Inventory Batch # *</label>
                                    <button
                                        type="button"
                                        onClick={() => onOpenCreateBatchModal(selectedLotId, selectedProductId)}
                                        className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Create New Batch
                                    </button>
                                </div>
                                <SearchableSelect
                                    options={availableBatches.map((b) => {
                                        const batchKey = getBatchKey(b);
                                        const exp = b.expiry_date || b.expiration_date;
                                        return {
                                            value: batchKey,
                                            label: `Batch #${b.batch_no}`,
                                            sublabel: `Cost: ₱${b.unit_cost}${exp ? ` | Exp: ${exp}` : ""}`,
                                        };
                                    })}
                                    value={selectedBatchKey}
                                    onChange={(val) => setSelectedBatchKey(String(val))}
                                    placeholder="Select Existing Batch..."
                                    searchPlaceholder="Search batches..."
                                    disabled={isEdit || loadingBatches}
                                    required
                                />
                                {batches.length === 0 && !loadingBatches && (
                                    <p className="text-[11px] text-amber-600 mt-1">This product has no batch assigned to this lot yet. Click &quot;Create New Batch&quot; to record the found stock for this audit.</p>
                                )}
                            </div>
                        )}

                        {/* Physical Count & Condition Inputs */}
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                                    Physical Count Quantity
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={physicalCount}
                                    onChange={(e) => setPhysicalCount(e.target.value)}
                                    placeholder="Leave blank for —"
                                    className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 font-mono"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                                    Inventory Condition
                                </label>
                                <select
                                    value={inventoryCondition}
                                    onChange={(e) => setInventoryCondition(e.target.value)}
                                    className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value="GOOD">GOOD</option>
                                    <option value="DAMAGED">DAMAGED</option>
                                    <option value="QUARANTINED">QUARANTINED</option>
                                    <option value="EXPIRED">EXPIRED</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">
                                Line Item Remarks (Optional)
                            </label>
                            <input
                                type="text"
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                placeholder="Enter variance explanation or remarks..."
                                className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="flex items-center justify-end gap-2 p-4 border-t bg-muted/20 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent border rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-xs"
                        >
                            {submitting ? "Saving Detail..." : isEdit ? "Update Detail" : "Add Detail Row"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
