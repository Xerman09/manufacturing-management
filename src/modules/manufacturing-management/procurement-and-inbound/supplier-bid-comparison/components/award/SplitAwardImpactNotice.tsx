"use client";

import React from "react";
import { AlertCircle, Info, Split } from "lucide-react";
import { motion } from "framer-motion";

interface SplitAwardImpactNoticeProps {
  supplierCount: number;
  totalItems: number;
  currency: string;
}

export const SplitAwardImpactNotice: React.FC<SplitAwardImpactNoticeProps> = ({
  supplierCount,
  totalItems,
  currency,
}) => {
  if (supplierCount <= 1) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold text-slate-700">Single Supplier Award:</span> All items are awarded to a single vendor. Fixed charges (customs processing, stamps, inland trucking, and bank fees) will only incur once.
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex items-start gap-3 shadow-xs"
    >
      <div className="p-1 rounded-md bg-amber-100 text-amber-700 shrink-0">
        <Split className="w-4 h-4" />
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-amber-900">
            Split Award Notice: Allocation spans {supplierCount} distinct vendors ({totalItems} items)
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-200 text-amber-800">
            Split PO
          </span>
        </div>
        <p className="text-amber-800/90 leading-relaxed">
          Splitting items lowers item-level purchase costs, but <strong>fixed overheads</strong> (lump-sum freight minimums, Philippine customs documentary stamps, arrastre/wharfage handling, inland delivery trucking, and bank LC fees) are billed per shipment and supplier. The total landed cost shown includes each winning supplier's standalone fixed overhead.
        </p>
      </div>
    </motion.div>
  );
};
