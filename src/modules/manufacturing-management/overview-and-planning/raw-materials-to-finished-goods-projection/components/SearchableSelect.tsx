"use client";

import React, { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableOption {
    value: string | number;
    label: string;
    subLabel?: string;
    badge?: string;
    disabled?: boolean;
}

interface SearchableSelectProps {
    options: SearchableOption[];
    value: string | number | null | undefined;
    onChange: (val: string | number) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    disabled?: boolean;
    className?: string;
    triggerClassName?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = "Select option...",
    searchPlaceholder = "Search...",
    emptyText = "No items found.",
    disabled = false,
    className,
    triggerClassName,
}) => {
    const [open, setOpen] = useState(false);

    // Deduplicate options by value to guarantee unique React keys and clean UX
    const uniqueOptions = useMemo(() => {
        const seen = new Set<string | number>();
        return options.filter((opt) => {
            const val = opt.value;
            if (seen.has(val)) return false;
            seen.add(val);
            return true;
        });
    }, [options]);

    const selectedOption = uniqueOptions.find(
        (opt) => String(opt.value) === String(value)
    );

    return (
        <div className={cn("relative w-full", className)}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={disabled}
                        className={cn(
                            "w-full justify-between font-normal text-left h-10 border-input bg-background px-3 py-2 text-sm ring-offset-background",
                            !selectedOption && "text-muted-foreground",
                            triggerClassName
                        )}
                    >
                        <span className="truncate">
                            {selectedOption ? selectedOption.label : placeholder}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0"
                    align="start"
                >
                    <Command className="w-full">
                        <CommandInput placeholder={searchPlaceholder} />
                        <CommandList className="w-full max-h-60 overflow-y-auto">
                            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                                {emptyText}
                            </CommandEmpty>
                            <CommandGroup>
                                {uniqueOptions.map((option, idx) => {
                                    const isSelected = String(option.value) === String(value);
                                    return (
                                        <CommandItem
                                            key={`${String(option.value)}-${idx}`}
                                            value={`${option.label} ${option.subLabel || ""}`}
                                            disabled={option.disabled}
                                            onSelect={() => {
                                                onChange(option.value);
                                                setOpen(false);
                                            }}
                                            className="flex items-center justify-between py-2 cursor-pointer"
                                        >
                                            <div className="flex flex-col truncate pr-2">
                                                <span className={cn("text-sm font-medium", isSelected && "text-primary font-semibold")}>
                                                    {option.label}
                                                </span>
                                                {option.subLabel && (
                                                    <span className="text-xs text-muted-foreground truncate">
                                                        {option.subLabel}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {option.badge && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                                                        {option.badge}
                                                    </span>
                                                )}
                                                <Check
                                                    className={cn(
                                                        "h-4 w-4 text-primary transition-opacity",
                                                        isSelected ? "opacity-100" : "opacity-0"
                                                    )}
                                                />
                                            </div>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
};
