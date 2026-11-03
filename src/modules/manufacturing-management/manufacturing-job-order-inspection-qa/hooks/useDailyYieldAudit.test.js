import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile("useDailyYieldAudit.ts", readFileSync(new URL("./useDailyYieldAudit.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);

// Execute the actual hook callbacks with controlled state and API boundaries.
function callback(name, context) {
    let body;
    function visit(node) {
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
            body = node.initializer.arguments[0].getText(source);
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(body, `Missing callback ${name}`);
    const script = ts.transpileModule(`(${body})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    return vm.runInContext(script, context);
}

function setup(uuidv4, accepted = true, rejected = true) {
    const errors = [];
    const requests = [];
    const acceptedFile = new File(["photo"], "good.jpg", { type: "image/jpeg" });
    const rejectedFile = new File(["photo"], "bad.jpg", { type: "image/jpeg" });
    const context = vm.createContext({
        Error, uuidv4, evidenceKeysByFile: { current: new WeakMap() },
        selectedYield: { ledgerId: 2, qaStatus: "Pending" }, selectedDetails: { jobOrderId: 1 },
        auditSubmitInFlight: { current: false },
        dailyLabStatus: "Passed", dailyActionTaken: "Released", dailyRemarks: "Keep remarks",
        dailyQAAuditStateError: () => null, isDailyQALabStatus: () => true,
        dailyAcceptedOutputQuantity: accepted ? "5" : "0", dailyRejectedOutputQuantity: rejected ? "1" : "0",
        parseQAOutputQuantity: Number, validateAllocationCapacity: () => null,
        acceptedOutputAllocations: [], rejectedOutputAllocations: [], buildOutputAllocations: () => [],
        yieldEvidenceRequirementsForLedger: () => ({ acceptedStock: accepted, rejectedStock: rejected }),
        isRejectedOutputRegistered: () => false,
        acceptedEvidenceError: null, rejectedEvidenceError: null,
        acceptedEvidenceFiles: accepted ? [acceptedFile] : [], rejectedEvidenceFiles: rejected ? [rejectedFile] : [],
        validateManufacturingEvidenceBatch: () => null, validateManufacturingEvidenceChannelBatch: () => null,
        routes: [], qaTemplates: [], qaParamValues: {}, moisturePct: "", acidityPh: "",
        sensoryStatus: "Passed", weightCheckPassed: true,
        setQuantityAllocationError: () => {}, setSaveError: value => { context.saveError = value; },
        setActionLoading: value => { context.actionLoading = value; }, setIsOpen: value => { context.isOpen = value; },
        toast: { error: message => errors.push(message), success: () => {} },
        DailyQARequestError: class extends Error {},
        postDailyQAInspection: async (payload, evidence) => { requests.push({ payload, evidence }); },
        onSaved: undefined
    });
    context.evidenceKeysFor = callback("evidenceKeysFor", context);
    return { context, errors, requests, submit: callback("submitAudit", context) };
}

test("QA evidence uses browser UUID fallback and preserves keys across failed submissions", async () => {
    const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    const cryptoApi = globalThis.crypto;
    try {
        Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues: cryptoApi.getRandomValues.bind(cryptoApi) } });
        const require = createRequire(import.meta.url);
        const browserUuidPath = resolve(dirname(require.resolve("uuid")), "../dist/v4.js");
        const { default: v4 } = await import(pathToFileURL(browserUuidPath).href);
        for (const [accepted, rejected] of [[true, false], [false, true], [true, true]]) {
            const { context, requests, submit } = setup(v4, accepted, rejected);
            context.postDailyQAInspection = async (payload, evidence) => {
                requests.push({ payload, evidence });
                if (requests.length === 1) throw new Error("Temporary failure");
            };
            await submit();
            assert.equal(context.saveError, "Temporary failure");
            assert.equal(context.actionLoading, false);
            await submit();
            assert.equal(requests.length, 2);
            const first = requests[0].evidence;
            const keys = [...first.acceptedKeys, ...first.rejectedKeys];
            assert.equal(keys.length, Number(accepted) + Number(rejected));
            assert.equal(new Set(keys).size, keys.length);
            keys.forEach(key => assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
            assert.equal(JSON.stringify(requests[1].evidence), JSON.stringify(first));
            assert.equal(requests[1].payload.acceptedQuantity, accepted ? 5 : 0);
            assert.equal(requests[1].payload.rejectedQuantity, rejected ? 1 : 0);
            assert.equal(context.auditSubmitInFlight.current, false);
            assert.equal(context.isOpen, false);

            if (rejected) {
                context.selectedYield.outcome = { isComplete: true };
                context.buildOutputAllocations = () => [{ quantity: 1 }];
                context.registerRejectedOutputAllocation = async (payload, evidence) => {
                    assert.equal(payload.rejectedQuantity, 1);
                    assert.equal(evidence.files[0], context.rejectedEvidenceFiles[0]);
                    assert.equal(evidence.keys[0], first.rejectedKeys[0]);
                };
                await callback("registerRejectedOutput", context)();
                assert.equal(context.actionLoading, false);
            }
        }
    } finally {
        Object.defineProperty(globalThis, "crypto", originalCrypto);
    }
});

test("QA attachment preparation errors are handled before any request", async () => {
    const { context, errors, requests, submit } = setup(() => { throw new Error("Crypto unavailable"); });
    await assert.doesNotReject(submit());
    assert.match(context.saveError, /Unable to prepare QA attachments.*HTTPS/);
    assert.equal(errors[0], context.saveError);
    assert.equal(requests.length, 0);
    assert.equal(context.auditSubmitInFlight.current, false);
    assert.equal(context.dailyRemarks, "Keep remarks");
    assert.equal(context.acceptedEvidenceFiles.length, 1);
    assert.equal(context.rejectedEvidenceFiles.length, 1);
});

test("resumable QA save recovery reuses the original evidence", async () => {
    let sequence = 0;
    const { context, requests, submit } = setup(() => `test-key-${++sequence}`);
    context.fetchJobOrderDailyYieldDetails = async () => ({ dailyYields: [context.selectedYield] });
    context.AbortSignal = AbortSignal;
    context.setSelectedDetails = () => {};
    context.setSelectedYield = () => {};
    context.postDailyQAInspection = async (payload, evidence) => {
        requests.push({ payload, evidence });
        if (requests.length === 1) {
            const error = new context.DailyQARequestError("Interrupted save");
            error.outcomeUnknown = true;
            error.canResume = true;
            throw error;
        }
    };
    await submit();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].evidence, requests[0].evidence);
    assert.equal(requests[1].payload, requests[0].payload);
    assert.equal(sequence, 2);
    assert.equal(context.auditSubmitInFlight.current, false);
    assert.equal(context.actionLoading, false);
    assert.equal(context.isOpen, false);
});
