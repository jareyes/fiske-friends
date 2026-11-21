const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const config = require("config");
const User = require("../lib/user");
const {DatabaseSync} = require("node:sqlite");
const {suite, test} = require("node:test");

function database() {
    const sqlite = new DatabaseSync(":memory:");
    const dirpath = path.join(__dirname, "..", "migrations");
    for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
        sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
    }
    return sqlite;
}

// How passwords were stored before: one shared salt, 1,000 rounds
function legacy_hash(password) {
    return crypto.pbkdf2Sync(password, config.get("app.password_salt"), 1000, 64, "sha512").toString("hex");
}

function add_user(sqlite, password_hash) {
    return User.create(sqlite, {first_name: "Pat", last_name: "Lee", email: "Pat@Example.org", password_hash});
}

suite("lib/user.js passwords", () => {
    test("each hash has its own salt, so the same password never looks the same twice", async () => {
        const a = await User.hash_password("bookworm1");
        const b = await User.hash_password("bookworm1");
        assert.match(a, /^pbkdf2_sha512\$210000\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
        assert.notStrictEqual(a, b);
        assert.deepStrictEqual(await User.check_password("bookworm1", a), {ok: true, upgrade: false});
        assert.deepStrictEqual(await User.check_password("bookworm2", a), {ok: false, upgrade: false});
    });

    test("an old-style password still signs in, and is upgraded on the spot", async () => {
        const sqlite = database();
        const user = add_user(sqlite, legacy_hash("bookworm1"));
        await assert.rejects(User.authenticate(sqlite, "pat@example.org", "wrong"), User.AuthenticationError);
        assert.strictEqual(User.get_by_id(sqlite, user.user_id).password_hash, legacy_hash("bookworm1"), "unchanged after a wrong guess");
        await User.authenticate(sqlite, " PAT@example.org ", "bookworm1");
        const stored = User.get_by_id(sqlite, user.user_id).password_hash;
        assert.match(stored, /^pbkdf2_sha512\$/);
        await User.authenticate(sqlite, "pat@example.org", "bookworm1");
        await assert.rejects(User.authenticate(sqlite, "nobody@example.org", "bookworm1"), User.AuthenticationError);
    });

    test("a reset link works until the password changes, then never again", async () => {
        const sqlite = database();
        const user = add_user(sqlite, await User.hash_password("bookworm1"));
        const token = User.reset_token(user);
        assert.strictEqual(User.user_from_reset_token(sqlite, token).user_id, user.user_id);
        User.set_password_hash(sqlite, user.user_id, await User.hash_password("newbookworm"));
        assert.strictEqual(User.user_from_reset_token(sqlite, token), null);
        assert.strictEqual(User.user_from_reset_token(sqlite, User.reset_token(user, -1000)), null, "expired");
        assert.strictEqual(User.user_from_reset_token(sqlite, "not-a-token"), null);
    });
});
