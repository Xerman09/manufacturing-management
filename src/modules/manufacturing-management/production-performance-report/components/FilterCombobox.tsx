"use client";

import React, { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@/components/ui/popover";

export interface ComboboxOption {
    value: string;
    label: string;
    sublabel?: string;
}

interface FilterComboboxProps {
    options: ComboboxOption[];
    value: string;
    onValueChange: (value: string) => void;
    placeholder: string;
    searchPlaceholder?: string;
    emptyLabel?: string;
    disabled?: boolean;
    className?: string;
}

export const FilterCombobox: React.FC<FilterComboboxProps> = ({
    options,
    value,
    onValueChange,
    placeholder,
    searchPlaceholder,
    emptyLabel = "No matching option.",
    disabled = false,
    className
}) => {
    const [open, setOpen] = useState(false);

    const selectedOption = useMemo(
        () => options.find((opt) => opt.value === value),
        [options, value]
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "h-8 w-full justify-between px-2.5 text-xs font-medium bg-background border-border/70 hover:bg-accent/50 transition-colors",
                        !selectedOption && "text-muted-foreground",
                        className
                    )}
                >
                    <span className="truncate text-left">
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[min(560px,calc(100vw-2rem))] min-w-[max(var(--radix-popover-trigger-width),380px)] p-0 rounded-xl shadow-lg border-border/70"
                align="start"
            >
                <Command>
                    <CommandInput
                        placeholder={searchPlaceholder || `Search ${placeholder.toLowerCase()}...`}
                        className="h-9 text-xs"
                    />
                    <CommandList className="max-h-[320px]">
                        <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                            {emptyLabel}
                        </CommandEmpty>
                        <CommandGroup className="p-1.5">
                            {options.map((opt) => {
                                const isSelected = opt.value === value;
                                return (
                                    <CommandItem
                                        key={opt.value}
                                        value={`${opt.label} ${opt.sublabel || ""}`}
                                        onSelect={() => {
                                            onValueChange(opt.value);
                                            setOpen(false);
                                        }}
                                        className={cn(
                                            "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition-colors",
                                            isSelected && "bg-accent font-semibold text-foreground"
                                        )}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate">{opt.label}</div>
                                            {opt.sublabel && (
                                                <div className="truncate text-[10px] font-normal text-muted-foreground">
                                                    {opt.sublabel}
                                                </div>
                                            )}
                                        </div>
                                        <Check
                                            className={cn(
                                                "h-3.5 w-3.5 shrink-0 text-primary transition-opacity",
                                                isSelected ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};
