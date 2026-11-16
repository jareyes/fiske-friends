// Quiet protection against bots on public forms (join, sign in, recommend a book).
//
// - A honeypot: a "website" field people never see. Simple bots fill in every field.
// - A timing check: the form carries a signed timestamp from when the page was shown.
//   Nobody fills in a form in under 2 seconds, but bots do. Works without JavaScript,
//   and the signature means a bot can't make up its own time.
const Token = require("./token");

const MIN_FILL_MS = 2000;
const STAMP_LIFETIME_MS = 24 * 60 * 60 * 1000;
const HONEYPOT_FIELD = "website";

// A token for the form's hidden "form_stamp" field
function stamp(now_ms = Date.now()) {
    return Token.sign(`form:${now_ms}`, STAMP_LIFETIME_MS, now_ms);
}

// "ok", "honeypot" (a bot: pretend it worked), or "too_fast" (show the form again)
function check(body, now_ms = Date.now()) {
    if(String(body?.[HONEYPOT_FIELD] ?? "").trim() !== "") {
        return "honeypot";
    }
    try {
        const [payload] = Token.validate(String(body?.form_stamp ?? ""), undefined, now_ms);
        const shown_ms = Number(String(payload).split(":")[1]);
        if(!String(payload).startsWith("form:") || !Number.isFinite(shown_ms)) {
            return "too_fast";
        }
        return now_ms - shown_ms < MIN_FILL_MS ? "too_fast" : "ok";
    }
    catch(err) {
        // Missing, tampered with, or a day-old page: ask them to press the button again
        return "too_fast";
    }
}

const TOO_FAST_MESSAGE = "That was quick! Please check the form and press the button again.";

exports.HONEYPOT_FIELD = HONEYPOT_FIELD;
exports.MIN_FILL_MS = MIN_FILL_MS;
exports.TOO_FAST_MESSAGE = TOO_FAST_MESSAGE;
exports.check = check;
exports.stamp = stamp;
