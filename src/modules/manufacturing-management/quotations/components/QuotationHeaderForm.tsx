import React, { useState, useRef, useEffect } from "react";
import { X, FolderOpen, PlusCircle } from "lucide-react";
import { Customer } from "../types";

interface PriceType {
    price_type_id: string | number;
    price_type_name: string;
}

interface CustomerProject {
    id: number;
    project_name: string;
    customer_id: number;
    customer_name: string;
    customer_code: string;
    status?: string;
}

interface QuotationHeaderFormProps {
    quoteNumber: string;
    setQuoteNumber: (val: string) => void;
    customerSearchText: string;
    selectedCustomerId: string;
    customers: Customer[];
    handleSearchCustomers: (search: string) => void;
    selectCustomer: (id: string, nameCode: string) => void;
    priceTypes: PriceType[];
    selectedPriceTypeId: string;
    setSelectedPriceTypeId: (val: string) => void;
    remarks: string;
    setRemarks: (val: string) => void;
    projectName: string;
    setProjectName: (val: string) => void;
    showValidationErrors?: boolean;
    selectedProjectId?: number | null;
    customerProjects?: CustomerProject[];
    onSelectExistingProject?: (project: CustomerProject | null) => void;
}

export function QuotationHeaderForm({
    quoteNumber,
    setQuoteNumber,
    customerSearchText,
    selectedCustomerId,
    customers,
    handleSearchCustomers,
    selectCustomer,
    priceTypes,
    selectedPriceTypeId,
    setSelectedPriceTypeId,
    remarks,
    setRemarks,
    projectName,
    setProjectName,
    showValidationErrors = false,
    selectedProjectId,
    customerProjects = [],
    onSelectExistingProject
}: QuotationHeaderFormProps) {
    const [isCustomerFocused, setIsCustomerFocused] = useState(false);
    const [isProjectFocused, setIsProjectFocused] = useState(false);
    const customerContainerRef = useRef<HTMLDivElement>(null);
    const projectContainerRef = useRef<HTMLDivElement>(null);

    const inputBorderClass = (val: string) => {
        if (showValidationErrors && !val.trim()) {
            return "border-rose-500 ring-1 ring-rose-500 focus:border-rose-500 focus:ring-rose-500";
        }
        return "border-slate-200 dark:border-slate-800 focus:border-primary focus:ring-primary";
    };

    // Close search dropdown on click outside for inputs
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (customerContainerRef.current && !customerContainerRef.current.contains(event.target as Node)) {
                setIsCustomerFocused(false);
            }
            if (projectContainerRef.current && !projectContainerRef.current.contains(event.target as Node)) {
                setIsProjectFocused(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    // Filtered list for the Customer Client autocomplete selection
    const displayList = customers.slice(0, 10);

    // Filter projects matching search if user types
    const matchingProjects = customerProjects.filter(p =>
        p.project_name.toLowerCase().includes(projectName.toLowerCase()) ||
        (p.customer_name && p.customer_name.toLowerCase().includes(projectName.toLowerCase())) ||
        (p.customer_code && p.customer_code.toLowerCase().includes(projectName.toLowerCase()))
    );


    return (
        <div className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
            <h4 className="text-sm font-bold text-foreground border-b pb-2">Quotation Header</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Quote Number */}
                <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Quote Number (Unique)</label>
                    <input
                        type="text"
                        value={quoteNumber}
                        onChange={e => setQuoteNumber(e.target.value)}
                        className={`w-full rounded border px-3 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 ${inputBorderClass(quoteNumber)}`}
                    />
                </div>

                {/* Project Name / Code (Select Existing or Create New) */}
                <div className="relative" ref={projectContainerRef}>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase block">
                            Project Name / Code
                            {selectedProjectId && (
                                <span className="ml-1.5 inline-flex items-center text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800">
                                    Existing Project
                                </span>
                            )}
                        </label>
                        {customerProjects.length > 0 && !selectedProjectId && (
                            <span className="text-[9px] text-primary/80 font-medium">
                                {customerProjects.length} existing project{customerProjects.length > 1 ? "s" : ""}
                            </span>
                        )}
                    </div>
                    <div className="relative">
                        <input
                            type="text"
                            value={projectName}
                            onFocus={() => setIsProjectFocused(true)}
                            onChange={e => {
                                setIsProjectFocused(true);
                                setProjectName(e.target.value);
                                if (selectedProjectId && onSelectExistingProject) {
                                    onSelectExistingProject(null);
                                }
                            }}
                            placeholder={customerProjects.length > 0 ? "Select an existing project or enter new..." : "e.g. Project Vertex Alpha, Hotel Phase 1"}
                            className={`w-full rounded border pl-3 pr-8 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 ${inputBorderClass(projectName)}`}
                        />
                        {projectName && (
                            <button
                                type="button"
                                onClick={() => {
                                    setProjectName("");
                                    if (onSelectExistingProject) onSelectExistingProject(null);
                                }}
                                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                                title="Clear project"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}

                        {/* Dropdown list for selecting existing customer projects */}
                        {isProjectFocused && (
                            <div className="absolute left-0 right-0 top-full mt-1 max-h-[220px] overflow-y-auto border bg-card rounded-md shadow-lg z-50 divide-y">
                                {customerProjects.length > 0 ? (
                                    <>
                                        <div className="px-3 py-1.5 bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-between">
                                            <span>
                                                {selectedCustomerId ? "Customer Projects" : "All Projects"} ({customerProjects.length})
                                            </span>
                                            <span className="text-[9px] font-normal lowercase">click to link</span>
                                        </div>
                                        {matchingProjects.map((p) => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => {
                                                    if (onSelectExistingProject) {
                                                        onSelectExistingProject(p);
                                                    } else {
                                                        setProjectName(p.project_name);
                                                    }
                                                    setIsProjectFocused(false);
                                                }}
                                                className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors font-medium flex items-center justify-between ${
                                                    selectedProjectId === p.id ? "bg-primary/10 text-primary font-bold" : "text-foreground"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                    <span className="truncate">{p.project_name}</span>
                                                    {!selectedCustomerId && (p.customer_name || p.customer_code) && (
                                                        <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                                            • {p.customer_name || p.customer_code}
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                        {matchingProjects.length === 0 && (
                                            <div className="px-3 py-2 text-xs text-muted-foreground">
                                                No project matching &quot;{projectName}&quot;
                                            </div>
                                        )}
                                        {projectName.trim() && !customerProjects.some(p => p.project_name.toLowerCase() === projectName.trim().toLowerCase()) && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (onSelectExistingProject) onSelectExistingProject(null);
                                                    setIsProjectFocused(false);
                                                }}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold border-t flex items-center gap-2"
                                            >
                                                <PlusCircle className="h-3.5 w-3.5 shrink-0" />
                                                <span>Create as new project: &quot;{projectName.trim()}&quot;</span>
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <div className="p-3 text-xs text-muted-foreground space-y-1">
                                        <p className="font-semibold text-foreground flex items-center gap-1.5">
                                            <PlusCircle className="h-3.5 w-3.5 text-primary" />
                                            New Project Mode
                                        </p>
                                        <p className="text-[11px]">
                                            No existing projects found in database. Type a project name to create one.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Customer Selection Search dropdown */}
                <div className="relative" ref={customerContainerRef}>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase block">Customer Client</label>
                    </div>
                    
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Type to search active customers..."
                            value={customerSearchText}
                            onFocus={() => {
                                setIsCustomerFocused(true);
                                if (customers.length === 0) {
                                    handleSearchCustomers("");
                                }
                            }}
                            onChange={(e) => {
                                setIsCustomerFocused(true);
                                handleSearchCustomers(e.target.value);
                            }}
                            className={`w-full rounded border pl-3 pr-8 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 ${inputBorderClass(selectedCustomerId)}`}
                        />
                        {selectedCustomerId && (
                            <button
                                type="button"
                                onClick={() => {
                                    selectCustomer("", "");
                                    handleSearchCustomers("");
                                }}
                                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                        
                        {/* Dropdown list */}
                        {isCustomerFocused && !selectedCustomerId && (
                            <div className="absolute left-0 right-0 top-full mt-1 max-h-[200px] overflow-y-auto border bg-card rounded-md shadow-lg z-50 divide-y">
                                {displayList.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => {
                                            selectCustomer(String(c.id), `${c.customer_name} (${c.customer_code})`);
                                            setIsCustomerFocused(false);
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors font-medium text-foreground block"
                                    >
                                        {c.customer_name} ({c.customer_code})
                                    </button>
                                ))}
                                {displayList.length === 0 && (
                                    <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                                        No active customers found.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Price Type selection */}
                <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Base Price Type Template</label>
                    <select
                        value={selectedPriceTypeId}
                        onChange={e => setSelectedPriceTypeId(e.target.value)}
                        className={`w-full rounded border px-3 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 ${inputBorderClass(selectedPriceTypeId)}`}
                    >
                        <option value="">-- No Price Type Template --</option>
                        {priceTypes.map(pt => (
                            <option key={pt.price_type_id} value={pt.price_type_id}>
                                Price Type {pt.price_type_name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Notes/Remarks */}
                <div className="md:col-span-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Notes / Remarks</label>
                    <textarea
                        rows={2}
                        value={remarks}
                        onChange={e => setRemarks(e.target.value)}
                        placeholder="Add special instructions, terms, or customer agreement details here..."
                        className="w-full rounded border px-3 py-2 text-xs bg-background text-foreground outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>
        </div>
    );
}
