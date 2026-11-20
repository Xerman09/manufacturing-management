"use client";

import { useState, useCallback } from "react";

interface UseNumericInputOptions {
    value: number | null | undefined;
    onChange: (val: number) => void;
    min?: number;
    max?: number;
    fallbackMin?: number; // fallback value on blur if empty (default 0)
    allowDecimals?: boolean;
    precision?: number;
    formatFixed?: boolean;
}

export function useNumericInput({
    value,
    onChange,
    min,
    max,
    fallbackMin = 0,
    allowDecimals = true,
    precision = 4,
    formatFixed = false,
}: UseNumericInputOptions) {
    const formatValue = useCallback(
        (v: number | null | undefined): string => {
            if (v === null || v === undefined) return "";
            if (typeof v === "number" && !isNaN(v)) {
                if (formatFixed && allowDecimals && precision !== undefined) {
                    return v.toFixed(precision);
                }
                return String(v);
            }
            return String(v);
        },
        [allowDecimals, precision, formatFixed]
    );

    const [isFocused, setIsFocused] = useState(false);
    const [prevValue, setPrevValue] = useState(value);
    const [textValue, setTextValue] = useState<string>(() => formatValue(value));

    // Only sync from external prop when the user is NOT actively typing inside this input
    if (!isFocused && value !== prevValue) {
        setPrevValue(value);
        setTextValue(formatValue(value));
    }

    const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        e.target.select();
    }, []);

    const handleClick = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
        (e.target as HTMLInputElement).select();
    }, []);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value;
            // Allow empty string while typing
            if (val === "") {
                setTextValue("");
                return;
            }

            // Regex check for numeric input (disallow minus if min >= 0)
            const regex =
                min !== undefined && min >= 0
                    ? allowDecimals
                        ? /^\d*\.?\d*$/
                        : /^\d*$/
                    : allowDecimals
                    ? /^-?\d*\.?\d*$/
                    : /^-?\d*$/;

            if (regex.test(val)) {
                const num = parseFloat(val);
                if (!isNaN(num)) {
                    if (max !== undefined && num > max) {
                        setTextValue(String(max));
                        onChange(max);
                        return;
                    }
                    setTextValue(val);
                    onChange(num);
                } else {
                    setTextValue(val);
                }
            }
        },
        [allowDecimals, min, max, onChange]
    );

    const handleBlur = useCallback(() => {
        setIsFocused(false);
        if (textValue.trim() === "" || isNaN(parseFloat(textValue))) {
            const fallback = fallbackMin;
            setTextValue(
                formatFixed && allowDecimals && precision !== undefined
                    ? fallback.toFixed(precision)
                    : String(fallback)
            );
            if (value !== fallback) {
                onChange(fallback);
            }
            return;
        }

        let num = parseFloat(textValue);
        if (min !== undefined && num < min) num = min;
        if (max !== undefined && num > max) num = max;

        if (allowDecimals && precision !== undefined) {
            num = parseFloat(num.toFixed(precision));
        }

        setTextValue(
            formatFixed && allowDecimals && precision !== undefined
                ? num.toFixed(precision)
                : String(num)
        );
        // Only trigger onChange if the value actually changed to prevent false re-renders
        if (value !== num) {
            onChange(num);
        }
    }, [textValue, fallbackMin, min, max, allowDecimals, precision, formatFixed, value, onChange]);

    return {
        textValue,
        handleFocus,
        handleClick,
        handleChange,
        handleBlur,
    };
}
