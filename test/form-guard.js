const assert = require("node:assert");
const FormGuard = require("../lib/form-guard");
const Throttle = require("../lib/throttle");
const {suite, test} = require("node:test");

const MINUTE_MS = 60 * 1000;

suite("lib/form-guard.js", () => {
    const shown = Date.UTC(2026, 11, 1, 15);

    test("a person who took a few seconds gets through", () => {
        assert.strictEqual(FormGuard.check({form_stamp: FormGuard.stamp(shown), website: ""}, shown + 8000), "ok");
    });

    test("a form sent back in under 2 seconds is too fast", () => {
        assert.strictEqual(FormGuard.check({form_stamp: FormGuard.stamp(shown)}, shown + 900), "too_fast");
    });

    test("a missing, made-up or day-old stamp counts as too fast", () => {
        assert.strictEqual(FormGuard.check({}, shown), "too_fast");
        const fake = Buffer.from(`form:${shown - 60000}|${shown + 999999}|0000`).toString("base64url");
        assert.strictEqual(FormGuard.check({form_stamp: fake}, shown), "too_fast");
        assert.strictEqual(FormGuard.check({form_stamp: FormGuard.stamp(shown)}, shown + 25 * 60 * MINUTE_MS), "too_fast");
    });

    test("anything in the honeypot is a bot, however long it took", () => {
        assert.strictEqual(FormGuard.check({form_stamp: FormGuard.stamp(shown), website: "http://spam.example"}, shown + 8000), "honeypot");
    });
});

suite("lib/throttle.js", () => {
    test("one try every few minutes", () => {
        const throttle = new Throttle({min_gap_ms: 2 * MINUTE_MS});
        const t = Date.UTC(2026, 11, 1);
        assert.strictEqual(throttle.attempt("a@b.co", t), true);
        assert.strictEqual(throttle.attempt("a@b.co", t + MINUTE_MS), false);
        assert.strictEqual(throttle.attempt("other@b.co", t + MINUTE_MS), true, "each address has its own limit");
        assert.strictEqual(throttle.attempt("a@b.co", t + 3 * MINUTE_MS), true);
    });

    test("a few a day, then it resets after 24 hours", () => {
        const throttle = new Throttle({min_gap_ms: 2 * MINUTE_MS, per_day: 3});
        const t = Date.UTC(2026, 11, 1);
        assert.deepStrictEqual([0, 10, 20, 30].map(m => throttle.attempt("a@b.co", t + m * MINUTE_MS)), [true, true, true, false]);
        assert.strictEqual(throttle.attempt("a@b.co", t + 24 * 60 * MINUTE_MS + 1), true);
    });

    test("no limits when they're turned off", () => {
        const throttle = new Throttle({min_gap_ms: 0, per_day: 0});
        assert.ok([1, 2, 3, 4, 5, 6].every(() => throttle.attempt("a@b.co", 1000)));
    });
});
