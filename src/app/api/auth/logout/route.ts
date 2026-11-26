import { NextResponse } from "next/server"
import { COOKIE_NAME, REFRESH_COOKIE_NAME, REFRESH_PATH, IS_SECURE_COOKIE } from "@/lib/auth-utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"


export async function POST() {
    const res = NextResponse.json({ ok: true })

    res.cookies.set({
        name: COOKIE_NAME,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: IS_SECURE_COOKIE,
        path: "/",
        maxAge: 0,
    })

    res.cookies.set({
        name: REFRESH_COOKIE_NAME,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: IS_SECURE_COOKIE,
        path: REFRESH_PATH,
        maxAge: 0,
    })

    return res
}
