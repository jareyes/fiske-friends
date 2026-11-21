const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Event = require("../lib/event");
const Events = require("../lib/readathon-events");
const time = require("../lib/time");
const {DatabaseSync} = require("node:sqlite");
const {seed_events} = require("../bin/seed-readathon-events");
const {suite, test} = require("node:test");

function database() {
    const sqlite = new DatabaseSync(":memory:");
    const dirpath = path.join(__dirname, "..", "migrations");
    for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
        sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
    }
    // The read-a-thon's sample events aren't a migration; the demo loads them the same way
    seed_events(sqlite);
    return sqlite;
}

suite("migrations and seeds", () => {
    test("migrations alone add the tags but no read-a-thon events, and seeding twice adds them once", () => {
        const sqlite = new DatabaseSync(":memory:");
        const dirpath = path.join(__dirname, "..", "migrations");
        for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
            sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
        }
        assert.ok(Event.get_tag(sqlite, "readathon-2027-01"));
        assert.strictEqual(Event.list_tags(sqlite, "audience").length, 4);
        assert.strictEqual(Event.list_by_tag(sqlite, "readathon-2027-01", {include_unpublished: true}).length, 0);
        assert.strictEqual(seed_events(sqlite), 11);
        assert.strictEqual(seed_events(sqlite), 0);
        assert.strictEqual(Event.list_by_tag(sqlite, "readathon-2027-01").length, 11);
    });
});

suite("lib/event.js tags", () => {
    const sqlite = database();

    test("the read-a-thon's events come tagged with its series and who they're for", () => {
        const events = Event.list_by_tag(sqlite, "readathon-2027-01");
        assert.strictEqual(events.length, 11);
        assert.deepStrictEqual(Event.tags_for(sqlite, events[0].event_id).map(t => t.slug), ["all-ages", "readathon-2027-01"]);
        assert.strictEqual(events.find(e => e.title === "Author talk").bingo_code, "AUTHOR");
    });

    test("tags can be made from a name, once", () => {
        assert.strictEqual(Event.slugify("Summer Reading 2027!"), "summer-reading-2027");
        const tag = Event.create_tag(sqlite, {name: "  Summer   Reading 2027 ", kind: "series"});
        assert.deepStrictEqual([tag.slug, tag.name, tag.kind], ["summer-reading-2027", "Summer Reading 2027", "series"]);
        assert.strictEqual(Event.create_tag(sqlite, {name: "summer reading 2027", kind: "series"}).tag_id, tag.tag_id);
        assert.strictEqual(Event.create_tag(sqlite, {name: "Whatever", kind: "mood"}), null);
    });

    test("an event can be in two series, and drafts stay off the public list", () => {
        const now = Date.UTC(2027, 6, 1);
        const event = Event.create(sqlite, {title: "Summer kickoff", slug: "2027-07-10-summer-kickoff", start_ms: now, end_ms: now + 3600000,
            location: "Lawn", summary: "", description: "", is_published: 0, created_ms: now, updated_ms: now});
        const summer = Event.get_tag(sqlite, "summer-reading-2027");
        const kids = Event.get_tag(sqlite, "kids");
        const readathon = Event.create_tag(sqlite, {name: "Read-a-thon: Summer 2027", kind: "series"});
        Event.set_tags(sqlite, event.event_id, [summer.tag_id, readathon.tag_id, kids.tag_id, kids.tag_id]);
        assert.strictEqual(Event.tags_for(sqlite, event.event_id).length, 3);
        assert.strictEqual(Event.list_by_tag(sqlite, "summer-reading-2027").length, 0, "a draft");
        assert.strictEqual(Event.list_by_tag(sqlite, "summer-reading-2027", {include_unpublished: true}).length, 1);
        Event.update(sqlite, {...event, start_ms: now, end_ms: now + 3600000, is_published: 1, updated_ms: now, created_ms: now});
        assert.strictEqual(Event.list_by_tag(sqlite, "read-a-thon-summer-2027").length, 1);
    });
});

suite("lib/readathon-events.js", () => {
    const sqlite = database();

    test("times read the way people say them", () => {
        const at = (h, m = 0) => new Date(Date.UTC(2027, 0, 2, h + 5, m));
        assert.strictEqual(Events.time_range(at(10), at(13)), "10 AM to 1 PM");
        assert.strictEqual(Events.time_range(at(18, 30), at(20)), "6:30 to 8 PM");
        assert.strictEqual(Events.time_range(at(12), at(14)), "Noon to 2 PM");
    });

    test("upcoming events are grouped by week, and past ones drop off", () => {
        const all = Events.upcoming(sqlite, "2027-01-12");
        assert.strictEqual(all[0].title, "Silent Book Club");
        assert.strictEqual(all[0].day, "2027-01-14");
        const weeks = Events.by_week(all, "2027-01-12");
        assert.deepStrictEqual(weeks.map(w => [w.label, w.events.length]), [
            ["This week", 2], ["Week of Jan 17", 3], ["Week of Jan 24", 2], ["Week of Jan 31", 1],
        ]);
    });

    test("an event view has its badge, time, audiences, bingo tie-in and calendar links", () => {
        const view = Events.view(sqlite, Events.get(sqlite, "2027-01-16-author-talk"), "2027-01-12");
        assert.deepStrictEqual(view.badge, {day_name: "Sat", day_number: 16, month: "Jan"});
        assert.strictEqual(view.time_label, "2 to 3:30 PM");
        assert.deepStrictEqual(view.audiences.map(t => t.name), ["All ages"]);
        assert.strictEqual(view.on_bingo, true);
        assert.strictEqual(view.at_library, true);
        assert.match(view.google_calendar_url, /dates=20270116T190000Z%2F20270116T203000Z/);
        assert.match(view.map_url, /108%20Broad%20Street/);
        assert.strictEqual(Events.get(sqlite, "no-such-event"), null);
    });

    test("the calendar file has the event in UTC with the right line endings", () => {
        const view = Events.view(sqlite, Events.get(sqlite, "2027-01-02-kickoff-open-house"), "2026-12-01");
        const file = Events.ics(view, view.address, "https://read.fiskefriends.org/readathon/events/x", new Date(Date.UTC(2026, 11, 1)));
        assert.match(file, /^BEGIN:VCALENDAR\r\n/);
        assert.match(file, /DTSTART:20270102T150000Z\r\nDTEND:20270102T180000Z/);
        assert.match(file, /LOCATION:Whole library\\, Fiske Free Library\\, 108 Broad Street/);
        assert.ok(file.split("\r\n").every(line => line.length <= 75));
    });
});

suite("routes/planning.js event form", () => {
    const Planning = require("../routes/planning");
    const sqlite = database();
    const base = {title: "Book Sale", date: "2027-03-06", start_time: "09:00", end_time: "13:00", location: "Gilmore Room"};

    test("makes a web address from the date and title, and checks the times", () => {
        const {errors, event} = Planning.parse_event_form(sqlite, base);
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(event.slug, "2027-03-06-book-sale");
        assert.strictEqual(Planning.parse_event_form(sqlite, {...base, end_time: "08:00"}).errors[0], "The end time needs to be after the start time.");
        assert.strictEqual(Planning.parse_event_form(sqlite, {...base, title: "", date: ""}).errors.length, 2);
    });

    test("won't reuse another event's web address, and bingo codes are letters", () => {
        assert.match(Planning.parse_event_form(sqlite, {...base, slug: "2027-01-02-kickoff-open-house"}).errors[0], /already uses/);
        assert.match(Planning.parse_event_form(sqlite, {...base, bingo_code: "silent 2"}).errors[0], /letters only/);
        assert.strictEqual(Planning.parse_event_form(sqlite, {...base, bingo_code: "silent"}).event.bingo_code, "SILENT");
    });

    test("January times stay right even when saved in summer (daylight saving)", () => {
        assert.strictEqual(time.parse_datetime_local("2027-01-02T10:00"), Date.UTC(2027, 0, 2, 15));
        assert.strictEqual(time.parse_datetime_local("2027-07-10T10:00"), Date.UTC(2027, 6, 10, 14));
    });
});
