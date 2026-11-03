import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./qa-api.ts", import.meta.url), "utf8");
const payload = {
    sourceReceivingId: 1, lotId: 2, batchNo: "BATCH-1", dispositionType: "VENDOR_RETURN",
    requestedQuantity: 3, reason: "Damaged stock", supplierReference: "REF-1"
};

function loadApi(v4, requests) {
    const apiModule = { exports: {} };
    const context = vm.createContext({
        Error, exports: apiModule.exports, module: apiModule,
        require: name => {
            if (name === "uuid") return { v4 };
            assert.equal(name, "@/app/api/manufacturing/qa-receiving/_receiving-errors");
            return { isReceivingErrorCode: () => false };
        },
        fetch: async (url, options) => {
            requests.push({ url, ...options });
            return new Response(JSON.stringify({ data: { id: 7 } }));
        }
    });
    vm.runInContext(ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText, context);
    return { api: apiModule.exports, context };
}

test("quarantine requests support the browser UUID fallback and matching return keys", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    const cryptoApi = globalThis.crypto;
    try {
        Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues: cryptoApi.getRandomValues.bind(cryptoApi) } });
        const require = createRequire(import.meta.url);
        const { default: v4 } = await import(pathToFileURL(resolve(dirname(require.resolve("uuid")), "../dist/v4.js")).href);
        const requests = [];
        const { api, context } = loadApi(v4, requests);
        assert.equal((await api.createQuarantineDisposition(payload)).id, 7);
        assert.equal((await api.processQuarantineReturn(7, 2)).id, 7);
        const created = JSON.parse(requests[0].body);
        const returned = JSON.parse(requests[1].body);
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
        assert.match(created.idempotencyKey, uuidPattern);
        assert.match(returned.operationKey, uuidPattern);
        assert.equal(requests[1].headers["Idempotency-Key"], returned.operationKey);
        assert.deepEqual(created, { ...payload, idempotencyKey: created.idempotencyKey });
        assert.deepEqual(returned, { action: "PROCESS_RETURN", quantity: 2, operationKey: returned.operationKey });
        assert.equal(requests[0].url, "/api/manufacturing/shop-floor-and-quality/qa-receiving-inspections/quarantine");
        assert.equal(requests[1].url, `${requests[0].url}/7`);
        await api.processQuarantineReturn(7, 1);
        assert.notEqual(JSON.parse(requests[2].body).operationKey, returned.operationKey);
        context.fetch = async () => new Response(JSON.stringify({ error: "Insufficient quarantine stock" }), { status: 409 });
        await assert.rejects(api.createQuarantineDisposition(payload), /Insufficient quarantine stock/);
        await assert.rejects(api.processQuarantineReturn(7, 2), /Insufficient quarantine stock/);
    } finally {
        Object.defineProperty(globalThis, "crypto", descriptor);
    }
});

test("unsupported crypto produces actionable errors without sending requests", async () => {
    const requests = [];
    const { api } = loadApi(() => { throw new Error("Crypto unavailable"); }, requests);
    await assert.rejects(api.createQuarantineDisposition(payload), /Unable to prepare this quarantine action.*HTTPS/);
    await assert.rejects(api.processQuarantineReturn(7, 2), /Unable to prepare this quarantine action.*HTTPS/);
    assert.equal(requests.length, 0);
});

test("quarantine UI handles preparation failures and successful actions refresh data", async () => {
    function callback(file, name, context) {
        const parsed = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
        let body;
        function visit(node) {
            if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === name) {
                body = ts.isCallExpression(node.initializer) ? node.initializer.arguments[0].getText(parsed) : node.initializer.getText(parsed);
            }
            ts.forEachChild(node, visit);
        }
        visit(parsed);
        assert.ok(body, `Missing callback ${name}`);
        return vm.runInContext(ts.transpileModule(`(${body})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    }
    const requests = [];
    const { api } = loadApi(() => { throw new Error("Crypto unavailable"); }, requests);
    const errors = [];
    let refreshes = 0;
    const context = vm.createContext({
        createQuarantineDisposition: api.createQuarantineDisposition,
        processQuarantineReturn: api.processQuarantineReturn,
        loadQuarantine: async () => { refreshes++; },
        stockKey: () => "source", typeBySource: {}, quantityBySource: { source: "3" },
        reasonBySource: { source: "Damaged stock" }, supplierReferenceBySource: {},
        returnQuantityByDisposition: { 7: "2" },
        setBusyKey: value => { context.busyKey = value; },
        toast: { error: message => errors.push(message), success: () => {} }
    });
    context.onCreate = callback("../hooks/useQAReceiving.ts", "handleCreateQuarantineDisposition", context);
    context.onProcessReturn = callback("../hooks/useQAReceiving.ts", "handleProcessQuarantineReturn", context);
    const create = callback("../components/QuarantineDispositions.tsx", "create", context);
    const process = callback("../components/QuarantineDispositions.tsx", "processReturn", context);
    await assert.doesNotReject(create({ ...payload, availableQuantity: 5 }));
    await assert.doesNotReject(process({ id: 7, remainingQuantity: 3 }));
    assert.equal(context.busyKey, null);
    assert.equal(errors.length, 2);
    errors.forEach(message => assert.match(message, /Unable to prepare this quarantine action.*HTTPS/));
    assert.equal(requests.length, 0);
    assert.equal(refreshes, 0);
    assert.equal(context.quantityBySource.source, "3");
    assert.equal(context.reasonBySource.source, "Damaged stock");
    assert.equal(context.returnQuantityByDisposition[7], "2");

    context.createQuarantineDisposition = async () => ({ id: 7 });
    context.processQuarantineReturn = async () => ({ id: 7 });
    await create({ ...payload, availableQuantity: 5 });
    await process({ id: 7, remainingQuantity: 3 });
    assert.equal(refreshes, 2);
    assert.equal(context.busyKey, null);
});
