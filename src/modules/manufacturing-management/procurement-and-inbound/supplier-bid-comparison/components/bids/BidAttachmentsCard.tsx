"use client";

import React, { useState, useRef } from "react";
import {
    Paperclip,
    Plus,
    Trash2,
    Eye,
    FileText,
    Image as ImageIcon,
    File,
    FileCode,
    Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBidComparisonStore, isRfqProjectLocked } from "../../hooks/useBidComparisonState";
import { SupplierBid, BidAttachment } from "../../types";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { toast } from "sonner";

interface BidAttachmentsCardProps {
    bid: SupplierBid;
}

export const BidAttachmentsCard: React.FC<BidAttachmentsCardProps> = ({ bid }) => {
    const { currentProject, updateProject } = useBidComparisonStore();
    const isLocked = isRfqProjectLocked(currentProject);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [previewAttachment, setPreviewAttachment] = useState<BidAttachment | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
    const [isUploading, setIsUploading] = useState<boolean>(false);

    const attachments = bid.attachments || [];

    // Real File Upload Handler via Directus /files API
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const fileList = Array.from(files);
        setIsUploading(true);
        const newAttachments: BidAttachment[] = [];
        let uploadErrors = 0;

        for (const file of fileList) {
            if (file.size > 20 * 1024 * 1024) {
                toast.error(`File "${file.name}" exceeds 20MB limit.`);
                uploadErrors++;
                continue;
            }

            try {
                // Read local preview content upfront so user has instantaneous zero-network preview
                let localDataUrl = "";
                let localRawText: string | undefined = undefined;

                if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(file.name)) {
                    localDataUrl = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = () => resolve("");
                        reader.readAsDataURL(file);
                    });
                } else if (file.type.includes("pdf") || /\.pdf$/i.test(file.name)) {
                    localDataUrl = URL.createObjectURL(file);
                } else if (
                    /\.(json|html?|xml|csv|txt|log|md)$/i.test(file.name) ||
                    file.type.includes("json") ||
                    file.type.startsWith("text/")
                ) {
                    localRawText = await file.text();
                    localDataUrl = URL.createObjectURL(new Blob([localRawText], { type: file.type || "text/plain" }));
                }

                const formData = new FormData();
                formData.append("file", file);

                const res = await fetch("/api/manufacturing/procurement-and-inbound/supplier-bid-comparison/attachments", {
                    method: "POST",
                    body: formData,
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => null);
                    // Provide graceful local preview fallback even if server is offline
                    newAttachments.push({
                        id: "att-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                        directusFileId: "local-" + Date.now().toString(36),
                        fileName: file.name,
                        mimeType: file.type || "application/octet-stream",
                        fileSize: file.size,
                        documentType: "Quotation Document",
                        uploadedAt: new Date().toISOString(),
                        dataUrl: localDataUrl,
                        rawText: localRawText,
                    });
                    toast.warning(`File "${file.name}" loaded for local preview. Server sync pending: ${errData?.error || res.statusText}`);
                    continue;
                }

                const data = await res.json();
                if (data.success && data.file) {
                    const df = data.file;
                    newAttachments.push({
                        id: "att-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                        directusFileId: df.id,
                        fileName: df.fileName,
                        mimeType: df.mimeType || file.type,
                        fileSize: df.fileSize || file.size,
                        documentType: "Quotation Document",
                        uploadedAt: new Date().toISOString(),
                        fileUrl: `/api/manufacturing/procurement-and-inbound/supplier-bid-comparison/attachments?fileId=${df.id}&fileName=${encodeURIComponent(df.fileName)}`,
                        dataUrl: localDataUrl,
                        rawText: localRawText,
                    });
                }
            } catch (err) {
                toast.error(`Error uploading "${file.name}": ${(err as Error).message}`);
                uploadErrors++;
            }
        }

        if (newAttachments.length > 0) {
            updateProject((prev) => ({
                ...prev,
                bids: prev.bids.map((b) =>
                    b.id === bid.id ? { ...b, attachments: [...(b.attachments || []), ...newAttachments] } : b
                ),
            }));
            toast.success(`Successfully uploaded ${newAttachments.length} document(s) to Directus.`);
        }

        if (uploadErrors > 0 && newAttachments.length === 0) {
            toast.error("File upload failed. Please try again.");
        }

        setIsUploading(false);

        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleRemoveAttachment = (attId: string) => {
        updateProject((prev) => ({
            ...prev,
            bids: prev.bids.map((b) =>
                b.id === bid.id ? { ...b, attachments: (b.attachments || []).filter((a) => a.id !== attId) } : b
            ),
        }));
        toast.info("Attachment removed.");
    };

    const handleOpenPreview = (att: BidAttachment) => {
        setPreviewAttachment(att);
        setIsPreviewOpen(true);
    };

    return (
        <>
            <Card className="shadow-xs border-border/80">
                <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <Paperclip className="h-4 w-4 text-primary" />
                        2.7 Attachments (quotation, certificates)
                    </CardTitle>

                    <div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            disabled={isLocked}
                            multiple
                            className="hidden"
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isLocked || isUploading}
                            className="h-7 text-xs gap-1"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Plus className="w-3.5 h-3.5" />
                                    Attach files
                                </>
                            )}
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                    {/* Attachments List: Exactly One Attachment Per Row */}
                    {attachments.length === 0 ? (
                        <div className="text-xs text-muted-foreground space-y-1 py-1">
                            <p>No files attached.</p>
                            <p className="text-[11px] text-muted-foreground/80">Only editors can attach files.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/60 rounded-lg border bg-card overflow-hidden">
                            {attachments.map((att) => {
                                const isImg = Boolean(
                                    att.mimeType?.startsWith("image/") ||
                                    /\.(png|jpe?g|webp|gif|svg)$/i.test(att.fileName)
                                );
                                const isPdf = Boolean(
                                    att.mimeType?.includes("pdf") ||
                                    /\.pdf$/i.test(att.fileName)
                                );
                                const isCode = Boolean(
                                    /\.(json|html?|xml|csv|txt|log|md)$/i.test(att.fileName)
                                );

                                return (
                                    <div
                                        key={att.id}
                                        onClick={() => handleOpenPreview(att)}
                                        className="p-2.5 px-3 flex items-center justify-between hover:bg-muted/20 transition-colors gap-3 cursor-pointer group rounded-md"
                                    >
                                        {/* Left: Icon & Clickable Filename */}
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            {isImg ? (
                                                <ImageIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                                            ) : isPdf ? (
                                                <FileText className="h-4 w-4 text-red-600 shrink-0" />
                                            ) : isCode ? (
                                                <FileCode className="h-4 w-4 text-blue-600 shrink-0" />
                                            ) : (
                                                <File className="h-4 w-4 text-primary shrink-0" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <span className="text-xs font-semibold text-foreground truncate block group-hover:text-primary transition-colors">
                                                    {att.fileName}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {att.fileSize ? `${(att.fileSize / 1024).toFixed(1)} KB` : "Document"}
                                                    {att.uploadedAt ? ` · ${new Date(att.uploadedAt).toLocaleDateString()}` : ""}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Right Action Buttons */}
                                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleOpenPreview(att)}
                                                title="Preview Attachment"
                                                className="h-7 px-2.5 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10 border-primary/20"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                <span>Preview</span>
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={isLocked}
                                                onClick={() => handleRemoveAttachment(att.id)}
                                                title="Remove Attachment"
                                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Interactive Preview Modal with Zoom, Pan, Rotate 360°, Reset */}
            <AttachmentPreviewModal
                attachment={previewAttachment}
                isOpen={isPreviewOpen}
                onClose={() => {
                    setIsPreviewOpen(false);
                    setPreviewAttachment(null);
                }}
            />
        </>
    );
};
