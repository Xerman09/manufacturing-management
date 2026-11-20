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

        // Fetch from Frankfurter API
        let response = await fetch(
            `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}`,
            { cache: "no-store", signal: AbortSignal.timeout(8000) }
        ).catch(() => null);

        // Fallback endpoint if primary fails
        if (!response || !response.ok) {
            response = await fetch(
                `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}`,
                { cache: "no-store", signal: AbortSignal.timeout(8000) }
            ).catch(() => null);
        }

        if (!response || !response.ok) {
            throw new Error(`Frankfurter API returned status ${response?.status || "unreachable"}`);
        }

        const data = (await response.json()) as {
            amount?: number;
            base?: string;
            date?: string;
            rates?: Record<string, number>;
        };

        const rates = data.rates || {};
        const ratesToComparison: Record<string, number> = {
            [base]: 1.0,
        };

        for (const [code, rate] of Object.entries(rates)) {
            if (typeof rate === "number" && rate > 0) {
                // Invert rate: 1 FOREIGN in BASE = 1 / rate
                ratesToComparison[code] = Number((1 / rate).toFixed(4));
            }
        }

        const date = data.date || new Date().toISOString().split("T")[0];

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
