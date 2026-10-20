"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  title?: string;
  subLabel?: string;
  tag?: string;
  tagClassName?: string;
  badge?: string;
  badgeClassName?: string;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  triggerTitle?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  disabled = false,
  className,
  triggerClassName,
  popoverClassName,
  triggerTitle,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedOption = React.useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const lower = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lower) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(lower)) ||
        (opt.tag && opt.tag.toLowerCase().includes(lower)) ||
        (opt.badge && opt.badge.toLowerCase().includes(lower))
    );
  }, [options, search]);

  const displayTitle =
    triggerTitle ??
    (selectedOption
      ? selectedOption.title ?? selectedOption.label
      : undefined);

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            title={displayTitle}
            className={cn(
              "w-full justify-between font-normal text-left h-9 text-xs border border-border/80 shadow-xs transition-all",
              !value && "text-muted-foreground",
              open && "ring-2 ring-primary/20 border-primary",
              triggerClassName
            )}
          >
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            "p-0 w-[var(--radix-popover-trigger-width)] min-w-[200px] max-w-[400px] border shadow-md bg-popover z-50",
            popoverClassName
          )}
          align="start"
          sideOffset={4}
        >
          <Command shouldFilter={false} className="flex flex-col">
            <div className="flex items-center border-b px-2.5 py-1.5 gap-2">
              <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground placeholder:text-xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 rounded"
                >
                  Clear
                </button>
              )}
            </div>
            <CommandList className="max-h-[220px] overflow-y-auto p-1">
              {filteredOptions.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  {emptyMessage}
                </div>
              ) : (
                <CommandGroup>
                  {filteredOptions.map((option) => {
                    const isSelected = option.value === value;
                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => {
                          onValueChange(option.value);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={cn(
                          "flex items-center justify-between text-xs py-1.5 px-2 rounded-md cursor-pointer transition-colors",
                          isSelected
                            ? "bg-primary/10 text-primary font-medium"
                            : "hover:bg-muted text-foreground"
                        )}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="truncate">{option.label}</span>
                          {option.subLabel && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {option.subLabel}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {option.badge && (
                            <span
                              className={cn(
                                "text-[9px] px-1 py-0.2 rounded font-mono",
                                option.badgeClassName ?? "bg-muted text-muted-foreground"
                              )}
                            >
                              {option.badge}
                            </span>
                          )}
                          <Check
                            className={cn(
                              "h-3.5 w-3.5",
                              isSelected ? "opacity-100 text-primary" : "opacity-0"
                            )}
                          />
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
