import React from "react";
import { X, Loader2 } from "lucide-react";

interface PreviewModalProps {
  isPreviewOpen: boolean;
  setIsPreviewOpen: (val: boolean) => void;
  currentGeneratingDocNo: string | null;
  pdfUrl: string | null;
}

export function PreviewModal({
  isPreviewOpen,
  setIsPreviewOpen,
  currentGeneratingDocNo,
  pdfUrl
}: PreviewModalProps) {
  if (!isPreviewOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-5xl h-full rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 md:p-6 border-b border-border flex items-center justify-between bg-card shrink-0">
          <div>
            <h3 className="text-xl font-extrabold text-foreground tracking-tight">Report Preview</h3>
            <p className="text-xs text-muted-foreground font-medium mt-1">Doc No: <span className="text-blue-600 font-bold">{currentGeneratingDocNo}</span></p>
          </div>
          <button 
            onClick={() => setIsPreviewOpen(false)}
            className="p-2 hover:bg-accent rounded-xl transition-colors text-muted-foreground hover:text-red-500"
          >
            <X size={24} />
          </button>
        </div>
        <div className="flex-1 bg-muted p-4 md:p-8 flex items-center justify-center relative">
          {pdfUrl ? (
            <iframe 
              src={pdfUrl} 
              className="w-full h-full rounded-2xl shadow-lg border border-border bg-card"
              title="PDF Preview"
            />
          ) : (
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center">
                <Loader2 className="animate-spin text-muted-foreground" size={32} />
              </div>
              <div className="text-sm font-medium text-muted-foreground">Generating Document...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
