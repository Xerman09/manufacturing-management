"use client";

import { useState, useEffect, useCallback } from "react";

interface UseNumericInputOptions {
    value: number | null | undefined;
    onChange: (val: number) => void;
    min?: number;
    max?: number;
    fallbackMin?: number; // fallback value on blur if empty (default 0)
    allowDecimals?: boolean;
    precision?: number;
}

export function useNumericInput({
    value,
    onChange,
    min,
    max,
    fallbackMin = 0,
    allowDecimals = true,
    precision = 4,
}: UseNumericInputOptions) {
    const [isFocused, setIsFocused] = useState(false);
    const [textValue, setTextValue] = useState<string>(
        value !== null && value !== undefined ? String(value) : ""
    );

    // Only sync from external prop when the user is NOT actively typing inside this input
    useEffect(() => {
        if (!isFocused) {
            setTextValue(value !== null && value !== undefined ? String(value) : "");
        }
    }, [value, isFocused]);

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

            // Regex check for numeric input
            const regex = allowDecimals ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
            if (regex.test(val)) {
                setTextValue(val);
                const num = parseFloat(val);
                if (!isNaN(num)) {
                    onChange(num);
                }
            }
        },
        [allowDecimals, onChange]
    );

    const handleBlur = useCallback(() => {
        setIsFocused(false);
        if (textValue.trim() === "" || isNaN(parseFloat(textValue))) {
            const fallback = fallbackMin;
            setTextValue(String(fallback));
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

        setTextValue(String(num));
        // Only trigger onChange if the value actually changed to prevent false re-renders
        if (value !== num) {
            onChange(num);
        }
    }, [textValue, fallbackMin, min, max, allowDecimals, precision, value, onChange]);

    return {
        textValue,
        handleFocus,
        handleClick,
        handleChange,
        handleBlur,
    };
}
