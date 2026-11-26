import { cookies } from "next/headers";
import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string {
    for (const k of keys) {
        const v = obj ? obj[k] : undefined;
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
}

/**
 * Extracts header user display info from the session JWT cookie.
 */
export async function getHeaderUserFromCookies() {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value ?? null;
    const payload = token ? decodeJwtPayload(token) : null;

    const first = pickString(payload, ["Firstname", "FirstName", "firstName", "firstname", "first_name"]);
    const last = pickString(payload, ["LastName", "Lastname", "lastName", "lastname", "last_name"]);
    const email = pickString(payload, ["email", "Email"]);

    const name = [first, last].filter(Boolean).join(" ") || email || "User";

    return {
        name,
        email: email || "",
        avatar: "/avatars/shadcn.jpg",
    };
}
