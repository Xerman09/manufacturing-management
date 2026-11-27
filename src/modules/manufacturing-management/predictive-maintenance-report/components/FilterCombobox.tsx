"use client";

import React, { useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Option {
    id: string;
    label: string;
    subLabel?: string;
}

interface FilterComboboxProps {
    options: Option[];
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    className?: string;
    allLabel?: string;
}

export function FilterCombobox({
    options,
    value,
    onChange,
    placeholder = "Select...",
    className,
    allLabel = "All"
}: FilterComboboxProps) {
    const [open, setOpen] = useState(false);

    const selectedOption = options.find((o) => o.id === value);
    const displayLabel = value === "all" ? allLabel : selectedOption ? selectedOption.label : placeholder;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("h-9 w-full justify-between text-left font-normal", className)}
                >
                    <span className="truncate">{displayLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
                    <CommandList>
                        <CommandEmpty>No option found.</CommandEmpty>
                        <CommandGroup>
                            <CommandItem
                                value="all"
                                onSelect={() => {
                                    onChange("all");
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    className={cn("mr-2 h-4 w-4", value === "all" ? "opacity-100" : "opacity-0")}
                                />
                                {allLabel}
                            </CommandItem>
                            {options.map((option) => (
                                <CommandItem
                                    key={option.id}
                                    value={option.label}
                                    onSelect={() => {
                                        onChange(option.id);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === option.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col truncate">
                                        <span className="truncate font-medium">{option.label}</span>
                                        {option.subLabel && (
                                            <span className="text-xs text-muted-foreground">
                                                {option.subLabel}
                                            </span>
                                        )}
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
