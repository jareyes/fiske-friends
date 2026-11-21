#!/usr/bin/env node
// Adds the January 2027 read-a-thon's sample events (seeds/readathon-2027-01-events.sql) to a database.
// Migrations don't include them, so the live site only gets them if someone runs this on purpose.
// Does nothing if the read-a-thon already has events, so running it twice won't make duplicates.
//
//   node bin/seed-readathon-events.js
const config = require("config");
const Event = require("../lib/event");
const fs = require("node:fs");
const path = require("node:path");
const {DatabaseSync} = require("node:sqlite");

const SEED_FILEPATH = path.join(__dirname, "..", "seeds", "readathon-2027-01-events.sql");

// Returns how many events were added (0 if it already had some)
function seed_events(sqlite, tag_slug = config.get("readathon.event_tag")) {
    if(Event.list_by_tag(sqlite, tag_slug, {include_unpublished: true}).length > 0) {
        return 0;
    }
    sqlite.exec("BEGIN");
    try {
        sqlite.exec(fs.readFileSync(SEED_FILEPATH, "utf8"));
        sqlite.exec("COMMIT");
    }
    catch(err) {
        sqlite.exec("ROLLBACK");
        throw err;
    }
    return Event.list_by_tag(sqlite, tag_slug, {include_unpublished: true}).length;
}

if(require.main === module) {
    const sqlite = new DatabaseSync(config.get("sqlite.filepath"));
    const added = seed_events(sqlite);
    console.log(added > 0
        ? `Added ${added} read-a-thon events. Edit them at /${config.get("app.mounts.planning")}/events.`
        : "The read-a-thon already has events, so nothing was added.");
}

exports.seed_events = seed_events;
