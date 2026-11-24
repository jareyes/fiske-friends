const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Prizes = require("../lib/readathon-prizes");
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
    const today = "2026-11-15";
    const place = {city: "Claremont", state: "NH"};

    test("accepts a family with birth years, a goal, an email and a town", () => {
        const {errors, household} = Readathon.parse_join({
            readers: [
                {name: " Josh ", age_group: "adult", birth_year: "1980"},
                {name: "Maya", age_group: "kid", birth_year: " 2017 "},
                {name: "", age_group: "kid", birth_year: ""},
            ],
            goal: "300",
            email: "Josh@Example.com",
            city: "  West   Claremont ",
            state: "nh",
        }, today);
        assert.deepStrictEqual(errors, []);
        assert.deepStrictEqual(household.readers.map(r => [r.name, r.birth_year]), [["Josh", 1980], ["Maya", 2017]]);
        assert.strictEqual(household.email, "josh@example.com");
        assert.strictEqual(household.goal_minutes, 300);
        assert.strictEqual(household.city, "West Claremont");
        assert.strictEqual(household.state, "NH");
    });

    test("needs a reader, a goal from the list, an email, and a town and state", () => {
        const {errors} = Readathon.parse_join({readers: [{name: "  "}], goal: "17", email: "nope", city: " ", state: "ZZ"}, today);
        assert.strictEqual(errors.length, 4);
    });

    test("needs a believable birth year for each reader, by name", () => {
        const {errors} = Readathon.parse_join({
            readers: [
                {name: "Josh", birth_year: ""},
                {name: "Maya", birth_year: "17"},
                {name: "Ava", birth_year: "2027"},
                {name: "Old", birth_year: "1899"},
                {name: "Ok", birth_year: "2026"},
            ],
            goal: "300",
            email: "a@b.co",
            ...place,
        }, today);
        assert.deepStrictEqual(errors, [
            "Add the year Josh was born, like 2017.",
            "Add the year Maya was born, like 2017.",
            "Add the year Ava was born, like 2017.",
            "Add the year Old was born, like 2017.",
        ]);
    });

    test("keeps what was typed so the form can be shown again", () => {
        const {rows} = Readathon.parse_join({readers: [{name: "Maya", age_group: "kid", birth_year: "20l7"}], ...place}, today);
        assert.deepStrictEqual(rows, [{name: "Maya", age_group: "kid", birth_year: "20l7"}]);
    });

    test("treats an unknown age as a grown-up and caps at six readers", () => {
        const readers = Array.from({length: 8}, (_, i) => ({name: `R${i}`, age_group: "wizard", birth_year: "1990"}));
        const {household} = Readathon.parse_join({readers, goal: "120", email: "a@b.co", ...place}, today);
        assert.strictEqual(household.readers.length, 6);
        assert.strictEqual(household.readers[0].age_group, "adult");
    });
});

suite("lib/readathon.js monthly goals", () => {
    test("hints spread the goal over every day of January", () => {
        // The board's math: 20 hours is about 39 minutes a day, 5 hours about 10
        assert.deepStrictEqual(Readathon.goal_choices("2026-12-01", 300, SETTINGS).presets.map(g => [g.label, g.hint, g.current]), [
            ["2 hours", "about 5 minutes a day", false],
            ["5 hours", "about 10 minutes a day", true],
            ["10 hours", "about 20 minutes a day", false],
            ["20 hours", "about 40 minutes a day", false],
            ["40 hours", "about 1 hour 15 minutes a day", false],
        ]);
    });

    test("hints for late joiners say it's for the rest of the month", () => {
        // January 20: 12 days left
        assert.deepStrictEqual(Readathon.goal_choices("2027-01-20", null, SETTINGS).presets.map(g => g.hint), [
            "about 10 minutes a day for the rest of January",
            "about 25 minutes a day for the rest of January",
            "about 50 minutes a day for the rest of January",
            "about 1 hour 45 minutes a day for the rest of January",
            "about 3 hours 15 minutes a day for the rest of January",
        ]);
        assert.strictEqual(Readathon.goal_choices("2027-01-31", null, SETTINGS).presets[0].hint, "about 2 hours today");
    });

    test("my own goal: any number of hours, 1 or more", () => {
        assert.deepStrictEqual(Readathon.parse_goal({goal: "600"}), {minutes: 600});
        assert.deepStrictEqual(Readathon.parse_goal({goal: "own", goal_hours: "37"}), {minutes: 2220});
        assert.deepStrictEqual(Readathon.parse_goal({goal: "own", goal_hours: "1,5"}), {minutes: 90});
        assert.deepStrictEqual(Readathon.parse_goal({goal_hours: "100"}), {minutes: 6000}, "typed hours without picking the choice");
        assert.deepStrictEqual(Readathon.parse_goal({goal: "600", goal_hours: "100"}), {minutes: 600}, "a picked choice wins");
        assert.match(Readathon.parse_goal({goal: "own", goal_hours: "0.5"}).error, /at least 1 hour/);
        assert.match(Readathon.parse_goal({goal: "own", goal_hours: ""}).error, /how many hours/);
        assert.match(Readathon.parse_goal({goal: "own", goal_hours: "900"}).error, /more hours than January/);
        assert.match(Readathon.parse_goal({goal: "777"}).error, /Pick a goal/);
    });

    test("a goal that isn't one of the choices shows up as my own goal", () => {
        const choices = Readathon.goal_choices("2026-12-01", 2220, SETTINGS);
        assert.ok(choices.presets.every(g => !g.current));
        assert.deepStrictEqual([choices.own.picked, choices.own.hours, choices.own.hint], [true, "37", "about 1 hour 15 minutes a day"]);
        const preset = Readathon.goal_choices("2026-12-01", 600, SETTINGS);
        assert.deepStrictEqual([preset.own.picked, preset.own.hours], [false, ""]);
        assert.strictEqual(Readathon.goal_label(2220), "37 hours");
        assert.strictEqual(Readathon.goal_label(90), "1.5 hours");
    });

    test("pace is measured from the day a reader joined, or the first day they logged", () => {
        const joined_ms = Date.UTC(2027, 0, 15, 17); // January 15, midday in New Hampshire
        assert.strictEqual(Readathon.reader_start_day({created_ms: joined_ms}, [], SETTINGS), "2027-01-15");
        assert.strictEqual(Readathon.reader_start_day({created_ms: joined_ms}, entries([["2027-01-12", 20]]), SETTINGS), "2027-01-12");
        assert.strictEqual(Readathon.reader_start_day({created_ms: Date.UTC(2026, 10, 15)}, [], SETTINGS), "2027-01-01");
    });

    test("on track compares against the days before today since they started", () => {
        // 5 hours over January: 9.7 minutes a day. By January 11, ten days are done (97 minutes).
        assert.strictEqual(Readathon.goal_progress(100, 300, "2027-01-01", "2027-01-11", SETTINGS).status, "on_track");
        const behind = Readathon.goal_progress(60, 300, "2027-01-01", "2027-01-11", SETTINGS);
        assert.strictEqual(behind.status, "keep_going");
        assert.strictEqual(behind.message, "Keep going, there's still plenty of time!");
        assert.doesNotMatch(behind.message, /behind/i);
        // Someone who joined on January 11 with nothing yet is right on track
        assert.strictEqual(Readathon.goal_progress(0, 300, "2027-01-11", "2027-01-11", SETTINGS).status, "on_track");
    });

    test("suggests how much to read today and notices when it's done", () => {
        // January 11, 5-hour goal, 60 minutes read before today: 240 left over 21 days is about 11 a day
        assert.deepStrictEqual(Readathon.today_plan(60, 0, 300, "2027-01-11", SETTINGS), {done: false, text: "Today's Goal: 10 minutes"});
        assert.deepStrictEqual(Readathon.today_plan(65, 5, 300, "2027-01-11", SETTINGS), {done: false, text: "Today's Goal: 5 minutes so far. 5 minutes left!"});
        assert.deepStrictEqual(Readathon.today_plan(80, 20, 300, "2027-01-11", SETTINGS), {done: true, text: "Today's Goal: 20 minutes. Nice job!"});
        assert.strictEqual(Readathon.today_plan(68, 8, 300, "2027-01-11", SETTINGS).text, "Today's Goal: 8 minutes so far. 2 minutes left!");
        // A 20-hour goal late in the month: 1,200 minutes over 7 days
        assert.strictEqual(Readathon.today_plan(0, 0, 1200, "2027-01-25", SETTINGS).text, "Today's Goal: 2 hours, 50 minutes");
        // Goal already reached before today
        assert.deepStrictEqual(Readathon.today_plan(320, 0, 300, "2027-01-20", SETTINGS), {done: false, text: "Not yet today."});
        assert.deepStrictEqual(Readathon.today_plan(330, 10, 300, "2027-01-20", SETTINGS), {done: true, text: "Today: 10 minutes read."});
    });

    test("reports a reached goal, the end of the month, and labels", () => {
        const done = Readathon.goal_progress(310, 300, "2027-01-01", "2027-01-20", SETTINGS);
        assert.deepStrictEqual([done.status, done.percent, done.total_label, done.goal_label], ["reached", 100, "5 hours, 10 minutes", "5 hours"]);
        assert.strictEqual(Readathon.goal_progress(100, 300, "2027-01-01", "2027-02-03", SETTINGS).status, "over");
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
    test("adds up minutes, days and streaks", () => {
        const s = Readathon.stats(entries([
            ["2027-01-01", 45], ["2027-01-02", 30], ["2027-01-03", 20],
            ["2027-01-09", 10], ["2027-01-10", 25], ["2027-01-11", 30], ["2027-01-11", 5],
            ["2026-12-31", 99],
        ]), "2027-01-12", SETTINGS);
        assert.strictEqual(s.total, 165);
        assert.strictEqual(s.days_read, 6);
        assert.strictEqual(s.streak, 3, "today has no reading yet, so the streak counts back from yesterday");
        assert.strictEqual(s.best_streak, 3);
    });
});

suite("lib/readathon.js duration_label", () => {
    test("says hours and minutes the way people do", () => {
        assert.strictEqual(Readathon.duration_label(0), "0 minutes");
        assert.strictEqual(Readathon.duration_label(1), "1 minute");
        assert.strictEqual(Readathon.duration_label(45), "45 minutes");
        assert.strictEqual(Readathon.duration_label(60), "1 hour");
        assert.strictEqual(Readathon.duration_label(190), "3 hours, 10 minutes");
        assert.strictEqual(Readathon.duration_label(61), "1 hour, 1 minute");
    });
});

suite("lib/readathon.js calendars and the reading log", () => {
    const by_day = {"2027-01-10": 30, "2027-01-11": 10};

    test("this week runs Sunday to Saturday, marking days read, today and days ahead", () => {
        const week = Readathon.week_strip(by_day, "2027-01-12", SETTINGS);
        assert.deepStrictEqual(week.map(d => d.number), [10, 11, 12, 13, 14, 15, 16]);
        assert.deepStrictEqual(week.map(d => d.read), [true, true, false, false, false, false, false]);
        assert.strictEqual(week[2].is_today, true);
        assert.deepStrictEqual(week.map(d => d.future), [false, false, false, true, true, true, true]);
        assert.strictEqual(week[0].label, "Sunday, January 10: 30 minutes");
        // The first week of January starts in December
        const first = Readathon.week_strip({}, "2027-01-01", SETTINGS);
        assert.deepStrictEqual(first.map(d => d.outside), [true, true, true, true, true, false, false]);
    });

    test("the calendar covers January in whole weeks, shaded by minutes", () => {
        const weeks = Readathon.month_calendar({...by_day, "2027-01-01": 75}, "2027-01-12", SETTINGS);
        assert.strictEqual(weeks.length, 6);
        assert.ok(weeks.every(week => week.length === 7));
        const days = weeks.flat().filter(d => !d.outside);
        assert.strictEqual(days.length, 31);
        assert.deepStrictEqual([days[0].day, days[0].level], ["2027-01-01", 4]);
        assert.deepStrictEqual([days[9].level, days[10].level, days[11].level], [3, 1, 0]);
    });

    test("entries are grouped by week with totals, and books add up across spellings", () => {
        const log = [
            {entry_id: 4, day: "2027-01-12", minutes: 20, title: "Hatchet"},
            {entry_id: 3, day: "2027-01-10", minutes: 30, title: " hatchet ", format: "Book"},
            {entry_id: 2, day: "2027-01-02", minutes: 45, title: null},
            {entry_id: 1, day: "2027-01-01", minutes: 15, title: "Frog and Toad"},
        ];
        const weeks = Readathon.log_by_week(log, "2027-01-12", SETTINGS);
        assert.deepStrictEqual(weeks.map(w => [w.label, w.total_label, w.entries.length, w.is_this_week]), [
            ["Jan 10 to 16", "50 min", 2, true],
            ["Jan 1 to 2", "1 hr", 2, false],
        ]);
        assert.strictEqual(weeks[0].entries[0].day_label, "Today");
        const books = Readathon.books_read(log, "2027-01-12");
        assert.deepStrictEqual(books.map(b => [b.title, b.minutes_label, b.sessions, b.last_label]), [
            ["Hatchet", "50 min", 2, "today"],
            ["Frog and Toad", "15 min", 1, "Fri, Jan 1"],
        ]);
    });
});

suite("lib/readathon.js duration_short", () => {
    test("keeps big numbers short", () => {
        assert.deepStrictEqual([0, 45, 60, 205, 1200].map(Readathon.duration_short), ["0 min", "45 min", "1 hr", "3 hr 25 min", "20 hr"]);
    });
});

suite("lib/readathon.js bingo", () => {
    const card = Readathon.bingo_card("adult");

    test("every card follows the rules", () => {
        for(const age of ["kid", "teen", "adult"]) {
            assert.deepStrictEqual(Readathon.bingo_card_problems(Readathon.bingo_card(age)), [], `the ${age} card`);
        }
    });

    test("the rule check explains what's wrong", () => {
        const squares = card.squares.slice(0, 24).map(square => ({...square}));
        squares[1] = {label: "Teen night", kind: "event", code: "teen night"};
        squares[12] = {label: "Read a comic"};
        squares[3] = {label: "Read every day", kind: "auto", key: "daily"};
        assert.deepStrictEqual(Readathon.bingo_card_problems({title: "Test", squares}), [
            "has 24 squares instead of 25",
            "the middle square isn't free",
            'square 2 ("Teen night") needs a code in capital letters',
            'square 4 ("Read every day") has an unknown automatic key "daily"',
        ]);
    });

    test("readers get the card for their age group", () => {
        assert.strictEqual(Readathon.bingo_card("kid").title, "Kids' card");
        assert.strictEqual(Readathon.bingo_card("teen").title, "Teen card");
        assert.strictEqual(Readathon.bingo_card("adult").title, "Grown-up card");
        assert.strictEqual(Readathon.bingo_card("wizard").title, "Grown-up card");
    });

    test("the free square plus a row of four makes a bingo", () => {
        const board = Readathon.bingo_board(card, [10, 11, 13, 14], {});
        assert.strictEqual(board.bingos, 1);
        assert.strictEqual(board.to_bingo, 0);
        assert.strictEqual(board.title, "Grown-up card");
    });

    test("automatic squares come from the reading log", () => {
        const off = Readathon.bingo_board(card, [], {streak7: false, hours5: false, recommended: false});
        const on = Readathon.bingo_board(card, [], {streak7: true, hours5: true, recommended: true});
        assert.strictEqual(off.count, 1);
        assert.strictEqual(on.count, 4);
        assert.strictEqual(on.squares[8].tappable, false);
    });

    test("lists automatic squares that just turned on", () => {
        const earned = Readathon.newly_earned_squares(card, {streak7: true, hours5: false}, {streak7: true, hours5: true});
        assert.deepStrictEqual(earned.map(square => square.label), ["Read for 5 hours in all"]);
        assert.deepStrictEqual(Readathon.newly_earned_squares(card, {hours5: true}, {hours5: true}), []);
    });

    test("event codes find their square on the reader's card, ignoring case", () => {
        assert.strictEqual(Readathon.event_code_square(card, " silent "), 1);
        assert.strictEqual(Readathon.event_code_square(card, "nope"), -1);
        assert.strictEqual(Readathon.event_code_square(card, ""), -1);
        const kid_card = {title: "Kids' card", squares: card.squares.map(square => square.code === "AUTHOR" ? {label: "Read a picture book"} : square)};
        assert.strictEqual(Readathon.event_code_square(kid_card, "AUTHOR"), -1, "not on this card");
        assert.strictEqual(Readathon.is_event_code("author"), true, "but a real event");
        assert.strictEqual(Readathon.is_event_code("nope"), false);
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
            city: "Claremont",
            state: "NH",
            goal_minutes: 300,
            readers: [{name: "Josh", age_group: "adult", birth_year: 1980}, {name: "Maya", age_group: "kid", birth_year: 2017}],
        });
        const readers = Readathon.list_readers(sqlite, id);
        assert.deepStrictEqual(readers.map(r => [r.name, r.color, r.birth_year]), [["Josh", 0, 1980], ["Maya", 1, 2017]]);
        const household = Readathon.get_household(sqlite, id);
        assert.deepStrictEqual([household.city, household.state], ["Claremont", "NH"]);
        assert.notStrictEqual(Readathon.find_household_by_email(sqlite, "FAMILY@example.com"), null);

        Readathon.add_entry(sqlite, readers[1].reader_id, {day: "2027-01-02", minutes: 20});
        Readathon.add_entry(sqlite, readers[1].reader_id, {day: "2026-12-30", minutes: 50});
        const totals = Readathon.community(sqlite, SETTINGS);
        assert.strictEqual(totals.minutes, 20, "reading before January 1 doesn't count");
        assert.strictEqual(totals.readers, 2);
    });

    test("a reader can change or remove their own entries, but not someone else's", () => {
        const id = Readathon.create_household(sqlite, {email: "edit@example.com", readers: [{name: "Lou", age_group: "adult"}]});
        const [lou] = Readathon.list_readers(sqlite, id);
        Readathon.add_entry(sqlite, lou.reader_id, {day: "2027-01-03", minutes: 20, source: "timer"});
        const [entry] = Readathon.list_entries(sqlite, lou.reader_id);
        Readathon.update_entry(sqlite, lou.reader_id, entry.entry_id, {day: "2027-01-04", minutes: 35, title: "Hatchet", format: "Book"});
        const changed = Readathon.get_entry(sqlite, lou.reader_id, entry.entry_id);
        assert.deepStrictEqual([changed.day, changed.minutes, changed.title, changed.format, changed.source], ["2027-01-04", 35, "Hatchet", "Book", "timer"]);

        const other_reader_id = lou.reader_id + 1000;
        assert.strictEqual(Readathon.get_entry(sqlite, other_reader_id, entry.entry_id), null);
        Readathon.update_entry(sqlite, other_reader_id, entry.entry_id, {day: "2027-01-05", minutes: 600});
        Readathon.delete_entry(sqlite, other_reader_id, entry.entry_id);
        assert.strictEqual(Readathon.get_entry(sqlite, lou.reader_id, entry.entry_id).minutes, 35, "untouched");

        Readathon.delete_entry(sqlite, lou.reader_id, entry.entry_id);
        assert.strictEqual(Readathon.get_entry(sqlite, lou.reader_id, entry.entry_id), null);
    });

    test("approved recommendations join the book lists; pending ones don't", () => {
        const Books = require("../lib/readathon-books");
        const listed = () => Books.browse(sqlite, {list: "community"}).filter(b => b.title === "Ox-Cart Man Two").length;
        Readathon.create_recommendation(sqlite, null, {title: "Ox-Cart Man Two", author: null, list: "community", audience: "Kids", why: null, recommended_by: "Ana", read_during: 1});
        assert.strictEqual(listed(), 0);
        const [pending] = Readathon.list_recommendations(sqlite, "pending");
        Readathon.review_recommendation(sqlite, pending.recommendation_id, "approved");
        assert.strictEqual(listed(), 1);
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

    test("a reader's note for their cheer page is tidied, capped, and cleared when blank", () => {
        assert.strictEqual(Gifts.set_sponsor_note(sqlite, maya.reader_id, "  I love\n\n  dragons!  "), "I love dragons!");
        assert.strictEqual(Readathon.get_reader(sqlite, maya.reader_id).sponsor_note, "I love dragons!");
        assert.strictEqual(Gifts.set_sponsor_note(sqlite, maya.reader_id, "x".repeat(500)).length, Gifts.NOTE_MAX);
        assert.strictEqual(Gifts.set_sponsor_note(sqlite, maya.reader_id, "   "), null);
        assert.strictEqual(Readathon.get_reader(sqlite, maya.reader_id).sponsor_note, null);
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

suite("lib/readathon-teams.js and lib/readathon-prizes.js", () => {
    const sqlite = new DatabaseSync(":memory:");
    const dirpath = path.join(__dirname, "..", "migrations");
    for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
        sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
    }
    // Goals: Josh 5 hours, Maya 2 hours, Ava 5 hours
    const family = Readathon.create_household(sqlite, {email: "t@example.com", readers: [
        {name: "Josh", age_group: "adult", goal_minutes: 300},
        {name: "Maya", age_group: "kid", goal_minutes: 120},
    ]});
    const [josh, maya] = Readathon.list_readers(sqlite, family);
    const other = Readathon.create_household(sqlite, {email: "o@example.com", readers: [{name: "Ava", age_group: "adult", goal_minutes: 300}]});
    const [ava] = Readathon.list_readers(sqlite, other);
    const log = (reader, day, minutes) => {
        Readathon.add_entry(sqlite, reader.reader_id, {day, minutes});
        return Prizes.update_awards(sqlite, reader.reader_id);
    };

    test("parse_team needs a name and readers from your own home", () => {
        const ok = Teams.parse_team({name: " Night  Owls ", reader_ids: [String(josh.reader_id), String(ava.reader_id)], is_open: "1"}, [josh.reader_id, maya.reader_id]);
        assert.deepStrictEqual(ok.errors, []);
        assert.strictEqual(ok.team.name, "Night Owls");
        assert.strictEqual(ok.team.is_open, 1);
        assert.deepStrictEqual(ok.reader_ids, [josh.reader_id], "someone else's reader is ignored");
        assert.strictEqual(Teams.parse_team({name: "NO"}, [josh.reader_id]).errors.length, 2);
    });

    test("a team's goal is its members' goals added up, and everyone's minutes count", () => {
        const team = Teams.get_by_code(sqlite, Teams.create_team(sqlite, {name: "Committee"}, [josh.reader_id]));
        Teams.join(sqlite, team.team_id, [ava.reader_id]);
        Readathon.add_entry(sqlite, josh.reader_id, {day: "2027-01-12", minutes: 60});
        Readathon.add_entry(sqlite, ava.reader_id, {day: "2027-01-11", minutes: 120});
        Readathon.add_entry(sqlite, ava.reader_id, {day: "2026-12-31", minutes: 500});
        const p = Teams.progress(sqlite, team, "2027-01-12", SETTINGS);
        assert.strictEqual(p.goal_minutes, 600);
        assert.strictEqual(p.goal_label, "10 hours");
        assert.strictEqual(p.total, 180, "reading before January doesn't count");
        assert.strictEqual(p.percent, 30);
        assert.strictEqual(p.read_today, 1);
        assert.deepStrictEqual(p.members.map(m => [m.name, m.share]), [["Ava", 67], ["Josh", 33]]);
    });

    test("readers can be on many teams; leaving one doesn't touch the others", () => {
        const class_team = Teams.get_by_code(sqlite, Teams.create_team(sqlite, {name: "4th Grade"}, [maya.reader_id, ava.reader_id]));
        const committee = Teams.list_public(sqlite, SETTINGS).find(t => t.name === "Committee");
        assert.deepStrictEqual(Teams.team_ids_for_reader(sqlite, ava.reader_id), [committee.team_id, class_team.team_id]);
        Teams.leave(sqlite, class_team.team_id, ava.reader_id);
        assert.deepStrictEqual(Teams.team_ids_for_reader(sqlite, ava.reader_id), [committee.team_id]);
        assert.strictEqual(Teams.progress(sqlite, class_team, null, SETTINGS).goal_minutes, 120, "Ava's goal left with her");
    });

    test("reaching your goal earns a raffle entry that stays even if you raise your goal", () => {
        assert.strictEqual(Prizes.raffle(sqlite, maya.reader_id).count, 0);
        assert.deepStrictEqual(log(maya, "2027-01-05", 60), {goal: false, teams: []});
        const earned = log(maya, "2027-01-06", 60);
        assert.strictEqual(earned.goal, true);
        assert.deepStrictEqual(earned.teams, ["4th Grade"], "Maya is alone on 4th Grade now, so her goal is the team's goal");
        Readathon.set_goal(sqlite, maya.reader_id, 1200);
        assert.deepStrictEqual(Prizes.raffle(sqlite, maya.reader_id).reasons, ["Reached your goal", "4th Grade reached its team goal"]);
    });

    test("one teammate's extra reading makes up for another's", () => {
        // Committee: Josh (5 h goal) and Ava (5 h goal) need 10 hours together. They have 3.
        const committee = Teams.list_public(sqlite, SETTINGS).find(t => t.name === "Committee");
        log(josh, "2027-01-13", 180); // Josh: 4 hours, an hour short of his own goal
        const earned = log(ava, "2027-01-14", 240); // Ava: 6 hours, an hour over hers
        assert.deepStrictEqual(earned, {goal: true, teams: ["Committee"]});
        assert.strictEqual(Prizes.raffle(sqlite, josh.reader_id).count, 1, "Josh missed his goal but his team made it");
        assert.deepStrictEqual(Prizes.raffle(sqlite, josh.reader_id).reasons, ["Committee reached its team goal"]);
        assert.strictEqual(Teams.progress(sqlite, Teams.get_team(sqlite, committee.team_id), null, SETTINGS).reached, true);
    });

    test("a newcomer makes the goal bigger; the team keeps its entries and the newcomer earns one when it's reached again", () => {
        const committee = Teams.get_team(sqlite, Teams.list_public(sqlite, SETTINGS).find(t => t.name === "Committee").team_id);
        Teams.join(sqlite, committee.team_id, [maya.reader_id]); // Maya's goal is now 20 hours
        Prizes.update_team_awards(sqlite, committee.team_id);
        const p = Teams.progress(sqlite, committee, null, SETTINGS);
        assert.strictEqual(p.reached, false);
        assert.strictEqual(p.reached_before, true);
        assert.strictEqual(Prizes.raffle(sqlite, maya.reader_id).count, 2, "no Committee entry for Maya yet");
        assert.strictEqual(Prizes.raffle(sqlite, josh.reader_id).count, 1, "Josh keeps his");
        log(maya, "2027-01-15", 600);
        log(maya, "2027-01-16", 480); // Committee: 600 + 120 + 1080 = 1800 of 300 + 300 + 1200
        assert.strictEqual(Prizes.raffle(sqlite, maya.reader_id).count, 3);
    });

    test("leaving a team keeps the entry you earned there", () => {
        const committee = Teams.list_public(sqlite, SETTINGS).find(t => t.name === "Committee");
        Teams.leave(sqlite, committee.team_id, josh.reader_id);
        assert.strictEqual(Prizes.raffle(sqlite, josh.reader_id).count, 1);
        Teams.join(sqlite, committee.team_id, [josh.reader_id]);
        assert.strictEqual(Prizes.raffle(sqlite, josh.reader_id).count, 1, "rejoining doesn't add a second");
    });

    test("any bingo earns a pin, a full card a tote bag, and the desk records pickups", () => {
        const card = Readathon.bingo_card("adult");
        const none = Prizes.bingo_prizes(Readathon.bingo_board(card, [], {}), []);
        assert.deepStrictEqual(none, {pin: {earned: false, picked_up: false}, tote: {earned: false, picked_up: false}});
        const row = Readathon.bingo_board(card, [10, 11, 13, 14], {});
        assert.deepStrictEqual(Prizes.bingo_prizes(row, []).pin, {earned: true, picked_up: false});
        const all = Readathon.bingo_board(card, Array.from({length: 25}, (_, i) => i), {});
        assert.deepStrictEqual(Prizes.bingo_prizes(all, []).tote, {earned: true, picked_up: false});

        Prizes.set_pickup(sqlite, ava.reader_id, "pin", true);
        Prizes.set_pickup(sqlite, ava.reader_id, "pin", true);
        assert.deepStrictEqual(Prizes.list_pickups(sqlite, ava.reader_id), ["pin"]);
        Prizes.set_pickup(sqlite, ava.reader_id, "pin", false);
        assert.deepStrictEqual(Prizes.list_pickups(sqlite, ava.reader_id), []);
        assert.strictEqual(Prizes.set_pickup(sqlite, ava.reader_id, "trophy", true), false);
    });

    test("hidden teams and empty teams stay off the public list", () => {
        const names = () => Teams.list_public(sqlite, SETTINGS).map(t => t.name);
        assert.ok(names().includes("4th Grade"));
        const team = Teams.list_public(sqlite, SETTINGS).find(t => t.name === "4th Grade");
        Teams.set_hidden(sqlite, team.team_id, true);
        assert.ok(!names().includes("4th Grade"));
        Teams.create_team(sqlite, {name: "Ghost Team"}, []);
        assert.ok(!names().includes("Ghost Team"));
    });
});


suite("lib/readathon.js event_date", () => {
    test("gives the pieces of a calendar badge for any month", () => {
        assert.deepStrictEqual(Readathon.event_date("2027-01-02"), {day_name: "Sat", day_number: 2, month: "Jan"});
        assert.deepStrictEqual(Readathon.event_date("2026-11-23"), {day_name: "Mon", day_number: 23, month: "Nov"});
    });
});

const Shelf = require("../lib/readathon-shelf");

suite("lib/readathon-shelf.js", () => {
    const fresh = () => {
        const sqlite = new DatabaseSync(":memory:");
        const dirpath = path.join(__dirname, "..", "migrations");
        for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
            sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
        }
        const id = Readathon.create_household(sqlite, {email: "s@example.com", readers: [{name: "Bo", age_group: "kid"}]});
        return {sqlite, bo: Readathon.list_readers(sqlite, id)[0].reader_id};
    };

    test("logging a title puts the book on the shelf once, whatever the capitals", () => {
        const {sqlite, bo} = fresh();
        Readathon.add_entry(sqlite, bo, {day: "2027-01-02", minutes: 20, title: "The Hobbit", format: "Book", author: "J. R. R. Tolkien"});
        Readathon.add_entry(sqlite, bo, {day: "2027-01-03", minutes: 30, title: "the hobbit"});
        Readathon.add_entry(sqlite, bo, {day: "2027-01-03", minutes: 15});
        const books = Shelf.books(sqlite, bo, Readathon.list_entries(sqlite, bo));
        assert.strictEqual(books.length, 1);
        assert.deepStrictEqual([books[0].title, books[0].author, books[0].minutes, books[0].days], ["The Hobbit", "J. R. R. Tolkien", 50, ["2027-01-02", "2027-01-03"]]);
    });

    test("finished books sort after the ones being read, and are counted", () => {
        const {sqlite, bo} = fresh();
        const a = Shelf.ensure(sqlite, bo, {title: "Alpha"});
        Shelf.ensure(sqlite, bo, {title: "Beta"});
        Shelf.set_finished(sqlite, bo, a.shelf_id, "2027-01-05");
        const books = Shelf.books(sqlite, bo, []);
        assert.deepStrictEqual(books.map(b => [b.title, b.finished]), [["Beta", false], ["Alpha", true]]);
        assert.strictEqual(Shelf.finished_count(sqlite, bo), 1);
        assert.deepStrictEqual(Shelf.current(sqlite, bo, []).map(b => b.title), ["Beta"]);
    });

    test("renaming a book renames its log entries; a clash with another book is refused", () => {
        const {sqlite, bo} = fresh();
        Readathon.add_entry(sqlite, bo, {day: "2027-01-02", minutes: 20, title: "Dogman"});
        Shelf.ensure(sqlite, bo, {title: "Hatchet"});
        const book = Shelf.by_title(sqlite, bo, "dogman");
        assert.strictEqual(Shelf.update(sqlite, bo, book.shelf_id, {title: "Dog Man", author: "Dav Pilkey", format: "Comics"}), null);
        assert.strictEqual(Readathon.list_entries(sqlite, bo)[0].title, "Dog Man");
        assert.match(Shelf.update(sqlite, bo, book.shelf_id, {title: "hatchet"}), /already/);
    });

    test("only a book with no reading can be taken off the shelf", () => {
        const {sqlite, bo} = fresh();
        Readathon.add_entry(sqlite, bo, {day: "2027-01-02", minutes: 20, title: "Kept"});
        const empty = Shelf.ensure(sqlite, bo, {title: "Oops"});
        assert.strictEqual(Shelf.remove(sqlite, bo, Shelf.by_title(sqlite, bo, "Kept").shelf_id), false);
        assert.strictEqual(Shelf.remove(sqlite, bo, empty.shelf_id), true);
        assert.deepStrictEqual(Shelf.books(sqlite, bo, Readathon.list_entries(sqlite, bo)).map(b => b.title), ["Kept"]);
    });

    test("a typed-in book needs a title, and only known formats are kept", () => {
        assert.deepStrictEqual(Shelf.parse_book({title: "  "}).errors, ["What's the book called?"]);
        assert.deepStrictEqual(Shelf.parse_book({title: " Holes ", author: "", format: "Scroll"}).book, {title: "Holes", author: null, format: null});
    });
});

suite("lib/readathon-shelf.js sharing", () => {
    const sqlite = new DatabaseSync(":memory:");
    const dirpath = path.join(__dirname, "..", "migrations");
    for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
        sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
    }
    const id = Readathon.create_household(sqlite, {email: "share@example.com", readers: [{name: "Ma", age_group: "adult"}, {name: "Kit", age_group: "kid"}]});
    const [ma, kit] = Readathon.list_readers(sqlite, id);
    Shelf.ensure(sqlite, ma.reader_id, {title: "Open Book"});
    const secret = Shelf.ensure(sqlite, ma.reader_id, {title: "Secret Book"});
    Shelf.set_private(sqlite, ma.reader_id, secret.shelf_id, true);
    Shelf.ensure(sqlite, kit.reader_id, {title: "Kid Book"});

    test("teammates see grown-ups' books but not kids' at first, and never private ones", () => {
        assert.deepStrictEqual(Shelf.shared_books(sqlite, ma, [], "team").map(b => b.title), ["Open Book"]);
        assert.deepStrictEqual(Shelf.shared_books(sqlite, kit, [], "team"), []);
        Shelf.set_sharing(sqlite, kit.reader_id, {team: true});
        assert.deepStrictEqual(Shelf.shared_books(sqlite, Readathon.get_reader(sqlite, kit.reader_id), [], "team").map(b => b.title), ["Kid Book"]);
    });

    test("the cheer page shows books only once turned on", () => {
        assert.deepStrictEqual(Shelf.shared_books(sqlite, ma, [], "cheer"), []);
        Shelf.set_sharing(sqlite, ma.reader_id, {cheer: true});
        const now = Readathon.get_reader(sqlite, ma.reader_id);
        assert.deepStrictEqual(Shelf.shared_books(sqlite, now, [], "cheer").map(b => b.title), ["Open Book"]);
        assert.strictEqual(Shelf.shares_with_team(now), true, "turning on the cheer page leaves teammates as they were");
    });
});

suite("lib/readathon.js week_and_streaks", () => {
    test("counts this week's days so far, and shows a streak from 2 days", () => {
        const one = Readathon.week_and_streaks(entries([["2027-01-12", 20]]), "2027-01-12", SETTINGS);
        assert.strictEqual(one.streak_label, null);
        const run = Readathon.week_and_streaks(entries([["2027-01-12", 20], ["2027-01-11", 10], ["2027-01-10", 5], ["2027-01-05", 30]]), "2027-01-12", SETTINGS);
        assert.deepStrictEqual([run.week_read, run.week_days, run.streak, run.streak_label], [3, 3, 3, "3 days in a row"]);
        assert.strictEqual(run.week.length, 7);
    });
});

suite("lib/readathon.js event_month", () => {
    test("names the month from the dates, or the range when it crosses months", () => {
        assert.strictEqual(Readathon.event_month(SETTINGS), "January");
        assert.strictEqual(Readathon.event_month({starts: "2026-11-23", ends: "2026-11-29"}), "November");
        assert.strictEqual(Readathon.event_month({starts: "2026-11-28", ends: "2026-12-04"}), "Nov 28 to Dec 4");
    });
});
