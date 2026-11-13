// Run with Node 24: node --env-file=.env.local <this-file> --operation schema|recover --url <Directus> --receipt <directory> [--ledger 219 --job-order 434] [--apply]
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrecisionRepairSnapshot, PrecisionRow } from "./_session-quantity-precision";

const precision: typeof import("./_session-quantity-precision") = await import(new URL("./_session-quantity-precision.ts", import.meta.url).href);
const { SESSION_QUANTITY_FIELDS, buildPrecisionRepairs, precisionSchema, quantityPrecisionSql, quantityText, quantityUnits } = precision;
const args = process.argv.slice(2);
function argument(name: string) { const index = args.indexOf(name); return index < 0 ? "" : args[index + 1] || ""; }
const target = argument("--url").replace(/\/$/, "");
const operation = argument("--operation");
const receiptDirectory = argument("--receipt");
const apply = args.includes("--apply");
const token = process.env.DIRECTUS_STATIC_TOKEN;
if (!target || !["http:", "https:"].includes(new URL(target).protocol) || !token || !receiptDirectory
    || !["schema", "recover"].includes(operation)) throw new Error("Specify --operation schema|recover, --url, --receipt and DIRECTUS_STATIC_TOKEN. Dry run is the default.");

async function request<T>(pathname: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(`${target}${pathname}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(60000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${method} ${pathname}: HTTP ${response.status}: ${JSON.stringify(result.errors || []).slice(0, 500)}`);
    return result.data as T;
}
function rows(collection: string, filter: Record<string, string> = {}) {
    const primaryKey: Record<string, string> = {
        manufacturing_job_order_materials: "jo_material_id",
        manufacturing_job_order_materials_reservations: "jo_materials_reservation_id",
        manufacturing_job_order_yield_ledger_bom_consumage: "consumage_id",
        jo_material_genealogy: "genealogy_id"
    };
    const query = new URLSearchParams({ ...filter, fields: "*", limit: "-1", sort: primaryKey[collection] });
    return request<PrecisionRow[]>(`/items/${collection}?${query}`);
}
function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, JSON.parse(stable(v))])));
    return JSON.stringify(value) ?? "null";
}
function hash(value: unknown) { return createHash("sha256").update(stable(value)).digest("hex"); }
await mkdir(receiptDirectory, { recursive: true });
const receipt: PrecisionRow = { target, operation, apply, startedAt: new Date().toISOString(), state: "PREFLIGHT", applied: [] };
await writeFile(path.join(receiptDirectory, "receipt.json"), JSON.stringify(receipt, null, 2), { flag: "wx" });
async function save(name: string, data: unknown) {
    await writeFile(path.join(receiptDirectory, name), JSON.stringify(data, null, 2));
}
async function saveReceipt() { await save("receipt.json", receipt); }

async function fieldMetadata() {
    return Promise.all(SESSION_QUANTITY_FIELDS.map(async ([collection, field, minimum]) => {
        const current = await request<PrecisionRow>(`/fields/${collection}/${field}`);
        if (current.type !== "decimal") throw new Error(`${collection}.${field} must be an existing decimal field.`);
        const schema = current.schema as PrecisionRow;
        return { collection, field, current, desired: precisionSchema(schema, minimum) };
    }));
}
async function migrateSchema() {
    const fields = await fieldMetadata();
    const collections = [...new Set(SESSION_QUANTITY_FIELDS.map(([collection]) => collection))];
    const before = Object.fromEntries(await Promise.all(collections.map(async collection => [collection, await rows(collection)] as const)));
    await save("schema-before.json", fields);
    await save("rows-before.json", before);
    const changes = fields.filter(({ current, desired }) => {
        const schema = current.schema as PrecisionRow;
        return schema.numeric_precision !== desired.numeric_precision || schema.numeric_scale !== desired.numeric_scale;
    });
    receipt.changes = changes.map(({ collection, field, current, desired }) => ({ collection, field, before: current.schema, after: desired }));
    const sql = changes.map(({ collection, field, current }) => quantityPrecisionSql(collection, field, current.schema as PrecisionRow, SESSION_QUANTITY_FIELDS.find(([table, column]) => table === collection && column === field)![2]));
    await writeFile(path.join(receiptDirectory, "schema-plan.sql"), sql.join("\n") + "\n");
    await saveReceipt();
    if (apply && changes.some(({ current }) => (current.schema as PrecisionRow).comment)) {
        throw new Error("Directus does not preserve SQL column comments. Apply schema-plan.sql through the database connection, then rerun this command to verify the schema.");
    }
    for (const { collection, field, current, desired } of changes) {
        if (!apply) continue;
        await request(`/fields/${collection}/${field}`, "PATCH", { schema: { ...(current.schema as PrecisionRow), ...desired } });
        (receipt.applied as unknown[]).push({ collection, field, ...desired });
        await saveReceipt();
    }
    if (apply) {
        const after = Object.fromEntries(await Promise.all(collections.map(async collection => [collection, await rows(collection)] as const)));
        function normalized(data: Record<string, PrecisionRow[]>) {
            return Object.fromEntries(Object.entries(data).map(([collection, records]) => [collection, records.map(row => {
                const copy = { ...row };
                for (const [table, field] of SESSION_QUANTITY_FIELDS) if (table === collection && copy[field] != null) copy[field] = quantityText(copy[field]);
                return copy;
            })]));
        }
        if (hash(normalized(before)) !== hash(normalized(after))) throw new Error("Business rows changed during schema migration. Review the backup before continuing.");
        const verified = await fieldMetadata();
        await save("schema-after.json", verified);
        for (const { current, desired, collection, field } of verified) {
            const schema = current.schema as PrecisionRow;
            if (schema.numeric_scale !== desired.numeric_scale || schema.numeric_precision !== desired.numeric_precision) throw new Error(`Precision migration did not persist: ${collection}.${field}.`);
            const original = fields.find(entry => entry.collection === collection && entry.field === field)?.current.schema as PrecisionRow;
            for (const property of ["is_nullable", "default_value", "is_unique", "is_indexed", "comment"]) {
                const normalize = (value: unknown) => property === "default_value" && value != null ? quantityText(value) : value;
                if (stable(normalize(original[property])) !== stable(normalize(schema[property]))) throw new Error(`Schema attribute changed: ${collection}.${field}.${property}.`);
            }
        }
        receipt.businessRowsPreserved = true;
    }
    receipt.counts = Object.fromEntries(Object.entries(before).map(([collection, records]) => [collection, records.length]));
}

async function recoverySnapshot(ledgerId: number, jobOrderId: number): Promise<PrecisionRepairSnapshot> {
    const ledger = await request<PrecisionRow>(`/items/manufacturing_job_order_yield_ledger/${ledgerId}`);
    const [consumptions, materials, genealogy] = await Promise.all([
        rows("manufacturing_job_order_yield_ledger_bom_consumage", { "filter[ledger_id][_eq]": String(ledgerId) }),
        rows("manufacturing_job_order_materials", { "filter[job_order_id][_eq]": String(jobOrderId) }),
        rows("jo_material_genealogy", { "filter[job_order_id][_eq]": String(jobOrderId), "filter[session_key][_eq]": String(ledger.session_key) })
    ]);
    const reservations = await rows("manufacturing_job_order_materials_reservations", { "filter[jo_material_id][_in]": materials.map(row => row.jo_material_id).join(",") });
    const groups: [string, PrecisionRow[], string][] = [
        ["manufacturing_job_order_yield_ledger_bom_consumage", consumptions, "consumage_id"],
        ["manufacturing_job_order_materials", materials, "jo_material_id"],
        ["manufacturing_job_order_materials_reservations", reservations, "jo_materials_reservation_id"],
        ["jo_material_genealogy", genealogy, "genealogy_id"]
    ];
    const revisions = (await Promise.all(groups.map(async ([collection, records, key]) => {
        if (!records.length) return [];
        const query = new URLSearchParams({ "filter[collection][_eq]": collection, "filter[item][_in]": records.map(row => row[key]).join(","), fields: "id,collection,item,activity,data,delta", limit: "-1", sort: "-id" });
        return request<PrecisionRow[]>(`/revisions?${query}`);
    }))).flat();
    return { ledger, consumptions, materials, reservations, genealogy, revisions };
}
function ledgerIdentity(ledger: PrecisionRow) {
    return Object.fromEntries(["ledger_id", "job_order_id", "session_key", "commit_status", "request_hash", "session_payload", "job_order_updated"].map(field => [field, ledger[field]]));
}
async function recover() {
    const ledgerId = Number(argument("--ledger"));
    const jobOrderId = Number(argument("--job-order"));
    if (![ledgerId, jobOrderId].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error("Recovery requires explicit --ledger and --job-order identifiers.");
    const fields = await fieldMetadata();
    if (apply && fields.some(({ current, desired }) => Number((current.schema as PrecisionRow).numeric_scale) < desired.numeric_scale)) throw new Error("Apply and verify the precision schema before repairing business rows.");
    const before = await recoverySnapshot(ledgerId, jobOrderId);
    await save("recovery-before.json", before);
    const plan = buildPrecisionRepairs(before, ledgerId, jobOrderId);
    await save("repair-plan.json", plan);
    receipt.ledgerId = ledgerId;
    receipt.jobOrderId = jobOrderId;
    receipt.changes = plan.map(({ collection, id, patch }) => ({ collection, id, patch }));
    await saveReceipt();
    if (!apply) return;
    const fresh = await recoverySnapshot(ledgerId, jobOrderId);
    if (hash(before) !== hash(fresh)) throw new Error("The shift changed during preflight. Close its shift window and run a new dry run.");
    for (const repair of plan) {
        const ledger = await request<PrecisionRow>(`/items/manufacturing_job_order_yield_ledger/${ledgerId}`);
        if (hash(ledgerIdentity(ledger)) !== hash(ledgerIdentity(before.ledger))) throw new Error("The pending shift changed. Recovery stopped.");
        const endpoint = `/items/${repair.collection}/${repair.id}`;
        const current = await request<PrecisionRow>(endpoint);
        if (hash(current) !== hash(repair.before)) throw new Error(`${repair.collection}/${repair.id} changed. Recovery stopped.`);
        await request(endpoint, "PATCH", repair.patch);
        const saved = await request<PrecisionRow>(endpoint);
        if (Object.entries(repair.patch).some(([field, expected]) => quantityUnits(saved[field]) !== quantityUnits(expected))) throw new Error(`The precision repair did not persist for ${repair.collection}/${repair.id}.`);
        (receipt.applied as unknown[]).push({ collection: repair.collection, id: repair.id, patch: repair.patch });
        await saveReceipt();
    }
    const after = await recoverySnapshot(ledgerId, jobOrderId);
    if (buildPrecisionRepairs(after, ledgerId, jobOrderId).length) throw new Error("Some precision repairs remain unapplied.");
    await save("recovery-after.json", after);
    receipt.readyToResume = true;
}
try {
    if (operation === "schema") await migrateSchema();
    else await recover();
    receipt.state = apply ? "APPLIED" : "DRY_RUN";
    receipt.finishedAt = new Date().toISOString();
    await saveReceipt();
    console.log(JSON.stringify({ ...receipt, receiptDirectory }));
} catch (error) {
    receipt.state = "STOPPED";
    receipt.error = error instanceof Error ? error.message : String(error);
    await saveReceipt();
    console.error(JSON.stringify({ state: receipt.state, error: receipt.error, receiptDirectory }));
    process.exitCode = 1;
}
