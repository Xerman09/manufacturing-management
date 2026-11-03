import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";

test("shift attachments save without randomUUID and retain their keys on retry", async () => {
    const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    const cryptoApi = globalThis.crypto;
    const require = createRequire(import.meta.url);
    const browserUuidPath = resolve(dirname(require.resolve("uuid")), "../dist/v4.js");
    const requests = [];
    try {
        // Load the installed browser implementation as it loads on an HTTP LAN origin.
        Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
        const { default: v4 } = await import(pathToFileURL(browserUuidPath).href);
        const source = readFileSync(new URL("./production-api.ts", import.meta.url), "utf8");
        const compiled = ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
        }).outputText;
        const apiModule = { exports: {} };
        vm.runInNewContext(compiled, {
            exports: apiModule.exports,
            module: apiModule,
            require: (name) => {
                assert.equal(name, "uuid");
                return { v4 };
            },
            FormData,
            fetch: async (url, options) => {
                requests.push({ url, ...options });
                return requests.length === 1
                    ? new Response(JSON.stringify({ error: "Temporary failure" }), { status: 503 })
                    : new Response(JSON.stringify({ success: true }));
            }
        });
        const first = new File(["photo"], "first.jpg", { type: "image/jpeg" });
        const second = new File(["photo"], "second.jpg", { type: "image/jpeg" });
        const payload = {
            sessionScope: "JOB_ORDER", sessionKey: "existing-session", joId: 42,
            yieldQty: 5, rejectedQty: 0, scrapQty: 0,
            materialsConsumed: [], evidenceImages: [first, second]
        };
        const submit = apiModule.exports.submitShiftRunLog;
        await assert.rejects(submit(payload), /Unable to prepare shift attachments.*HTTPS/);
        assert.equal(requests.length, 0);

        Object.defineProperty(globalThis, "crypto", {
            configurable: true,
            value: { getRandomValues: cryptoApi.getRandomValues.bind(cryptoApi) }
        });
        await assert.rejects(submit(payload), /Temporary failure/);
        assert.equal((await submit(payload)).success, true);
        const keys = JSON.parse(requests[0].body.get("inspectorEvidenceKeys"));
        assert.equal(new Set(keys).size, 2);
        keys.forEach(key => assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
        assert.equal(requests[1].body.get("inspectorEvidenceKeys"), JSON.stringify(keys));
        assert.equal(requests[0].url, "/api/manufacturing/production/shift-run-log");
        assert.equal(requests[0].body.getAll("inspectorEvidence").length, 2);
        const expectedSession = { ...payload };
        delete expectedSession.evidenceImages;
        assert.deepEqual(JSON.parse(requests[0].body.get("payload")), expectedSession);

        Object.defineProperty(globalThis, "crypto", originalCrypto);
        await submit({ ...payload, completeProductionAfterLog: true, evidenceImages: [first] });
        assert.deepEqual(JSON.parse(requests[2].body.get("inspectorEvidenceKeys")), [keys[0]]);
        assert.equal(JSON.parse(requests[2].body.get("payload")).completeProductionAfterLog, true);
    } finally {
        Object.defineProperty(globalThis, "crypto", originalCrypto);
    }
});
