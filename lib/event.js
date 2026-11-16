function convert(row) {
    return {
        event_id: row.event_id,
        created_at: new Date(row.created_ms),
        description: row.description,
        end: new Date(row.end_ms),
        is_published: !!row.is_published,
        location: row.location,
        title: row.title,
        slug: row.slug,
        start: new Date(row.start_ms),
        summary: row.summary,
        updated_at: new Date(row.updated_ms),
        bingo_code: row.bingo_code ?? null,
        address: row.address ?? null,
    };
}

const COLUMNS = ["description", "end_ms", "is_published", "location", "title", "slug", "start_ms", "summary",
    "updated_ms", "bingo_code", "address"];

// Just the columns a statement uses: node:sqlite refuses unknown named parameters, and an event from
// get_by_slug carries extras like start and created_at.
function columns(event, extra) {
    const row = {bingo_code: null, address: null};
    for(const name of [...COLUMNS, ...extra]) {
        if(event[name] !== undefined) {
            row[name] = event[name];
        }
    }
    return row;
}

function create(sqlite, event) {
    const statement = sqlite.prepare(
        `INSERT INTO events (
           created_ms,
           description,
           end_ms,
           is_published,
           location,
           title,
           slug,
           start_ms,
           summary,
           updated_ms,
           bingo_code,
           address
         ) VALUES (
           :created_ms,
           :description,
           :end_ms,
           :is_published,
           :location,
           :title,
           :slug,
           :start_ms,
           :summary,
           :updated_ms,
           :bingo_code,
           :address
         )`,
    );
    statement.run(columns(event, ["created_ms"]));
    return get_by_slug(sqlite, event.slug);
}

function get_by_slug(sqlite, slug) {
    const statement = sqlite.prepare(
        `SELECT * FROM events WHERE slug=:slug`,
    );
    const row = statement.get({slug});
    if(row === undefined) {
        return null;
    }
    const event = convert(row);
    return event;
}

function get_by_id(sqlite, event_id) {
    const row = sqlite.prepare("SELECT * FROM events WHERE event_id = :event_id").get({event_id: Number(event_id)});
    return row === undefined ? null : convert(row);
}

// TODO: Yes, I know that 0 is January 1, 1970
// We didn't start planning events until 2023
function list(sqlite, since_ms=0) {
    const statement = sqlite.prepare(
        `SELECT * FROM events ORDER BY start_ms ASC`
    );
    const rows = statement.all();
    const events = rows.map(convert);
    return events;
}

function list_published(sqlite, since_ms=0) {
       const statement = sqlite.prepare(
        `SELECT * FROM events
         WHERE
            start_ms > :since_ms AND
            is_published > 0
         ORDER BY start_ms ASC`
    );
    const rows = statement.all({since_ms});
    const events = rows.map(convert);
    return events;
}

function update(sqlite, event) {
    sqlite.prepare(
        `UPDATE events SET
           description = :description,
           end_ms = :end_ms,
           is_published = :is_published,
           location = :location,
           title = :title,
           slug = :slug,
           start_ms = :start_ms,
           summary = :summary,
           updated_ms = :updated_ms,
           bingo_code = :bingo_code,
           address = :address
         WHERE event_id = :event_id`,
    ).run(columns(event, ["event_id"]));
    return get_by_slug(sqlite, event.slug);
}

// ---------- tags ----------
// General labels for events. kind "series" is a program or series (a read-a-thon, summer reading);
// kind "audience" is who it's for (kids, teens, grown-ups, all ages). An event can have any number.

const TAG_KINDS = ["series", "audience"];

// "Summer Reading 2027!" -> "summer-reading-2027"
function slugify(text) {
    return String(text ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function list_tags(sqlite, kind = null) {
    return sqlite.prepare(
        `SELECT * FROM event_tags ${kind ? "WHERE kind = :kind" : ""} ORDER BY kind, sort, name COLLATE NOCASE`,
    ).all(kind ? {kind} : {});
}

function get_tag(sqlite, slug) {
    return sqlite.prepare("SELECT * FROM event_tags WHERE slug = :slug").get({slug}) ?? null;
}

// Makes a tag, or returns the existing one with the same slug
function create_tag(sqlite, {name, kind}, now_ms = Date.now()) {
    const clean_name = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    const slug = slugify(clean_name);
    if(slug === "" || !TAG_KINDS.includes(kind)) {
        return null;
    }
    sqlite.prepare(
        "INSERT OR IGNORE INTO event_tags (slug, name, kind, created_ms) VALUES (:slug, :name, :kind, :now_ms)",
    ).run({slug, name: clean_name, kind, now_ms});
    return get_tag(sqlite, slug);
}

function tags_for(sqlite, event_id) {
    return sqlite.prepare(
        `SELECT t.* FROM event_tags t JOIN event_tag_links l ON l.tag_id = t.tag_id
         WHERE l.event_id = :event_id ORDER BY t.kind, t.sort, t.name COLLATE NOCASE`,
    ).all({event_id});
}

// Replaces an event's tags with these tag ids
function set_tags(sqlite, event_id, tag_ids) {
    sqlite.prepare("DELETE FROM event_tag_links WHERE event_id = :event_id").run({event_id});
    const insert = sqlite.prepare("INSERT OR IGNORE INTO event_tag_links (event_id, tag_id) VALUES (:event_id, :tag_id)");
    for(const tag_id of new Set(tag_ids)) {
        insert.run({event_id, tag_id});
    }
}

// Events with a tag, soonest first. Only published ones unless include_unpublished.
function list_by_tag(sqlite, tag_slug, {since_ms = 0, include_unpublished = false} = {}) {
    return sqlite.prepare(
        `SELECT e.* FROM events e
         JOIN event_tag_links l ON l.event_id = e.event_id
         JOIN event_tags t ON t.tag_id = l.tag_id
         WHERE t.slug = :tag_slug AND e.end_ms > :since_ms ${include_unpublished ? "" : "AND e.is_published > 0"}
         ORDER BY e.start_ms ASC`,
    ).all({tag_slug, since_ms}).map(convert);
}

exports.TAG_KINDS = TAG_KINDS;
exports.create_tag = create_tag;
exports.get_tag = get_tag;
exports.list_by_tag = list_by_tag;
exports.list_tags = list_tags;
exports.set_tags = set_tags;
exports.slugify = slugify;
exports.tags_for = tags_for;
exports.create = create;
exports.get_by_id = get_by_id;
exports.get_by_slug = get_by_slug;
exports.list = list;
exports.list_published = list_published;
exports.update = update;
