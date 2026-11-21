// The site's emails: what each one says, built from templates in views/emails. Mostly the read-a-thon's
// (in its winter look), plus the board's password reset (in the Friends' look, layouts/friends.hbs).
//
// Each email has a styled version (views/emails/<name>.hbs, in layouts/html.hbs) and a plain-text
// version (views/emails/<name>.text.hbs, in layouts/text.hbs). Admins can preview every email with
// sample details at /plan/emails without sending anything.
const config = require("config");
const Events = require("./readathon-events");
const hbs = require("express-handlebars");
const path = require("node:path");
const Readathon = require("./readathon");
const helpers = require("./template");
const Token = require("./token");

const APP = config.get("app");
const SETTINGS = config.get("readathon");
const SITE_URL = `${APP.protocol}://${APP.domain}`;
const BASE_URL = `${SITE_URL}/${config.get("app.mounts.readathon")}`;
const SIGN_IN_LINK_DAYS = 7;
const SESSION_DAYS = 60;
const VIEWS = path.join(__dirname, "..", "views", "emails");

const engine_settings = {
    extname: ".hbs",
    layoutsDir: path.join(VIEWS, "layouts"),
    partialsDir: path.join(VIEWS, "partials"),
    helpers,
};
const HTML = hbs.create({...engine_settings, defaultLayout: "html"});
// Plain text isn't HTML, so nothing gets turned into &amp; and friends
const TEXT = hbs.create({...engine_settings, defaultLayout: "text", compilerOptions: {noEscape: true}});

// "Katie", "Katie and Sam", "Katie, Sam and Rosa"
function names(list) {
    const all = list.filter(Boolean);
    return all.length <= 1 ? (all[0] ?? "") : `${all.slice(0, -1).join(", ")} and ${all.at(-1)}`;
}

// A sign-in link for a household, good for a week
function sign_in_link(household_id) {
    const token = Token.sign(`readathon:${household_id}`, SIGN_IN_LINK_DAYS * 24 * 60 * 60 * 1000);
    return `${BASE_URL}/sign-in/${token}`;
}

function shared(data) {
    return {
        site_url: SITE_URL,
        base_url: BASE_URL,
        logo_url: `${SITE_URL}/img/readathon/logo-email.png`,
        library_address: SETTINGS.library_address,
        date_range: "January 1 to 31, 2027",
        sign_in_link_days: SIGN_IN_LINK_DAYS,
        session_days: SESSION_DAYS,
        ...data,
    };
}

// layout "html" is the read-a-thon's; "friends" is the Friends' own
async function render(name, subject, preheader, data, layout = "html") {
    const context = shared({...data, subject, preheader});
    const [html, text] = await Promise.all([
        HTML.renderView(path.join(VIEWS, `${name}.hbs`), {...context, layout}),
        TEXT.renderView(path.join(VIEWS, `${name}.text.hbs`), {...context, layout: layout === "html" ? "text" : `${layout}-text`}),
    ]);
    // Templates leave blank lines where {{#if}} blocks were skipped; keep at most one in a row
    return {subject, html, text: text.replace(/\n{3,}/g, "\n\n").trim() + "\n"};
}

// ---------- the emails ----------
// Each takes plain details (not the database) so the previews can use sample ones.

// Sent when someone asks for a sign-in link. {link, reader_names: ["Katie", ...]}
function sign_in(details) {
    return render("sign-in", "Your Resolve to Read sign-in link",
        `Tap the button to sign in. It works for ${SIGN_IN_LINK_DAYS} days.`, {
            link: details.link,
            readers: names(details.reader_names ?? []),
        });
}

// Sent right after a household joins.
// {link, readers: [{name, goal_minutes}], phase: "before" | "during" | "after", wants_updates, next_event}
function welcome(details) {
    const before = details.phase === "before";
    return render("welcome", "Welcome to Resolve to Read!",
        before ? "Reading starts January 1. Here's how it works." : "You're all set. Every minute you read this month counts.", {
            link: details.link,
            before,
            button: before ? "Get ready" : "Open my reading",
            readers: (details.readers ?? []).map(reader => ({name: reader.name, goal: Readathon.goal_label(reader.goal_minutes)})),
            several: (details.readers ?? []).length > 1,
            wants_updates: !!details.wants_updates,
            next_event: details.next_event ?? null,
        });
}

// Sent when a board member asks for a reset link on the Sign in page. {first_name, link}
function password_reset(details) {
    return render("password-reset", "Reset your Friends password", "Choose a new password. The link works once, for 24 hours.", {
        first_name: details.first_name,
        link: details.link,
        hours: 24,
    }, "friends");
}

// ---------- from the database ----------

function event_details(view) {
    return view && {
        title: view.title,
        when: `${view.long_day}, ${view.time_label}`,
        location: view.location,
        url: `${BASE_URL}/events/${view.slug}`,
    };
}

async function sign_in_for(sqlite, household) {
    const readers = Readathon.list_readers(sqlite, household.household_id);
    const message = await sign_in({link: sign_in_link(household.household_id), reader_names: readers.map(r => r.name)});
    return {...message, to: household.email, kind: "sign-in", household_id: household.household_id};
}

async function password_reset_for(user) {
    const User = require("./user");
    const link = `${SITE_URL}/${config.get("app.mounts.auth")}/reset/${User.reset_token(user)}`;
    const message = await password_reset({first_name: user.first_name, link});
    return {...message, to: user.email, kind: "password-reset", from_name: "Friends of the Fiske Free Library"};
}

async function welcome_for(sqlite, household, today = Readathon.today()) {
    const readers = Readathon.list_readers(sqlite, household.household_id);
    const [next] = Events.upcoming(sqlite, today, 1);
    const message = await welcome({
        link: sign_in_link(household.household_id),
        readers,
        phase: Readathon.phase(today),
        wants_updates: household.wants_updates,
        next_event: event_details(next),
    });
    return {...message, to: household.email, kind: "welcome", household_id: household.household_id};
}

// ---------- previews ----------

const SAMPLE_READERS = [
    {name: "Katie", goal_minutes: 600},
    {name: "Sam", goal_minutes: 300},
    {name: "Grandma Rose", goal_minutes: 1200},
];
const SAMPLE_LINK = `${BASE_URL}/sign-in/sample-link-for-preview`;
const SAMPLE_EVENT = {
    title: "Kickoff open house",
    when: "Saturday, January 2, 10 AM to 1 PM",
    location: "Whole library",
    url: `${BASE_URL}/events`,
};

// What the admin previews list. variants are versions worth seeing, like before and during January.
const PREVIEWS = [
    {
        id: "sign-in",
        name: "Sign-in link",
        when: "Someone enters their email on the Sign in page and it's signed up.",
        variants: [{id: "default", name: "Sign-in link"}],
        build: () => sign_in({link: SAMPLE_LINK, reader_names: SAMPLE_READERS.map(r => r.name)}),
    },
    {
        id: "welcome",
        name: "Welcome",
        when: "A household joins online, or the desk signs one up with an email address.",
        variants: [
            {id: "before", name: "Joined before January"},
            {id: "during", name: "Joined during January"},
        ],
        build: variant => welcome({
            link: SAMPLE_LINK,
            readers: SAMPLE_READERS,
            phase: variant === "during" ? "during" : "before",
            wants_updates: true,
            next_event: SAMPLE_EVENT,
        }),
    },
];

PREVIEWS.push({
    id: "password-reset",
    name: "Password reset (board)",
    when: "A board member asks for a reset link with \"Forgot your password?\" on the Sign in page.",
    variants: [{id: "default", name: "Password reset"}],
    from_name: "Friends of the Fiske Free Library",
    build: () => password_reset({first_name: "Pat", link: `${SITE_URL}/${config.get("app.mounts.auth")}/reset/sample-link-for-preview`}),
});

function preview_list() {
    return PREVIEWS.map(({build, ...preview}) => preview);
}

// {preview, variant, message} or null
async function preview(id, variant_id) {
    const found = PREVIEWS.find(p => p.id === id);
    if(!found) {
        return null;
    }
    const variant = found.variants.find(v => v.id === variant_id) ?? found.variants[0];
    const {build, ...info} = found;
    return {preview: info, variant, message: await build(variant.id)};
}

exports.names = names;
exports.password_reset = password_reset;
exports.password_reset_for = password_reset_for;
exports.preview = preview;
exports.preview_list = preview_list;
exports.sign_in = sign_in;
exports.sign_in_for = sign_in_for;
exports.welcome = welcome;
exports.welcome_for = welcome_for;
