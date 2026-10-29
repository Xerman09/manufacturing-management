"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface RowQuantityInputProps {
  value: number;
  onChange: (val: number) => void;
  max?: number;
  min?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

function cleanFloatingNoise(val: number | string): string {
  if (typeof val === "number") {
    // Eliminates IEEE-754 precision noise such as 0.9479999999999791 -> 0.948
    const cleaned = parseFloat(val.toFixed(8));
    return String(cleaned);
  }
  const clean = val.replace(/,/g, "").trim();
  const num = parseFloat(clean);
  if (!isNaN(num) && clean.includes(".")) {
    const cleaned = parseFloat(num.toFixed(8));
    return String(cleaned);
  }
  return clean;
}

function formatWithCommas(raw: string, maxDecimals = 4): string {
  const clean = cleanFloatingNoise(raw);
  if (!clean) return "";
  const isNegative = clean.startsWith("-");
  const unsigned = isNegative ? clean.slice(1) : clean;
  const parts = unsigned.split(".");
  const integerPart = parts[0];
  // TRUNCATE to maxDecimals without rounding off
  const decimalPart = parts.length > 1 ? parts[1].slice(0, maxDecimals) : null;

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (decimalPart !== null) {
    return `${isNegative ? "-" : ""}${formattedInteger}.${decimalPart}`;
  }
  return `${isNegative ? "-" : ""}${formattedInteger}`;
}

function parseRawNumber(str: string, maxDecimals = 4): number {
  const clean = str.replace(/,/g, "").trim();
  if (!clean) return 0;
  const parts = clean.split(".");
  if (parts.length > 1) {
    // Truncate to maxDecimals without rounding off
    const truncated = `${parts[0]}.${parts[1].slice(0, maxDecimals)}`;
    const parsed = parseFloat(truncated);
    return isNaN(parsed) ? 0 : parsed;
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

export const RowQuantityInput: React.FC<RowQuantityInputProps> = ({
  value,
  onChange,
  max,
  min = 0.0001,
  disabled = false,
  className,
  placeholder = "0.00",
}) => {
  const [prevValue, setPrevValue] = useState(value);
  const [localText, setLocalText] = useState<string>(
    value > 0 ? formatWithCommas(String(value)) : ""
  );

  if (value !== prevValue) {
    setPrevValue(value);
    setLocalText(value > 0 ? formatWithCommas(String(value)) : "");
  }

  const handleFocusOrClick = (e: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>) => {
    const parsed = parseRawNumber(localText);
    if (parsed === 0) {
      setLocalText("");
    } else {
      e.currentTarget.select();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      setLocalText("");
      onChange(0);
      return;
    }
    const unmasked = raw.replace(/,/g, "");
    // Support decimal input up to 4 decimal places without round-off
    if (/^\d*(\.\d{0,4})?$/.test(unmasked)) {
      const parts = unmasked.split(".");
      const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      const formatted = parts.length > 1 ? `${integerPart}.${parts[1]}` : integerPart;
      setLocalText(formatted);
      const parsed = parseFloat(unmasked);
      if (!isNaN(parsed) && parsed > 0) {
        onChange(parsed);
      } else if (unmasked === "0" || unmasked === "0.") {
        onChange(0);
      }
    }
  };

  const handleBlur = () => {
    const parsed = parseRawNumber(localText);
    if (parsed <= 0) {
      if (min !== undefined && min > 0 && localText !== "") {
        setLocalText(formatWithCommas(String(min)));
        onChange(min);
      } else {
        setLocalText("");
        onChange(0);
      }
    } else if (max !== undefined && parsed > max) {
      const clampedMax = parseRawNumber(String(max));
      setLocalText(formatWithCommas(String(clampedMax)));
      onChange(clampedMax);
    } else {
      setLocalText(formatWithCommas(localText));
      onChange(parsed);
    }
  };

  const isExceeded = max !== undefined && parseRawNumber(localText) > max;

  return (
    <div className="relative flex items-center">
      <Input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={localText}
        onChange={handleChange}
        onFocus={handleFocusOrClick}
        onClick={handleFocusOrClick}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          "h-8 text-right font-mono transition-colors",
          isExceeded && "border-destructive focus-visible:ring-destructive text-destructive font-semibold",
          disabled && "bg-muted cursor-not-allowed opacity-75",
          className
        )}
      />
    </div>
  );
};
