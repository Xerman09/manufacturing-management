import test from "node:test";
import assert from "node:assert/strict";
import { formatInZone, isValidTimeZone, nowUtcSql, parseUtc } from "./datetime";

test("nowUtcSql formats Date in UTC as YYYY-MM-DD HH:mm:ss", () => {
    const d = new Date("2026-11-25T08:44:47+08:00");
    assert.equal(nowUtcSql(d), "2026-11-25 00:44:47");
    assert.equal(nowUtcSql(new Date("invalid")), "");
});

test("parseUtc treats naive SQL/ISO datetime as UTC and preserves explicit offsets", () => {
    const expectedMs = Date.UTC(2026, 10, 25, 0, 44, 47);

    assert.equal(parseUtc("2026-11-25 00:44:47")?.getTime(), expectedMs);
    assert.equal(parseUtc("2026-11-25T00:44:47")?.getTime(), expectedMs);
    assert.equal(parseUtc("2026-11-25T00:44:47.000Z")?.getTime(), expectedMs);
    assert.equal(parseUtc("2026-11-25T08:44:47+08:00")?.getTime(), expectedMs);
    assert.equal(parseUtc("2026-11-25 08:44:47+0800")?.getTime(), expectedMs);

    assert.equal(parseUtc(null), null);
    assert.equal(parseUtc(""), null);
    assert.equal(parseUtc("2026-02-31 10:00:00"), null);
    assert.equal(parseUtc("not-a-date"), null);
});

test("formatInZone converts UTC timestamps to configured timezone as YYYY-MM-DD HH:mm:ss", () => {
    assert.equal(formatInZone("2026-11-25 00:44:47", "Asia/Manila"), "2026-11-25 08:44:47");
    assert.equal(formatInZone("2026-11-25T00:44:47.000Z", "Asia/Manila"), "2026-11-25 08:44:47");
    assert.equal(formatInZone("2026-11-25T08:44:47+08:00", "Asia/Manila"), "2026-11-25 08:44:47");
    assert.equal(formatInZone("2026-11-25 16:00:00", "Asia/Manila"), "2026-11-26 00:00:00");
    assert.equal(formatInZone("2026-11-25 00:44:47", "Asia/Tokyo"), "2026-11-25 09:44:47");
    assert.equal(formatInZone("2026-11-25 00:44:47", "UTC"), "2026-11-25 00:44:47");
});

test("formatInZone strictly returns '-' without silent fallback on missing/invalid inputs", () => {
    assert.equal(formatInZone("2026-11-25 00:44:47", null), "-");
    assert.equal(formatInZone("2026-11-25 00:44:47", ""), "-");
    assert.equal(formatInZone("2026-11-25 00:44:47", "Invalid/Zone"), "-");
    assert.equal(formatInZone(null, "Asia/Manila"), "-");
    assert.equal(formatInZone("", "Asia/Manila"), "-");
    assert.equal(formatInZone("invalid", "Asia/Manila"), "-");
    assert.equal(isValidTimeZone("Asia/Manila"), true);
    assert.equal(isValidTimeZone("Invalid/Zone"), false);
});
