"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className = "",
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div
        className="bg-muted border border-border rounded-lg px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-blue-500/25 flex items-center justify-between cursor-pointer min-h-[38px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={selectedOption ? "text-foreground" : "text-muted-foreground"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={16} className="text-muted-foreground" />
      </div>

      {isOpen && (
        <div className="absolute z-[100] w-full mt-1 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border bg-muted flex items-center gap-2">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">No results found.</div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:bg-muted ${
                    value === opt.value ? "bg-blue-500/10 text-blue-700 font-medium" : "text-foreground"
                  }`}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearchTerm("");
                  }}
                >
                  {opt.label}
                  {value === opt.value && <Check size={14} className="text-blue-600" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

