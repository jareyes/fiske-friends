const AuthenticationError = require("./authentication_error");
const config = require("config");
const crypto = require("node:crypto");

const LINK_SALT = config.get("app.link_salt");
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function assemble(...arguments) {
    return arguments.join("|");
}

function disassemble(payload) {
    return payload.split("|");
}

function get_digest(
    payload,
    salt=LINK_SALT,
) {
    const hmac = crypto.createHmac("sha256", salt);
    hmac.update(payload);
    const digest = hmac.digest("hex");
    return digest;
}

// IMPORTANT: The payload cannot contain pipes (|)
function sign(
    payload,
    expiry_ms=MS_PER_DAY,
    now_ms=Date.now(),
    salt=LINK_SALT,
) {
    const expiration_ms = now_ms + expiry_ms;
    const digest = get_digest(payload);
    const buf = Buffer.from(`${payload}|${expiration_ms}|${digest}`);
    const token = buf.toString("base64url");
    return token;
}

function validate(
    token,
    salt=LINK_SALT,
    now_ms=Date.now(),
) {
    const buf = Buffer.from(token, "base64url");
    const decoded = buf.toString("utf-8");
    const parts = disassemble(decoded);
    const digest = parts.pop();
    const expiration_ms = parseInt(parts.pop());
    if(now_ms > expiration_ms) {
        console.log({
            event: "Token.EXPIRED",
            ago_ms: now_ms - expiration_ms,
        });
        throw new AuthenticationError();
    }
    const payload = assemble(parts);
    const expected = get_digest(payload);
    if(digest !== expected) {
        console.log({
            event: "Token.INVALID",
        });
        throw new AuthenticationError();
    }
    return parts;       
}

exports.assemble = assemble;
exports.sign = sign;
exports.validate = validate;
