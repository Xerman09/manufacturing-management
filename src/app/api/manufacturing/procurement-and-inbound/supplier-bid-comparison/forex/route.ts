import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CachedRates {
    base: string;
    date: string;
    ratesToComparison: Record<string, number>;
    timestamp: number;
}

const cache = new Map<string, CachedRates>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const base = (searchParams.get("base") || "PHP").toUpperCase().trim();
        const force = searchParams.get("force") === "true";

        const cached = cache.get(base);
        const now = Date.now();
        if (!force && cached && now - cached.timestamp < CACHE_TTL_MS) {
            return NextResponse.json({
                success: true,
                base: cached.base,
                date: cached.date,
                ratesToComparison: cached.ratesToComparison,
                cached: true,
            });
        }

        // 1. Fetch Primary Source: Frankfurter API (ECB reference rates)
        let frankfurterRes = await fetch(
            `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`,
            { cache: "no-store", signal: AbortSignal.timeout(8000) }
        ).catch(() => null);

        if (!frankfurterRes || !frankfurterRes.ok) {
            frankfurterRes = await fetch(
                `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`,
                { cache: "no-store", signal: AbortSignal.timeout(8000) }
            ).catch(() => null);
        }

        // 2. Fetch Secondary Source (covers non-ECB currencies like AFN, VND, TWD, etc.)
        const baseLower = base.toLowerCase();
        let secondaryRates: Record<string, number> = {};
        let secondaryDate: string | undefined;

        const erApiRes = await fetch(
            `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`,
            { cache: "no-store", signal: AbortSignal.timeout(8000) }
        ).catch(() => null);

        if (erApiRes && erApiRes.ok) {
            const erData = (await erApiRes.json().catch(() => null)) as {
                result?: string;
                time_last_update_utc?: string;
                rates?: Record<string, number>;
            } | null;
            if (erData?.result === "success" && erData.rates) {
                secondaryRates = erData.rates;
                if (erData.time_last_update_utc) {
                    const parsed = new Date(erData.time_last_update_utc);
                    if (!isNaN(parsed.getTime())) {
                        secondaryDate = parsed.toISOString().split("T")[0];
                    }
                }
            }
        }

        // Backup secondary CDN if open.er-api.com failed
        if (Object.keys(secondaryRates).length === 0) {
            const cdnRes = await fetch(
                `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${encodeURIComponent(baseLower)}.min.json`,
                { cache: "no-store", signal: AbortSignal.timeout(8000) }
            ).catch(() => null);

            if (cdnRes && cdnRes.ok) {
                const cdnData = (await cdnRes.json().catch(() => null)) as Record<string, unknown> | null;
                const rawRates = cdnData?.[baseLower];
                if (rawRates && typeof rawRates === "object") {
                    for (const [k, v] of Object.entries(rawRates as Record<string, unknown>)) {
                        if (typeof v === "number" && v > 0) {
                            secondaryRates[k.toUpperCase()] = v;
                        }
                    }
                    if (typeof cdnData?.date === "string") {
                        secondaryDate = cdnData.date;
                    }
                }
            }
        }

        const hasFrankfurter = Boolean(frankfurterRes && frankfurterRes.ok);
        const hasSecondary = Object.keys(secondaryRates).length > 0;

        if (!hasFrankfurter && !hasSecondary) {
            throw new Error(
                `Unable to fetch exchange rates from Frankfurter (${frankfurterRes?.status || "unreachable"}) or secondary FX provider`
            );
        }

        const ratesToComparison: Record<string, number> = {
            [base]: 1.0,
        };

        // Populate secondary source rates first (inverted: 1 FOREIGN in BASE = 1 / rate)
        for (const [code, rate] of Object.entries(secondaryRates)) {
            const upperCode = code.toUpperCase();
            if (/^[A-Z]{3}$/.test(upperCode) && typeof rate === "number" && rate > 0) {
                ratesToComparison[upperCode] = Number((1 / rate).toFixed(4));
            }
        }

        let date = secondaryDate || new Date().toISOString().split("T")[0];

        // Overlay Frankfurter ECB rates so primary source takes precedence for ECB currencies
        if (hasFrankfurter && frankfurterRes) {
            const data = (await frankfurterRes.json()) as {
                amount?: number;
                base?: string;
                date?: string;
                rates?: Record<string, number>;
            };

            const rates = data.rates || {};
            for (const [code, rate] of Object.entries(rates)) {
                if (typeof rate === "number" && rate > 0) {
                    ratesToComparison[code.toUpperCase()] = Number((1 / rate).toFixed(4));
                }
            }
            if (data.date) {
                date = data.date;
            }
        }

        cache.set(base, {
            base,
            date,
            ratesToComparison,
            timestamp: now,
        });

        return NextResponse.json({
            success: true,
            base,
            date,
            ratesToComparison,
            cached: false,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: (error as Error).message || "Failed to fetch foreign exchange rates from Frankfurter",
            },
            { status: 502 }
        );
    }
}
