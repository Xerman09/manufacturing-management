"use client";

import { useState, useEffect, useMemo } from "react";
import { ProductType, Salesman, Supplier } from "../types";
import { fetchProvider } from "../providers/fetchProvider";
import { toast } from "sonner";
import { generatePriceListPDF } from "../utils/generatePriceListPDF";
import { PdfTemplate, pdfTemplateService } from "@/components/pdf-layout-design/services/pdf-template";
import { useTimeZone } from "@/providers/TimeZoneProvider";

const FINISHED_GOODS_PRODUCT_TYPE_ID = 388;

function isFinishedGoodsType(productType: ProductType): boolean {
    return (
        Number(productType.id) === FINISHED_GOODS_PRODUCT_TYPE_ID ||
        productType.name.toLowerCase().includes("finished")
    );
}

export function usePriceList() {
    const { timeZone } = useTimeZone();
    const [salesmen, setSalesmen] = useState<Salesman[]>([]);
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [templates, setTemplates] = useState<PdfTemplate[]>([]);

    const [selectedSalesmanId, setSelectedSalesmanId] = useState<string>("");
    const [selectedProductTypeIds, setSelectedProductTypeIds] = useState<string[]>([]);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
    const [selectedTemplateName, setSelectedTemplateName] = useState<string>("");

    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    const [showBarcode, setShowBarcode] = useState(false);

    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    const [customFilename, setCustomFilename] = useState<string>("");
    const [isFilenameEdited, setIsFilenameEdited] = useState(false);

    const selectedProductTypes = useMemo(() => {
        const selectedSet = new Set(selectedProductTypeIds);
        return productTypes.filter((pt) => selectedSet.has(String(pt.id)));
    }, [productTypes, selectedProductTypeIds]);

    const isFinishedGoodsOnly = useMemo(
        () => selectedProductTypes.length > 0 && selectedProductTypes.every(isFinishedGoodsType),
        [selectedProductTypes]
    );

    const isSupplierRequired = !isFinishedGoodsOnly;

    const selectedProductTypeNames = useMemo(
        () => selectedProductTypes.map((pt) => pt.name).join(", "),
        [selectedProductTypes]
    );

    useEffect(() => {
        if (isFilenameEdited) return;

        if (selectedSupplierId && suppliers.length > 0) {
            const supplier = suppliers.find((s) => s.id === Number(selectedSupplierId));
            if (supplier) {
                const shortcut = supplier.supplier_shortcut || supplier.supplier_name;
                setCustomFilename(`${shortcut} Pricelist Booking`);
                return;
            }
        }

        if (selectedProductTypes.length > 0) {
            const label = selectedProductTypes.map((pt) => pt.name).join(" & ");
            setCustomFilename(`${label} Pricelist Booking`);
            return;
        }

        setCustomFilename("");
    }, [selectedSupplierId, suppliers, selectedProductTypes, isFilenameEdited]);

    const handleFilenameChange = (val: string) => {
        setCustomFilename(val);
        setIsFilenameEdited(true);
    };

    useEffect(() => {
        const init = async () => {
            setIsLoading(true);
            try {
                const [sData, ptData, suppData, tpls] = await Promise.all([
                    fetchProvider.getSalesmen(),
                    fetchProvider.getProductTypes(),
                    fetchProvider.getSuppliers(),
                    pdfTemplateService.fetchTemplates(),
                ]);

                setSalesmen(sData);
                setProductTypes(ptData);
                setSuppliers(suppData);
                setTemplates(tpls);

                if (tpls.length > 0) {
                    setSelectedTemplateName(tpls[0].name);
                }
            } catch (error) {
                console.error("Error loading selection data:", error);
                toast.error(
                    error instanceof Error
                        ? error.message
                        : "Failed to load salesmen, product types, suppliers, or templates"
                );
            } finally {
                setIsLoading(false);
            }
        };
        init();
    }, []);

    useEffect(() => {
        return () => {
            if (pdfUrl) {
                URL.revokeObjectURL(pdfUrl);
            }
        };
    }, [pdfUrl]);

    const handleGenerate = async (options?: { download?: boolean }) => {
        if (!selectedSalesmanId || !selectedTemplateName || (isSupplierRequired && !selectedSupplierId)) {
            toast.warning(
                isSupplierRequired
                    ? "Please select a salesman, supplier, and layout"
                    : "Please select a salesman, product type, and layout"
            );
            return;
        }

        setIsGenerating(true);
        try {
            const productTypeNumericIds = selectedProductTypeIds
                .map((id) => Number(id))
                .filter((id) => Number.isFinite(id) && id > 0);

            const data = await fetchProvider.getPriceList({
                salesmanId: Number(selectedSalesmanId),
                productTypeIds: productTypeNumericIds.length > 0 ? productTypeNumericIds : undefined,
                supplierId: selectedSupplierId ? Number(selectedSupplierId) : undefined,
            });

            if (!data || data.length === 0) {
                toast.info("No price data found for the selected criteria");
                return;
            }

            const salesman = salesmen.find((s) => s.id === Number(selectedSalesmanId));
            const supplier = selectedSupplierId
                ? suppliers.find((s) => s.id === Number(selectedSupplierId))
                : undefined;

            const doc = await generatePriceListPDF({
                items: data,
                templateName: selectedTemplateName,
                salesmanName: salesman?.salesman_name || "-",
                salesmanCode: salesman?.salesman_code || "-",
                supplierName: supplier?.supplier_name || undefined,
                productTypeName: selectedProductTypeNames || undefined,
                showBarcode,
                timeZone,
            });

            if (options?.download) {
                doc.save(`${customFilename || "PriceList"}.pdf`);
            }

            const blob = doc.output("blob");
            const url = URL.createObjectURL(blob);

            if (pdfUrl) {
                URL.revokeObjectURL(pdfUrl);
            }

            setPdfUrl(url);
            setIsPreviewOpen(true);

            if (options?.download) {
                toast.success("Price list downloaded and ready for preview");
            } else {
                toast.success("Price list generated for preview");
            }
        } catch (error) {
            console.error("Error generating price list:", error);
            toast.error(
                error instanceof Error ? error.message : "Failed to generate price list"
            );
        } finally {
            setIsGenerating(false);
        }
    };

    const closePreview = () => {
        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
        }
        setPdfUrl(null);
        setIsPreviewOpen(false);
    };

    return {
        salesmen,
        productTypes,
        suppliers,
        templates,
        selectedSalesmanId,
        setSelectedSalesmanId,
        selectedProductTypeIds,
        setSelectedProductTypeIds,
        isSupplierRequired,
        selectedSupplierId,
        setSelectedSupplierId,
        selectedTemplateName,
        setSelectedTemplateName,
        pdfUrl,
        isPreviewOpen,
        closePreview,
        isLoading,
        isGenerating,
        customFilename,
        handleFilenameChange,
        handleGenerate,
        showBarcode,
        setShowBarcode,
    };
}
