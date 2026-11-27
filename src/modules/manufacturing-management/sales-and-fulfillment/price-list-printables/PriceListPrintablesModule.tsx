"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Printer,
    FileText,
    Loader2,
    Users,
    Truck,
    Layout,
    X,
    Download,
    Type,
    Barcode,
    Package,
} from "lucide-react";
import { usePriceList } from "./hooks/usePriceList";
import { Badge } from "@/components/ui/badge";
import { LocalMultiSelect, LocalSearchableSelect } from "./components/LocalSearchableSelect";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function PriceListPrintablesModule() {
    const {
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
    } = usePriceList();

    const salesmanOptions = salesmen.map((s) => ({
        value: String(s.id),
        label: `${s.salesman_name} (${s.salesman_code})`,
    }));

    const productTypeOptions = productTypes.map((pt) => ({
        value: String(pt.id),
        label: pt.name,
    }));

    const supplierOptions = suppliers.map((s) => ({
        value: String(s.id),
        label: s.supplier_name,
    }));

    const layoutOptions = templates.map((t) => ({
        value: t.name,
        label: t.name,
    }));

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="p-8 max-w-4xl mx-auto space-y-8"
        >
            <header className="space-y-2">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
                        <Layout className="text-white" size={24} />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-foreground">
                        Price List Printables
                    </h1>
                </div>
                <p className="text-muted-foreground font-medium ml-12">
                    Generate and print professional product price lists by product type, salesman, and supplier.
                </p>
            </header>

            <Card className="border-none shadow-2xl shadow-black/10 dark:shadow-black/40 rounded-[2.5rem] overflow-hidden bg-card/80 backdrop-blur-sm border border-border">
                <CardHeader className="p-8 pb-4">
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <FileText className="text-blue-500" size={20} />
                        Selection Criteria
                    </CardTitle>
                    <CardDescription>
                        Select the required details below to generate the price list
                    </CardDescription>
                </CardHeader>

                <CardContent className="p-8 pb-4 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Users size={14} className="text-blue-400" />
                                Salesman
                            </Label>
                            <LocalSearchableSelect
                                options={salesmanOptions}
                                value={selectedSalesmanId}
                                onValueChange={setSelectedSalesmanId}
                                placeholder={isLoading ? "Loading salesmen..." : "Select Salesman"}
                                disabled={isLoading || isGenerating}
                                className="h-14 bg-muted/50 border-border rounded-2xl focus:ring-blue-500/20 px-6 font-bold text-foreground transition-all hover:bg-card hover:border-blue-500/30 shadow-sm"
                            />
                        </div>

                        <div className="space-y-3">
                            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Package size={14} className="text-blue-400" />
                                Product Type
                            </Label>
                            <LocalMultiSelect
                                options={productTypeOptions}
                                values={selectedProductTypeIds}
                                onValuesChange={setSelectedProductTypeIds}
                                placeholder={isLoading ? "Loading product types..." : "Select Product Type(s)"}
                                disabled={isLoading || isGenerating}
                                className="h-14 bg-muted/50 border-border rounded-2xl focus:ring-blue-500/20 px-6 font-bold text-foreground transition-all hover:bg-card hover:border-blue-500/30 shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Truck size={14} className="text-blue-400" />
                                Supplier
                                <Badge variant="secondary" className="text-[10px] font-semibold normal-case tracking-normal">
                                    {isSupplierRequired ? "Required" : "Optional"}
                                </Badge>
                            </Label>
                            <LocalSearchableSelect
                                options={supplierOptions}
                                value={selectedSupplierId}
                                onValueChange={setSelectedSupplierId}
                                placeholder={
                                    isLoading
                                        ? "Loading suppliers..."
                                        : isSupplierRequired
                                          ? "Select Supplier"
                                          : "Select Supplier"
                                }
                                disabled={isLoading || isGenerating}
                                allowClear
                                className="h-14 bg-muted/50 border-border rounded-2xl focus:ring-blue-500/20 px-6 font-bold text-foreground transition-all hover:bg-card hover:border-blue-500/30 shadow-sm"
                            />
                        </div>

                        <div className="space-y-3">
                            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Layout size={14} className="text-blue-400" />
                                PDF Template Layout
                            </Label>
                            <LocalSearchableSelect
                                options={layoutOptions}
                                value={selectedTemplateName}
                                onValueChange={setSelectedTemplateName}
                                placeholder={isLoading ? "Loading layouts..." : "Select Layout"}
                                disabled={isLoading || isGenerating}
                                className="h-14 bg-muted/50 border-border rounded-2xl focus:ring-blue-500/20 px-6 font-bold text-foreground transition-all hover:bg-card hover:border-blue-500/30 shadow-sm"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                        <div className="space-y-3">
                            <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <Type size={14} className="text-blue-400" />
                                Export File Name
                            </Label>
                            <Input
                                value={customFilename}
                                onChange={(e) => handleFilenameChange(e.target.value)}
                                placeholder="Enter custom filename..."
                                disabled={isLoading || isGenerating}
                                className="h-14 bg-muted/50 border-border rounded-2xl focus:ring-blue-500/20 px-6 font-bold text-foreground transition-all hover:bg-card hover:border-blue-500/30 shadow-sm"
                            />
                        </div>

                        <div className="flex flex-row items-center justify-between h-14 rounded-2xl border border-border bg-muted/50 px-6 shadow-sm">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-bold text-foreground flex items-center gap-2">
                                    <Barcode size={16} className="text-blue-500" />
                                    Show Barcode
                                </Label>
                                <p className="text-[11px] text-muted-foreground font-medium">
                                    Include product barcodes in printout
                                </p>
                            </div>
                            <Switch
                                checked={showBarcode}
                                onCheckedChange={setShowBarcode}
                                disabled={isLoading || isGenerating}
                                className="data-[state=checked]:bg-blue-600"
                            />
                        </div>
                    </div>

                    <div className="p-6 bg-blue-500/10 rounded-3xl border border-blue-500/20 flex items-start gap-4">
                        <div className="p-2 bg-card rounded-lg shadow-sm border border-blue-500/20">
                            <Layout className="text-blue-500" size={18} />
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-bold text-foreground text-sm">Design Selection</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                                Pick one or more <strong>Product Types</strong>.{" "}
                                {isSupplierRequired
                                    ? "Supplier is required for non-Finished Goods product types."
                                    : "Leave Supplier blank for in-house Finished Goods (has BOM), or pick a Supplier to scope to that supplier."}
                            </p>
                        </div>
                    </div>
                </CardContent>

                <CardFooter className="p-8 bg-muted/50 border-t border-border/50 flex justify-end">
                    <Button
                        onClick={() => handleGenerate({ download: false })}
                        disabled={
                            isGenerating ||
                            !selectedSalesmanId ||
                            !selectedTemplateName ||
                            (isSupplierRequired && !selectedSupplierId)
                        }
                        className="h-14 px-12 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-200 transition-all active:scale-95 disabled:bg-muted disabled:shadow-none"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="mr-2 animate-spin" size={20} />
                                Preparing Print...
                            </>
                        ) : (
                            <>
                                <Printer className="mr-2" size={20} />
                                Print Price List
                            </>
                        )}
                    </Button>
                </CardFooter>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-card rounded-3xl shadow-lg shadow-black/10 dark:shadow-black/40 border border-border flex flex-col items-center text-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                        <Badge variant="outline" className="bg-green-500 text-white border-none text-[10px] h-5">
                            1
                        </Badge>
                    </div>
                    <h3 className="font-bold text-foreground">Configure</h3>
                    <p className="text-xs text-muted-foreground font-medium">
                        Pick a salesman, product type, supplier (if needed), and layout.
                    </p>
                </div>
                <div className="p-6 bg-card rounded-3xl shadow-lg shadow-black/10 dark:shadow-black/40 border border-border flex flex-col items-center text-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Badge variant="outline" className="bg-blue-500 text-white border-none text-[10px] h-5">
                            2
                        </Badge>
                    </div>
                    <h3 className="font-bold text-foreground">Preview</h3>
                    <p className="text-xs text-muted-foreground font-medium">
                        Review the price list in a live modal before printing.
                    </p>
                </div>
                <div className="p-6 bg-card rounded-3xl shadow-lg shadow-black/10 dark:shadow-black/40 border border-border flex flex-col items-center text-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                        <Badge variant="outline" className="bg-purple-500 text-white border-none text-[10px] h-5">
                            3
                        </Badge>
                    </div>
                    <h3 className="font-bold text-foreground">Final Print</h3>
                    <p className="text-xs text-muted-foreground font-medium">
                        Use the built-in PDF controls to print or save the document.
                    </p>
                </div>
            </div>

            <AnimatePresence>
                {isPreviewOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-slate-900/60 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 8 }}
                            transition={{ duration: 0.2 }}
                            className="bg-card w-full max-w-6xl h-full rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
                        >
                            <div className="p-6 border-b border-border flex items-center justify-between bg-card shrink-0">
                                <div>
                                    <h3 className="text-xl font-extrabold text-foreground tracking-tight">
                                        Print Preview
                                    </h3>
                                    <p className="text-xs text-muted-foreground font-medium mt-1">
                                        Exporting as:{" "}
                                        <span className="text-blue-600 font-bold">
                                            {customFilename || "PriceList"}.pdf
                                        </span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center gap-2 px-6 h-10 shadow-lg shadow-blue-200"
                                        onClick={() => handleGenerate({ download: true })}
                                    >
                                        <Download size={16} />
                                        Download PDF
                                    </Button>
                                    <button
                                        onClick={closePreview}
                                        className="p-2 hover:bg-accent rounded-2xl transition-all text-muted-foreground hover:text-red-500 active:scale-95"
                                    >
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 bg-muted p-4 md:p-8 flex items-center justify-center relative">
                                {pdfUrl ? (
                                    <iframe
                                        src={pdfUrl}
                                        className="w-full h-full rounded-2xl border border-border shadow-xl bg-card"
                                        title="Price List Preview"
                                    />
                                ) : (
                                    <div className="animate-pulse flex flex-col items-center gap-4 text-muted-foreground">
                                        <div className="h-20 w-20 bg-muted rounded-full flex items-center justify-center">
                                            <Layout size={40} />
                                        </div>
                                        <div className="h-4 w-32 bg-muted rounded-md"></div>
                                        <p className="text-sm font-bold">Preparing preview...</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
