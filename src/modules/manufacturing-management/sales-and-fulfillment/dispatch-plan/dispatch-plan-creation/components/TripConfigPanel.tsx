"use client";

import React from "react";
import { Lock, Building2, UserCheck, Users, SlidersHorizontal, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox } from "../../components/SearchableCombobox";
import type { BranchOption, UserOption, VehicleOption } from "../../shared.types";

export interface TripConfigFormValues {
  branch_id: number | null;
  vehicle_id?: number | null;
  driver_id: number | null;
  helper_id: number | null;
  departure_date: string;
  arrival_date: string;
  remarks: string;
}

interface TripConfigPanelProps {
  values: TripConfigFormValues;
  onChange?: (patch: Partial<TripConfigFormValues>) => void;
  branches: BranchOption[];
  drivers: UserOption[];
  helpers: UserOption[];
  vehicles?: VehicleOption[];
  readOnly?: boolean;
  lockedVehicleName?: string;
  branchNameFallback?: string;
  driverNameFallback?: string;
  helperNameFallback?: string;
  children?: React.ReactNode;
}

export const TripConfigPanel: React.FC<TripConfigPanelProps> = ({
  values,
  onChange,
  branches,
  drivers,
  helpers,
  vehicles = [],
  readOnly = false,
  lockedVehicleName = "3rd Party Logistics",
  branchNameFallback,
  driverNameFallback,
  helperNameFallback,
  children,
}) => {
  const branchOptions = branches.map((b) => ({
    value: String(b.id),
    label: b.branch_name,
    sublabel: b.branch_code || undefined,
  }));

  const selectedVehicle = vehicles.find((v) => v.vehicle_id === values.vehicle_id);
  const isThirdParty =
    values.vehicle_id === undefined ||
    values.vehicle_id === null ||
    values.vehicle_id === 0 ||
    selectedVehicle?.is_third_party ||
    Boolean(selectedVehicle?.name?.toLowerCase().includes("third party")) ||
    Boolean(selectedVehicle?.name?.toLowerCase().includes("3rd party")) ||
    Boolean(lockedVehicleName?.toLowerCase().includes("3rd party") && !values.vehicle_id);

  const vehicleOptions = (vehicles.length > 0
    ? vehicles
    : [{ vehicle_id: 0, vehicle_plate: "3PL", name: lockedVehicleName, is_third_party: true }]
  ).map((v) => {
    const metaParts = [
      v.vehicle_type_name,
      v.category_name,
      v.maximum_weight ? `Max: ${v.maximum_weight} kg` : null,
    ].filter(Boolean);

    const plate = v.vehicle_plate?.trim();
    const name = v.name?.trim();
    const label = plate
      ? (name && name !== plate ? `${plate} — ${name}` : plate)
      : (name || "Vehicle");

    return {
      value: String(v.vehicle_id),
      label,
      sublabel: metaParts.length > 0 ? metaParts.join(" · ") : undefined,
    };
  });

  const driverOptions = drivers.map((d) => ({
    value: String(d.user_id),
    label: d.full_name,
    sublabel: d.user_position || undefined,
  }));

  const helperOptions = helpers
    .filter((h) => h.user_id !== values.driver_id)
    .map((h) => ({
      value: String(h.user_id),
      label: h.full_name,
      sublabel: h.user_position || undefined,
    }));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto p-5 space-y-5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
        Trip Configuration
      </div>

      {/* Row 1: Source Branch + Vehicle Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Source Branch <span className="text-destructive">*</span>
          </Label>
          {readOnly ? (
            <div className="h-9 px-3 rounded-md border bg-muted/40 flex items-center text-sm font-medium text-foreground">
              {branchNameFallback ||
                branches.find((b) => b.id === values.branch_id)?.branch_name ||
                "-"}
            </div>
          ) : (
            <SearchableCombobox
              options={branchOptions}
              value={values.branch_id ? String(values.branch_id) : null}
              onChange={(val) => onChange?.({ branch_id: val ? Number(val) : null })}
              placeholder="Select source branch..."
              searchPlaceholder="Search branch..."
              emptyText="No branch found."
              icon={<Building2 className="h-3.5 w-3.5" />}
              popoverWidthClass="w-[260px]"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Vehicle</span>
            {selectedVehicle?.maximum_weight && selectedVehicle.maximum_weight > 0 ? (
              <span className="text-[10px] text-muted-foreground font-mono lowercase">
                (max: {selectedVehicle.maximum_weight} kg)
              </span>
            ) : null}
          </Label>
          {readOnly ? (
            <div className="h-9 px-3 rounded-md border bg-muted/50 flex items-center justify-between text-sm font-medium text-foreground select-none">
              <span>{selectedVehicle?.name || lockedVehicleName}</span>
              {isThirdParty && <Lock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
            </div>
          ) : (
            <SearchableCombobox
              options={vehicleOptions}
              value={values.vehicle_id !== undefined && values.vehicle_id !== null ? String(values.vehicle_id) : "0"}
              onChange={(val) => {
                const vid = val ? Number(val) : 0;
                const newlySelected = vehicles.find((v) => v.vehicle_id === vid);
                const isNow3PL = vid === 0 || newlySelected?.is_third_party;
                onChange?.({
                  vehicle_id: vid,
                  ...(isNow3PL ? { driver_id: null, helper_id: null } : {}),
                });
              }}
              placeholder="Select vehicle..."
              searchPlaceholder="Search vehicle plate or type..."
              emptyText="No vehicle found."
              icon={<Truck className="h-3.5 w-3.5" />}
              popoverWidthClass="w-[320px]"
            />
          )}
          {isThirdParty ? (
            <p className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
              <Lock className="h-3 w-3" />
              Locked to 3rd Party Logistics (Driver & Helper not required)
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Internal Vehicle: driver and helper assignment required.
            </p>
          )}
        </div>
      </div>

      {/* Row 2: Departure (ETD) + Arrival (ETDA) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Departure (ETD) <span className="text-destructive">*</span>
          </Label>
          <Input
            type="datetime-local"
            value={values.departure_date}
            disabled={readOnly}
            onChange={(e) => onChange?.({ departure_date: e.target.value })}
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Arrival (ETDA) <span className="text-destructive">*</span>
          </Label>
          <Input
            type="datetime-local"
            value={values.arrival_date}
            min={values.departure_date || undefined}
            disabled={readOnly}
            onChange={(e) => onChange?.({ arrival_date: e.target.value })}
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* Row 3: Driver + Helper (Locked / Disabled if Third Party Logistics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>
              Driver {!isThirdParty && <span className="text-destructive">*</span>}
            </span>
            {isThirdParty && (
              <span className="text-[10px] text-muted-foreground font-normal">
                (Disabled for 3PL)
              </span>
            )}
          </Label>
          {readOnly ? (
            <div className="h-9 px-3 rounded-md border bg-muted/40 flex items-center text-sm font-medium text-foreground">
              {driverNameFallback ||
                drivers.find((d) => d.user_id === values.driver_id)?.full_name ||
                (isThirdParty ? "External 3PL Driver" : "-")}
            </div>
          ) : isThirdParty ? (
            <div className="h-9 px-3 rounded-md border bg-muted/30 flex items-center justify-between text-xs text-muted-foreground select-none cursor-not-allowed">
              <span>External 3PL Driver (Not Required)</span>
              <Lock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            </div>
          ) : (
            <SearchableCombobox
              options={driverOptions}
              value={values.driver_id ? String(values.driver_id) : null}
              onChange={(val) => onChange?.({ driver_id: val ? Number(val) : null })}
              placeholder="Select driver..."
              searchPlaceholder="Search driver..."
              emptyText="No driver found."
              icon={<UserCheck className="h-3.5 w-3.5" />}
              popoverWidthClass="w-[260px]"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>
              Helper {!isThirdParty && <span className="text-destructive">*</span>}
            </span>
            {isThirdParty && (
              <span className="text-[10px] text-muted-foreground font-normal">
                (Disabled for 3PL)
              </span>
            )}
          </Label>
          {readOnly ? (
            <div className="h-9 px-3 rounded-md border bg-muted/40 flex items-center text-sm font-medium text-foreground">
              {helperNameFallback ||
                helpers.find((h) => h.user_id === values.helper_id)?.full_name ||
                (isThirdParty ? "External 3PL Helper" : "-")}
            </div>
          ) : isThirdParty ? (
            <div className="h-9 px-3 rounded-md border bg-muted/30 flex items-center justify-between text-xs text-muted-foreground select-none cursor-not-allowed">
              <span>External 3PL Helper (Not Required)</span>
              <Lock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            </div>
          ) : (
            <SearchableCombobox
              options={helperOptions}
              value={values.helper_id ? String(values.helper_id) : null}
              onChange={(val) => onChange?.({ helper_id: val ? Number(val) : null })}
              placeholder="Select helper..."
              searchPlaceholder="Search helper..."
              emptyText="No helper found."
              icon={<Users className="h-3.5 w-3.5" />}
              popoverWidthClass="w-[260px]"
            />
          )}
        </div>
      </div>

      {/* Remarks */}
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Remarks / Delivery Instructions
        </Label>
        <Textarea
          rows={2}
          disabled={readOnly}
          value={values.remarks}
          onChange={(e) => onChange?.({ remarks: e.target.value })}
          placeholder={readOnly ? "-" : "Enter trip remarks or special delivery instructions..."}
          className="text-sm resize-none"
        />
      </div>

      {/* Optional slot for COA Budget section */}
      {children}
    </div>
  );
};
