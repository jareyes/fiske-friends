const crypto = require("node:crypto");
const config = require("config");
const util = require("node:util");

const crypto_pbkdf2 = util.promisify(crypto.pbkdf2);
const PASSWORD_DIGEST = "sha512";
const PASSWORD_ITERATIONS = 1000;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT = config.get("app.password_salt");

class AuthenticationError extends Error {};

async function authenticate(sqlite, email, password) {
    const user = get(sqlite, email);
    const password_hash = await hash_password(password);
    if(user?.password_hash === password_hash) {
        return user;
    }
    throw new AuthenticationError();
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

async function hash_password(
    password,
    digest=PASSWORD_DIGEST,
    iterations=PASSWORD_ITERATIONS,
    key_length=PASSWORD_KEY_LENGTH,
    salt=PASSWORD_SALT,
) {
    const buf = await crypto_pbkdf2(
        password,
        salt,
        iterations,
        key_length,
        digest,
    );
    return buf.toString("hex");
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
    return get(sqlite, email);
}

function get(sqlite, email) {
    const statement = sqlite.prepare(
        `SELECT          
            user_id,
            created_ms,
            email,
            first_name,
            last_name,
            password_hash,
            updated_ms
         FROM users
         WHERE email = :email`,
    );
    const row = statement.get({email});
    if(row === undefined) {
        return null;
    }
    const user = convert(row);
    return user;
}

exports.AuthenticationError = AuthenticationError;
exports.authenticate = authenticate;
exports.create = create;
exports.has_permission = has_permission;
exports.hash_password = hash_password;
exports.get = get;
