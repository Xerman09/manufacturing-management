"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { useNumericInput } from "../../hooks/useNumericInput";
import { cn } from "@/lib/utils";

interface NumericInputFieldProps {
    value: number | null | undefined;
    onChange: (val: number) => void;
    placeholder?: string;
    min?: number;
    max?: number;
    fallbackMin?: number;
    allowDecimals?: boolean;
    precision?: number;
    formatFixed?: boolean;
    useGrouping?: boolean;
    disabled?: boolean;
    className?: string;
    prefix?: string;
    suffix?: string;
}

export const NumericInputField: React.FC<NumericInputFieldProps> = ({
    value,
    onChange,
    placeholder,
    min,
    max,
    fallbackMin = 0,
    allowDecimals = true,
    precision = 4,
    formatFixed = false,
    useGrouping = true,
    disabled = false,
    className,
    prefix,
    suffix,
}) => {
    const { textValue, handleFocus, handleClick, handleChange, handleBlur } =
        useNumericInput({
            value,
            onChange,
            min,
            max,
            fallbackMin,
            allowDecimals,
            precision,
            formatFixed,
            useGrouping,
        });

    const prefixPadding = prefix
        ? prefix.length > 3
            ? "pl-14"
            : prefix.length > 2
            ? "pl-11"
            : prefix.length > 1
            ? "pl-9"
            : "pl-7"
        : "";

    const suffixPadding = suffix
        ? suffix.length > 3
            ? "pr-14"
            : suffix.length > 2
            ? "pr-11"
            : suffix.length > 1
            ? "pr-9"
            : "pr-8"
        : "";

    return (
        <div className="relative flex items-center w-full">
            {prefix && (
                <span className="absolute left-2.5 text-xs text-muted-foreground pointer-events-none select-none font-mono">
                    {prefix}
                </span>
            )}
            <Input
                type="text"
                inputMode={allowDecimals ? "decimal" : "numeric"}
                value={textValue}
                onChange={handleChange}
                onFocus={handleFocus}
                onClick={handleClick}
                onBlur={handleBlur}
                disabled={disabled}
                readOnly={disabled}
                placeholder={placeholder}
                className={cn(
                    "h-8 text-xs font-mono transition-colors disabled:opacity-75 disabled:bg-muted/40 disabled:cursor-not-allowed",
                    prefixPadding,
                    suffixPadding,
                    className
                )}
            />
            {suffix && (
                <span className="absolute right-2.5 text-xs text-muted-foreground pointer-events-none select-none font-mono">
                    {suffix}
                </span>
            )}
        </div>
    );
};
