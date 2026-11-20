"use client";

import React, { useState } from "react";
import { Plus, Trash2, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableCombobox } from "../../components/SearchableCombobox";
import type { CoaOption } from "../../shared.types";
import { formatCurrency } from "../../shared.utils";

export interface BudgetRowDraft {
  id?: number;
  coa_id: number | null;
  account_title?: string;
  amount: string; // string while typing so user can clear/backspace freely
  remarks: string;
}

interface BudgetSectionProps {
  rows: BudgetRowDraft[];
  onChange?: (rows: BudgetRowDraft[]) => void;
  coaOptions: CoaOption[];
  readOnly?: boolean;
}

export const BudgetSection: React.FC<BudgetSectionProps> = ({
  rows,
  onChange,
  coaOptions,
  readOnly = false,
}) => {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const totalBudget = rows.reduce((sum, r) => {
    const num = parseFloat(r.amount);
    return sum + (Number.isNaN(num) ? 0 : num);
  }, 0);

  const handleAddRow = () => {
    onChange?.([...rows, { coa_id: null, amount: "", remarks: "" }]);
  };

  const handleRemoveRow = (index: number) => {
    onChange?.(rows.filter((_, idx) => idx !== index));
  };

  const handleRowPatch = (index: number, patch: Partial<BudgetRowDraft>) => {
    onChange?.(rows.map((r, idx) => (idx === index ? { ...r, ...patch } : r)));
  };

  const comboboxItems = coaOptions.map((c) => ({
    value: String(c.coa_id),
    label: c.account_title,
    sublabel: c.gl_code || undefined,
  }));

  return (
    <div className="space-y-2.5 pt-2 border-t">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
          <PieChart className="h-3.5 w-3.5 text-primary" />
          Trip COA Budget
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRow}
            className="h-7 px-2.5 text-xs gap-1"
          >
            <Plus className="h-3 w-3" />
            Add Budget Line
          </Button>
        )}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40 border-b text-muted-foreground">
              <th className="text-left font-semibold px-3 py-2">Account Title</th>
              <th className="text-right font-semibold px-3 py-2 w-[140px]">Budget (PHP)</th>
              {!readOnly && <th className="w-9 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={readOnly ? 2 : 3}
                  className="px-3 py-4 text-center text-muted-foreground"
                >
                  No COA budget lines allocated.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const resolvedTitle =
                  row.account_title ||
                  coaOptions.find((c) => c.coa_id === row.coa_id)?.account_title ||
                  "-";
                return (
                  <tr key={row.id ?? `draft-${idx}`} className="border-b last:border-b-0">
                    <td className="px-2.5 py-2 align-middle">
                      {readOnly ? (
                        <span className="font-medium text-foreground">{resolvedTitle}</span>
                      ) : (
                        <SearchableCombobox
                          options={comboboxItems}
                          value={row.coa_id ? String(row.coa_id) : null}
                          onChange={(val) => {
                            const coaId = val ? Number(val) : null;
                            const found = coaOptions.find((c) => c.coa_id === coaId);
                            handleRowPatch(idx, {
                              coa_id: coaId,
                              account_title: found?.account_title,
                            });
                          }}
                          placeholder="Select account..."
                          searchPlaceholder="Search COA..."
                          emptyText="No account found."
                          className="h-8 text-xs"
                          popoverWidthClass="w-[260px]"
                        />
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-right align-middle">
                      {readOnly ? (
                        <span className="font-mono font-semibold text-foreground">
                          {formatCurrency(parseFloat(row.amount || "0"))}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.amount}
                          placeholder="0.00"
                          onFocus={(e) => {
                            setFocusedIndex(idx);
                            if (row.amount === "0" || row.amount === "0.00") {
                              handleRowPatch(idx, { amount: "" });
                            } else {
                              e.target.select();
                            }
                          }}
                          onClick={(e) => {
                            if (focusedIndex !== idx) {
                              e.currentTarget.select();
                            }
                          }}
                          onChange={(e) => handleRowPatch(idx, { amount: e.target.value })}
                          onBlur={() => {
                            setFocusedIndex(null);
                            const parsed = parseFloat(row.amount);
                            if (row.amount.trim() === "" || Number.isNaN(parsed) || parsed < 0) {
                              handleRowPatch(idx, { amount: "0" });
                            }
                          }}
                          className="h-8 text-right font-mono text-xs"
                        />
                      )}
                    </td>
                    {!readOnly && (
                      <td className="px-1.5 py-2 text-center align-middle">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRow(idx)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 border-t">
              <td className="px-3 py-2 font-semibold text-foreground">Total Allocated Budget:</td>
              <td
                colSpan={readOnly ? 1 : 2}
                className="px-3 py-2 text-right font-mono font-bold text-primary"
              >
                PHP{" "}
                {totalBudget.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
