import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile("OffsettingWorkspace.tsx", readFileSync(new URL("./OffsettingWorkspace.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);

function loadFunction(name, context) {
    let body;
    function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) body = node.getText(source);
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) body = node.initializer.arguments[0].getText(source);
        ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(body, `Missing function ${name}`);
    return vm.runInContext(ts.transpileModule(`(${body})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
}

function setup(uuidv4) {
    const errors = [];
    const changes = [];
    const shortageItems = [1, 2].map(id => ({
        detailId: id, product_id: 11, lot_id: 100 + id,
        shortagePieces: 12, uomCount: 12, unitCost: 120, resolvedName: "Product"
    }));
    const surplusItems = [{ detailId: 3, product_id: 11, lot_id: 103, surplusPieces: 24, uomCount: 24, unitCost: 480, resolvedName: "Product" }];
    const existing = { id: "saved-pair" };
    const context = vm.createContext({
        uuidv4, canEdit: true, saving: false,
        shortageItems, surplusItems, activePairings: [existing],
        linkQty: "24", linkReason: "UOM Miscount", linkNotes: "Keep audit note",
        groupingViewMode: "DETAIL", selectedShortageDetailIds: [1, 2], selectedSurplusDetailIds: [3],
        selectedShortageTotalPieces: 24, selectedSurplusTotalPieces: 24,
        selectedShortageProductIds: [], selectedSurplusProductIds: [],
        REASON_CODES: ["UOM Miscount"], normalizeProductName: name => name.trim(),
        toast: { error: message => errors.push(message), success: () => {}, info: () => {} },
        setActivePairings: update => { context.activePairings = update(context.activePairings); changes.push("pairings"); }
    });
    for (const name of ["SelectedShortageProductIds", "SelectedSurplusProductIds", "SelectedShortageDetailIds", "SelectedSurplusDetailIds", "LinkQty", "LinkReason", "LinkNotes"]) {
        context[`set${name}`] = () => changes.push(name);
    }
    context.createOffsettingId = loadFunction("createOffsettingId", context);
    return { context, errors, changes, run: name => loadFunction(name, context)() };
}

test("manual and automatic offsetting work without randomUUID and preserve calculations", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    const cryptoApi = globalThis.crypto;
    try {
        Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues: cryptoApi.getRandomValues.bind(cryptoApi) } });
        const require = createRequire(import.meta.url);
        const browserUuidPath = resolve(dirname(require.resolve("uuid")), "../dist/v4.js");
        const { default: v4 } = await import(pathToFileURL(browserUuidPath).href);
        for (const [handler, prefix, groupPrefix] of [
            ["handleAddPairing", "OFF-", "OFF-GRP-"],
            ["handleAutoMatchSameProduct", "OFF-AUTO-", "OFF-GRP-AUTO-"]
        ]) {
            const { context, errors, run } = setup(v4);
            run(handler);
            assert.equal(errors.length, 0);
            assert.equal(context.activePairings[0].id, "saved-pair");
            const pairs = context.activePairings.slice(1);
            assert.equal(pairs.length, 2);
            assert.notEqual(pairs[0].id, pairs[1].id);
            assert.equal(pairs[0].group_link_id, pairs[1].group_link_id);
            assert.ok(pairs[0].group_link_id.startsWith(groupPrefix));
            for (const pair of pairs) {
                assert.ok(pair.id.startsWith(prefix));
                assert.match(pair.id.slice(prefix.length), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
                assert.equal(pair.offset_pieces, 12);
                assert.equal(pair.shortage_containers_deducted, 1);
                assert.equal(pair.surplus_containers_deducted, 0.5);
                assert.equal(pair.unit_cost_variance, 10);
                assert.equal(pair.net_financial_impact, 120);
            }
            assert.equal(context.shortageItems[0].shortagePieces, 12);
            assert.equal(context.surplusItems[0].surplusPieces, 24);
        }
    } finally {
        Object.defineProperty(globalThis, "crypto", descriptor);
    }
});

test("UUID failures never commit partial pairings or clear user input", () => {
    for (const handler of ["handleAddPairing", "handleAutoMatchSameProduct"]) {
        for (const failAt of [1, 3]) {
            let sequence = 0;
            const { context, errors, changes, run } = setup(() => {
                if (++sequence === failAt) throw new Error("Crypto unavailable");
                return `test-${sequence}`;
            });
            assert.doesNotThrow(() => run(handler));
            assert.equal(context.activePairings.length, 1);
            assert.equal(changes.length, 0);
            assert.equal(context.linkQty, "24");
            assert.equal(context.linkReason, "UOM Miscount");
            assert.equal(context.linkNotes, "Keep audit note");
            assert.equal(errors.length, 1);
            assert.match(errors[0], /Unable to prepare offset pairings.*HTTPS/);
        }
    }
});
