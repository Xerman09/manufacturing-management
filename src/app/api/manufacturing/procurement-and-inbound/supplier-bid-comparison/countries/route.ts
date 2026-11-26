import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface FlagdexCurrency {
    code: string;
    name: string;
    symbol?: string;
}

export interface FlagdexCountry {
    iso2: string;
    iso3: string;
    name: string;
    officialName?: string;
    flagEmoji?: string;
    currencies: FlagdexCurrency[];
}

interface CachedCountries {
    countries: FlagdexCountry[];
    timestamp: number;
}

let cachedCountries: CachedCountries | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours cache

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const force = searchParams.get("force") === "true";
        const now = Date.now();

        if (!force && cachedCountries && now - cachedCountries.timestamp < CACHE_TTL_MS) {
            return NextResponse.json({
                success: true,
                countries: cachedCountries.countries,
                cached: true,
            });
        }

        const response = await fetch("https://flagdex.net/api/v1/countries.json", {
            cache: "no-store",
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            throw new Error(`Flagdex API returned status ${response.status}`);
        }

        const raw = (await response.json()) as {
            countries?: Array<Record<string, unknown>>;
        };

        const rawList = Array.isArray(raw?.countries) ? raw.countries : [];
        if (rawList.length === 0) {
            throw new Error("Flagdex API returned an empty country list");
        }

        const countries: FlagdexCountry[] = rawList
            .map((entry) => {
                const rawCurrencies = Array.isArray(entry.currencies) ? entry.currencies : [];
                const currencies: FlagdexCurrency[] = rawCurrencies
                    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
                    .map((c) => ({
                        code: String(c.code || "").trim().toUpperCase(),
                        name: String(c.name || "").trim(),
                        symbol: c.symbol ? String(c.symbol).trim() : undefined,
                    }))
                    .filter((c) => c.code.length > 0);

                return {
                    iso2: String(entry.iso2 || "").trim().toUpperCase(),
                    iso3: String(entry.iso3 || "").trim().toUpperCase(),
                    name: String(entry.name || "").trim(),
                    officialName: entry.officialName ? String(entry.officialName).trim() : undefined,
                    flagEmoji: entry.flagEmoji ? String(entry.flagEmoji) : undefined,
                    currencies,
                };
            })
            .filter((c) => c.name.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name));

        cachedCountries = {
            countries,
            timestamp: now,
        };

        return NextResponse.json({
            success: true,
            countries,
            cached: false,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                countries: [],
                error: (error as Error).message || "Failed to fetch countries from Flagdex API",
            },
            { status: 502 }
        );
    }
}
