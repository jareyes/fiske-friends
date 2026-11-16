// The read-a-thon's events: the main site's events tagged with this read-a-thon's series
// (readathon.event_tag in the config), shaped for the read-a-thon pages.
const config = require("config");
const Event = require("./event");
const Readathon = require("./readathon");

const SETTINGS = config.get("readathon");
const TIMEZONE = config.get("app.timezone");
const LIBRARY_ADDRESS = SETTINGS.library_address ?? "Fiske Free Library, 108 Broad Street, Claremont, NH 03743";

function series_tag() {
    return SETTINGS.event_tag ?? null;
}

// The local date of a moment, "2027-01-02"
function local_day(date) {
    return new Intl.DateTimeFormat("en-CA", {timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit"}).format(date);
}

// "10 AM", "6:30 PM", "Noon"
function clock(date) {
    const parts = new Intl.DateTimeFormat("en-US", {timeZone: TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true}).formatToParts(date);
    const hour = parts.find(p => p.type === "hour").value;
    const minute = parts.find(p => p.type === "minute").value;
    const period = parts.find(p => p.type === "dayPeriod").value.toUpperCase();
    if(hour === "12" && minute === "00" && period === "PM") {
        return "Noon";
    }
    return minute === "00" ? `${hour} ${period}` : `${hour}:${minute} ${period}`;
}

// "10 AM to 1 PM", "6:30 to 8 PM"
function time_range(start, end) {
    const a = clock(start);
    const b = clock(end);
    const same_period = a.slice(-2) === b.slice(-2) && a !== "Noon" && b !== "Noon";
    return `${same_period ? a.slice(0, -3) : a} to ${b}`;
}

// 20270102T150000Z, for calendar links and files
function utc_stamp(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function google_calendar_url(event, address) {
    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: event.title,
        dates: `${utc_stamp(event.start)}/${utc_stamp(event.end)}`,
        details: event.summary ?? "",
        location: [event.location, address].filter(Boolean).join(", "),
    });
    return `https://calendar.google.com/calendar/render?${params}`;
}

function map_url(address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// A calendar file (.ics) that Apple Calendar, Outlook and others can open
function ics(event, address, url, now = new Date()) {
    const escape = text => String(text ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
    // Lines longer than 75 characters are folded, as the format requires
    const fold = line => line.length <= 75 ? line : line.match(/.{1,74}/g).join("\r\n ");
    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Friends of the Fiske Free Library//Read-a-thon//EN",
        "BEGIN:VEVENT",
        `UID:${event.slug}@fiskefriends.org`,
        `DTSTAMP:${utc_stamp(now)}`,
        `DTSTART:${utc_stamp(event.start)}`,
        `DTEND:${utc_stamp(event.end)}`,
        `SUMMARY:${escape(event.title)}`,
        `DESCRIPTION:${escape([event.summary, url].filter(Boolean).join("\n\n"))}`,
        `LOCATION:${escape([event.location, address].filter(Boolean).join(", "))}`,
        `URL:${url}`,
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ].map(fold).join("\r\n");
}

// An event with everything the read-a-thon pages show
function view(sqlite, event, today_day = Readathon.today()) {
    const day = local_day(event.start);
    const tags = Event.tags_for(sqlite, event.event_id);
    const address = event.address || LIBRARY_ADDRESS;
    return {
        ...event,
        day,
        badge: Readathon.event_date(day),
        day_label: Readathon.label_day(day, today_day),
        long_day: Readathon.long_day(day),
        time_label: time_range(event.start, event.end),
        audiences: tags.filter(t => t.kind === "audience"),
        series: tags.filter(t => t.kind === "series"),
        // The code itself is never shown, only that the event is a bingo square
        on_bingo: !!event.bingo_code && Readathon.is_event_code(event.bingo_code),
        address,
        at_library: !event.address,
        map_url: map_url(address),
        google_calendar_url: google_calendar_url(event, address),
    };
}

// Upcoming read-a-thon events (still going on today or later)
function upcoming(sqlite, today_day = Readathon.today(), limit = null) {
    const tag = series_tag();
    if(!tag) {
        return [];
    }
    const events = Event.list_by_tag(sqlite, tag)
        .map(event => view(sqlite, event, today_day))
        .filter(event => event.day >= today_day);
    return limit ? events.slice(0, limit) : events;
}

// Upcoming events grouped into Sunday-to-Saturday weeks
function by_week(events, today_day = Readathon.today()) {
    const weeks = [];
    for(const event of events) {
        const first = Readathon.add_days(event.day, -new Date(`${event.day}T12:00:00Z`).getUTCDay());
        let week = weeks.at(-1);
        if(!week || week.first !== first) {
            const this_week = first === Readathon.add_days(today_day, -new Date(`${today_day}T12:00:00Z`).getUTCDay());
            week = {first, label: this_week ? "This week" : week_label(first), events: []};
            weeks.push(week);
        }
        week.events.push(event);
    }
    return weeks;
}

// "Week of Jan 10"
function week_label(first) {
    const {month, day_number} = Readathon.event_date(first);
    return `Week of ${month} ${day_number}`;
}

function get(sqlite, slug) {
    const tag = series_tag();
    const event = Event.get_by_slug(sqlite, String(slug ?? ""));
    if(event === null || !event.is_published || !Event.tags_for(sqlite, event.event_id).some(t => t.slug === tag)) {
        return null;
    }
    return event;
}

exports.by_week = by_week;
exports.clock = clock;
exports.get = get;
exports.ics = ics;
exports.local_day = local_day;
exports.series_tag = series_tag;
exports.time_range = time_range;
exports.upcoming = upcoming;
exports.view = view;
