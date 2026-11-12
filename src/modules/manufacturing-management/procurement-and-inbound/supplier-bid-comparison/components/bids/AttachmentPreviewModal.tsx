"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    ZoomIn,
    ZoomOut,
    RotateCw,
    RotateCcw,
    RotateCcw as ResetIcon,
    Download,
    FileText,
    Image as ImageIcon,
    File,
    X,
} from "lucide-react";
import { BidAttachment } from "../../types";

interface AttachmentPreviewModalProps {
    attachment: BidAttachment | null;
    isOpen: boolean;
    onClose: () => void;
}

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
    attachment,
    isOpen,
    onClose,
}) => {
    // Zoom state
    const [scale, setScale] = useState<number>(1);
    // Pan coordinates
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // Cumulative rotation to fix the 270° -> 0° snap/reverse spin issue
    // Each clockwise click adds +90 continuously: 0° -> 90° -> 180° -> 270° -> 360° -> 450°
    const [cumulativeRotation, setCumulativeRotation] = useState<number>(0);

    const containerRef = useRef<HTMLDivElement>(null);

    const resetTransform = useCallback(() => {
        setScale(1);
        setPan({ x: 0, y: 0 });
        setCumulativeRotation(0);
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isOpen) {
            resetTransform();
        }
    }, [isOpen, attachment, resetTransform]);

    if (!isOpen || !attachment) return null;

    const isImage = Boolean(
        attachment.mimeType?.startsWith("image/") ||
        /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(attachment.fileName)
    );

    const isPdf = Boolean(
        attachment.mimeType?.includes("pdf") ||
        /\.pdf$/i.test(attachment.fileName)
    );

    const fileSource = attachment.dataUrl || attachment.fileUrl || "";

    // Zoom Controls
    const handleZoomIn = () => setScale((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 5));
    const handleZoomOut = () => setScale((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.25));

    // Continuous clockwise rotation (+90deg per click)
    // Going from 270° to 360° continues rotating smoothly clockwise instead of snapping
    const handleRotateClockwise = () => {
        setCumulativeRotation((prev) => prev + 90);
    };

    // Continuous counter-clockwise rotation (-90deg per click)
    const handleRotateCounterClockwise = () => {
        setCumulativeRotation((prev) => prev - 90);
    };

    // Pan Drag Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only primary click
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX - pan.x,
            y: e.clientY - pan.y,
        };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        setPan({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y,
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Mousewheel Zoom
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (e.deltaY < 0) {
            handleZoomIn();
        } else {
            handleZoomOut();
        }
    };

    const handleDownload = () => {
        if (!fileSource) return;
        const a = document.createElement("a");
        a.href = fileSource;
        a.download = attachment.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // Normalized visual angle for the angle badge: (cum % 360 + 360) % 360
    const normalizedAngle = ((cumulativeRotation % 360) + 360) % 360;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[94vw] w-[94vw] max-w-[1400px] h-[92vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border shadow-2xl">
                {/* Header Toolbar */}
                <DialogHeader className="py-2.5 px-4 border-b flex flex-row items-center justify-between space-y-0 bg-muted/30 shrink-0">
                    <div className="flex items-center gap-2 min-w-0 pr-4">
                        {isImage ? (
                            <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : isPdf ? (
                            <FileText className="w-4 h-4 text-red-600 shrink-0" />
                        ) : (
                            <File className="w-4 h-4 text-primary shrink-0" />
                        )}
                        <DialogTitle className="text-sm font-semibold truncate">
                            {attachment.fileName}
                        </DialogTitle>
                        {attachment.fileSize && (
                            <span className="text-xs text-muted-foreground shrink-0">
                                ({(attachment.fileSize / 1024).toFixed(1)} KB)
                            </span>
                        )}
                    </div>

                    {/* Toolbar Controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        {isImage && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleZoomOut}
                                    title="Zoom Out"
                                    className="h-7 w-7 p-0"
                                >
                                    <ZoomOut className="w-3.5 h-3.5" />
                                </Button>

                                <span className="text-xs font-mono px-1.5 min-w-[3.5rem] text-center font-medium">
                                    {Math.round(scale * 100)}%
                                </span>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleZoomIn}
                                    title="Zoom In"
                                    className="h-7 w-7 p-0"
                                >
                                    <ZoomIn className="w-3.5 h-3.5" />
                                </Button>

                                <div className="h-4 w-px bg-border mx-1" />

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRotateCounterClockwise}
                                    title="Rotate Left (-90°)"
                                    className="h-7 w-7 p-0"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </Button>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRotateClockwise}
                                    title="Rotate Right (+90°)"
                                    className="h-7 w-7 p-0"
                                >
                                    <RotateCw className="w-3.5 h-3.5" />
                                </Button>

                                {normalizedAngle > 0 && (
                                    <span className="text-[11px] font-mono text-muted-foreground px-1">
                                        {normalizedAngle}°
                                    </span>
                                )}

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={resetTransform}
                                    title="Reset view (zoom, pan, rotation)"
                                    className="h-7 text-xs px-2 gap-1"
                                >
                                    <ResetIcon className="w-3 h-3" />
                                    Reset
                                </Button>

                                <div className="h-4 w-px bg-border mx-1" />
                            </>
                        )}

                        {fileSource && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownload}
                                title="Download File"
                                className="h-7 px-2 text-xs gap-1"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Download
                            </Button>
                        )}

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="h-7 w-7 p-0 ml-1"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </DialogHeader>

                {/* Viewport Canvas */}
                <div
                    ref={containerRef}
                    onMouseDown={isImage ? handleMouseDown : undefined}
                    onMouseMove={isImage ? handleMouseMove : undefined}
                    onMouseUp={isImage ? handleMouseUp : undefined}
                    onMouseLeave={isImage ? handleMouseUp : undefined}
                    onWheel={isImage ? handleWheel : undefined}
                    className={`flex-1 relative overflow-hidden bg-neutral-900/90 dark:bg-black/95 flex items-center justify-center p-4 select-none ${
                        isImage ? (isDragging ? "cursor-grabbing" : "cursor-grab") : ""
                    }`}
                >
                    {isImage ? (
                        fileSource ? (
                            <div
                                style={{
                                    transform: `translate3d(${pan.x}px, ${pan.y}px, 0px) scale(${scale}) rotate(${cumulativeRotation}deg)`,
                                    transition: isDragging ? "none" : "transform 0.18s cubic-bezier(0.2, 0, 0, 1)",
                                    transformOrigin: "center center",
                                }}
                                className="inline-block"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={fileSource}
                                    alt={attachment.fileName}
                                    draggable={false}
                                    className="max-w-[88vw] max-h-[80vh] object-contain shadow-2xl rounded pointer-events-none"
                                />
                            </div>
                        ) : (
                            <div className="text-center text-muted-foreground p-8 space-y-2">
                                <ImageIcon className="w-12 h-12 mx-auto opacity-40 text-white" />
                                <p className="text-sm text-neutral-300">Image binary preview unavailable.</p>
                                <p className="text-xs text-neutral-400">File was registered with ID {attachment.directusFileId}</p>
                            </div>
                        )
                    ) : isPdf ? (
                        fileSource ? (
                            <iframe
                                src={fileSource}
                                title={attachment.fileName}
                                className="w-full h-full rounded border-0 bg-white"
                            />
                        ) : (
                            <div className="text-center text-muted-foreground p-8 space-y-3">
                                <FileText className="w-12 h-12 mx-auto text-red-400 opacity-80" />
                                <p className="text-sm text-neutral-200">PDF Document: {attachment.fileName}</p>
                                <Button size="sm" onClick={handleDownload} className="gap-1.5">
                                    <Download className="w-4 h-4" /> Download to Open
                                </Button>
                            </div>
                        )
                    ) : (
                        <div className="text-center text-muted-foreground p-8 space-y-3">
                            <File className="w-12 h-12 mx-auto text-primary opacity-80" />
                            <p className="text-sm text-neutral-200">{attachment.fileName}</p>
                            <p className="text-xs text-neutral-400">Preview not supported for this file format ({attachment.mimeType || "document"}).</p>
                            {fileSource && (
                                <Button size="sm" onClick={handleDownload} className="gap-1.5">
                                    <Download className="w-4 h-4" /> Download Document
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
