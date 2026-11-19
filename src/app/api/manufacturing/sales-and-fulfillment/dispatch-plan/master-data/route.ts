import { NextResponse } from "next/server";
import {
  directusGet,
  formatUserName,
  LOCKED_VEHICLE_LABEL,
  type RawBranchRow,
  type RawUserRow,
} from "../_helpers";
import type { VehicleOption } from "@/modules/manufacturing-management/sales-and-fulfillment/dispatch-plan/shared.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RawVehicleRow {
  vehicle_id: number;
  vehicle_plate: string;
  name?: string | null;
  status?: string | null;
  maximum_weight?: number | string | null;
  capacity_cbm?: number | string | null;
  category_id?: number | null;
  engine_type?: number | null;
  vehicle_type?: number | null;
  custodian_id?: number | null;
}

export async function GET() {
  try {
    const [
      branches,
      driversRaw,
      helpersRaw,
      coaRaw,
      vehiclesRaw,
      categoriesRaw,
      engineTypesRaw,
      vehicleTypesRaw,
      custodianHistoryRaw,
      usersRaw,
    ] = await Promise.all([
      directusGet<RawBranchRow>(
        "/items/branches?filter[isActive][_eq]=1&limit=-1&sort=branch_name&fields=id,branch_name,branch_code"
      ),
      directusGet<RawUserRow>(
        "/items/user?filter[position_id][_eq]=1000&limit=-1&sort=user_fname,user_lname&fields=user_id,user_fname,user_lname,user_department,user_position"
      ),
      directusGet<RawUserRow>(
        "/items/user?filter[position_id][_eq]=1001&limit=-1&sort=user_fname,user_lname&fields=user_id,user_fname,user_lname,user_department,user_position"
      ),
      directusGet<{ coa_id: number; account_title: string; gl_code: string }>(
        "/items/chart_of_accounts?filter[account_type][_in]=8,9&limit=-1&sort=account_title&fields=coa_id,account_title,gl_code"
      ),
      directusGet<RawVehicleRow>(
        "/items/vehicles?limit=-1&sort=vehicle_plate&fields=vehicle_id,vehicle_plate,name,status,maximum_weight,capacity_cbm,category_id,engine_type,vehicle_type,custodian_id"
      ).catch(() => [] as RawVehicleRow[]),
      directusGet<{ id: number; name: string }>(
        "/items/vehicle_category?limit=-1&fields=id,name"
      ).catch(() => [] as { id: number; name: string }[]),
      directusGet<{ id: number; name: string }>(
        "/items/vehicle_engine_type?limit=-1&fields=id,name"
      ).catch(() => [] as { id: number; name: string }[]),
      directusGet<{ id: number; type_name: string }>(
        "/items/vehicle_type?limit=-1&fields=id,type_name"
      ).catch(() => [] as { id: number; type_name: string }[]),
      directusGet<{ vehicle_id: number; custodian_id: number }>(
        "/items/vehicle_custodian_history?limit=-1&fields=vehicle_id,custodian_id&sort=-id"
      ).catch(() => [] as { vehicle_id: number; custodian_id: number }[]),
      directusGet<{ user_id: number; user_fname?: string; user_lname?: string }>(
        "/items/user?limit=-1&fields=user_id,user_fname,user_lname"
      ).catch(() => [] as { user_id: number; user_fname?: string; user_lname?: string }[]),
    ]);

    const categoryMap = new Map(categoriesRaw.map((c) => [Number(c.id), c.name]));
    const engineTypeMap = new Map(engineTypesRaw.map((e) => [Number(e.id), e.name]));
    const vehicleTypeMap = new Map(vehicleTypesRaw.map((v) => [Number(v.id), v.type_name]));
    const userMap = new Map(
      usersRaw.map((u) => [
        Number(u.user_id),
        `${u.user_fname || ""} ${u.user_lname || ""}`.trim(),
      ])
    );
    const custodianHistoryMap = new Map<number, number>();
    for (const ch of custodianHistoryRaw) {
      if (ch.vehicle_id && !custodianHistoryMap.has(Number(ch.vehicle_id))) {
        custodianHistoryMap.set(Number(ch.vehicle_id), Number(ch.custodian_id));
      }
    }

    const is3PLVehicle = (v: RawVehicleRow, typeName?: string | null) => {
      const name = String(v.name || "").toLowerCase();
      const plate = String(v.vehicle_plate || "").toLowerCase();
      const type = String(typeName || "").toLowerCase();
      return (
        name.includes("third party") ||
        name.includes("3rd party") ||
        plate.includes("3pl") ||
        type.includes("third party") ||
        type.includes("3rd party") ||
        type.includes("3pl") ||
        Number(v.vehicle_type) === 8 ||
        Number(v.vehicle_id) === 245
      );
    };

    const isActiveStatus = (st?: string | null) => {
      if (!st) return true;
      const s = String(st).trim().toLowerCase();
      return s === "active" || s === "1";
    };

    const mappedVehicles: VehicleOption[] = vehiclesRaw
      .filter((v) => isActiveStatus(v.status))
      .map((v) => {
        const vId = Number(v.vehicle_id);
        const catId = v.category_id ? Number(v.category_id) : null;
        const engId = v.engine_type ? Number(v.engine_type) : null;
        const vtId = v.vehicle_type ? Number(v.vehicle_type) : null;
        const vtName = vtId ? vehicleTypeMap.get(vtId) || null : null;
        const custId =
          (v.custodian_id ? Number(v.custodian_id) : null) ||
          custodianHistoryMap.get(vId) ||
          null;

        const is3PL = is3PLVehicle(v, vtName);
        const plate = v.vehicle_plate?.trim()
          ? v.vehicle_plate.trim()
          : is3PL
          ? "3PL"
          : (v.name || `Vehicle #${vId}`);

        return {
          vehicle_id: vId,
          vehicle_plate: plate,
          name: v.name || (is3PL ? "Third Party Logistics" : null),
          maximum_weight:
            v.maximum_weight !== null && v.maximum_weight !== undefined
              ? Number(v.maximum_weight)
              : null,
          capacity_cbm:
            v.capacity_cbm !== null && v.capacity_cbm !== undefined
              ? Number(v.capacity_cbm)
              : null,
          category_id: catId,
          category_name: catId ? categoryMap.get(catId) || null : null,
          engine_type_id: engId,
          engine_type_name: engId ? engineTypeMap.get(engId) || null : null,
          vehicle_type_id: vtId,
          vehicle_type_name: vtName || (is3PL ? "External 3PL" : null),
          custodian_id: custId,
          custodian_name: custId ? userMap.get(custId) || null : null,
          is_third_party: is3PL,
        };
      });

    const thirdPartyList = mappedVehicles.filter((v) => v.is_third_party);
    const standardList = mappedVehicles.filter((v) => !v.is_third_party);

    const vehicleList: VehicleOption[] =
      thirdPartyList.length > 0
        ? [...thirdPartyList, ...standardList]
        : [
            {
              vehicle_id: 0,
              vehicle_plate: "3PL",
              name: "Third Party Logistics",
              vehicle_type_name: "External 3PL",
              maximum_weight: 0,
              capacity_cbm: 0,
              is_third_party: true,
            },
            ...standardList,
          ];

    const primary3PL = vehicleList.find((v) => v.is_third_party) || vehicleList[0];

    return NextResponse.json({
      success: true,
      branches: branches.map((b) => ({
        id: Number(b.id),
        branch_name: b.branch_name,
        branch_code: b.branch_code || "",
      })),
      drivers: driversRaw.map((u) => ({
        user_id: Number(u.user_id),
        user_fname: u.user_fname || "",
        user_lname: u.user_lname || "",
        full_name: formatUserName(u),
        user_department: u.user_department ?? null,
        user_position: u.user_position ?? null,
      })),
      helpers: helpersRaw.map((u) => ({
        user_id: Number(u.user_id),
        user_fname: u.user_fname || "",
        user_lname: u.user_lname || "",
        full_name: formatUserName(u),
        user_department: u.user_department ?? null,
        user_position: u.user_position ?? null,
      })),
      vehicles: vehicleList,
      coa: coaRaw.map((c) => ({
        coa_id: Number(c.coa_id),
        account_title: c.account_title || `COA #${c.coa_id}`,
        gl_code: c.gl_code || "",
      })),
      locked_vehicle: {
        id: primary3PL?.vehicle_id ?? 0,
        name: primary3PL?.name || LOCKED_VEHICLE_LABEL,
      },
    });
  } catch (error) {
    console.error("[Dispatch Plan API] GET /master-data error:", error);
    return NextResponse.json(
      {
        success: false,
        message: (error as Error).message || "Failed to load master data",
      },
      { status: 500 }
    );
  }
}
