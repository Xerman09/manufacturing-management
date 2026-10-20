// Work In Progress - Directus API Client (Local to Module)
export const DIRECTUS_URL = process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";
export const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

export function getDirectusHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (DIRECTUS_STATIC_TOKEN) {
        headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
    }
    return headers;
}
