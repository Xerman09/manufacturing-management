"use client";

import type { Column } from "@tanstack/react-table";
import { Check, PlusCircle, XCircle } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface Option {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
    count?: number;
}

interface DataTableFacetedFilterProps<TData, TValue> {
    column?: Column<TData, TValue>;
    title?: string;
    options: Option[];
    multiple?: boolean;
    value?: string[];
    onValueChange?: (values: string[]) => void;
}

export function DataTableFacetedFilter<TData, TValue>({
    column,
    title,
    options,
    multiple,
    value: externalValue,
    onValueChange,
}: DataTableFacetedFilterProps<TData, TValue>) {
    const [open, setOpen] = React.useState(false);

    const columnFilterValue = column?.getFilterValue();
    const selectedValues = React.useMemo(
        () => new Set(externalValue || (Array.isArray(columnFilterValue) ? columnFilterValue : [])),
        [externalValue, columnFilterValue]
    );

    const onItemSelect = React.useCallback(
        (option: Option, isSelected: boolean) => {
            const newSelectedValues = new Set(selectedValues);
            if (multiple) {
                if (isSelected) {
                    newSelectedValues.delete(option.value);
                } else {
                    newSelectedValues.add(option.value);
                }
            } else {
                newSelectedValues.clear();
                if (!isSelected) newSelectedValues.add(option.value);
                setOpen(false);
            }

            const filterValues = Array.from(newSelectedValues);

            if (column) {
                column.setFilterValue(filterValues.length ? filterValues : undefined);
            }

            if (onValueChange) {
                onValueChange(filterValues);
            }
        },
        [column, multiple, selectedValues, onValueChange]
    );

    const onReset = React.useCallback(
        (event?: React.MouseEvent) => {
            event?.stopPropagation();
            if (column) column.setFilterValue(undefined);
            if (onValueChange) onValueChange([]);
        },
        [column, onValueChange]
    );

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="border-dashed font-normal h-auto min-h-8 px-3 rounded-md bg-background hover:bg-muted/50 transition-all"
                >
                    {selectedValues?.size > 0 ? (
                        <div
                            role="button"
                            aria-label={`Clear ${title} filter`}
                            tabIndex={0}
                            className="mr-2 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            onClick={onReset}
                        >
                            <XCircle className="h-4 w-4" />
                        </div>
                    ) : (
                        <PlusCircle className="mr-2 h-4 w-4" />
                    )}
                    {title}
                    {selectedValues?.size > 0 && (
                        <>
                            <Separator
                                orientation="vertical"
                                className="mx-2 data-[orientation=vertical]:h-4"
                            />
                            <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                                {selectedValues.size}
                            </Badge>
                            <div className="hidden items-center gap-1 lg:flex">
                                {selectedValues.size > 2 ? (
                                    <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                                        {selectedValues.size} selected
                                    </Badge>
                                ) : (
                                    options
                                        .filter((option) => selectedValues.has(option.value))
                                        .map((option) => (
                                            <Badge
                                                variant="secondary"
                                                key={option.value}
                                                className="rounded-sm px-1 font-normal"
                                            >
                                                {option.label}
                                            </Badge>
                                        ))
                                )}
                            </div>
                        </>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[200px] p-0 rounded-xl shadow-xl border-border/50"
                align="start"
                onWheel={(e) => e.stopPropagation()}
                onWheelCapture={(e) => e.stopPropagation()}
            >
                <Command>
                    <CommandInput placeholder={title} className="h-9" />
                    <CommandList
                        className="max-h-[300px] overflow-y-auto overscroll-contain"
                        onWheel={(e) => e.stopPropagation()}
                        onWheelCapture={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                    >
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup className="p-1.5">
                            {options.map((option) => {
                                const isSelected = selectedValues.has(option.value);

                                return (
                                    <CommandItem
                                        key={option.value}
                                        onSelect={() => onItemSelect(option, isSelected)}
                                        className="rounded-lg py-2"
                                    >
                                        <div
                                            className={cn(
                                                "flex size-4 items-center justify-center rounded border border-primary transition-colors",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible"
                                            )}
                                        >
                                            <Check className="h-3 w-3" />
                                        </div>
                                        {option.icon && (
                                            <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                                        )}
                                        <span className="truncate text-sm">{option.label}</span>
                                        {option.count && (
                                            <span className="ml-auto font-mono text-xs text-muted-foreground">
                                                {option.count}
                                            </span>
                                        )}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        {selectedValues.size > 0 && (
                            <>
                                <CommandSeparator />
                                <CommandGroup className="p-1.5">
                                    <CommandItem
                                        onSelect={() => onReset()}
                                        className="justify-center text-center font-semibold text-primary rounded-lg"
                                    >
                                        Clear filters
                                    </CommandItem>
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
