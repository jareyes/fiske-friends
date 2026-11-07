#!/usr/bin/env node
// Runs the site with a throwaway in-memory database full of sample read-a-thon data,
// pretending today is January 12, 2027. Nothing is written to disk.
//
//   node bin/readathon-demo.js          then open http://localhost:3000/readathon
//
// Sample family:   demo@example.com  (Renee and Katie). Use "Sign in"; the link appears on screen.
// Volunteer desk:  volunteer@example.com at /readathon/volunteer (or the "Volunteers" footer link)
//                  password "readathon", or whatever READATHON_DEMO_PASSWORD is set to
//
// To share it as a preview on the server, see events/202701-readathon/README.md.
const path = require("node:path");
const fs = require("node:fs");
const process = require("node:process");

// Settings for running on a laptop: no HTTPS, no real domain, demo date and visible sign-in links
process.env.NODE_CONFIG = JSON.stringify({
    session: {secret: "readathon-demo-only", cookie: {secure: false, domain: null, sameSite: "lax"}},
    // Placeholder keys so no real payment can ever happen from the demo
    stripe: {secret_key: "sk_test_readathon_demo", publishable_key: "pk_test_readathon_demo"},
    readathon: {today_override: process.env.READATHON_TODAY ?? "2027-01-12", show_sign_in_links: true, fake_payments: true},
    ...JSON.parse(process.env.NODE_CONFIG ?? "{}"),
});
process.chdir(path.join(__dirname, ".."));

const config = require("config");
const {DatabaseSync} = require("node:sqlite");
const Gifts = require("../lib/readathon-gifts");
const Readathon = require("../lib/readathon");
const Teams = require("../lib/readathon-teams");
const User = require("../lib/user");
const app = require("./app");
const express = require("express");

const VOLUNTEER_PASSWORD = process.env.READATHON_DEMO_PASSWORD || "readathon";

const MIGRATIONS_DIRPATH = path.join(__dirname, "..", "migrations");

function migrate(sqlite) {
    const files = fs.readdirSync(MIGRATIONS_DIRPATH).filter(f => f.endsWith(".sql")).sort();
    for(const file of files) {
        sqlite.exec(fs.readFileSync(path.join(MIGRATIONS_DIRPATH, file), "utf8"));
    }
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
        wants_updates: 1,
        goal_minutes: 30,
        readers: [
            {name: "Renee", age_group: "adult", goal_minutes: 30},
            {name: "Katie", age_group: "kid", goal_minutes: 15},
        ],
    });
    const [renee, katie] = Readathon.list_readers(sqlite, household_id);
    const renee_log = [45, 30, 20, 25, 40, 0, 15, 35, 60, 30, 25];
    const katie_log = [15, 20, 15, 20, 15, 25, 20, 10, 30, 15, 20];
    days.forEach((day, i) => {
        if(renee_log[i]) {
            Readathon.add_entry(sqlite, renee.reader_id, {day, minutes: renee_log[i], title: "The Lincoln Highway", format: "Book"});
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
    const random = random_generator(42);
    names.forEach((name, n) => {
        const id = Readathon.create_household(sqlite, {
            email: `reader${n}@example.org`,
            goal_minutes: 15,
            readers: [{name, age_group: ["kid", "teen", "adult"][n % 3]}],
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
    const team = (name, hours, is_open, names) => Teams.create_team(sqlite, {name, goal_minutes: hours * 60, is_open}, names.map(by_name));
    team("Fiske Friends Committee", 50, 0, ["Renee", "Ava", "Ben", "Carmen", "Rosa"]);
    team("Ms. Rivera's 4th Grade", 100, 0, ["Katie", "Dot", "Eli", "Fern", "Gus", "Sam", "Zoe"]);
    team("Stevens High Book Club", 50, 0, ["Kai", "Lena", "Milo", "Nora"]);
    team("The Night Owls", 25, 1, ["Hana", "Ike", "June"]);
    team("Red River Diner Regulars", 10, 1, ["Otis", "Pia", "Bea", "Walt"]);

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

    // A volunteer who can open the desk page
    const user = User.create(sqlite, {
        first_name: "Desk",
        last_name: "Volunteer",
        email: "volunteer@example.com",
        password_hash: await User.hash_password(VOLUNTEER_PASSWORD),
    });
    const {group_id} = sqlite.prepare("SELECT group_id FROM groups WHERE name = 'admin'").get();
    sqlite.prepare("INSERT INTO permissions (user_id, group_id) VALUES (:user_id, :group_id)").run({user_id: user.user_id, group_id});
}

async function main() {
    const sqlite = new DatabaseSync(":memory:");
    migrate(sqlite);
    await seed(sqlite);
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
        console.log(`\nRead-a-thon demo running (pretending today is ${Readathon.today()}).`);
        console.log(`  Open:      http://localhost:${port}/readathon`);
        console.log("  Family:    sign in as demo@example.com (the link shows on screen)");
        console.log(`  Volunteer: volunteer@example.com / ${process.env.READATHON_DEMO_PASSWORD ? "(your READATHON_DEMO_PASSWORD)" : "readathon"} at /readathon/volunteer (Volunteers link in the footer)`);
        console.log("  Timer:     add ?demo to the timer page address for a skip-ahead button\n");
    });
}

main();
