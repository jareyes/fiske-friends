// Keeps express-session sign-ins in the site's SQLite database (the sessions table, migration 012),
// so a restart or deploy doesn't sign everyone out.
const session = require("express-session");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

// When a session's cookie has no expiry of its own, keep it this long
const DEFAULT_LIFETIME_MS = ONE_DAY_MS;

function expires_ms(sess, now_ms) {
    const expires = sess?.cookie?.expires;
    if(expires) {
        const ms = new Date(expires).getTime();
        if(Number.isFinite(ms)) {
            return ms;
        }
    }
    return now_ms + DEFAULT_LIFETIME_MS;
}

class SqliteStore extends session.Store {
    // options.now lets tests control the clock. options.purge_every_ms: 0 turns off the hourly cleanup.
    constructor(sqlite, options = {}) {
        super();
        this.sqlite = sqlite;
        this.now = options.now ?? (() => Date.now());
        this.queries = {
            get: sqlite.prepare("SELECT data, expires_ms FROM sessions WHERE session_id = :session_id"),
            set: sqlite.prepare(
                `INSERT INTO sessions (session_id, data, expires_ms) VALUES (:session_id, :data, :expires_ms)
                 ON CONFLICT (session_id) DO UPDATE SET data = excluded.data, expires_ms = excluded.expires_ms`,
            ),
            touch: sqlite.prepare("UPDATE sessions SET expires_ms = :expires_ms WHERE session_id = :session_id"),
            destroy: sqlite.prepare("DELETE FROM sessions WHERE session_id = :session_id"),
            purge: sqlite.prepare("DELETE FROM sessions WHERE expires_ms <= :now_ms"),
            count: sqlite.prepare("SELECT COUNT(*) AS n FROM sessions"),
        };
        this.purge();
        const every = options.purge_every_ms ?? ONE_HOUR_MS;
        if(every > 0) {
            this.timer = setInterval(() => this.purge(), every);
            // Don't keep the process alive just for cleanup
            this.timer.unref?.();
        }
    }

    get(session_id, callback) {
        try {
            const row = this.queries.get.get({session_id});
            if(!row) {
                return callback(null, null);
            }
            if(row.expires_ms <= this.now()) {
                this.queries.destroy.run({session_id});
                return callback(null, null);
            }
            callback(null, JSON.parse(row.data));
        }
        catch(err) {
            callback(err);
        }
    }

    set(session_id, sess, callback = () => {}) {
        try {
            this.queries.set.run({session_id, data: JSON.stringify(sess), expires_ms: expires_ms(sess, this.now())});
            callback(null);
        }
        catch(err) {
            callback(err);
        }
    }

    // Called on page views where nothing in the session changed. To keep writes down, the expiry is
    // only pushed back when it has moved by more than a day.
    touch(session_id, sess, callback = () => {}) {
        try {
            const row = this.queries.get.get({session_id});
            const wanted = expires_ms(sess, this.now());
            if(row && wanted - row.expires_ms > ONE_DAY_MS) {
                this.queries.touch.run({session_id, expires_ms: wanted});
            }
            callback(null);
        }
        catch(err) {
            callback(err);
        }
    }

    destroy(session_id, callback = () => {}) {
        try {
            this.queries.destroy.run({session_id});
            callback(null);
        }
        catch(err) {
            callback(err);
        }
    }

    // Clear out expired sessions. Returns how many were removed.
    purge() {
        return Number(this.queries.purge.run({now_ms: this.now()}).changes);
    }

    length(callback) {
        try {
            callback(null, this.queries.count.get().n);
        }
        catch(err) {
            callback(err);
        }
    }

    close() {
        clearInterval(this.timer);
    }
}

module.exports = SqliteStore;
