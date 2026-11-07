const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Readathon = require("../lib/readathon");
const {DatabaseSync} = require("node:sqlite");
const {suite, test} = require("node:test");

const SETTINGS = {starts: "2027-01-01", ends: "2027-01-31", community_goal_minutes: 100000};
const entries = list => list.map(([day, minutes]) => ({day, minutes}));

suite("lib/readathon.js dates", () => {
    test("labels today, yesterday and other days", () => {
        assert.strictEqual(Readathon.label_day("2027-01-12", "2027-01-12"), "Today");
        assert.strictEqual(Readathon.label_day("2027-01-11", "2027-01-12"), "Yesterday");
        assert.strictEqual(Readathon.label_day("2027-01-01", "2027-01-12"), "Fri, Jan 1");
    });

    test("only days from the start up to today can be logged", () => {
        assert.deepStrictEqual(Readathon.loggable_days("2026-12-20", SETTINGS), []);
        assert.deepStrictEqual(Readathon.loggable_days("2027-01-03", SETTINGS), ["2027-01-03", "2027-01-02", "2027-01-01"]);
        assert.strictEqual(Readathon.loggable_days("2027-03-01", SETTINGS).length, 31);
    });

    test("uses the override date when one is set", () => {
        assert.strictEqual(Readathon.today(Date.now(), {today_override: "2027-01-12"}), "2027-01-12");
    });
});

suite("lib/readathon.js parse_join", () => {
    test("accepts a family with a goal and email", () => {
        const {errors, household} = Readathon.parse_join({
            readers: [{name: " Josh ", age_group: "adult"}, {name: "Maya", age_group: "kid"}, {name: "", age_group: "kid"}],
            goal: "15",
            email: "Josh@Example.com",
        });
        assert.deepStrictEqual(errors, []);
        assert.deepStrictEqual(household.readers.map(r => r.name), ["Josh", "Maya"]);
        assert.strictEqual(household.email, "josh@example.com");
        assert.strictEqual(household.goal_minutes, 15);
    });

    test("needs a reader, a goal from the list, and an email", () => {
        const {errors} = Readathon.parse_join({readers: [{name: "  "}], goal: "17", email: "nope"});
        assert.strictEqual(errors.length, 3);
    });

    test("treats an unknown age as a grown-up and caps at six readers", () => {
        const readers = Array.from({length: 8}, (_, i) => ({name: `R${i}`, age_group: "wizard"}));
        const {household} = Readathon.parse_join({readers, goal: "5", email: "a@b.co"});
        assert.strictEqual(household.readers.length, 6);
        assert.strictEqual(household.readers[0].age_group, "adult");
    });
});

suite("lib/readathon.js parse_log", () => {
    const today = "2027-01-12";

    test("accepts a chip choice or a typed number", () => {
        assert.strictEqual(Readathon.parse_log({minutes: "20", day: today}, today, "manual", SETTINGS).entry.minutes, 20);
        const typed = Readathon.parse_log({minutes: "other", minutes_other: "25", day: "2027-01-03"}, today, "manual", SETTINGS);
        assert.deepStrictEqual(typed.errors, []);
        assert.strictEqual(typed.entry.minutes, 25);
    });

    test("rejects missing minutes, future days and days before the start", () => {
        assert.strictEqual(Readathon.parse_log({minutes: "other", minutes_other: ""}, today, "manual", SETTINGS).errors.length, 1);
        assert.strictEqual(Readathon.parse_log({minutes: "20", day: "2027-01-13"}, today, "manual", SETTINGS).errors.length, 1);
        assert.strictEqual(Readathon.parse_log({minutes: "20", day: "2026-12-31"}, today, "manual", SETTINGS).errors.length, 1);
    });

    test("caps a timer session at 4 hours and a typed one at 10", () => {
        assert.strictEqual(Readathon.parse_log({minutes: "241"}, today, "timer", SETTINGS).errors.length, 1);
        assert.strictEqual(Readathon.parse_log({minutes: "241"}, today, "manual", SETTINGS).errors.length, 0);
        assert.strictEqual(Readathon.parse_log({minutes: "601"}, today, "manual", SETTINGS).errors.length, 1);
    });

    test("nothing can be logged before the read-a-thon starts", () => {
        const {errors} = Readathon.parse_log({minutes: "20"}, "2026-12-20", "manual", SETTINGS);
        assert.match(errors[0], /January 1/);
    });
});

suite("lib/readathon.js stats", () => {
    test("adds up minutes, days, streaks and weekly stickers", () => {
        const s = Readathon.stats(entries([
            ["2027-01-01", 45], ["2027-01-02", 30], ["2027-01-03", 20],
            ["2027-01-09", 10], ["2027-01-10", 25], ["2027-01-11", 30], ["2027-01-11", 5],
            ["2026-12-31", 99],
        ]), "2027-01-12", SETTINGS);
        assert.strictEqual(s.total, 165);
        assert.strictEqual(s.days_read, 6);
        assert.strictEqual(s.streak, 3, "today has no reading yet, so the streak counts back from yesterday");
        assert.strictEqual(s.best_streak, 3);
        assert.strictEqual(s.books, 5);
        assert.strictEqual(s.minutes_to_next_book, 15);
        assert.strictEqual(s.stickers, 2);
        assert.strictEqual(s.weeks.length, 5);
    });
});

suite("lib/readathon.js bookmark", () => {
    test("colors one book per 30 minutes and marks the new ones", () => {
        const mark = Readathon.bookmark(95, 40);
        assert.strictEqual(mark.number, 1);
        assert.strictEqual(mark.colored, 3);
        assert.deepStrictEqual(mark.cells.slice(0, 4).map(c => [c.filled, c.fresh]), [[true, false], [true, true], [true, true], [false, false]]);
    });

    test("a full bookmark stays full until the next book starts a new one", () => {
        assert.strictEqual(Readathon.bookmark(600).full, true);
        assert.strictEqual(Readathon.bookmark(600).number, 1);
        const second = Readathon.bookmark(630);
        assert.strictEqual(second.number, 2);
        assert.strictEqual(second.colored, 1);
    });
});

suite("lib/readathon.js bingo", () => {
    test("the free square plus a row of four makes a bingo", () => {
        const board = Readathon.bingo_board([10, 11, 13, 14], {});
        assert.strictEqual(board.bingos, 1);
        assert.strictEqual(board.to_bingo, 0);
    });

    test("automatic squares come from the reading log", () => {
        const off = Readathon.bingo_board([], {streak7: false, hours5: false, recommended: false});
        const on = Readathon.bingo_board([], {streak7: true, hours5: true, recommended: true});
        assert.strictEqual(off.count, 1);
        assert.strictEqual(on.count, 4);
        assert.strictEqual(on.squares[8].tappable, false);
    });

    test("event codes find their square, ignoring case", () => {
        assert.strictEqual(Readathon.event_code_square(" silent "), 1);
        assert.strictEqual(Readathon.event_code_square("nope"), -1);
        assert.strictEqual(Readathon.event_code_square(""), -1);
    });
});

suite("lib/readathon.js database", () => {
    const sqlite = new DatabaseSync(":memory:");
    const dirpath = path.join(__dirname, "..", "migrations");
    for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
        sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
    }

    test("creates a household, logs reading and totals the community", () => {
        const id = Readathon.create_household(sqlite, {
            email: "family@example.com",
            goal_minutes: 15,
            readers: [{name: "Josh", age_group: "adult"}, {name: "Maya", age_group: "kid"}],
        });
        const readers = Readathon.list_readers(sqlite, id);
        assert.deepStrictEqual(readers.map(r => [r.name, r.color]), [["Josh", 0], ["Maya", 1]]);
        assert.notStrictEqual(Readathon.find_household_by_email(sqlite, "FAMILY@example.com"), null);

        Readathon.add_entry(sqlite, readers[1].reader_id, {day: "2027-01-02", minutes: 20});
        Readathon.add_entry(sqlite, readers[1].reader_id, {day: "2026-12-30", minutes: 50});
        const totals = Readathon.community(sqlite, SETTINGS);
        assert.strictEqual(totals.minutes, 20, "reading before January 1 doesn't count");
        assert.strictEqual(totals.readers, 2);
    });

    test("approved recommendations join the book lists; pending ones don't", () => {
        Readathon.create_recommendation(sqlite, null, {title: "Ox-Cart Man Two", author: null, list: "community", audience: "Kids", why: null, recommended_by: "Ana", read_during: 1});
        assert.strictEqual(Readathon.books(sqlite, "community", "ox-cart man two").length, 0);
        const [pending] = Readathon.list_recommendations(sqlite, "pending");
        Readathon.review_recommendation(sqlite, pending.recommendation_id, "approved");
        assert.strictEqual(Readathon.books(sqlite, "community", "ox-cart man two").length, 1);
    });
});

const Gifts = require("../lib/readathon-gifts");

suite("lib/readathon-gifts.js parse_gift", () => {
    const VALID = {amount: "25", first_name: " Jo ", last_name: "Reyes", email: "jo@example.com", payment_method_id: "pm_1"};

    test("accepts a suggested amount and signs it with the first name", () => {
        const {errors, gift} = Gifts.parse_gift(VALID);
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(gift.amount_cents, 2500);
        assert.strictEqual(gift.display_name, "Jo");
    });

    test("parses a typed amount with a dollar sign", () => {
        const {errors, gift} = Gifts.parse_gift({...VALID, amount: "other", amount_other: "$1,000.50"});
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(gift.amount_cents, 100050);
    });

    test("keeps a chosen name and message, or hides the name when anonymous", () => {
        const named = Gifts.parse_gift({...VALID, display_name: "Grandma Jo", message: "Go Maya!"}).gift;
        assert.strictEqual(named.display_name, "Grandma Jo");
        assert.strictEqual(named.message, "Go Maya!");
        assert.strictEqual(Gifts.parse_gift({...VALID, display_name: "Grandma Jo", anonymous: "1"}).gift.display_name, null);
    });

    test("rejects small amounts, missing names and bad emails", () => {
        assert.strictEqual(Gifts.parse_gift({...VALID, amount: "other", amount_other: "4"}).errors.length, 1);
        assert.strictEqual(Gifts.parse_gift({...VALID, first_name: "", email: "nope"}).errors.length, 2);
    });

    test("needs a card unless payments are faked for a demo", () => {
        assert.strictEqual(Gifts.parse_gift({...VALID, payment_method_id: ""}).errors.length, 1);
        assert.strictEqual(Gifts.parse_gift({...VALID, payment_method_id: ""}, false).errors.length, 0);
    });
});

suite("lib/readathon-gifts.js database", () => {
    const sqlite = new DatabaseSync(":memory:");
    const dirpath = path.join(__dirname, "..", "migrations");
    for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
        sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
    }
    const id = Readathon.create_household(sqlite, {email: "g@example.com", readers: [{name: "Maya", age_group: "kid"}]});
    const [maya] = Readathon.list_readers(sqlite, id);
    const gift = (cents, extra = {}) => ({amount_cents: cents, display_name: "Jo", message: null, hide_amount: 0, first_name: "Jo", last_name: "R", email: "jo@example.com", ...extra});

    test("a reader's cheer code is made once and finds the reader", () => {
        const code = Gifts.cheer_code(sqlite, maya);
        assert.match(code, /^[A-Za-z0-9_-]{8}$/);
        assert.strictEqual(Gifts.cheer_code(sqlite, Readathon.get_reader(sqlite, maya.reader_id)), code);
        assert.strictEqual(Gifts.reader_by_cheer_code(sqlite, code).name, "Maya");
        assert.strictEqual(Gifts.reader_by_cheer_code(sqlite, "../etc"), null);
    });

    test("cheers show names and messages but never emails, and can hide amounts", () => {
        Gifts.record_gift(sqlite, maya.reader_id, gift(2500, {message: "Go!"}), "pi_1");
        Gifts.record_gift(sqlite, maya.reader_id, gift(1000, {hide_amount: 1, display_name: null}), "pi_2");
        const cheers = Gifts.reader_cheers(sqlite, maya.reader_id);
        assert.strictEqual(cheers.total, "$35");
        assert.deepStrictEqual(cheers.cheers.map(c => [c.name, c.amount]).sort(), [["Jo", "$25"], ["Someone", null]]);
        assert.ok(!JSON.stringify(cheers).includes("jo@example.com"));
    });

    test("totals add the sponsor match per hour, up to the cap", () => {
        const settings = {fundraising: {goal_usd: 5000, match_per_hour_usd: 1, match_cap_usd: 100}};
        Gifts.record_gift(sqlite, null, gift(10000), "pi_3");
        const some = Gifts.totals(sqlite, 125, settings);
        assert.strictEqual(some.match, "$2");
        assert.strictEqual(some.total, "$137");
        const capped = Gifts.totals(sqlite, 60 * 500, settings);
        assert.strictEqual(capped.match, "$100");
        assert.strictEqual(capped.match_capped, true);
    });
});

const Teams = require("../lib/readathon-teams");

suite("lib/readathon-teams.js", () => {
    const sqlite = new DatabaseSync(":memory:");
    const dirpath = path.join(__dirname, "..", "migrations");
    for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
        sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
    }
    const family = Readathon.create_household(sqlite, {email: "t@example.com", readers: [{name: "Josh", age_group: "adult"}, {name: "Maya", age_group: "kid"}]});
    const [josh, maya] = Readathon.list_readers(sqlite, family);
    const other = Readathon.create_household(sqlite, {email: "o@example.com", readers: [{name: "Ava", age_group: "adult"}]});
    const [ava] = Readathon.list_readers(sqlite, other);

    test("parse_team needs a name, a goal from the list, and readers from your own home", () => {
        const ok = Teams.parse_team({name: " Night  Owls ", goal_hours: "25", reader_ids: [String(josh.reader_id), String(ava.reader_id)], is_open: "1"}, [josh.reader_id, maya.reader_id]);
        assert.deepStrictEqual(ok.errors, []);
        assert.strictEqual(ok.team.name, "Night Owls");
        assert.strictEqual(ok.team.goal_minutes, 1500);
        assert.strictEqual(ok.team.is_open, 1);
        assert.deepStrictEqual(ok.reader_ids, [josh.reader_id], "someone else's reader is ignored");
        assert.strictEqual(Teams.parse_team({name: "NO", goal_hours: "7"}, [josh.reader_id]).errors.length, 3);
    });

    test("a team adds up its members' January minutes and who read today", () => {
        const code = Teams.create_team(sqlite, {name: "Committee", goal_minutes: 600}, [josh.reader_id]);
        const team = Teams.get_by_code(sqlite, code);
        Teams.join(sqlite, team.team_id, [ava.reader_id]);
        Readathon.add_entry(sqlite, josh.reader_id, {day: "2027-01-12", minutes: 60});
        Readathon.add_entry(sqlite, ava.reader_id, {day: "2027-01-11", minutes: 120});
        Readathon.add_entry(sqlite, ava.reader_id, {day: "2026-12-31", minutes: 500});
        const p = Teams.progress(sqlite, team, "2027-01-12", SETTINGS);
        assert.strictEqual(p.total, 180);
        assert.strictEqual(p.percent, 30);
        assert.strictEqual(p.read_today, 1);
        assert.deepStrictEqual(p.members.map(m => [m.name, m.share]), [["Ava", 67], ["Josh", 33]]);
        assert.strictEqual(p.total_label, "3 hours");
    });

    test("kids and grown-ups can be on different teams; joining another team moves you", () => {
        const class_code = Teams.create_team(sqlite, {name: "4th Grade", goal_minutes: 6000, is_open: 0}, [maya.reader_id]);
        const class_team = Teams.get_by_code(sqlite, class_code);
        assert.notStrictEqual(Readathon.get_reader(sqlite, maya.reader_id).team_id, Readathon.get_reader(sqlite, josh.reader_id).team_id);
        Teams.join(sqlite, class_team.team_id, [ava.reader_id]);
        assert.strictEqual(Readathon.get_reader(sqlite, ava.reader_id).team_id, class_team.team_id);
        Teams.leave(sqlite, ava.reader_id);
        assert.strictEqual(Readathon.get_reader(sqlite, ava.reader_id).team_id, null);
    });

    test("hidden teams and empty teams stay off the public list", () => {
        const names = () => Teams.list_public(sqlite, SETTINGS).map(t => t.name);
        assert.ok(names().includes("4th Grade"));
        const team = Teams.get_by_code(sqlite, Teams.list_public(sqlite, SETTINGS).find(t => t.name === "4th Grade").code);
        Teams.set_hidden(sqlite, team.team_id, true);
        assert.ok(!names().includes("4th Grade"));
        Teams.create_team(sqlite, {name: "Ghost Team", goal_minutes: 600}, []);
        assert.ok(!names().includes("Ghost Team"));
    });
});
