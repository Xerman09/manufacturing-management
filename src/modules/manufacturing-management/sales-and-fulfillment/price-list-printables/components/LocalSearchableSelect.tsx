"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search as SearchIcon, X } from "lucide-react";
import { Command as CommandPrimitive } from "cmdk";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

const Command = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
    <CommandPrimitive
        ref={ref}
        className={cn(
            "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
            className
        )}
        {...props}
    />
));
Command.displayName = "LocalCommand";

const CommandInput = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Input>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
    <div className="flex h-9 items-center gap-2 border-b px-3">
        <SearchIcon className="size-4 shrink-0 opacity-50" />
        <CommandPrimitive.Input
            ref={ref}
            className={cn(
                "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
            {...props}
        />
    </div>
));
CommandInput.displayName = "LocalCommandInput";

const CommandList = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.List
        ref={ref}
        className={cn(
            "max-h-[300px] overflow-x-hidden overflow-y-auto overscroll-contain",
            className
        )}
        {...props}
    />
));
CommandList.displayName = "LocalCommandList";

const CommandEmpty = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Empty>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
    <CommandPrimitive.Empty
        ref={ref}
        className="py-6 text-center text-sm"
        {...props}
    />
));
CommandEmpty.displayName = "LocalCommandEmpty";

const CommandGroup = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Group>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.Group
        ref={ref}
        className={cn(
            "text-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
            className
        )}
        {...props}
    />
));
CommandGroup.displayName = "LocalCommandGroup";

const CommandItem = React.forwardRef<
    React.ElementRef<typeof CommandPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
    <CommandPrimitive.Item
        ref={ref}
        className={cn(
            "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
            className
        )}
        {...props}
    />
));
CommandItem.displayName = "LocalCommandItem";

export interface SearchableSelectProps {
    options: { value: string; label: string }[];
    value?: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    allowClear?: boolean;
    className?: string;
}

export function LocalSearchableSelect({
    options = [],
    value,
    onValueChange,
    placeholder = "Select option...",
    disabled = false,
    allowClear = false,
    className,
}: SearchableSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");
    const commandListRef = React.useRef<HTMLDivElement>(null);

    const selectedLabel = React.useMemo(() => {
        return options.find((opt) => opt.value === value)?.label;
    }, [options, value]);

    React.useEffect(() => {
        if (commandListRef.current) {
            commandListRef.current.scrollTop = 0;
        }
    }, [search]);

    React.useEffect(() => {
        if (!open) {
            setSearch("");
        }
    }, [open]);

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between font-bold", !value && "text-muted-foreground", className)}
                    disabled={disabled}
                >
                    <span className="block truncate text-left w-[calc(100%-24px)]">
                        {selectedLabel || placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] min-w-[200px] p-0"
                align="start"
                onWheel={(e) => e.stopPropagation()}
                onWheelCapture={(e) => e.stopPropagation()}
            >
                <Command>
                    <CommandInput
                        placeholder="Search..."
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList
                        ref={commandListRef}
                        onWheel={(e) => e.stopPropagation()}
                        onWheelCapture={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                    >
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {allowClear && value && (
                                <CommandItem
                                    value="__clear__"
                                    onSelect={() => {
                                        onValueChange("");
                                        setOpen(false);
                                    }}
                                    className="text-muted-foreground border-b border-border/50 mb-1"
                                >
                                    <X className="mr-2 h-4 w-4" />
                                    Clear selection
                                </CommandItem>
                            )}
                            {options.map((opt) => (
                                <CommandItem
                                    key={opt.value}
                                    value={opt.label}
                                    onSelect={() => {
                                        if (allowClear && value === opt.value) {
                                            onValueChange("");
                                        } else {
                                            onValueChange(opt.value);
                                        }
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4 shrink-0",
                                            value === opt.value ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <span className="truncate">{opt.label}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export interface MultiSelectProps {
    options: { value: string; label: string }[];
    values: string[];
    onValuesChange: (values: string[]) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export function LocalMultiSelect({
    options = [],
    values,
    onValuesChange,
    placeholder = "Select options...",
    disabled = false,
    className,
}: MultiSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");
    const commandListRef = React.useRef<HTMLDivElement>(null);

    const selectedLabels = React.useMemo(() => {
        const valueSet = new Set(values);
        return options.filter((opt) => valueSet.has(opt.value)).map((opt) => opt.label);
    }, [options, values]);

    const displayText = React.useMemo(() => {
        if (selectedLabels.length === 0) return placeholder;
        if (selectedLabels.length <= 2) return selectedLabels.join(", ");
        return `${selectedLabels.length} selected (${selectedLabels.slice(0, 2).join(", ")}, ...)`;
    }, [selectedLabels, placeholder]);

    React.useEffect(() => {
        if (commandListRef.current) {
            commandListRef.current.scrollTop = 0;
        }
    }, [search]);

    React.useEffect(() => {
        if (!open) {
            setSearch("");
        }
    }, [open]);

    const toggleValue = (targetValue: string) => {
        const exists = values.includes(targetValue);
        if (exists) {
            onValuesChange(values.filter((v) => v !== targetValue));
        } else {
            onValuesChange([...values, targetValue]);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen} modal={true}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-between font-bold",
                        values.length === 0 && "text-muted-foreground",
                        className
                    )}
                    disabled={disabled}
                >
                    <span className="block truncate text-left w-[calc(100%-24px)]">
                        {displayText}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] min-w-[200px] p-0"
                align="start"
                onWheel={(e) => e.stopPropagation()}
                onWheelCapture={(e) => e.stopPropagation()}
            >
                <Command>
                    <CommandInput
                        placeholder="Search..."
                        value={search}
                        onValueChange={setSearch}
                    />
                    <CommandList
                        ref={commandListRef}
                        onWheel={(e) => e.stopPropagation()}
                        onWheelCapture={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                    >
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {values.length > 0 && (
                                <CommandItem
                                    value="__clear_all__"
                                    onSelect={() => onValuesChange([])}
                                    className="text-muted-foreground border-b border-border/50 mb-1"
                                >
                                    <X className="mr-2 h-4 w-4" />
                                    Clear all ({values.length})
                                </CommandItem>
                            )}
                            {options.map((opt) => {
                                const isSelected = values.includes(opt.value);
                                return (
                                    <CommandItem
                                        key={opt.value}
                                        value={opt.label}
                                        onSelect={() => toggleValue(opt.value)}
                                    >
                                        <span
                                            className={cn(
                                                "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                                                isSelected
                                                    ? "border-primary bg-primary text-primary-foreground"
                                                    : "border-muted-foreground/40"
                                            )}
                                        >
                                            {isSelected && <Check className="h-3 w-3" />}
                                        </span>
                                        <span className="truncate">{opt.label}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
