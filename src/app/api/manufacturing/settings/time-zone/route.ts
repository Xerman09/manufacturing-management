import { NextResponse } from "next/server";
import { isValidTimeZone } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

export async function GET() {
    if (!DIRECTUS_URL) {
        return NextResponse.json(
            { message: "DIRECTUS_URL is not configured." },
            { status: 500 }
        );
    }

    if (!DIRECTUS_STATIC_TOKEN) {
        return NextResponse.json(
            { message: "DIRECTUS_STATIC_TOKEN is not configured." },
            { status: 500 }
        );
    }

    try {
        const url = `${DIRECTUS_URL.replace(/\/+$/, "")}/items/general_setting?filter[setting_key][_eq]=time_zone&fields=setting_key,setting_value&limit=1`;
        const res = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
            },
            cache: "no-store",
        });

        if (!res.ok) {
            return NextResponse.json(
                { message: `Failed to fetch general_setting.time_zone (HTTP ${res.status}).` },
                { status: 502 }
            );
        }

        const body = (await res.json()) as {
            data?: Array<{ setting_key?: string; setting_value?: string }>;
        };
        const rawValue = body.data?.[0]?.setting_value?.trim() ?? "";

        if (!rawValue) {
            return NextResponse.json(
                { message: "Setting 'time_zone' is missing in general_setting." },
                { status: 500 }
            );
        }

        if (!isValidTimeZone(rawValue)) {
            return NextResponse.json(
                { message: `Invalid IANA timezone '${rawValue}' in general_setting.time_zone.` },
                { status: 500 }
            );
        }

        return NextResponse.json({ timeZone: rawValue });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Failed to load timezone setting.";
        return NextResponse.json({ message }, { status: 500 });
    }
}
