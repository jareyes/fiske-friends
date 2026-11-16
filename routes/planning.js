// The planning admin: the Friends' events, for admins only. Mounted at /plan.
//
//   /plan/events               every event, upcoming first, with filters
//   /plan/events/create        a new event
//   /plan/event/:slug          edit an event
const config = require("config");
const Event = require("../lib/event");
const Events = require("../lib/readathon-events");
const Readathon = require("../lib/readathon");
const {Router} = require("express");
const middleware = require("../lib/middleware");
const time = require("../lib/time");

const MOUNTS = config.get("app.mounts");
const TIMEZONE = config.get("app.timezone");
const READATHON = config.get("readathon");
const STYLESHEET = '<link rel="stylesheet" href="/css/admin.css">';

function clean(value, max_length = 200) {
    return String(value ?? "").trim().slice(0, max_length);
}

// Pieces of a date in the site's time zone, for the form: {date: "2027-01-02", time: "10:00"}
function local_parts(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(date);
    const get = type => parts.find(p => p.type === type).value;
    return {date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`};
}

function tag_ids(value) {
    const list = Array.isArray(value) ? value : (value === undefined ? [] : [value]);
    return list.map(v => Number.parseInt(v, 10)).filter(Number.isInteger);
}

// Checks the event form. Returns {errors, event, tags, new_series}
function parse_event_form(sqlite, body, existing = null) {
    const errors = [];
    const title = clean(body.title, 120);
    if(title === "") {
        errors.push("Give the event a title.");
    }
    const date = clean(body.date, 10);
    const start_ms = time.parse_datetime_local(`${date}T${clean(body.start_time, 5)}`);
    const end_ms = time.parse_datetime_local(`${date}T${clean(body.end_time, 5)}`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(start_ms)) {
        errors.push("Pick a date and a start time.");
    }
    else if(Number.isNaN(end_ms) || end_ms <= start_ms) {
        errors.push("The end time needs to be after the start time.");
    }
    let slug = Event.slugify(body.slug);
    if(slug === "" && title !== "" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        slug = `${date}-${Event.slugify(title)}`;
    }
    const taken = slug ? Event.get_by_slug(sqlite, slug) : null;
    if(taken && taken.event_id !== existing?.event_id) {
        errors.push(`Another event already uses the web address "${slug}". Change the title or the web address.`);
    }
    const bingo_code = clean(body.bingo_code, 20).toUpperCase();
    if(bingo_code && !/^[A-Z]+$/.test(bingo_code)) {
        errors.push("A bingo code is letters only, like SILENT.");
    }
    const tags = tag_ids(body.tags);
    const new_series = clean(body.new_series, 60);
    return {
        errors,
        event: {
            event_id: existing?.event_id,
            title,
            summary: clean(body.summary, 500),
            description: clean(body.description, 5000),
            location: clean(body.location, 120),
            address: clean(body.address, 200) || null,
            bingo_code: bingo_code || null,
            start_ms,
            end_ms,
            slug,
            is_published: body.is_published ? 1 : 0,
        },
        tags,
        new_series,
        form: {...body, tags},
    };
}

function tag_choices(sqlite, checked_ids) {
    const checked = new Set(checked_ids);
    const tags = Event.list_tags(sqlite).map(tag => ({...tag, checked: checked.has(tag.tag_id)}));
    return {
        series: tags.filter(t => t.kind === "series"),
        audiences: tags.filter(t => t.kind === "audience"),
    };
}

function show_form(req, res, sqlite, {form, event = null, errors = []}) {
    const choices = tag_choices(sqlite, form.tags ?? []);
    const code = clean(form.bingo_code, 20).toUpperCase();
    res.render("planning/event-edit", {
        title: event ? `Edit ${event.title}` : "New event",
        head: STYLESHEET,
        event,
        form,
        errors,
        series: choices.series,
        audiences: choices.audiences,
        bingo_warning: code && /^[A-Z]+$/.test(code) && !Readathon.is_event_code(code)
            ? `${code} isn't on any read-a-thon bingo card yet, so it won't mark a square.` : null,
        readathon_url: event && event.is_published ? `/${MOUNTS.readathon}/events/${event.slug}` : null,
    });
}

function list_events(req, res, next, sqlite) {
    try {
        const now_ms = Date.now();
        const when = ["past", "all"].includes(req.query.when) ? req.query.when : "upcoming";
        const series = clean(req.query.series, 80);
        let events = Event.list(sqlite).map(event => ({...event, tags: Event.tags_for(sqlite, event.event_id)}));
        if(series) {
            events = events.filter(event => event.tags.some(t => t.slug === series));
        }
        if(when === "upcoming") {
            events = events.filter(event => event.end.getTime() >= now_ms);
        }
        else if(when === "past") {
            events = events.filter(event => event.end.getTime() < now_ms).reverse();
        }
        const message = req.session.planning_message ?? null;
        delete req.session.planning_message;
        res.render("planning/events-list", {
            title: "Events",
            head: STYLESHEET,
            message,
            when,
            series,
            whens: [["upcoming", "Upcoming"], ["past", "Past"], ["all", "All"]].map(([id, name]) => ({id, name, current: id === when})),
            series_tags: Event.list_tags(sqlite, "series").map(tag => ({...tag, current: tag.slug === series})),
            readathon_tag: READATHON.event_tag,
            events: events.map(event => ({
                ...event,
                time_label: Events.time_range(event.start, event.end),
                series_tags: event.tags.filter(t => t.kind === "series"),
                audience_tags: event.tags.filter(t => t.kind === "audience"),
                on_readathon: event.tags.some(t => t.slug === READATHON.event_tag),
            })),
        });
    }
    catch(err) {
        next(err);
    }
}

function create_event(req, res, next, sqlite) {
    try {
        // Most events are at the library and published; new ones start tagged like the current filter
        const series = Event.get_tag(sqlite, clean(req.query.series, 80));
        show_form(req, res, sqlite, {form: {start_time: "18:00", end_time: "19:00", is_published: "1", tags: series ? [series.tag_id] : []}});
    }
    catch(err) {
        next(err);
    }
}

function edit_event(req, res, next, sqlite) {
    try {
        const event = Event.get_by_slug(sqlite, req.params.slug);
        if(event === null) {
            return res.redirect(`/${MOUNTS.planning}/events`);
        }
        const start = local_parts(event.start);
        const end = local_parts(event.end);
        show_form(req, res, sqlite, {
            event,
            form: {
                ...event,
                date: start.date,
                start_time: start.time,
                end_time: end.time,
                is_published: event.is_published ? "1" : "",
                tags: Event.tags_for(sqlite, event.event_id).map(t => t.tag_id),
            },
        });
    }
    catch(err) {
        next(err);
    }
}

function save_event(req, res, next, sqlite) {
    try {
        const existing = req.body.event_id ? Event.get_by_id(sqlite, req.body.event_id) : null;
        const {errors, event, tags, new_series, form} = parse_event_form(sqlite, req.body, existing);
        if(errors.length > 0) {
            res.status(400);
            return show_form(req, res, sqlite, {form, event: existing, errors});
        }
        if(new_series) {
            const tag = Event.create_tag(sqlite, {name: new_series, kind: "series"});
            if(tag) {
                tags.push(tag.tag_id);
            }
        }
        const now_ms = Date.now();
        let saved;
        if(existing) {
            saved = Event.update(sqlite, {...event, event_id: existing.event_id, updated_ms: now_ms});
            console.log({event: "Planning.UPDATE", slug: event.slug});
        }
        else {
            const {event_id, ...fields} = event;
            saved = Event.create(sqlite, {...fields, created_ms: now_ms, updated_ms: now_ms});
            console.log({event: "Planning.CREATE", slug: event.slug});
        }
        Event.set_tags(sqlite, saved.event_id, tags);
        req.session.planning_message = `Saved "${saved.title}".${saved.is_published ? "" : " It's a draft, so it isn't on the website yet."}`;
        res.redirect(`/${MOUNTS.planning}/events`);
    }
    catch(err) {
        next(err);
    }
}

function create(sqlite) {
    const router = new Router();
    router.use(middleware.require_authentication);
    router.use(middleware.require_admin(sqlite));
    router.get("/event/:slug", middleware.supply(edit_event, sqlite));
    router.get("/events", middleware.supply(list_events, sqlite));
    router.get("/events/create", middleware.supply(create_event, sqlite));
    router.post("/events/save", middleware.supply(save_event, sqlite));
    return router;
}

exports.create = create;
exports.parse_event_form = parse_event_form;
