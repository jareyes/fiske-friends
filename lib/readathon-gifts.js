// Read-a-thon pledges and donations: parsing the form, saving gifts, and totals.
// Payments themselves go through Stripe in routes/readathon-gifts.js.
const config = require("config");
const crypto = require("node:crypto");

const SETTINGS = config.get("readathon");

const SUGGESTED_USD = [10, 25, 50, 100];
const MIN_USD = 5;
const MAX_USD = 10000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USD = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"});
const USD_WHOLE = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 0});

function clean(value, max_length = 200) {
    return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max_length);
}

function format_cents(cents) {
    return cents % 100 === 0 ? USD_WHOLE.format(cents / 100) : USD.format(cents / 100);
}

// Turns a submitted gift form into a gift, or a list of problems.
// require_payment_method is false only in demo mode, where no card is taken.
function parse_gift(body, require_payment_method = true) {
    const errors = [];
    const choice = clean(body.amount);
    const raw = choice === "other" ? clean(body.amount_other).replace(/[$,]/g, "") : choice;
    const amount_usd = Math.round(Number.parseFloat(raw) * 100) / 100;
    if(!Number.isFinite(amount_usd) || amount_usd < MIN_USD) {
        errors.push(`The smallest gift is $${MIN_USD}.`);
    }
    else if(amount_usd > MAX_USD) {
        errors.push("For gifts over $10,000, please contact the Friends directly.");
    }

    const first_name = clean(body.first_name, 100);
    const last_name = clean(body.last_name, 100);
    const email = clean(body.email, 200);
    if(first_name === "" || last_name === "") {
        errors.push("Please enter your first and last name for the receipt.");
    }
    if(!EMAIL_PATTERN.test(email)) {
        errors.push("Please enter a valid email address for your receipt.");
    }

    const anonymous = !!body.anonymous;
    const display_name = anonymous ? null : (clean(body.display_name, 60) || first_name || null);

    const payment_method_id = clean(body.payment_method_id);
    if(require_payment_method && errors.length === 0 && payment_method_id === "") {
        errors.push("We couldn't read your card details. Please try again.");
    }

    return {
        errors,
        gift: {
            amount_cents: Number.isFinite(amount_usd) ? Math.round(amount_usd * 100) : 0,
            display_name,
            message: clean(body.message, 200) || null,
            hide_amount: body.hide_amount ? 1 : 0,
            first_name,
            last_name,
            email,
            payment_method_id,
        },
    };
}

function new_cheer_code() {
    return crypto.randomBytes(6).toString("base64url");
}

// Every reader gets a code the first time someone asks for it
function cheer_code(sqlite, reader) {
    if(reader.cheer_code) {
        return reader.cheer_code;
    }
    const code = new_cheer_code();
    sqlite.prepare(
        "UPDATE readathon_readers SET cheer_code = :code WHERE reader_id = :reader_id AND cheer_code IS NULL",
    ).run({code, reader_id: reader.reader_id});
    return sqlite.prepare(
        "SELECT cheer_code FROM readathon_readers WHERE reader_id = :reader_id",
    ).get({reader_id: reader.reader_id}).cheer_code;
}

function reader_by_cheer_code(sqlite, code) {
    if(!/^[A-Za-z0-9_-]{6,16}$/.test(String(code ?? ""))) {
        return null;
    }
    return sqlite.prepare(
        "SELECT * FROM readathon_readers WHERE cheer_code = :code",
    ).get({code}) ?? null;
}

function record_gift(sqlite, reader_id, gift, payment_intent_id, is_demo = false, now_ms = Date.now()) {
    sqlite.prepare(
        `INSERT INTO readathon_gifts
           (reader_id, amount_cents, display_name, message, hide_amount,
            first_name, last_name, email, payment_intent_id, is_demo, created_ms)
         VALUES
           (:reader_id, :amount_cents, :display_name, :message, :hide_amount,
            :first_name, :last_name, :email, :payment_intent_id, :is_demo, :created_ms)`,
    ).run({
        reader_id: reader_id ?? null,
        amount_cents: gift.amount_cents,
        display_name: gift.display_name,
        message: gift.message,
        hide_amount: gift.hide_amount,
        first_name: gift.first_name,
        last_name: gift.last_name,
        email: gift.email,
        payment_intent_id,
        is_demo: is_demo ? 1 : 0,
        created_ms: now_ms,
    });
}

// What the reader and their visitors see: no last names, no emails
function public_cheer(row) {
    return {
        name: row.display_name || "Someone",
        message: row.message,
        amount: row.hide_amount ? null : format_cents(row.amount_cents),
    };
}

function reader_cheers(sqlite, reader_id) {
    const rows = sqlite.prepare(
        "SELECT * FROM readathon_gifts WHERE reader_id = :reader_id ORDER BY created_ms DESC",
    ).all({reader_id});
    const cents = rows.reduce((sum, row) => sum + row.amount_cents, 0);
    return {
        count: rows.length,
        cents,
        total: format_cents(cents),
        cheers: rows.map(public_cheer),
    };
}

// Gifts plus the sponsor's match for hours read, toward the fundraising goal
function totals(sqlite, community_minutes, settings = SETTINGS) {
    const {cents, count} = sqlite.prepare(
        "SELECT COALESCE(SUM(amount_cents), 0) AS cents, COUNT(*) AS count FROM readathon_gifts",
    ).get();
    const fundraising = settings.fundraising;
    const hours = Math.floor(community_minutes / 60);
    const match_cents = Math.min(
        hours * fundraising.match_per_hour_usd * 100,
        fundraising.match_cap_usd * 100,
    );
    const all_cents = cents + match_cents;
    return {
        gifts_count: count,
        gifts: format_cents(cents),
        hours,
        match: format_cents(match_cents),
        match_capped: match_cents >= fundraising.match_cap_usd * 100,
        match_cap: format_cents(fundraising.match_cap_usd * 100),
        match_per_hour: format_cents(fundraising.match_per_hour_usd * 100),
        total: format_cents(all_cents),
        goal: format_cents(fundraising.goal_usd * 100),
        percent: Math.min(100, Math.round(all_cents / (fundraising.goal_usd * 100) * 100)),
    };
}

function recent_gifts(sqlite, limit = 15) {
    return sqlite.prepare(
        `SELECT g.*, r.name AS reader_name FROM readathon_gifts g
         LEFT JOIN readathon_readers r ON r.reader_id = g.reader_id
         ORDER BY g.created_ms DESC LIMIT :limit`,
    ).all({limit}).map(row => ({
        ...row,
        amount: format_cents(row.amount_cents),
        to: row.reader_name ?? "The whole read-a-thon",
    }));
}

exports.MIN_USD = MIN_USD;
exports.SUGGESTED_USD = SUGGESTED_USD;
exports.cheer_code = cheer_code;
exports.format_cents = format_cents;
exports.new_cheer_code = new_cheer_code;
exports.parse_gift = parse_gift;
exports.reader_by_cheer_code = reader_by_cheer_code;
exports.reader_cheers = reader_cheers;
exports.recent_gifts = recent_gifts;
exports.record_gift = record_gift;
exports.totals = totals;
