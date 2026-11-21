#!/usr/bin/env node
// Runs the read-a-thon on its own, away from the real site's data. Two ways:
//
// MEETING DEMO (the default)
//   node bin/readathon-demo.js          then open http://localhost:3000/readathon
//   A throwaway in-memory database full of sample readers, pretending today is January 12, 2027.
//   Nothing is written to disk, and payments are pretend.
//   Sample family:   demo@example.com  (Renee and Katie). Use "Sign in"; the link appears on screen.
//   Volunteer desk:  volunteer@example.com at /readathon/volunteer (or the "Volunteers" footer link)
//                    password "readathon", or whatever READATHON_DEMO_PASSWORD is set to
//
// DRY RUN (READATHON_MODE=dry-run)
//   For the board to use the site for real for a week before launch. Starts empty, keeps everything in
//   a database file across restarts, uses today's real date with short read-a-thon dates so logging is
//   open, takes Stripe TEST payments, and shows a "Report a problem" link on every page. Needs:
//     READATHON_DB              database file, e.g. /var/lib/fiske-friends/readathon-dry-run.sqlite
//     READATHON_STARTS / _ENDS  the dry run's dates, e.g. 2026-11-23 and 2026-11-29
//     STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY   Stripe test keys (sk_test_... / pk_test_...)
//     READATHON_DEMO_PASSWORD   the volunteer desk password (volunteer@example.com)
//     SESSION_SECRET            any long random text, so sign-ins survive restarts safely
//
// To run either on the server at read.fiskefriends.org, see events/202701-readathon/README.md.
const path = require("node:path");
const fs = require("node:fs");
const process = require("node:process");

const DRY_RUN = process.env.READATHON_MODE === "dry-run";

// Links in emails (sign-in links, the logo) need the address people reach this server at.
// SITE_DOMAIN sets it, like read.fiskefriends.org; otherwise it's this laptop.
function site_settings(default_domain) {
    const domain = process.env.SITE_DOMAIN || default_domain;
    const local = domain.startsWith("localhost") || domain.startsWith("127.");
    return {protocol: local || process.env.HTTPS === "0" ? "http" : "https", domain};
}

function dry_run_settings() {
    const env = process.env;
    const missing = ["READATHON_DB", "READATHON_STARTS", "READATHON_ENDS", "STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "READATHON_DEMO_PASSWORD", "SESSION_SECRET"]
        .filter(name => !env[name]);
    if(missing.length > 0) {
        console.error(`Dry run needs these settings: ${missing.join(", ")}`);
        process.exit(1);
    }
    // Never take real money in a dry run
    if(!env.STRIPE_SECRET_KEY.startsWith("sk_test_") || !env.STRIPE_PUBLISHABLE_KEY.startsWith("pk_test_")) {
        console.error("Dry run only works with Stripe TEST keys (sk_test_... and pk_test_...).");
        process.exit(1);
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(env.READATHON_STARTS) || !/^\d{4}-\d{2}-\d{2}$/.test(env.READATHON_ENDS)) {
        console.error("READATHON_STARTS and READATHON_ENDS should look like 2026-11-23.");
        process.exit(1);
    }
    return {
        app: site_settings("read.fiskefriends.org"),
        // Its own cookie name: the main site's cookie is for fiskefriends.org and every subdomain, so
        // with the same name the two sites would trip over each other's sign-ins
        session: {name: "readathon_preview.sid", secret: env.SESSION_SECRET, cookie: {secure: env.HTTPS !== "0", domain: null, sameSite: "lax"}},
        stripe: {secret_key: env.STRIPE_SECRET_KEY, publishable_key: env.STRIPE_PUBLISHABLE_KEY},
        sqlite: {filepath: env.READATHON_DB},
        readathon: {
            starts: env.READATHON_STARTS,
            ends: env.READATHON_ENDS,
            today_override: null,
            // Until email is set up (SMTP_HOST), sign-in links show on screen. No limits either way.
            show_sign_in_links: !env.SMTP_HOST,
            sign_in_email_limits: {minutes_between: 0, per_day: 0},
            fake_payments: false,
            show_report_link: true,
            banner: "Dry run: a test of the read-a-thon site before it opens. Cards are never charged.",
        },
    };
}

// Settings for running on a laptop: no HTTPS, no real domain, demo date and visible sign-in links
process.env.NODE_CONFIG = JSON.stringify({
    ...(DRY_RUN ? dry_run_settings() : {
        app: site_settings(`localhost:${process.env.PORT ?? 3000}`),
        session: {name: "readathon_preview.sid", secret: "readathon-demo-only", cookie: {secure: false, domain: null, sameSite: "lax"}},
        // Placeholder keys so no real payment can ever happen from the demo
        stripe: {secret_key: "sk_test_readathon_demo", publishable_key: "pk_test_readathon_demo"},
        // No sign-in email limits: the demo shows the link on screen, and people sign in over and over
        readathon: {today_override: process.env.READATHON_TODAY ?? "2027-01-12", show_sign_in_links: true, fake_payments: true, sign_in_email_limits: {minutes_between: 0, per_day: 0}},
    }),
    ...JSON.parse(process.env.NODE_CONFIG ?? "{}"),
});
process.chdir(path.join(__dirname, ".."));

const config = require("config");
const {DatabaseSync} = require("node:sqlite");
const Gifts = require("../lib/readathon-gifts");
const Mailer = require("../lib/mailer");
const {seed_events} = require("./seed-readathon-events");
const Readathon = require("../lib/readathon");
const Prizes = require("../lib/readathon-prizes");
const Teams = require("../lib/readathon-teams");
const User = require("../lib/user");
const app = require("./app");
const express = require("express");

const VOLUNTEER_PASSWORD = process.env.READATHON_DEMO_PASSWORD || "readathon";

const MIGRATIONS_DIRPATH = path.join(__dirname, "..", "migrations");

// Runs any migrations the database hasn't had yet, and records them (like bin/migrate.js),
// so a dry-run database file can be reopened after a restart or an update
function migrate(sqlite) {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS migrations (
        migration_id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT`);
    const applied = new Set(sqlite.prepare("SELECT filename FROM migrations").all().map(row => row.filename));
    const files = fs.readdirSync(MIGRATIONS_DIRPATH).filter(f => f.endsWith(".sql")).sort();
    for(const file of files.filter(f => !applied.has(f))) {
        sqlite.exec("BEGIN");
        try {
            sqlite.exec(fs.readFileSync(path.join(MIGRATIONS_DIRPATH, file), "utf8"));
            sqlite.prepare("INSERT INTO migrations (filename) VALUES (:filename)").run({filename: file});
            sqlite.exec("COMMIT");
        }
        catch(err) {
            sqlite.exec("ROLLBACK");
            throw err;
        }
    }
}

// A volunteer who can open the desk page, made once
async function ensure_volunteer(sqlite) {
    if(User.get_by_email(sqlite, "volunteer@example.com")) {
        return;
    }
    const user = User.create(sqlite, {
        first_name: "Desk",
        last_name: "Volunteer",
        email: "volunteer@example.com",
        password_hash: await User.hash_password(VOLUNTEER_PASSWORD),
    });
    const {group_id} = sqlite.prepare("SELECT group_id FROM groups WHERE name = 'admin'").get();
    sqlite.prepare("INSERT INTO permissions (user_id, group_id) VALUES (:user_id, :group_id)").run({user_id: user.user_id, group_id});
}

// Small deterministic random numbers so the demo looks the same every time
function random_generator(seed) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return value / 2147483647;
    };
}

async function seed(sqlite) {
    const today = Readathon.today();
    const days = Readathon.event_days().filter(day => day < today);

    // The family used in the meeting demo
    const household_id = Readathon.create_household(sqlite, {
        email: "demo@example.com",
        city: "Claremont",
        state: "NH",
        wants_updates: 1,
        goal_minutes: 600,
        readers: [
            {name: "Renee", age_group: "adult", birth_year: 1984, goal_minutes: 600},
            {name: "Katie", age_group: "kid", birth_year: 2018, goal_minutes: 300},
        ],
    });
    const [renee, katie] = Readathon.list_readers(sqlite, household_id);
    const renee_log = [45, 30, 20, 25, 40, 0, 15, 35, 60, 30, 25];
    const katie_log = [15, 20, 15, 20, 15, 25, 20, 10, 30, 15, 20];
    days.forEach((day, i) => {
        if(renee_log[i]) {
            const book = i < 6 ? {title: "The Lincoln Highway", format: "Book"} : {title: "Educated", format: "Audiobook"};
            Readathon.add_entry(sqlite, renee.reader_id, {day, minutes: renee_log[i], ...book});
        }
        if(katie_log[i]) {
            Readathon.add_entry(sqlite, katie.reader_id, {day, minutes: katie_log[i], title: "Dog Man", format: "Comics"});
        }
    });
    [6, 10, 16].forEach(square => Readathon.set_mark(sqlite, renee.reader_id, square, true));
    [2, 4, 16, 17].forEach(square => Readathon.set_mark(sqlite, katie.reader_id, square, true));

    // Other readers, so the community total looks like the middle of January
    const names = ["Ava", "Ben", "Carmen", "Dot", "Eli", "Fern", "Gus", "Hana", "Ike", "June", "Kai", "Lena",
        "Milo", "Nora", "Otis", "Pia", "Quinn", "Rosa", "Sam", "Tess", "Uma", "Vic", "Wes", "Zoe"];
    const towns = [["Claremont", "NH"], ["Claremont", "NH"], ["Claremont", "NH"], ["Newport", "NH"], ["Charlestown", "NH"], ["Windsor", "VT"]];
    const birth_years = {kid: 2017, teen: 2011, adult: 1975};
    const random = random_generator(42);
    names.forEach((name, n) => {
        const age_group = ["kid", "teen", "adult"][n % 3];
        const [city, state] = towns[n % towns.length];
        const id = Readathon.create_household(sqlite, {
            email: `reader${n}@example.org`,
            city,
            state,
            goal_minutes: 300,
            readers: [{name, age_group, birth_year: birth_years[age_group] - (n % 4)}],
        });
        const [reader] = Readathon.list_readers(sqlite, id);
        days.forEach(day => {
            if(random() < 0.75) {
                Readathon.add_entry(sqlite, reader.reader_id, {day, minutes: 10 + Math.round(random() * 50)});
            }
        });
    });
    // Paper readers entered at the desk
    for(const name of ["Bea", "Walt"]) {
        const id = Readathon.create_household(sqlite, {email: null, source: "desk", readers: [{name, age_group: "adult"}]});
        const [reader] = Readathon.list_readers(sqlite, id);
        days.slice(0, 7).forEach(day => Readathon.add_entry(sqlite, reader.reader_id, {day, minutes: 30, source: "desk"}));
    }

    // Recommendations: some live, some waiting for a volunteer
    const recs = [
        {title: "Educated", author: "Tara Westover", audience: "Grown-ups", why: "Couldn't put it down. Read it in three nights.", recommended_by: "Linda R.", read_during: 1, status: "approved"},
        {title: "Diary of a Wimpy Kid", author: "Jeff Kinney", audience: "Kids", why: "My brother and I read it together and laughed the whole time.", recommended_by: "Sam, age 10", read_during: 1, status: "approved"},
        {title: "A Gentleman in Moscow", author: "Amor Towles", audience: "Grown-ups", why: "If you liked The Lincoln Highway, read this next.", recommended_by: "Pat", read_during: 0, status: "pending"},
        {title: "Bluey: The Beach", author: "", audience: "Little kids", why: "My son asks for it every night!", recommended_by: "Ana", read_during: 1, status: "pending"},
    ];
    for(const {status, ...rec} of recs) {
        Readathon.create_recommendation(sqlite, null, {list: "community", ...rec});
    }
    for(const rec of Readathon.list_recommendations(sqlite, "pending").filter(r => ["Educated", "Diary of a Wimpy Kid"].includes(r.title))) {
        Readathon.review_recommendation(sqlite, rec.recommendation_id, "approved");
    }

    // Teams: the demo family is split across two, like a real family might be
    const by_name = name => sqlite.prepare("SELECT reader_id FROM readathon_readers WHERE name = :name").get({name}).reader_id;
    // Readers can be on more than one team: Renee reads with the committee and the Night Owls
    const team = (name, is_open, names) => Teams.create_team(sqlite, {name, is_open}, names.map(by_name));
    team("Fiske Friends Committee", 0, ["Renee", "Ava", "Ben", "Carmen", "Rosa"]);
    team("Ms. Rivera's 4th Grade", 0, ["Katie", "Dot", "Eli", "Fern", "Gus", "Sam", "Zoe"]);
    team("Stevens High Book Club", 0, ["Kai", "Lena", "Milo", "Nora"]);
    team("The Night Owls", 1, ["Hana", "Ike", "June", "Renee"]);
    team("Red River Diner Regulars", 1, ["Otis", "Pia", "Bea", "Walt"]);
    // Work out raffle entries from the sample reading
    Prizes.update_all_awards(sqlite);

    // Cheers for the demo family, and gifts to the whole read-a-thon
    const cheer = (reader, display_name, dollars, message, extra = {}) => Gifts.record_gift(sqlite, reader?.reader_id, {
        amount_cents: dollars * 100,
        display_name,
        message,
        hide_amount: 0,
        first_name: display_name ?? "Anonymous",
        last_name: "Example",
        email: "donor@example.org",
        ...extra,
    }, `demo_seed_${Gifts.new_cheer_code()}`, true);
    Gifts.cheer_code(sqlite, renee);
    Gifts.cheer_code(sqlite, katie);
    cheer(renee, "Grandma Jo", 25, "Proud of you! Keep reading!");
    cheer(renee, "The Martins", 10, null, {hide_amount: 1});
    cheer(katie, "Aunt Linda", 50, "Read on, Katie! Can't wait to hear about Dog Man.");
    cheer(katie, "Grandpa Ray", 20, "One more chapter!");
    [250, 100, 500, 75, 50, 150, 40, 300, 25, 60].forEach((dollars, i) => cheer(null, null, dollars, null, {first_name: `Donor${i}`}));

}

async function main() {
    // The dry run keeps its data in a file and starts empty; the meeting demo starts fresh with samples
    const sqlite = new DatabaseSync(DRY_RUN ? config.get("sqlite.filepath") : ":memory:");
    migrate(sqlite);
    // The read-a-thon's sample events (not in the migrations, so the live site never gets them by accident)
    seed_events(sqlite);
    if(!DRY_RUN) {
        await seed(sqlite);
    }
    await ensure_volunteer(sqlite);
    const port = Number(process.env.PORT ?? config.get("app.port"));
    // Keep the preview out of search results
    const preview = express();
    preview.set("trust proxy", 1);
    preview.use((req, res, next) => {
        res.set("X-Robots-Tag", "noindex, nofollow");
        next();
    });
    preview.get("/robots.txt", (req, res) => res.type("text/plain").send("User-agent: *\nDisallow: /\n"));
    preview.use(app.create(sqlite));
    // HOST=127.0.0.1 keeps it reachable only through nginx on a server
    const host = process.env.HOST || undefined;
    preview.listen(port, host, () => {
        if(DRY_RUN) {
            const settings = config.get("readathon");
            console.log(`\nRead-a-thon DRY RUN running: ${settings.starts} to ${settings.ends}, data in ${config.get("sqlite.filepath")}.`);
            console.log(`  Open:      http://localhost:${port}/readathon`);
            console.log("  Volunteer: volunteer@example.com / your READATHON_DEMO_PASSWORD");
            console.log("  Payments:  Stripe test mode. Use card 4242 4242 4242 4242, any future date, any CVC.");
            console.log(`  Emails:    ${Mailer.status().live ? `sending through ${Mailer.status().host}, links to ${config.get("app.domain")}` : "kept in the outbox at /plan/emails, not sent"}`);
            if(Mailer.status().problem) {
                console.log(`  PROBLEM:   ${Mailer.status().problem}`);
            }
            console.log("");
            return;
        }
        console.log(`\nRead-a-thon demo running (pretending today is ${Readathon.today()}).`);
        console.log(`  Open:      http://localhost:${port}/readathon`);
        console.log("  Family:    sign in as demo@example.com (the link shows on screen)");
        console.log(`  Volunteer: volunteer@example.com / ${process.env.READATHON_DEMO_PASSWORD ? "(your READATHON_DEMO_PASSWORD)" : "readathon"} at /readathon/volunteer (Volunteers link in the footer)`);
        console.log("  Timer:     add ?demo to the timer page address for a skip-ahead button");
        console.log(`  Emails:    ${Mailer.status().live ? `sending through ${Mailer.status().host}` : "kept in the outbox, not sent"}. See them at /plan/emails (sign in at /auth/login as the volunteer)\n`);
    });
}

main();
