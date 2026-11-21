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
// The signature covers the expiration too, so nobody can stretch a link by editing its date.
function sign(
    payload,
    expiry_ms=MS_PER_DAY,
    now_ms=Date.now(),
    salt=LINK_SALT,
) {
    const expiration_ms = now_ms + expiry_ms;
    const digest = get_digest(`${payload}|${expiration_ms}`, salt);
    const buf = Buffer.from(`${payload}|${expiration_ms}|${digest}`);
    const token = buf.toString("base64url");
    return token;
}

function validate(
    token,
    salt=LINK_SALT,
    now_ms=Date.now(),
) {
    const buf = Buffer.from(String(token), "base64url");
    const decoded = buf.toString("utf-8");
    const parts = disassemble(decoded);
    const digest = parts.pop() ?? "";
    const expiration_text = parts.pop() ?? "";
    const expiration_ms = Number.parseInt(expiration_text, 10);
    if(!/^\d+$/.test(expiration_text) || now_ms > expiration_ms) {
        console.log({
            event: "Token.EXPIRED",
            ago_ms: now_ms - expiration_ms,
        });
        throw new AuthenticationError();
    }
    const expected = get_digest(`${assemble(...parts)}|${expiration_text}`, salt);
    // Constant-time comparison, so the signature can't be guessed a character at a time
    if(digest.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected))) {
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
