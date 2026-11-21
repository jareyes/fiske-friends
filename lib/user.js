const AuthenticationError = require("./authentication_error");
const crypto = require("node:crypto");
const config = require("config");
const util = require("node:util");

const crypto_pbkdf2 = util.promisify(crypto.pbkdf2);

// Passwords are stored as "pbkdf2_sha512$<rounds>$<salt>$<hash>": a random salt for each person, so the
// same password never looks the same twice, and enough rounds that guessing is slow.
const HASH_SCHEME = "pbkdf2_sha512";
const HASH_ROUNDS = 210000;
const HASH_KEY_LENGTH = 64;
const SALT_BYTES = 16;

// The old way: one shared salt and 1,000 rounds. Still accepted, and upgraded the next time that
// person signs in. Once everyone has signed in (or reset), this can go.
const LEGACY_SALT = config.get("app.password_salt");
const LEGACY_ROUNDS = 1000;

async function derive(password, salt, rounds) {
    const key = await crypto_pbkdf2(String(password ?? ""), salt, rounds, HASH_KEY_LENGTH, "sha512");
    return key.toString("hex");
}

function same(a, b) {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function hash_password(password, rounds = HASH_ROUNDS) {
    const salt = crypto.randomBytes(SALT_BYTES).toString("hex");
    return `${HASH_SCHEME}$${rounds}$${salt}$${await derive(password, salt, rounds)}`;
}

// {ok, upgrade}: whether the password matches, and whether its hash is in an old format to replace
async function check_password(password, stored) {
    const parts = String(stored ?? "").split("$");
    if(parts.length === 4 && parts[0] === HASH_SCHEME) {
        const [, rounds, salt, hash] = parts;
        const ok = same(await derive(password, salt, Number(rounds)), hash);
        return {ok, upgrade: ok && Number(rounds) < HASH_ROUNDS};
    }
    const ok = same(await derive(password, LEGACY_SALT, LEGACY_ROUNDS), stored);
    return {ok, upgrade: ok};
}

// A stand-in hash, so an unknown email takes as long to check as a wrong password
const DUMMY_HASH = `${HASH_SCHEME}$${HASH_ROUNDS}$${"0".repeat(SALT_BYTES * 2)}$${"0".repeat(HASH_KEY_LENGTH * 2)}`;

async function authenticate(sqlite, email, password) {
    const user = get_by_email(sqlite, String(email ?? "").trim());
    const {ok, upgrade} = await check_password(password, user?.password_hash ?? DUMMY_HASH);
    if(!user || !ok) {
        throw new AuthenticationError();
    }
    if(upgrade) {
        user.password_hash = await hash_password(password);
        set_password_hash(sqlite, user.user_id, user.password_hash);
        console.log({event: "User.PASSWORD_UPGRADED", user_id: user.user_id});
    }
    return user;
}

function set_password_hash(sqlite, user_id, password_hash, now_ms = Date.now()) {
    sqlite.prepare("UPDATE users SET password_hash = :password_hash, updated_ms = :now_ms WHERE user_id = :user_id")
        .run({user_id, password_hash, now_ms});
}

// ---------- password reset links ----------
// The link carries a fingerprint of the current password hash, so it stops working once the password
// changes: each link resets the password once.

function password_fingerprint(user) {
    return crypto.createHash("sha256").update(String(user.password_hash)).digest("hex").slice(0, 16);
}

function reset_token(user, expiry_ms = 24 * 60 * 60 * 1000) {
    const Token = require("./token");
    return Token.sign(Token.assemble(user.user_id, password_fingerprint(user)), expiry_ms);
}

// The user a reset token is for, or null if it's expired, altered or already used
function user_from_reset_token(sqlite, token) {
    const Token = require("./token");
    try {
        const [user_id, fingerprint] = Token.validate(token);
        const user = get_by_id(sqlite, Number(user_id));
        return user && same(password_fingerprint(user), fingerprint ?? "") ? user : null;
    }
    catch(err) {
        if(err instanceof AuthenticationError) {
            return null;
        }
        throw err;
    }
}

function convert(row) {
    return {
        user_id: row.user_id,
        created_at: new Date(row.created_ms),
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        password_hash: row.password_hash,
        updated_at: new Date(row.updated_ms),
    };
}

function has_permission(sqlite, user_id, group_name) {
    const statement = sqlite.prepare(
        `SELECT COUNT(*) AS count FROM permissions p
         JOIN groups g ON p.group_id = g.group_id
         WHERE
            p.user_id=:user_id AND
            g.name = :group_name`,
    );
    const {count} = statement.get({user_id, group_name});
    return count > 0;
}

function create(
    sqlite,
    {
        first_name,
        last_name,
        email,
        password_hash,
        now_ms=Date.now(),
    },
) {

    const statement = sqlite.prepare(
        `INSERT INTO users (
           created_ms,
           email,
           first_name,
           last_name,
           password_hash,
           updated_ms
         ) VALUES (
           :now_ms,
           :email,
           :first_name,
           :last_name,
           :password_hash,
           :now_ms
         )`
    );
    statement.run({
        email,
        first_name,
        last_name,
        now_ms,
        password_hash,
    });
    return get_by_email(sqlite, email);
}

function get_by_email(sqlite, email) {
    const statement = sqlite.prepare(
        // Capital letters don't matter in email addresses
        `SELECT * FROM users
         WHERE lower(email) = lower(:email)`,
    );
    const row = statement.get({email: String(email ?? "").trim()});
    if(row === undefined) {
        return null;
    }
    const user = convert(row);
    return user;
}

function get_by_id(sqlite, user_id) {
    const statement = sqlite.prepare(
        `SELECT * FROM users          
         WHERE user_id = :user_id`,
    );
    const row = statement.get({user_id});
    if(row === undefined) {
        return null;
    }
    const user = convert(row);
    return user;
}

function update(sqlite, user, now_ms=Date.now()) {
    const statement = sqlite.prepare(
        `UPDATE users SET
           email = :email,
           first_name = :first_name,
           last_name = :last_name,
           password_hash = :password_hash,
           updated_ms = :updated_ms
         WHERE user_id = :user_id`,
    ).run(user);
    return get_by_id(sqlite, user.user_id);
}

exports.AuthenticationError = AuthenticationError;
exports.authenticate = authenticate;
exports.create = create;
exports.has_permission = has_permission;
exports.check_password = check_password;
exports.hash_password = hash_password;
exports.reset_token = reset_token;
exports.set_password_hash = set_password_hash;
exports.user_from_reset_token = user_from_reset_token;
exports.get = get_by_email;
exports.get_by_email = get_by_email;
exports.get_by_id = get_by_id;
exports.update = update;
