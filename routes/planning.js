// The planning admin: the Friends' events, for admins only. Mounted at /plan.
//
//   /plan                      the admin home: what's here, and anything that needs a look
//   /plan/events               every event, upcoming first, with filters
//   /plan/events/create        a new event
//   /plan/event/:slug          edit an event
//   /plan/emails               preview the site's emails, send tests, see what's been sent
const config = require("config");
const Event = require("../lib/event");
const Emails = require("../lib/readathon-emails");
const Events = require("../lib/readathon-events");
const Mailer = require("../lib/mailer");
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

// ---------- emails ----------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUS_NAMES = {outbox: "In the outbox", sending: "Sending", sent: "Sent", failed: "Didn't send"};

const SITE_URL = `${config.get("app.protocol")}://${config.get("app.domain")}`;

// Emails use full addresses for images (an email has no site of its own), and those point at the live
// site, which may not have a new image yet. Previews load images from this server instead; links are
// left alone, so the preview still shows where they really go.
function local_images(html) {
    return html.replaceAll(`src="${SITE_URL}/`, 'src="/');
}

// Email bodies are shown in a sandboxed frame; they get no scripts and only load images
function send_email_html(res, html) {
    html = local_images(html);
    res.set("Content-Security-Policy", "default-src 'none'; img-src * data:; style-src 'unsafe-inline'; sandbox allow-popups allow-popups-to-escape-sandbox");
    res.type("html").send(html);
}

function take_message(req) {
    const message = req.session.planning_message ?? null;
    delete req.session.planning_message;
    return message;
}

function list_emails(req, res, next, sqlite) {
    try {
        res.render("planning/emails", {
            title: "Emails",
            head: STYLESHEET,
            message: take_message(req),
            mail: Mailer.status(),
            previews: Emails.preview_list(),
            emails: Mailer.list_recent(sqlite, 100).map(email => ({
                ...email,
                status_name: STATUS_NAMES[email.status] ?? email.status,
            })),
        });
    }
    catch(err) {
        next(err);
    }
}

async function preview_email(req, res, next) {
    try {
        const found = await Emails.preview(req.params.id, req.query.variant);
        if(found === null) {
            return res.redirect(`/${MOUNTS.planning}/emails`);
        }
        res.render("planning/email-preview", {
            title: `Preview: ${found.preview.name}`,
            head: STYLESHEET,
            flash: take_message(req),
            mail: Mailer.status(),
            ...found,
            variants: found.preview.variants.map(v => ({...v, current: v.id === found.variant.id})),
            from: Mailer.from_with_name(found.preview.from_name),
            test_to: req.session.user?.email ?? "",
        });
    }
    catch(err) {
        next(err);
    }
}

async function preview_email_html(req, res, next) {
    try {
        const found = await Emails.preview(req.params.id, req.query.variant);
        if(found === null) {
            return res.sendStatus(404);
        }
        send_email_html(res, found.message.html);
    }
    catch(err) {
        next(err);
    }
}

async function send_test_email(req, res, next, sqlite) {
    try {
        const found = await Emails.preview(req.params.id, req.body.variant);
        const back = `/${MOUNTS.planning}/emails/preview/${encodeURIComponent(req.params.id)}?variant=${encodeURIComponent(found?.variant.id ?? "")}`;
        if(found === null) {
            return res.redirect(`/${MOUNTS.planning}/emails`);
        }
        const to = clean(req.body.to, 200);
        if(!EMAIL_PATTERN.test(to)) {
            req.session.planning_message = "Enter an email address to send the test to.";
            return res.redirect(back);
        }
        const result = await Mailer.send(sqlite, {
            ...found.message,
            subject: `[Test] ${found.message.subject}`,
            from_name: found.preview.from_name,
            to,
            kind: found.preview.id,
            is_test: true,
        });
        console.log({event: "Planning.TEST_EMAIL", kind: found.preview.id, status: result.status});
        req.session.planning_message = {
            sent: `Sent a test to ${to}. It can take a minute to arrive; check spam if it doesn't.`,
            outbox: "Email isn't set up here, so the test went to the outbox instead. It's at the top of the list on the Emails page.",
            failed: `The test didn't send: ${result.error}`,
        }[result.status];
        res.redirect(back);
    }
    catch(err) {
        next(err);
    }
}

async function check_email_connection(req, res, next) {
    try {
        const result = await Mailer.verify();
        req.session.planning_message = result.ok
            ? "The mail server answered and accepted the login. Emails will send."
            : `Couldn't connect to the mail server: ${result.error}`;
        res.redirect(`/${MOUNTS.planning}/emails`);
    }
    catch(err) {
        next(err);
    }
}

function show_sent_email(req, res, next, sqlite) {
    try {
        const email = Mailer.get(sqlite, req.params.email_id);
        if(email === null) {
            return res.redirect(`/${MOUNTS.planning}/emails`);
        }
        res.render("planning/email-sent", {
            title: email.subject,
            head: STYLESHEET,
            email: {...email, status_name: STATUS_NAMES[email.status] ?? email.status},
        });
    }
    catch(err) {
        next(err);
    }
}

function sent_email_html(req, res, next, sqlite) {
    try {
        const email = Mailer.get(sqlite, req.params.email_id);
        if(email === null || email.html === null) {
            return res.sendStatus(404);
        }
        send_email_html(res, email.html);
    }
    catch(err) {
        next(err);
    }
}

// ---------- home ----------

function home(req, res, next, sqlite) {
    try {
        const now_ms = Date.now();
        const events = Event.list(sqlite);
        const upcoming = events.filter(event => event.end.getTime() >= now_ms);
        const emails = Mailer.list_recent(sqlite, 500);
        const week_ago = now_ms - 7 * 24 * 60 * 60 * 1000;
        res.render("planning/home", {
            title: "Admin",
            head: STYLESHEET,
            first_name: req.session.user?.first_name ?? "",
            upcoming_count: upcoming.length,
            draft_count: upcoming.filter(event => !event.is_published).length,
            next_event: upcoming.find(event => event.is_published) ?? null,
            mail: Mailer.status(),
            sent_this_week: emails.filter(email => email.created_ms >= week_ago && email.status === "sent").length,
            outbox_count: emails.filter(email => email.status === "outbox").length,
            failed_count: emails.filter(email => email.created_ms >= week_ago && email.status === "failed").length,
        });
    }
    catch(err) {
        next(err);
    }
}

function create(sqlite) {
    const router = new Router();
    router.use(middleware.require_authentication);
    router.use(middleware.require_admin(sqlite));
    router.get("/", middleware.supply(home, sqlite));
    router.get("/event/:slug", middleware.supply(edit_event, sqlite));
    router.get("/events", middleware.supply(list_events, sqlite));
    router.get("/events/create", middleware.supply(create_event, sqlite));
    router.post("/events/save", middleware.supply(save_event, sqlite));
    router.get("/emails", middleware.supply(list_emails, sqlite));
    router.post("/emails/check", check_email_connection);
    router.get("/emails/preview/:id", preview_email);
    router.get("/emails/preview/:id/html", preview_email_html);
    router.post("/emails/test/:id", middleware.supply(send_test_email, sqlite));
    router.get("/emails/sent/:email_id", middleware.supply(show_sent_email, sqlite));
    router.get("/emails/sent/:email_id/html", middleware.supply(sent_email_html, sqlite));
    return router;
}

exports.create = create;
exports.parse_event_form = parse_event_form;
