const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const SqliteStore = require("../lib/session-store");
const {DatabaseSync} = require("node:sqlite");
const {promisify} = require("node:util");
const {suite, test} = require("node:test");

const DAY_MS = 24 * 60 * 60 * 1000;

function database() {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(fs.readFileSync(path.join(__dirname, "..", "migrations", "012-create-sessions-table.sql"), "utf8"));
    return sqlite;
}

function store_at(sqlite, clock) {
    const store = new SqliteStore(sqlite, {now: () => clock.ms, purge_every_ms: 0});
    return {
        store,
        get: promisify(store.get.bind(store)),
        set: promisify(store.set.bind(store)),
        touch: promisify(store.touch.bind(store)),
        destroy: promisify(store.destroy.bind(store)),
        length: promisify(store.length.bind(store)),
    };
}

const signed_in = (expires_ms) => ({cookie: {expires: new Date(expires_ms).toISOString()}, readathon: {household_id: 7}});

suite("lib/session-store.js", () => {
    test("a sign-in survives a restart", async () => {
        const sqlite = database();
        const clock = {ms: Date.UTC(2027, 0, 5)};
        await store_at(sqlite, clock).set("abc", signed_in(clock.ms + 60 * DAY_MS));
        // A new store on the same database, as after a restart
        const after_restart = store_at(sqlite, clock);
        assert.deepStrictEqual((await after_restart.get("abc")).readathon, {household_id: 7});
        assert.strictEqual(await after_restart.get("nope"), null);
    });

    test("expired sessions are gone, and cleanup removes them", async () => {
        const sqlite = database();
        const clock = {ms: Date.UTC(2027, 0, 5)};
        const s = store_at(sqlite, clock);
        await s.set("old", signed_in(clock.ms + DAY_MS));
        await s.set("new", signed_in(clock.ms + 60 * DAY_MS));
        clock.ms += 2 * DAY_MS;
        assert.strictEqual(await s.get("old"), null);
        await s.set("old2", signed_in(clock.ms - 1));
        assert.strictEqual(s.store.purge(), 1);
        assert.strictEqual(await s.length(), 1);
    });

    test("a session with no expiry of its own lasts a day", async () => {
        const sqlite = database();
        const clock = {ms: Date.UTC(2027, 0, 5)};
        const s = store_at(sqlite, clock);
        await s.set("flash", {cookie: {}, readathon_bingo_message: {text: "Checked in!"}});
        clock.ms += DAY_MS - 1000;
        assert.ok(await s.get("flash"));
        clock.ms += 2000;
        assert.strictEqual(await s.get("flash"), null);
    });

    test("touch only pushes the expiry back when it moved by more than a day", async () => {
        const sqlite = database();
        const clock = {ms: Date.UTC(2027, 0, 5)};
        const s = store_at(sqlite, clock);
        await s.set("abc", signed_in(clock.ms + 60 * DAY_MS));
        const expiry = () => sqlite.prepare("SELECT expires_ms FROM sessions WHERE session_id = 'abc'").get().expires_ms;
        const first = expiry();
        await s.touch("abc", signed_in(clock.ms + 60 * DAY_MS + 60 * 60 * 1000));
        assert.strictEqual(expiry(), first, "an hour later: no write");
        await s.touch("abc", signed_in(clock.ms + 62 * DAY_MS));
        assert.strictEqual(expiry(), clock.ms + 62 * DAY_MS, "two days later: pushed back");
    });

    test("signing out removes the session", async () => {
        const sqlite = database();
        const clock = {ms: Date.UTC(2027, 0, 5)};
        const s = store_at(sqlite, clock);
        await s.set("abc", signed_in(clock.ms + DAY_MS));
        await s.destroy("abc");
        assert.strictEqual(await s.get("abc"), null);
    });
});
