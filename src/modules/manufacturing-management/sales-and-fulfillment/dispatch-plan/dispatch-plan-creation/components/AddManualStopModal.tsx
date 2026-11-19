"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface AddManualStopModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (stop: {
    remarks: string;
    distance: number;
    latitude: number | null;
    longitude: number | null;
  }) => void;
  editStop?: {
    remarks: string;
    distance: number;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}

interface AddManualStopFormContentProps {
  editStop?: {
    remarks: string;
    distance: number;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  onAdd: (stop: {
    remarks: string;
    distance: number;
    latitude: number | null;
    longitude: number | null;
  }) => void;
  onClose: () => void;
}

const AddManualStopFormContent: React.FC<AddManualStopFormContentProps> = ({
  editStop,
  onAdd,
  onClose,
}) => {
  const [remarks, setRemarks] = useState(editStop?.remarks || "");
  const [locationStr, setLocationStr] = useState(
    editStop?.latitude && editStop?.longitude ? `${editStop.latitude}, ${editStop.longitude}` : ""
  );
  const [distance, setDistance] = useState<number | string>(editStop?.distance ?? 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!remarks.trim()) {
      toast.error("Location Required", {
        description: "Please enter a location name or remarks for the stop.",
      });
      return;
    }

    let latitude: number | null = null;
    let longitude: number | null = null;

    if (locationStr.trim()) {
      const parts = locationStr.split(",");
      if (parts.length === 2) {
        const latVal = parseFloat(parts[0].trim());
        const lonVal = parseFloat(parts[1].trim());
        if (!Number.isNaN(latVal) && !Number.isNaN(lonVal)) {
          latitude = latVal;
          longitude = lonVal;
        }
      }
    }

    const distNum = typeof distance === "string" ? parseFloat(distance) || 0 : distance || 0;

    onAdd({
      remarks: remarks.trim(),
      distance: distNum,
      latitude,
      longitude,
    });

    onClose();
  };

  const query = encodeURIComponent(locationStr.trim() || remarks.trim());

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">
          Location Name / Remarks <span className="text-destructive">*</span>
        </Label>
        <Input
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="e.g. Branch B, Gas Station, Warehouse Drop-off"
          className="text-xs h-9"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">
          Geo Tag / Place Name (Optional)
        </Label>
        <Input
          value={locationStr}
          onChange={(e) => setLocationStr(e.target.value)}
          placeholder="e.g. 14.5995, 120.9842 or Pozorrubio, Pangasinan"
          className="text-xs h-9"
        />
        {query && (
          <div className="h-[180px] rounded-lg border overflow-hidden mt-2 bg-muted/20 relative">
            <iframe
              title="Stop Location Map"
              width="100%"
              height="280"
              style={{ border: 0, marginTop: "-50px" }}
              loading="lazy"
              src={`https://maps.google.com/maps?q=${query}&z=14&output=embed`}
            />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${query}`}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-2 right-2 bg-background/90 hover:bg-background backdrop-blur-sm px-2.5 py-1 rounded border text-[10px] font-semibold text-primary inline-flex items-center gap-1 shadow-xs"
            >
              <span>Open in Google Maps</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Estimated Distance (KM)</Label>
        <Input
          type="number"
          min={0}
          step="any"
          value={distance}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDistance(e.target.value)}
          placeholder="0"
          className="text-xs h-9"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm">
          {editStop ? "Save Changes" : "Add Stop"}
        </Button>
      </div>
    </form>
  );
};

export const AddManualStopModal: React.FC<AddManualStopModalProps> = ({
  open,
  onOpenChange,
  onAdd,
  editStop,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <MapPin className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-bold">
              {editStop ? "Edit Manual Stop" : "Add Manual Stop"}
            </DialogTitle>
          </div>
        </DialogHeader>

        {open && (
          <AddManualStopFormContent
            key={editStop?.remarks ?? "new"}
            editStop={editStop}
            onAdd={onAdd}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
