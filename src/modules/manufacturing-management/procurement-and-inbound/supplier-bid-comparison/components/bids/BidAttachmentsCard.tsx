"use client";

import React, { useState, useRef } from "react";
import {
    Paperclip,
    Plus,
    Trash2,
    Eye,
    Download,
    FileText,
    Image as ImageIcon,
    File,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBidComparisonStore } from "../../hooks/useBidComparisonState";
import { SupplierBid, BidAttachment } from "../../types";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { toast } from "sonner";

interface BidAttachmentsCardProps {
    bid: SupplierBid;
}

export const BidAttachmentsCard: React.FC<BidAttachmentsCardProps> = ({ bid }) => {
    const { updateProject } = useBidComparisonStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [previewAttachment, setPreviewAttachment] = useState<BidAttachment | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

    const attachments = bid.attachments || [];

    // File Upload Handler (with DataURL extraction for instant preview + UUID directus_file_id)
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const fileList = Array.from(files);
        let processedCount = 0;
        const newAttachments: BidAttachment[] = [];

        fileList.forEach((file) => {
            if (file.size > 20 * 1024 * 1024) {
                toast.error(`File "${file.name}" exceeds 20MB limit.`);
                return;
            }

            const reader = new FileReader();
            reader.onload = (loadEvt) => {
                const dataUrl = loadEvt.target?.result as string;

                // Generate standard 36-char UUID format
                const uuid = crypto.randomUUID
                    ? crypto.randomUUID()
                    : `att-${Date.now().toString(16)}-4000-8000-${Math.random().toString(16).slice(2, 14)}`;

                newAttachments.push({
                    id: "att-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    directusFileId: uuid,
                    fileName: file.name,
                    mimeType: file.type || "application/octet-stream",
                    fileSize: file.size,
                    documentType: "Quotation Document",
                    uploadedAt: new Date().toISOString(),
                    dataUrl,
                });

                processedCount += 1;
                if (processedCount === fileList.length) {
                    updateProject((prev) => ({
                        ...prev,
                        bids: prev.bids.map((b) =>
                            b.id === bid.id ? { ...b, attachments: [...(b.attachments || []), ...newAttachments] } : b
                        ),
                    }));
                    toast.success(`Attached ${newAttachments.length} document(s).`);
                }
            };

            reader.readAsDataURL(file);
        });

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
                        Attachments (quotation, certificates)
                    </CardTitle>

                    <div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            multiple
                            className="hidden"
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            className="h-7 text-xs gap-1"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Attach files
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

                                return (
                                    <div
                                        key={att.id}
                                        className="p-2.5 px-3 flex items-center justify-between hover:bg-muted/15 transition-colors gap-3"
                                    >
                                        {/* Left: Icon & Clickable Filename */}
                                        <div
                                            onClick={() => handleOpenPreview(att)}
                                            className="flex items-center gap-2.5 min-w-0 cursor-pointer group flex-1"
                                        >
                                            {isImg ? (
                                                <ImageIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                                            ) : isPdf ? (
                                                <FileText className="h-4 w-4 text-red-600 shrink-0" />
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
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleOpenPreview(att)}
                                                title="Preview Attachment"
                                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                            </Button>

                                            {att.dataUrl && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        const a = document.createElement("a");
                                                        a.href = att.dataUrl!;
                                                        a.download = att.fileName;
                                                        document.body.appendChild(a);
                                                        a.click();
                                                        document.body.removeChild(a);
                                                    }}
                                                    title="Download File"
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                </Button>
                                            )}

                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleRemoveAttachment(att.id)}
                                                title="Remove Attachment"
                                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
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
