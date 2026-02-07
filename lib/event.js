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
    };
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
           updated_ms
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
           :updated_ms
         )`,
    );
    statement.run(event);
    return get_by_slug(event.slug);
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
           updated_ms = :updated_ms
         WHERE event_id = :event_id`,
    ).run(event);
    return get_by_slug(sqlite, event.slug);
}

exports.create = create;
exports.get_by_slug = get_by_slug;
exports.list = list;
exports.list_published = list_published;
exports.update = update;
