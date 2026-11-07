// January 2027 Read-a-thon pages. Mounted at /readathon.
const config = require("config");
const content = require("../lib/readathon-content");
const Gifts = require("../lib/readathon-gifts");
const gift_routes = require("./readathon-gifts");
const team_routes = require("./readathon-teams");
const Teams = require("../lib/readathon-teams");
const middleware = require("../lib/middleware");
const Readathon = require("../lib/readathon");
const {Router} = require("express");
const Token = require("../lib/token");

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
        body_class: "theme-readathon",
        base: BASE,
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

function show_join(req, res, rows = [{name: "", age_group: "adult"}], form = {goal: "15"}, errors = [], sqlite = null) {
    const team_code = Readathon.clean(req.body?.team ?? req.query.team, 16);
    const team = sqlite && team_code ? Teams.get_by_code(sqlite, team_code) : null;
    page(res, "join", {
        team: team ? {name: team.name, code: team.code} : null,
        title: "Join",
        errors,
        form,
        rows: rows.map((row, i) => ({...row, i, number: i + 1, removable: i > 0})),
        can_add: rows.length < Readathon.MAX_READERS,
        goals: content.GOALS,
        ages: content.AGE_GROUPS,
    });
}

function join(req, res, sqlite) {
    const {errors, rows, household} = Readathon.parse_join(req.body);
    const form = {
        goal: String(req.body.goal ?? ""),
        email: Readathon.clean(req.body.email, 200),
        wants_updates: !!req.body.wants_updates,
    };
    // Without JavaScript, "Add another reader" submits the form and comes back with one more row
    if(req.body.add_reader !== undefined) {
        return show_join(req, res, [...rows, {name: "", age_group: "kid"}].slice(0, Readathon.MAX_READERS), form, [], sqlite);
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
                books: reader_stats.books,
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
        Readathon.list_marks(sqlite, reader.reader_id),
        Readathon.auto_squares(sqlite, reader, stats),
    );
    const goal = content.GOALS.find(g => g.minutes === reader.goal_minutes) ?? content.GOALS[1];
    page(res, "reader", {
        title: reader.name,
        nav: "me",
        welcome,
        phase: Readathon.phase(today),
        today_label: Readathon.label_day(today),
        initial: reader.name.charAt(0).toUpperCase(),
        several_readers: res.locals.readers.length > 1,
        stats,
        goal,
        goal_met: stats.today_minutes >= reader.goal_minutes,
        goal_percent: Math.min(100, Math.round(stats.today_minutes / reader.goal_minutes * 100)),
        goal_left: Math.max(0, reader.goal_minutes - stats.today_minutes),
        goals: content.GOALS.map(g => ({...g, current: g.minutes === reader.goal_minutes})),
        bookmark: Readathon.bookmark(stats.total),
        board,
        cheers: Gifts.reader_cheers(sqlite, reader.reader_id),
        team: reader.team_id ? Teams.progress(sqlite, Teams.get_team(sqlite, reader.team_id), today) : null,
        recent: entries.slice(0, 8).map(entry => ({...entry, day_label: Readathon.label_day(entry.day, today)})),
    });
}

function update_goal(req, res, sqlite) {
    const {reader} = res.locals;
    Readathon.set_goal(sqlite, reader.reader_id, Number.parseInt(req.body.goal, 10));
    res.redirect(`${BASE}/r/${reader.reader_id}`);
}

function timer(req, res, sqlite) {
    const {reader} = res.locals;
    const today = Readathon.today();
    page(res, "timer", {
        title: "Reading timer",
        body_class: "theme-readathon theme-readathon-night",
        is_open: Readathon.phase(today) === "during",
        today,
    });
}

function show_log(req, res, sqlite, form = {}, errors = []) {
    const {reader} = res.locals;
    const today = Readathon.today();
    const minutes = String(form.minutes ?? "20");
    page(res, "log", {
        title: "Add reading",
        nav: "me",
        errors,
        is_open: Readathon.phase(today) !== "before",
        form: {...form, minutes},
        minute_choices: [10, 15, 20, 30, 45, 60].map(n => ({n, checked: String(n) === minutes})),
        other_checked: minutes === "other",
        days: Readathon.loggable_days(today).slice(0, 14).map(day => ({
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
    const before = Readathon.stats(Readathon.list_entries(sqlite, reader.reader_id), today).total;
    Readathon.add_entry(sqlite, reader.reader_id, entry);
    req.session.readathon_yay = {reader_id: reader.reader_id, added: entry.minutes, before};
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
    const mark = Readathon.bookmark(stats.total, flash.before);
    const new_books = Math.floor(stats.total / Readathon.MINUTES_PER_BOOK)
        - Math.floor(flash.before / Readathon.MINUTES_PER_BOOK);
    const pin = Math.floor(stats.total / 600) > Math.floor(flash.before / 600);
    const team = reader.team_id ? Teams.progress(sqlite, Teams.get_team(sqlite, reader.team_id), Readathon.today()) : null;
    page(res, "yay", {
        title: "Nice reading!",
        added: flash.added,
        new_books,
        new_books_plural: new_books !== 1,
        pin,
        goal_met: stats.today_minutes >= reader.goal_minutes,
        stats,
        bookmark: mark,
        team,
    });
}

function remove_entry(req, res, sqlite) {
    const {reader} = res.locals;
    Readathon.delete_entry(sqlite, reader.reader_id, Number(req.params.entry_id));
    res.redirect(`${BASE}/r/${reader.reader_id}#log`);
}

function bingo(req, res, sqlite, message = null) {
    const {reader} = res.locals;
    const {stats} = reader_context(sqlite, reader);
    const board = Readathon.bingo_board(
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
    const definition = content.BINGO_SQUARES[square];
    if(definition && definition.kind !== "free" && definition.kind !== "auto") {
        const marked = Readathon.list_marks(sqlite, reader.reader_id).includes(square);
        Readathon.set_mark(sqlite, reader.reader_id, square, !marked);
    }
    res.redirect(`${BASE}/r/${reader.reader_id}/bingo`);
}

function bingo_code(req, res, sqlite) {
    const {reader} = res.locals;
    const square = Readathon.event_code_square(req.body.code);
    if(square < 0) {
        req.session.readathon_bingo_message = {
            bad: true,
            text: "We don't know that code. Check the screen at the event, or ask a volunteer.",
        };
    }
    else {
        Readathon.set_mark(sqlite, reader.reader_id, square, true, "code");
        req.session.readathon_bingo_message = {
            text: `Checked in! "${content.BINGO_SQUARES[square].label}" is marked.`,
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
            return {...reader, total: reader_stats.total, stickers: reader_stats.stickers};
        }),
        days: Readathon.loggable_days(today).slice(0, 14).map(day => ({day, label: Readathon.label_day(day, today)})),
        ages: content.AGE_GROUPS,
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
    desk_back(req, res, `Added ${entry.minutes} minutes for ${reader.name}.`, query);
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
    Readathon.create_household(sqlite, {
        email: email || null,
        source: "desk",
        goal_minutes: 15,
        readers: [{name, age_group}],
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

function create(sqlite) {
    const router = Router();
    const own = load_reader(sqlite);
    const admin = middleware.require_admin(sqlite);
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
    router.get("/r/:reader_id/timer", own, wrap(timer));
    router.get("/r/:reader_id/log", own, wrap((req, res, db) => show_log(req, res, db)));
    router.post("/r/:reader_id/log", own, wrap(save_log));
    router.get("/r/:reader_id/yay", own, wrap(yay));
    router.post("/r/:reader_id/entries/:entry_id/delete", own, wrap(remove_entry));
    router.get("/r/:reader_id/bingo", own, wrap((req, res, db) => bingo(req, res, db)));
    router.post("/r/:reader_id/bingo", own, wrap(toggle_square));
    router.post("/r/:reader_id/bingo/code", own, wrap(bingo_code));

    router.get("/books", wrap(books));
    router.get("/books/recommend", (req, res) => show_recommend(req, res));
    router.post("/books/recommend", wrap(recommend));
    router.get("/books/recommend/thanks", recommend_thanks);
    router.get("/how", how);

    router.use(gift_routes.create(sqlite, {page, own}));
    router.use(team_routes.create(sqlite, {page, household_id}));

    router.get("/desk", middleware.require_authentication, admin, wrap((req, res, db) => desk(req, res, db)));
    router.post("/desk/minutes", middleware.require_authentication, admin, wrap(desk_add_minutes));
    router.post("/desk/readers", middleware.require_authentication, admin, wrap(desk_add_reader));
    router.post("/desk/teams/:team_id", middleware.require_authentication, admin, wrap(desk_team));
    router.post("/desk/recommendations/:recommendation_id", middleware.require_authentication, admin, wrap(desk_review));
    return router;
}

exports.create = create;
