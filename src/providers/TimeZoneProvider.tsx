"use client";

import * as React from "react";
import { toast } from "sonner";
import { formatInZone, isValidTimeZone } from "@/lib/datetime";

export interface TimeZoneContextValue {
    timeZone: string | null;
    isLoading: boolean;
    error: string | null;
    formatDateTime: (value: unknown) => string;
    refreshTimeZone: () => Promise<string | null>;
}

interface SharedTimeZoneState {
    timeZone: string | null;
    isLoading: boolean;
    error: string | null;
    fetched: boolean;
}

let sharedState: SharedTimeZoneState = {
    timeZone: null,
    isLoading: false,
    error: null,
    fetched: false,
};

let inflightRequest: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

function emitChange() {
    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot(): SharedTimeZoneState {
    return sharedState;
}

const SERVER_SNAPSHOT: SharedTimeZoneState = {
    timeZone: null,
    isLoading: true,
    error: null,
    fetched: false,
};

function getServerSnapshot(): SharedTimeZoneState {
    return SERVER_SNAPSHOT;
}

export async function loadConfiguredTimeZone(force = false): Promise<string | null> {
    if (!force && sharedState.fetched && sharedState.timeZone) {
        return sharedState.timeZone;
    }
    if (!force && inflightRequest) {
        return inflightRequest;
    }

    sharedState = {
        ...sharedState,
        isLoading: true,
        error: null,
    };
    emitChange();

    inflightRequest = (async () => {
        try {
            const res = await fetch("/api/manufacturing/settings/time-zone", {
                cache: "no-store",
            });
            const payload = (await res.json().catch(() => null)) as
                | { timeZone?: string; message?: string }
                | null;

            if (!res.ok) {
                const msg =
                    payload?.message ||
                    `Failed to load timezone setting (HTTP ${res.status}).`;
                throw new Error(msg);
            }

            const tz = payload?.timeZone?.trim() ?? "";
            if (!isValidTimeZone(tz)) {
                throw new Error("Invalid or empty timezone received from general_setting.");
            }

            sharedState = {
                timeZone: tz,
                isLoading: false,
                error: null,
                fetched: true,
            };
            emitChange();
            return tz;
        } catch (err) {
            const msg =
                err instanceof Error ? err.message : "Failed to load timezone setting.";
            sharedState = {
                timeZone: null,
                isLoading: false,
                error: msg,
                fetched: true,
            };
            emitChange();
            toast.error(msg);
            return null;
        } finally {
            inflightRequest = null;
        }
    })();

    return inflightRequest;
}

const TimeZoneContext = React.createContext<TimeZoneContextValue | null>(null);

export function TimeZoneProvider({ children }: { children: React.ReactNode }) {
    const state = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    React.useEffect(() => {
        if (!sharedState.fetched && !inflightRequest) {
            void loadConfiguredTimeZone(false);
        }
    }, []);

    const formatDateTime = React.useCallback(
        (value: unknown) => formatInZone(value, state.timeZone),
        [state.timeZone]
    );

    const refreshTimeZone = React.useCallback(() => loadConfiguredTimeZone(true), []);

    const contextValue = React.useMemo<TimeZoneContextValue>(
        () => ({
            timeZone: state.timeZone,
            isLoading: state.isLoading,
            error: state.error,
            formatDateTime,
            refreshTimeZone,
        }),
        [state.timeZone, state.isLoading, state.error, formatDateTime, refreshTimeZone]
    );

    return (
        <TimeZoneContext.Provider value={contextValue}>
            {children}
        </TimeZoneContext.Provider>
    );
}

export function useTimeZone(): TimeZoneContextValue {
    const ctx = React.useContext(TimeZoneContext);
    const state = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    React.useEffect(() => {
        if (!ctx && !sharedState.fetched && !inflightRequest) {
            void loadConfiguredTimeZone(false);
        }
    }, [ctx]);

    const fallbackFormat = React.useCallback(
        (value: unknown) => formatInZone(value, state.timeZone),
        [state.timeZone]
    );

    const fallbackRefresh = React.useCallback(() => loadConfiguredTimeZone(true), []);

    if (ctx) {
        return ctx;
    }

    return {
        timeZone: state.timeZone,
        isLoading: state.isLoading,
        error: state.error,
        formatDateTime: fallbackFormat,
        refreshTimeZone: fallbackRefresh,
    };
}
