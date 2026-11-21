// Sends email through SMTP with Nodemailer, and keeps a log of every email in the emails table.
//
// Settings are in config "mail" (or SMTP_HOST, SMTP_USER, ... in the environment). With no SMTP host,
// nothing leaves the server: each email is kept in the outbox, with its body, for admins to read at
// /plan/emails. That's the setup for the demo and for working on the site.
const config = require("config");
const nodemailer = require("nodemailer");

const MAIL = config.get("mail");

let transport;

function settings_transport(settings = MAIL) {
    const smtp = settings.smtp ?? {};
    if(!smtp.host) {
        return null;
    }
    const port = Number(smtp.port ?? 587);
    return nodemailer.createTransport({
        host: smtp.host,
        port,
        secure: smtp.secure ?? port === 465,
        auth: smtp.user ? {user: smtp.user, pass: smtp.pass} : undefined,
        // Reuse a couple of connections instead of opening one per email
        pool: true,
        maxConnections: 2,
    });
}

function get_transport() {
    if(transport === undefined) {
        transport = settings_transport();
    }
    return transport;
}

// For tests: a Nodemailer transport (or anything with sendMail), or null for the outbox
function set_transport(value) {
    transport = value;
}

// What admins see at the top of /plan/emails
function status(settings = MAIL) {
    const live = get_transport() !== null;
    return {
        live,
        host: live ? settings.smtp?.host ?? "(test transport)" : null,
        from: settings.from,
        reply_to: settings.reply_to || null,
    };
}

function insert(sqlite, row) {
    const {lastInsertRowid} = sqlite.prepare(
        `INSERT INTO emails (kind, to_address, subject, status, html, text, household_id, is_test, created_ms)
         VALUES (:kind, :to_address, :subject, :status, :html, :text, :household_id, :is_test, :created_ms)`,
    ).run(row);
    return Number(lastInsertRowid);
}

// The from address, under another name: "Friends of the Fiske Free Library <readathon@...>"
function from_with_name(name, from = MAIL.from) {
    if(!name) {
        return from;
    }
    const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
    return `"${String(name).replace(/["\\]/g, "")}" <${address}>`;
}

// Sends one email: {to, subject, html, text, kind, household_id?, is_test?, from_name?}. Never throws; returns
// {status: "outbox" | "sent" | "failed", email_id, error?}.
async function send(sqlite, message, now_ms = Date.now()) {
    const live = get_transport() !== null;
    const email_id = insert(sqlite, {
        kind: message.kind,
        to_address: message.to,
        subject: message.subject,
        status: live ? "sending" : "outbox",
        html: live ? null : message.html,
        text: live ? null : message.text,
        household_id: message.household_id ?? null,
        is_test: message.is_test ? 1 : 0,
        created_ms: now_ms,
    });
    if(!live) {
        console.log({event: "Mail.OUTBOX", kind: message.kind, email_id});
        return {status: "outbox", email_id};
    }
    try {
        await get_transport().sendMail({
            from: from_with_name(message.from_name),
            replyTo: MAIL.reply_to || undefined,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
        });
        sqlite.prepare("UPDATE emails SET status = 'sent', sent_ms = :sent_ms WHERE email_id = :email_id")
            .run({email_id, sent_ms: Date.now()});
        console.log({event: "Mail.SENT", kind: message.kind, email_id});
        return {status: "sent", email_id};
    }
    catch(err) {
        const error = String(err?.message ?? err).slice(0, 500);
        sqlite.prepare("UPDATE emails SET status = 'failed', error = :error WHERE email_id = :email_id")
            .run({email_id, error});
        console.error({event: "Mail.FAILED", kind: message.kind, email_id, error});
        return {status: "failed", email_id, error};
    }
}

// Sends in the background, for pages that shouldn't wait on the mail server (and shouldn't take
// longer when an address is signed up, which would give away who is). build is an async function
// that returns the message.
function deliver(sqlite, build) {
    Promise.resolve()
        .then(build)
        .then(message => message && send(sqlite, message))
        .catch(err => console.error({event: "Mail.BUILD_FAILED", error: String(err?.message ?? err)}));
}

// Checks that the SMTP server answers and accepts the login. {ok, error?}
async function verify() {
    if(get_transport() === null) {
        return {ok: false, error: "There's no SMTP host set, so emails stay in the outbox."};
    }
    try {
        await get_transport().verify();
        return {ok: true};
    }
    catch(err) {
        return {ok: false, error: String(err?.message ?? err)};
    }
}

function convert(row) {
    return {
        ...row,
        created: new Date(row.created_ms),
        sent: row.sent_ms ? new Date(row.sent_ms) : null,
        is_test: !!row.is_test,
        has_body: row.html !== null,
    };
}

function list_recent(sqlite, limit = 50) {
    return sqlite.prepare(
        `SELECT email_id, kind, to_address, subject, status, error, household_id, is_test, created_ms, sent_ms,
                CASE WHEN html IS NULL THEN NULL ELSE '' END AS html
         FROM emails ORDER BY created_ms DESC, email_id DESC LIMIT :limit`,
    ).all({limit}).map(convert);
}

function get(sqlite, email_id) {
    const row = sqlite.prepare("SELECT * FROM emails WHERE email_id = :email_id").get({email_id: Number(email_id)});
    return row === undefined ? null : convert(row);
}

exports.deliver = deliver;
exports.from_with_name = from_with_name;
exports.get = get;
exports.list_recent = list_recent;
exports.send = send;
exports.set_transport = set_transport;
exports.settings_transport = settings_transport;
exports.status = status;
exports.verify = verify;
