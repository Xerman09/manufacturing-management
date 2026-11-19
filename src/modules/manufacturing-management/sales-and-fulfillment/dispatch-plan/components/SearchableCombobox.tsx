"use client";

import React, { useState, useEffect, useRef } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
  popoverWidthClass?: string;
}

export const SearchableCombobox: React.FC<SearchableComboboxProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  emptyText = "No matching option found.",
  allowClear = false,
  clearLabel = "All",
  disabled = false,
  icon,
  className,
  popoverWidthClass = "w-[260px]",
}) => {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((opt) => opt.value === value);

  // Radix Dialog scroll-lock mitigation: ensure wheel & touch scrolling always works inside popover dropdowns
  useEffect(() => {
    if (!open) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const popoverEl =
        target.closest("[data-slot='command-list']") ||
        target.closest("[cmdk-list]") ||
        target.closest("[data-radix-popper-content-wrapper]") ||
        target.closest("[data-slot='popover-content']") ||
        (contentRef.current && contentRef.current.contains(target) ? contentRef.current : null);

      if (popoverEl) {
        // Stop propagation so react-remove-scroll on parent dialogs won't cancel the wheel event
        e.stopPropagation();

        const list = (target.closest("[data-slot='command-list']") ||
          target.closest("[cmdk-list]") ||
          popoverEl.querySelector("[data-slot='command-list']") ||
          popoverEl.querySelector("[cmdk-list]")) as HTMLElement | null;

        if (list && list.scrollHeight > list.clientHeight) {
          e.preventDefault();
          const delta =
            e.deltaMode === 1
              ? e.deltaY * 33
              : e.deltaMode === 2
              ? e.deltaY * list.clientHeight
              : e.deltaY;
          list.scrollTop += delta;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const popoverEl =
        target.closest("[data-slot='command-list']") ||
        target.closest("[cmdk-list]") ||
        target.closest("[data-radix-popper-content-wrapper]") ||
        target.closest("[data-slot='popover-content']") ||
        (contentRef.current && contentRef.current.contains(target) ? contentRef.current : null);

      if (popoverEl) {
        e.stopPropagation();
      }
    };

    window.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    document.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    window.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
    document.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });

    return () => {
      window.removeEventListener("wheel", handleWheel, { capture: true });
      document.removeEventListener("wheel", handleWheel, { capture: true });
      window.removeEventListener("touchmove", handleTouchMove, { capture: true });
      document.removeEventListener("touchmove", handleTouchMove, { capture: true });
    };
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between text-sm font-normal border-input bg-background",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
            <span className="truncate">
              {selected ? selected.label : allowClear ? clearLabel : placeholder}
            </span>
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        className={cn("p-0 shadow-md z-[100]", popoverWidthClass)}
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9 text-sm" />
          <CommandList className="max-h-[260px] overflow-y-auto">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value={`__all__ ${clearLabel}`}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="cursor-pointer text-sm"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === null ? "opacity-100 text-primary" : "opacity-0"
                    )}
                  />
                  <span className="font-medium">{clearLabel}</span>
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.sublabel || ""} ${opt.value}`}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="cursor-pointer text-sm"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === opt.value ? "opacity-100 text-primary" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {opt.sublabel}
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
};
