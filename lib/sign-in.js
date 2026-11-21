// Signing board members and volunteers in with a password: shared by /auth/login and the read-a-thon's
// volunteer sign-in.
const config = require("config");

const COOKIE = config.get("session.cookie");

// Only addresses on this site: "/plan/events" yes; "https://elsewhere.example" and "//elsewhere" no
function safe_redirect(value, fallback) {
    const url = String(value ?? "");
    return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\") ? url : fallback;
}

// Starts a signed-in session with a new session id, so an id someone planted before sign-in is useless.
// Keeps anything else in the session (a family signed in on the same device stays signed in), and
// stores only what pages need about the user, never the password hash.
function start_user_session(req, user) {
    const kept = Object.fromEntries(Object.entries(req.session).filter(([key]) => key !== "cookie"));
    const {password_hash, ...safe_user} = user;
    return new Promise((resolve, reject) => {
        req.session.regenerate(err => {
            if(err) {
                return reject(err);
            }
            Object.assign(req.session, kept, {user: safe_user});
            req.session.save(save_err => save_err ? reject(save_err) : resolve());
        });
    });
}

// Why a sign-in on this request wouldn't stick, or null. A browser silently drops a Secure cookie on
// plain http, and a cookie for another domain, so the sign-in "works" and then forgets you.
function cookie_problem(req, cookie = COOKIE) {
    if(cookie.secure === true && !req.secure) {
        return "This server only keeps sign-ins on HTTPS (session.cookie.secure is true), and this page is on plain HTTP. "
            + "To work on your own computer, set session.cookie.secure to false in config/local.json5.";
    }
    const domain = String(cookie.domain ?? "").replace(/^\./, "");
    if(domain && req.hostname !== domain && !req.hostname.endsWith(`.${domain}`)) {
        return `Sign-ins are kept for ${domain} (session.cookie.domain), but this page is on ${req.hostname}. `
            + "To work on your own computer, set session.cookie.domain to null in config/local.json5.";
    }
    return null;
}

// Wrong passwords: after too many for one email (or from one place), wait a while before trying again
class FailedSignIns {
    constructor({window_ms = 15 * 60 * 1000, per_email = 8, per_ip = 30} = {}) {
        this.window_ms = window_ms;
        this.limits = {email: per_email, ip: per_ip};
        this.failures = new Map();
    }

    keys(email, ip) {
        return [["email", `email:${String(email).trim().toLowerCase()}`], ["ip", `ip:${ip}`]];
    }

    recent(key, now_ms) {
        const list = (this.failures.get(key) ?? []).filter(ms => now_ms - ms < this.window_ms);
        if(list.length === 0) {
            this.failures.delete(key);
        }
        else {
            this.failures.set(key, list);
        }
        return list;
    }

    blocked(email, ip, now_ms = Date.now()) {
        return this.keys(email, ip).some(([kind, key]) => this.recent(key, now_ms).length >= this.limits[kind]);
    }

    record(email, ip, now_ms = Date.now()) {
        for(const [, key] of this.keys(email, ip)) {
            this.failures.set(key, [...this.recent(key, now_ms), now_ms]);
        }
    }

    clear(email) {
        this.failures.delete(this.keys(email, "")[0][1]);
    }
}

exports.FailedSignIns = FailedSignIns;
exports.cookie_problem = cookie_problem;
exports.safe_redirect = safe_redirect;
exports.start_user_session = start_user_session;
