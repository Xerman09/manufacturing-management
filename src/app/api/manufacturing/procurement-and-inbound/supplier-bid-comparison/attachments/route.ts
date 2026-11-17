import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

function getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (DIRECTUS_STATIC_TOKEN) {
        headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
    }
    return headers;
}

/**
 * POST /api/manufacturing/procurement-and-inbound/supplier-bid-comparison/attachments
 * Uploads a file to Directus /files storage
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof Blob)) {
            return NextResponse.json(
                { success: false, error: "No file provided or invalid file format" },
                { status: 400 }
            );
        }

        // Directus requires standard multipart FormData with 'file' field
        const directusFormData = new FormData();
        directusFormData.append("file", file);

        const res = await fetch(`${DIRECTUS_URL}/files`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: directusFormData,
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => null);
            const msg = errData?.errors?.[0]?.message || `Directus storage returned HTTP ${res.status}`;
            return NextResponse.json(
                { success: false, error: msg },
                { status: res.status >= 500 ? 502 : 400 }
            );
        }

        const data = await res.json();
        const df = data.data;

        return NextResponse.json({
            success: true,
            file: {
                id: String(df.id),
                fileName: String(df.filename_download || (file as File).name || "document"),
                mimeType: String(df.type || file.type || "application/octet-stream"),
                fileSize: Number(df.filesize || file.size || 0),
            },
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: (error as Error).message || "File upload failed" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/manufacturing/procurement-and-inbound/supplier-bid-comparison/attachments
 * Streams a stored file from Directus /assets with server bearer token authentication
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get("fileId");

        if (!fileId) {
            return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
        }

        const res = await fetch(`${DIRECTUS_URL}/assets/${fileId}`, {
            headers: getAuthHeaders(),
            cache: "no-store",
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: `File asset not found (${res.status})` },
                { status: res.status }
            );
        }

        const isDownload = searchParams.get("download") === "true";
        const customFileName = searchParams.get("fileName");

        const rawDisposition = res.headers.get("content-disposition") || "";
        const filenameMatch = rawDisposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
        let filename = customFileName || (filenameMatch ? decodeURIComponent(filenameMatch[1]) : fileId);
        // Clean filename of potential invalid characters
        filename = filename.replace(/[/\\]/g, "_");

        let contentType = res.headers.get("content-type") || "application/octet-stream";
        const lowerName = filename.toLowerCase();

        // Ensure proper MIME type for inline preview if Directus returned generic octet-stream
        if (contentType.includes("octet-stream") || !contentType || contentType === "application/download") {
            if (lowerName.endsWith(".pdf")) contentType = "application/pdf";
            else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) contentType = "image/jpeg";
            else if (lowerName.endsWith(".png")) contentType = "image/png";
            else if (lowerName.endsWith(".webp")) contentType = "image/webp";
            else if (lowerName.endsWith(".gif")) contentType = "image/gif";
            else if (lowerName.endsWith(".svg")) contentType = "image/svg+xml";
            else if (lowerName.endsWith(".html") || lowerName.endsWith(".htm")) contentType = "text/html; charset=utf-8";
            else if (lowerName.endsWith(".json")) contentType = "application/json; charset=utf-8";
            else if (lowerName.endsWith(".txt") || lowerName.endsWith(".csv") || lowerName.endsWith(".log") || lowerName.endsWith(".md") || lowerName.endsWith(".xml")) {
                contentType = "text/plain; charset=utf-8";
            }
        }

        const contentDisposition = isDownload
            ? `attachment; filename="${encodeURIComponent(filename)}"`
            : "inline";

        return new NextResponse(res.body, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": contentDisposition,
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "public, max-age=3600",
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: (error as Error).message || "Failed to retrieve file asset" },
            { status: 500 }
        );
    }
}
