"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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

export interface ComboboxOption {
    value: string;
    label: string;
    subLabel?: string;
    extra?: Record<string, unknown>;
}

interface ComboboxSelectProps {
    options: ComboboxOption[];
    value: string;
    onChange: (value: string, selectedOption?: ComboboxOption) => void;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    allowAdHoc?: boolean;
    disabled?: boolean;
    className?: string;
}

export const ComboboxSelect: React.FC<ComboboxSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = "Select an option...",
    searchPlaceholder = "Search...",
    emptyText = "No results found.",
    allowAdHoc = true,
    disabled = false,
    className,
}) => {
    const [open, setOpen] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState("");

    const selectedOption = React.useMemo(
        () => options.find((o) => o.value.toLowerCase() === (value || "").toLowerCase()),
        [options, value]
    );

    // High performance windowed search: cap at top 50 items to keep DOM mounts instantaneous
    const filteredOptions = React.useMemo(() => {
        if (!searchValue.trim()) {
            return options.slice(0, 50);
        }
        const lower = searchValue.toLowerCase();
        const matches: ComboboxOption[] = [];
        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            if (
                opt.label.toLowerCase().includes(lower) ||
                (opt.subLabel && opt.subLabel.toLowerCase().includes(lower)) ||
                opt.value.toLowerCase().includes(lower)
            ) {
                matches.push(opt);
                if (matches.length >= 50) break;
            }
        }
        return matches;
    }, [options, searchValue]);

    const handleSelect = (selectedValue: string, opt?: ComboboxOption) => {
        const matched =
            opt ||
            options.find(
                (o) => o.value.toLowerCase() === selectedValue.toLowerCase()
            );
        onChange(matched ? matched.value : selectedValue, matched);
        setOpen(false);
    };

    const handleAddAdHoc = () => {
        if (!searchValue.trim()) return;
        onChange(searchValue.trim(), undefined);
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "w-full justify-between h-8 text-xs font-normal px-2.5",
                        !value && "text-muted-foreground",
                        className
                    )}
                >
                    <span className="truncate">
                        {selectedOption ? selectedOption.label : value || placeholder}
                    </span>
                    <ChevronsUpDown className="ml-1.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={searchPlaceholder}
                        value={searchValue}
                        onValueChange={setSearchValue}
                        className="h-8 text-xs"
                    />
                    <CommandList>
                        <CommandEmpty className="p-2 text-xs text-muted-foreground text-center">
                            {emptyText}
                            {allowAdHoc && searchValue.trim() && (
                                <div className="mt-2 pt-2 border-t">
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-7 w-full text-xs justify-start gap-1.5"
                                        onClick={handleAddAdHoc}
                                    >
                                        <Plus className="h-3 w-3" />
                                        Use &ldquo;{searchValue.trim()}&rdquo;
                                    </Button>
                                </div>
                            )}
                        </CommandEmpty>
                        <CommandGroup className="max-h-56 overflow-y-auto">
                            {filteredOptions.map((option, idx) => (
                                <CommandItem
                                    key={`${option.value}-${idx}`}
                                    value={option.value}
                                    onSelect={() => handleSelect(option.value, option)}
                                    className="text-xs py-1.5 cursor-pointer"
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-3.5 w-3.5 shrink-0",
                                            value?.toLowerCase() === option.value.toLowerCase()
                                                ? "opacity-100 text-primary"
                                                : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col min-w-0">
                                        <span className="truncate font-medium">{option.label}</span>
                                        {option.subLabel && (
                                            <span className="text-[10px] text-muted-foreground truncate">
                                                {option.subLabel}
                                            </span>
                                        )}
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                        {options.length > 50 && !searchValue && (
                            <div className="px-2 py-1 text-[10px] text-muted-foreground text-center border-t bg-muted/20">
                                Showing top 50 of {options.length} options. Type to filter...
                            </div>
                        )}
                        {allowAdHoc && searchValue.trim() && (
                            <div className="p-1 border-t">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-full text-xs justify-start gap-1.5 text-muted-foreground hover:text-foreground"
                                    onClick={handleAddAdHoc}
                                >
                                    <Plus className="h-3 w-3" />
                                    Custom: &ldquo;{searchValue.trim()}&rdquo;
                                </Button>
                            </div>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};
