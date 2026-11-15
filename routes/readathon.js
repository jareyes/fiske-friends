// January 2027 Read-a-thon pages. Mounted at /readathon.
const config = require("config");
const content = require("../lib/readathon-content");
const Gifts = require("../lib/readathon-gifts");
const Prizes = require("../lib/readathon-prizes");
const gift_routes = require("./readathon-gifts");
const team_routes = require("./readathon-teams");
const Teams = require("../lib/readathon-teams");
const middleware = require("../lib/middleware");
const Readathon = require("../lib/readathon");
const {Router} = require("express");
const Token = require("../lib/token");
const User = require("../lib/user");

const APP = config.get("app");
const MOUNTS = config.get("app.mounts");
const SETTINGS = config.get("readathon");
const BASE = `/${MOUNTS.readathon}`;
const SITE_URL = `${APP.protocol}://${APP.domain}`;
const SESSION_DAYS = 60;
const SIGN_IN_LINK_DAYS = 7;

const DATE_RANGE_LABEL = "January 1 to 31, 2027";

function page(res, view, locals = {}) {
    res.render(`readathon/${view}`, {
        layout: "readathon",
        body_class: "theme-readathon",
        base: BASE,
        friends_url: SITE_URL,
        date_range: DATE_RANGE_LABEL,
        demo_today: SETTINGS.today_override
            ? Readathon.label_day(SETTINGS.today_override)
            : null,
        og: {
            title: "Resolve to Read: the Fiske Free Library Read-a-thon",
            description: `A month-long read-a-thon for every age, ${DATE_RANGE_LABEL}. No rules, just read.`,
            url: `${SITE_URL}${BASE}`,
        },
        ...locals,
        title: locals.title ? `${locals.title} | Read-a-thon` : "Resolve to Read",
    });
}

function household_id(req) {
    return req.session.readathon?.household_id ?? null;
}

function sign_in_session(req, id) {
    req.session.readathon = {household_id: id};
    req.session.cookie.maxAge = SESSION_DAYS * 24 * 60 * 60 * 1000;
}

function format_number(n) {
    return Number(n).toLocaleString("en-US");
}

// Loads the reader in the URL and checks it belongs to whoever is signed in
function load_reader(sqlite) {
    return (req, res, next) => {
        const reader = Readathon.get_reader(sqlite, Number(req.params.reader_id));
        if(reader === null || reader.household_id !== household_id(req)) {
            return res.redirect(`${BASE}/sign-in`);
        }
        res.locals.reader = reader;
        res.locals.readers = Readathon.list_readers(sqlite, reader.household_id);
        res.locals.reader_url = `${BASE}/r/${reader.reader_id}`;
        next();
    };
}

function reader_context(sqlite, reader) {
    const today = Readathon.today();
    const entries = Readathon.list_entries(sqlite, reader.reader_id);
    const reader_stats = Readathon.stats(entries, today);
    return {today, entries, stats: reader_stats};
}

// ---------- landing, join, sign in ----------

function home(req, res, sqlite) {
    const today = Readathon.today();
    const totals = Readathon.community(sqlite);
    const upcoming = content.EVENTS.filter(e => e.day >= today).slice(0, 3).map(e => ({
        ...e,
        label: Readathon.label_day(e.day, today),
        day_number: Number(e.day.slice(8)),
        day_name: Readathon.label_day(e.day).split(",")[0],
        is_feb: e.day.slice(5, 7) === "02",
    }));
    const phase = Readathon.phase(today);
    page(res, "home", {
        body_class: "theme-readathon ra-home",
        fundraising: Gifts.totals(sqlite, totals.minutes),
        purpose: content.FUNDRAISING_PURPOSE,
        phase,
        days_to_go: Readathon.days_between(today, SETTINGS.starts),
        signed_in: household_id(req) !== null,
        totals: {
            ...totals,
            minutes_label: format_number(totals.minutes),
            goal_label: format_number(totals.goal),
            readers_label: format_number(totals.readers),
        },
        upcoming,
    });
}

const BLANK_JOIN_FORM = {goal: String(content.DEFAULT_GOAL_MINUTES), city: SETTINGS.default_city, state: SETTINGS.default_state};

function show_join(req, res, rows = [{name: "", age_group: "adult", birth_year: ""}], form = BLANK_JOIN_FORM, errors = [], sqlite = null) {
    const team_code = Readathon.clean(req.body?.team ?? req.query.team, 16);
    const team = sqlite && team_code ? Teams.get_by_code(sqlite, team_code) : null;
    page(res, "join", {
        team: team ? {name: team.name, code: team.code} : null,
        title: "Join",
        errors,
        form,
        rows: rows.map((row, i) => ({...row, i, number: i + 1, removable: i > 0})),
        can_add: rows.length < Readathon.MAX_READERS,
        goals: Readathon.goal_choices(Readathon.today()),
        ages: content.AGE_GROUPS,
        states: content.STATES,
        latest_birth_year: Readathon.today().slice(0, 4),
    });
}

function join(req, res, sqlite) {
    const {errors, rows, household} = Readathon.parse_join(req.body);
    const form = {
        goal: String(req.body.goal ?? ""),
        email: Readathon.clean(req.body.email, 200),
        city: Readathon.clean(req.body.city, 60),
        state: Readathon.clean(req.body.state, 2).toUpperCase(),
        wants_updates: !!req.body.wants_updates,
    };
    // Without JavaScript, "Add another reader" submits the form and comes back with one more row
    if(req.body.add_reader !== undefined) {
        return show_join(req, res, [...rows, {name: "", age_group: "kid", birth_year: ""}].slice(0, Readathon.MAX_READERS), form, [], sqlite);
    }
    if(errors.length > 0) {
        res.status(400);
        return show_join(req, res, rows, form, errors, sqlite);
    }
    if(Readathon.find_household_by_email(sqlite, household.email) !== null) {
        res.status(400);
        return show_join(req, res, rows, form, [
            `${household.email} is already signed up. Use "Sign in" below and we'll send you a link.`,
        ], sqlite);
    }
    const id = Readathon.create_household(sqlite, household);
    sign_in_session(req, id);
    console.log({event: "Readathon.JOINED", household_id: id, readers: household.readers.length});
    req.session.readathon_welcome = true;
    // Came from a team invite? Go back to the team so they can join it
    const team = Teams.get_by_code(sqlite, Readathon.clean(req.body.team, 16));
    res.redirect(team ? `${BASE}/teams/${team.code}` : `${BASE}/me`);
}

function show_sign_in(req, res, locals = {}) {
    page(res, "sign-in", {title: "Sign in", ...locals});
}

function sign_in(req, res, sqlite) {
    const email = Readathon.clean(req.body.email, 200).toLowerCase();
    const household = Readathon.find_household_by_email(sqlite, email);
    let link = null;
    if(household !== null) {
        const token = Token.sign(`readathon:${household.household_id}`, SIGN_IN_LINK_DAYS * 24 * 60 * 60 * 1000);
        link = `${BASE}/sign-in/${token}`;
        // TODO: email this link. Until a mailer is set up it is logged for volunteers.
        console.log({event: "Readathon.SIGN_IN_LINK", household_id: household.household_id, link: `${SITE_URL}${link}`});
    }
    // Same message whether or not the email exists, so addresses can't be guessed
    show_sign_in(req, res, {
        sent: true,
        email,
        demo_link: SETTINGS.show_sign_in_links ? link : null,
    });
}

function sign_in_with_token(req, res) {
    try {
        const [payload] = Token.validate(req.params.token);
        const id = Number(String(payload).split(":")[1]);
        if(!String(payload).startsWith("readathon:") || !Number.isInteger(id)) {
            throw new Error("Not a read-a-thon link");
        }
        sign_in_session(req, id);
        res.redirect(`${BASE}/me`);
    }
    catch(err) {
        show_sign_in(req, res, {expired: true});
    }
}

function sign_out(req, res) {
    delete req.session.readathon;
    res.redirect(BASE);
}

function me(req, res, sqlite) {
    const id = household_id(req);
    if(id === null) {
        return res.redirect(`${BASE}/join`);
    }
    const readers = Readathon.list_readers(sqlite, id);
    if(readers.length === 0) {
        delete req.session.readathon;
        return res.redirect(`${BASE}/join`);
    }
    const welcome = !!req.session.readathon_welcome;
    delete req.session.readathon_welcome;
    if(readers.length === 1) {
        if(welcome) {
            req.session.readathon_welcome = true;
        }
        return res.redirect(`${BASE}/r/${readers[0].reader_id}`);
    }
    const today = Readathon.today();
    page(res, "who", {
        title: "Who's reading?",
        welcome,
        readers: readers.map(reader => {
            const reader_stats = Readathon.stats(Readathon.list_entries(sqlite, reader.reader_id), today);
            return {
                ...reader,
                initial: reader.name.charAt(0).toUpperCase(),
                minutes_today: reader_stats.today_minutes,
            };
        }),
    });
}

// ---------- a reader's pages ----------

function reader_home(req, res, sqlite) {
    const {reader} = res.locals;
    const {today, entries, stats} = reader_context(sqlite, reader);
    const welcome = !!req.session.readathon_welcome;
    delete req.session.readathon_welcome;
    const board = Readathon.bingo_board(
        Readathon.bingo_card(reader.age_group),
        Readathon.list_marks(sqlite, reader.reader_id),
        Readathon.auto_squares(sqlite, reader, stats),
    );
    page(res, "reader", {
        title: reader.name,
        nav: "me",
        welcome,
        phase: Readathon.phase(today),
        today_label: Readathon.label_day(today),
        initial: reader.name.charAt(0).toUpperCase(),
        several_readers: res.locals.readers.length > 1,
        stats,
        progress: Readathon.goal_progress(stats.total, reader.goal_minutes, Readathon.reader_start_day(reader, entries), today),
        today_plan: Readathon.today_plan(stats.total, stats.today_minutes, reader.goal_minutes, today),
        goals: Readathon.goal_choices(today, reader.goal_minutes),
        board,
        prizes: Prizes.bingo_prizes(board, Prizes.list_pickups(sqlite, reader.reader_id)),
        raffle: Prizes.raffle(sqlite, reader.reader_id),
        cheers: Gifts.reader_cheers(sqlite, reader.reader_id),
        teams: Teams.for_reader(sqlite, reader.reader_id, today),
        week: Readathon.week_strip(stats.by_day, today),
        // Only shown for a run of two or more, so nobody sees a zero
        streak_note: stats.streak >= 2 ? `${stats.streak} days in a row!` : null,
        recent: entries.slice(0, 3).map(entry => ({...entry, day_label: Readathon.label_day(entry.day, today)})),
        entry_count: entries.length,
        more_entries: entries.length > 3,
    });
}

// The whole reading log: a summary, a January calendar, every entry by week, and the books they named
function reading_log(req, res, sqlite) {
    const {reader} = res.locals;
    const {today, entries, stats} = reader_context(sqlite, reader);
    page(res, "reading-log", {
        title: `${reader.name}'s reading log`,
        nav: "me",
        body_class: "theme-readathon ra-wide",
        message: log_message(req),
        phase: Readathon.phase(today),
        stats,
        total_label: Readathon.duration_short(stats.total),
        calendar: Readathon.month_calendar(stats.by_day, today),
        weeks: Readathon.log_by_week(entries, today),
        books: Readathon.books_read(entries, today),
    });
}

function update_goal(req, res, sqlite) {
    const {reader} = res.locals;
    Readathon.set_goal(sqlite, reader.reader_id, Number.parseInt(req.body.goal, 10));
    // A smaller goal might already be reached, for them or their teams
    Prizes.update_awards(sqlite, reader.reader_id);
    res.redirect(`${BASE}/r/${reader.reader_id}`);
}

function timer(req, res, sqlite) {
    const {reader} = res.locals;
    const today = Readathon.today();
    page(res, "timer", {
        title: "Reading timer",
        body_class: "theme-readathon theme-readathon-night",
        bare: true,
        is_open: Readathon.phase(today) === "during",
        today,
    });
}

const MINUTE_CHOICES = [10, 15, 20, 30, 45, 60];

// A note shown once at the top of the reading log, after editing or removing an entry
function log_message(req) {
    const text = req.session.readathon_log_message ?? null;
    delete req.session.readathon_log_message;
    return text;
}

// "Fix the time" from the timer opens the add-reading form with its minutes filled in
function prefill_minutes(value) {
    const minutes = Number.parseInt(value, 10);
    if(!Number.isInteger(minutes) || minutes < 1 || minutes > 600) {
        return {};
    }
    return MINUTE_CHOICES.includes(minutes) ? {minutes: String(minutes)} : {minutes: "other", minutes_other: String(minutes)};
}

// The add-reading form, or the same form for changing an entry when entry is given
function show_log(req, res, sqlite, form = {}, errors = [], entry = null) {
    const {reader} = res.locals;
    const today = Readathon.today();
    const minutes = String(form.minutes ?? "20");
    // Adding offers the last two weeks; changing an entry offers every day so far
    const days = Readathon.loggable_days(today).slice(0, entry ? undefined : 14);
    page(res, "log", {
        title: entry ? "Change reading" : "Add reading",
        nav: "me",
        errors,
        entry,
        action: entry ? `${BASE}/r/${reader.reader_id}/entries/${entry.entry_id}` : `${BASE}/r/${reader.reader_id}/log`,
        is_open: Readathon.phase(today) !== "before",
        form: {...form, minutes},
        open_details: !!(form.title || form.format),
        minute_choices: MINUTE_CHOICES.map(n => ({n, checked: String(n) === minutes})),
        other_checked: minutes === "other",
        days: days.map(day => ({
            day,
            label: Readathon.label_day(day, today),
            selected: day === (form.day ?? today),
        })),
        formats: content.FORMATS.map(name => ({name, checked: name === form.format})),
    });
}

function save_log(req, res, sqlite) {
    const {reader} = res.locals;
    const source = req.body.source === "timer" ? "timer" : "manual";
    const today = Readathon.today();
    const {errors, entry} = Readathon.parse_log(req.body, today, source);
    if(errors.length > 0) {
        res.status(400);
        return show_log(req, res, sqlite, req.body, errors);
    }
    const before_stats = Readathon.stats(Readathon.list_entries(sqlite, reader.reader_id), today);
    const before_auto = Readathon.auto_squares(sqlite, reader, before_stats);
    Readathon.add_entry(sqlite, reader.reader_id, entry);
    const earned = Prizes.update_awards(sqlite, reader.reader_id);
    req.session.readathon_yay = {reader_id: reader.reader_id, added: entry.minutes, before: before_stats.total, before_auto, earned};
    res.redirect(`${BASE}/r/${reader.reader_id}/yay`);
}

function yay(req, res, sqlite) {
    const {reader} = res.locals;
    const flash = req.session.readathon_yay;
    delete req.session.readathon_yay;
    if(!flash || flash.reader_id !== reader.reader_id) {
        return res.redirect(`${BASE}/r/${reader.reader_id}`);
    }
    const {stats} = reader_context(sqlite, reader);
    const goal = reader.goal_minutes;
    const goal_reached = flash.before < goal && stats.total >= goal;
    const halfway = !goal_reached && flash.before < goal / 2 && stats.total >= goal / 2;
    // Bingo squares this reading just earned, and whether they finished a line
    const before_auto = flash.before_auto ?? {};
    const after_auto = Readathon.auto_squares(sqlite, reader, stats);
    const marks = Readathon.list_marks(sqlite, reader.reader_id);
    const card = Readathon.bingo_card(reader.age_group);
    const new_squares = Readathon.newly_earned_squares(card, before_auto, after_auto);
    const before_board = Readathon.bingo_board(card, marks, before_auto);
    const after_board = Readathon.bingo_board(card, marks, after_auto);
    const new_bingo = after_board.bingos > before_board.bingos;
    const earned = flash.earned ?? {goal: false, teams: []};
    page(res, "yay", {
        title: "Nice reading!",
        added: flash.added,
        total_label: Readathon.duration_label(stats.total),
        new_squares,
        new_bingo,
        first_bingo: before_board.bingos === 0 && after_board.bingos > 0,
        new_blackout: !before_board.blackout && after_board.blackout,
        raffle_goal: earned.goal,
        raffle_teams: earned.teams,
        goal_reached,
        halfway,
        goal_label: Readathon.goal_label(goal),
        stats,
        confetti: Array.from({length: 20}),
        teams: Teams.for_reader(sqlite, reader.reader_id, Readathon.today()),
    });
}

// "today", "yesterday", or "on Mon, Jan 11" (or "from ..." for removing)
function on_day(day, today, preposition = "on") {
    const label = Readathon.label_day(day, today);
    return ["Today", "Yesterday"].includes(label) ? (preposition === "on" ? label.toLowerCase() : `from ${label.toLowerCase()}`) : `${preposition} ${label}`;
}

function load_entry(req, res, sqlite) {
    return Readathon.get_entry(sqlite, res.locals.reader.reader_id, Number(req.params.entry_id));
}

function edit_entry(req, res, sqlite) {
    const entry = load_entry(req, res, sqlite);
    if(entry === null) {
        return res.redirect(`${BASE}/r/${res.locals.reader.reader_id}/reading-log`);
    }
    const preset = MINUTE_CHOICES.includes(entry.minutes);
    show_log(req, res, sqlite, {
        minutes: preset ? String(entry.minutes) : "other",
        minutes_other: preset ? "" : String(entry.minutes),
        day: entry.day,
        title: entry.title ?? "",
        format: entry.format ?? "",
    }, [], entry);
}

function save_entry(req, res, sqlite) {
    const {reader} = res.locals;
    const entry = load_entry(req, res, sqlite);
    if(entry === null) {
        return res.redirect(`${BASE}/r/${reader.reader_id}/reading-log`);
    }
    const today = Readathon.today();
    // Changes are checked like typed-in reading, even for timer sessions (up to 10 hours)
    const {errors, entry: changes} = Readathon.parse_log(req.body, today, "manual");
    if(errors.length > 0) {
        res.status(400);
        return show_log(req, res, sqlite, req.body, errors, entry);
    }
    Readathon.update_entry(sqlite, reader.reader_id, entry.entry_id, changes);
    // More minutes might reach a goal. Fewer never takes back a raffle entry.
    Prizes.update_awards(sqlite, reader.reader_id);
    req.session.readathon_log_message = `Updated: ${changes.minutes} min ${on_day(changes.day, today)}.`;
    res.redirect(`${BASE}/r/${reader.reader_id}/reading-log`);
}

function remove_entry(req, res, sqlite) {
    const {reader} = res.locals;
    const entry = load_entry(req, res, sqlite);
    if(entry !== null) {
        Readathon.delete_entry(sqlite, reader.reader_id, entry.entry_id);
        req.session.readathon_log_message = `Removed ${entry.minutes} min ${on_day(entry.day, Readathon.today(), "from")}.`;
    }
    res.redirect(`${BASE}/r/${reader.reader_id}/reading-log`);
}

function bingo(req, res, sqlite, message = null) {
    const {reader} = res.locals;
    const {stats} = reader_context(sqlite, reader);
    const board = Readathon.bingo_board(
        Readathon.bingo_card(reader.age_group),
        Readathon.list_marks(sqlite, reader.reader_id),
        Readathon.auto_squares(sqlite, reader, stats),
    );
    page(res, "bingo", {
        title: "Bingo",
        nav: "bingo",
        board,
        message: message ?? req.session.readathon_bingo_message ?? null,
        rows: [0, 1, 2, 3, 4].map(r => board.squares.slice(r * 5, r * 5 + 5)),
    });
    delete req.session.readathon_bingo_message;
}

function toggle_square(req, res, sqlite) {
    const {reader} = res.locals;
    const square = Number.parseInt(req.body.square, 10);
    const definition = Readathon.bingo_card(reader.age_group).squares[square];
    if(definition && definition.kind !== "free" && definition.kind !== "auto") {
        const marked = Readathon.list_marks(sqlite, reader.reader_id).includes(square);
        Readathon.set_mark(sqlite, reader.reader_id, square, !marked);
    }
    res.redirect(`${BASE}/r/${reader.reader_id}/bingo`);
}

function bingo_code(req, res, sqlite) {
    const {reader} = res.locals;
    const card = Readathon.bingo_card(reader.age_group);
    const square = Readathon.event_code_square(card, req.body.code);
    if(square < 0 && Readathon.is_event_code(req.body.code)) {
        // A real event, just not one on this reader's card (say, teen night on a kid's card)
        req.session.readathon_bingo_message = {
            text: `Thanks for coming! That event isn't on ${reader.name}'s card, but every minute you read there still counts.`,
        };
    }
    else if(square < 0) {
        req.session.readathon_bingo_message = {
            bad: true,
            text: "We don't know that code. Check the screen at the event, or ask a volunteer.",
        };
    }
    else {
        Readathon.set_mark(sqlite, reader.reader_id, square, true, "code");
        req.session.readathon_bingo_message = {
            text: `Checked in! "${card.squares[square].label}" is marked.`,
        };
    }
    res.redirect(`${BASE}/r/${reader.reader_id}/bingo`);
}

// ---------- books ----------

function books(req, res, sqlite) {
    const list_id = content.LISTS.some(l => l.id === req.query.list) ? req.query.list : null;
    const query = Readathon.clean(req.query.q, 80);
    const list = content.LISTS.find(l => l.id === list_id);
    page(res, "books", {
        title: "Book lists",
        nav: "books",
        signed_in: household_id(req) !== null,
        lists: content.LISTS.map(l => ({...l, current: l.id === list_id})),
        all_current: list_id === null,
        list,
        query,
        books: Readathon.books(sqlite, list_id, query),
    });
}

function show_recommend(req, res, form = {}, errors = []) {
    const list = form.list ?? "community";
    const audience = form.audience ?? "All ages";
    page(res, "recommend", {
        title: "Recommend a book",
        nav: "books",
        errors,
        form: {...form, read_during: form.read_during ?? true},
        lists: content.LISTS.map(l => ({...l, checked: l.id === list})),
        audiences: content.AUDIENCES.map(name => ({name, checked: name === audience})),
    });
}

function recommend(req, res, sqlite) {
    const {errors, recommendation} = Readathon.parse_recommendation(req.body);
    if(errors.length > 0) {
        res.status(400);
        return show_recommend(req, res, {...req.body, read_during: !!req.body.read_during}, errors);
    }
    Readathon.create_recommendation(sqlite, household_id(req), recommendation);
    req.session.readathon_recommended = recommendation;
    res.redirect(`${BASE}/books/recommend/thanks`);
}

function recommend_thanks(req, res) {
    const recommendation = req.session.readathon_recommended;
    if(!recommendation) {
        return res.redirect(`${BASE}/books`);
    }
    delete req.session.readathon_recommended;
    page(res, "recommend-thanks", {
        title: "Thanks!",
        nav: "books",
        recommendation,
        initial: recommendation.title.replace(/^(The|A|An) /, "").charAt(0).toUpperCase(),
        signed_in: household_id(req) !== null,
    });
}

// ---------- how it works ----------

function how(req, res) {
    page(res, "how", {title: "How it works", nav: "how", signed_in: household_id(req) !== null});
}

// ---------- volunteer desk (admins only) ----------

function desk(req, res, sqlite, message = null) {
    const today = Readathon.today();
    const query = Readathon.clean(req.query.q, 60);
    const totals = Readathon.community(sqlite);
    page(res, "desk", {
        title: "Volunteer desk",
        message: message ?? req.session.readathon_desk_message ?? null,
        query,
        totals: {...totals, minutes_label: format_number(totals.minutes)},
        pending: Readathon.list_recommendations(sqlite, "pending"),
        fundraising: Gifts.totals(sqlite, totals.minutes),
        gifts: Gifts.recent_gifts(sqlite),
        teams: Teams.list_all(sqlite),
        results: Readathon.search_readers(sqlite, query).map(reader => {
            const reader_stats = Readathon.stats(Readathon.list_entries(sqlite, reader.reader_id), today);
            const board = Readathon.bingo_board(
                Readathon.bingo_card(reader.age_group),
                Readathon.list_marks(sqlite, reader.reader_id),
                Readathon.auto_squares(sqlite, reader, reader_stats),
            );
            return {...reader, total: reader_stats.total, prizes: Prizes.bingo_prizes(board, Prizes.list_pickups(sqlite, reader.reader_id))};
        }),
        days: Readathon.loggable_days(today).slice(0, 14).map(day => ({day, label: Readathon.label_day(day, today)})),
        ages: content.AGE_GROUPS,
        states: content.STATES,
        latest_birth_year: today.slice(0, 4),
    });
    delete req.session.readathon_desk_message;
}

function desk_back(req, res, text, query = "") {
    req.session.readathon_desk_message = text;
    res.redirect(`${BASE}/desk${query ? `?q=${encodeURIComponent(query)}` : ""}`);
}

function desk_add_minutes(req, res, sqlite) {
    const reader = Readathon.get_reader(sqlite, Number(req.body.reader_id));
    const query = Readathon.clean(req.body.q, 60);
    if(reader === null) {
        return desk_back(req, res, "Couldn't find that reader.", query);
    }
    const {errors, entry} = Readathon.parse_log(req.body, Readathon.today(), "desk");
    if(errors.length > 0) {
        return desk_back(req, res, errors[0], query);
    }
    Readathon.add_entry(sqlite, reader.reader_id, entry);
    Prizes.update_awards(sqlite, reader.reader_id);
    desk_back(req, res, `Added ${entry.minutes} minutes for ${reader.name}.`, query);
}

// Record (or undo) a pin or tote bag handed over at the desk
function desk_pickup(req, res, sqlite) {
    const reader = Readathon.get_reader(sqlite, Number(req.body.reader_id));
    const query = Readathon.clean(req.body.q, 60);
    const prize = req.body.prize;
    if(reader === null || !Prizes.PRIZES.includes(prize)) {
        return desk_back(req, res, "Couldn't find that reader.", query);
    }
    const picked_up = req.body.picked_up === "1";
    Prizes.set_pickup(sqlite, reader.reader_id, prize, picked_up);
    const name = prize === "pin" ? "enamel pin" : "tote bag";
    desk_back(req, res, picked_up ? `Marked ${reader.name}'s ${name} as picked up.` : `Undid ${reader.name}'s ${name} pickup.`, query);
}

function desk_add_reader(req, res, sqlite) {
    const name = Readathon.clean(req.body.name, 40);
    const email = Readathon.clean(req.body.email, 200).toLowerCase();
    if(name === "") {
        return desk_back(req, res, "Enter the reader's first name.");
    }
    if(email && Readathon.find_household_by_email(sqlite, email)) {
        return desk_back(req, res, `${email} is already signed up. Search for them instead.`, email);
    }
    const age_group = content.AGE_GROUPS.some(a => a.id === req.body.age_group) ? req.body.age_group : "adult";
    // Birth year, town and state are optional here; paper forms aren't always filled in
    const birth_year_text = Readathon.clean(req.body.birth_year, 4);
    const birth_year = Readathon.parse_birth_year(birth_year_text);
    if(birth_year_text !== "" && birth_year === null) {
        return desk_back(req, res, "Birth year should be four digits, like 1958. Leave it blank if you don't know.");
    }
    Readathon.create_household(sqlite, {
        email: email || null,
        city: Readathon.clean(req.body.city, 60) || null,
        state: Readathon.parse_state(req.body.state),
        source: "desk",
        goal_minutes: content.DEFAULT_GOAL_MINUTES,
        readers: [{name, age_group, birth_year}],
    });
    desk_back(req, res, `Signed up ${name}. Give them a paper kit!`, name);
}

function desk_review(req, res, sqlite) {
    Readathon.review_recommendation(sqlite, Number(req.params.recommendation_id), req.body.status);
    desk_back(req, res, req.body.status === "approved" ? "Approved. It's on the book lists now." : "Declined. It won't be shown.");
}

function desk_team(req, res, sqlite) {
    Teams.set_hidden(sqlite, Number(req.params.team_id), req.body.hidden === "1");
    desk_back(req, res, req.body.hidden === "1" ? "Team hidden from the teams page." : "Team is showing again.");
}

// Volunteers sign in here instead of the main site's login, so the desk stays on the read-a-thon site
function require_volunteer(sqlite) {
    const admin = middleware.require_admin(sqlite);
    return (req, res, next) => {
        if(req.session.user === undefined) {
            return res.redirect(`${BASE}/volunteer?next=${encodeURIComponent(req.originalUrl)}`);
        }
        admin(req, res, next);
    };
}

function safe_next(value) {
    const next = String(value ?? "");
    return next.startsWith(`${BASE}/`) && !next.startsWith("//") ? next : `${BASE}/desk`;
}

function show_volunteer(req, res, locals = {}) {
    page(res, "volunteer", {title: "Volunteer sign-in", next: safe_next(req.query.next), ...locals});
}

async function volunteer_sign_in(req, res, next, sqlite) {
    const email = Readathon.clean(req.body.email, 200);
    try {
        req.session.user = await User.authenticate(sqlite, email, String(req.body.password ?? ""));
        res.redirect(safe_next(req.body.next));
    }
    catch(err) {
        if(!(err instanceof User.AuthenticationError)) {
            return next(err);
        }
        res.status(401);
        show_volunteer(req, res, {error: "That email and password don't match.", email, next: safe_next(req.body.next)});
    }
}

function create(sqlite) {
    const router = Router();
    const own = load_reader(sqlite);
    const volunteer = require_volunteer(sqlite);
    const wrap = handler => (req, res, next) => {
        try {
            handler(req, res, sqlite);
        }
        catch(err) {
            next(err);
        }
    };

    router.get("/", wrap(home));
    router.get("/join", (req, res) => show_join(req, res, undefined, undefined, [], sqlite));
    router.post("/join", wrap(join));
    router.get("/sign-in", (req, res) => show_sign_in(req, res));
    router.post("/sign-in", wrap(sign_in));
    router.get("/sign-in/:token", sign_in_with_token);
    router.get("/sign-out", sign_out);
    router.get("/me", wrap(me));

    router.get("/r/:reader_id", own, wrap(reader_home));
    router.post("/r/:reader_id/goal", own, wrap(update_goal));
    router.get("/r/:reader_id/reading-log", own, wrap(reading_log));
    router.get("/r/:reader_id/timer", own, wrap(timer));
    router.get("/r/:reader_id/log", own, wrap((req, res, db) => show_log(req, res, db, prefill_minutes(req.query.minutes))));
    router.post("/r/:reader_id/log", own, wrap(save_log));
    router.get("/r/:reader_id/yay", own, wrap(yay));
    router.get("/r/:reader_id/entries/:entry_id", own, wrap(edit_entry));
    router.post("/r/:reader_id/entries/:entry_id", own, wrap(save_entry));
    router.post("/r/:reader_id/entries/:entry_id/delete", own, wrap(remove_entry));
    router.get("/r/:reader_id/bingo", own, wrap((req, res, db) => bingo(req, res, db)));
    router.post("/r/:reader_id/bingo", own, wrap(toggle_square));
    router.post("/r/:reader_id/bingo/code", own, wrap(bingo_code));

    router.get("/books", wrap(books));
    router.get("/books/recommend", (req, res) => show_recommend(req, res));
    router.post("/books/recommend", wrap(recommend));
    router.get("/books/recommend/thanks", recommend_thanks);
    router.get("/how", how);

    router.get("/volunteer", (req, res) => show_volunteer(req, res));
    router.post("/volunteer", (req, res, next) => volunteer_sign_in(req, res, next, sqlite));
    router.get("/volunteer/sign-out", (req, res) => {
        delete req.session.user;
        res.redirect(BASE);
    });
    router.use(gift_routes.create(sqlite, {page, own}));
    router.use(team_routes.create(sqlite, {page, household_id}));

    router.get("/desk", volunteer, wrap((req, res, db) => desk(req, res, db)));
    router.post("/desk/minutes", volunteer, wrap(desk_add_minutes));
    router.post("/desk/readers", volunteer, wrap(desk_add_reader));
    router.post("/desk/pickups", volunteer, wrap(desk_pickup));
    router.post("/desk/teams/:team_id", volunteer, wrap(desk_team));
    router.post("/desk/recommendations/:recommendation_id", volunteer, wrap(desk_review));
    return router;
}

exports.create = create;
