// "What I'm reading": each reader's books. Log entries keep their title as text, and are matched to a
// book on the shelf by title_key, so "the hobbit" and "The Hobbit" are the same book.
//
// Every title logged lands on the shelf (add_entry and update_entry call ensure), and a book can be
// added before any reading. Readers mark books finished; finished books stay, with their time.
const content = require("./readathon-content");

const TITLE_MAX = 120;
const AUTHOR_MAX = 80;

function clean(value, max_length) {
    return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max_length);
}

// Lowercases A-Z only, the same as SQLite's lower() (migration 019 uses it on old entries)
function title_key(title) {
    return clean(title, TITLE_MAX).replace(/[A-Z]/g, c => c.toLowerCase());
}

// A book typed in by a reader: {errors, book: {title, author, format}}
function parse_book(body) {
    const title = clean(body.title, TITLE_MAX);
    const format = clean(body.format, 40);
    return {
        errors: title === "" ? ["What's the book called?"] : [],
        book: {
            title,
            author: clean(body.author, AUTHOR_MAX) || null,
            format: content.FORMATS.includes(format) ? format : null,
        },
    };
}

function get(sqlite, reader_id, shelf_id) {
    return sqlite.prepare("SELECT * FROM readathon_shelf WHERE reader_id = :reader_id AND shelf_id = :shelf_id")
        .get({reader_id, shelf_id: Number(shelf_id) || 0}) ?? null;
}

function by_title(sqlite, reader_id, title) {
    return sqlite.prepare("SELECT * FROM readathon_shelf WHERE reader_id = :reader_id AND title_key = :key")
        .get({reader_id, key: title_key(title)}) ?? null;
}

// Puts a book on the shelf if it isn't there, and fills in an author or format it didn't have.
// Returns the shelf row (or null for a blank title).
function ensure(sqlite, reader_id, {title, author = null, format = null}, now_ms = Date.now()) {
    const key = title_key(title);
    if(key === "") {
        return null;
    }
    sqlite.prepare(
        `INSERT INTO readathon_shelf (reader_id, title, title_key, author, format, created_ms)
         VALUES (:reader_id, :title, :key, :author, :format, :now_ms)
         ON CONFLICT (reader_id, title_key) DO UPDATE SET
           author = COALESCE(readathon_shelf.author, excluded.author),
           format = COALESCE(readathon_shelf.format, excluded.format)`,
    ).run({reader_id, title: clean(title, TITLE_MAX), key, author: author || null, format: format || null, now_ms});
    return by_title(sqlite, reader_id, title);
}

// Changes a book's title, author or format. A new title is copied to its log entries too.
// Returns an error message, or null.
function update(sqlite, reader_id, shelf_id, {title, author, format}) {
    const book = get(sqlite, reader_id, shelf_id);
    if(book === null) {
        return "Couldn't find that book.";
    }
    const key = title_key(title);
    const other = by_title(sqlite, reader_id, title);
    if(other && other.shelf_id !== book.shelf_id) {
        return `"${other.title}" is already one of your books.`;
    }
    sqlite.prepare(
        "UPDATE readathon_shelf SET title = :title, title_key = :key, author = :author, format = :format WHERE shelf_id = :shelf_id",
    ).run({title: clean(title, TITLE_MAX), key, author: author || null, format: format || null, shelf_id: book.shelf_id});
    if(key !== book.title_key || clean(title, TITLE_MAX) !== book.title) {
        const update_entry = sqlite.prepare("UPDATE readathon_entries SET title = :title WHERE entry_id = :entry_id");
        for(const entry of entries_for(sqlite, reader_id, book.title_key)) {
            update_entry.run({title: clean(title, TITLE_MAX), entry_id: entry.entry_id});
        }
    }
    return null;
}

function set_private(sqlite, reader_id, shelf_id, is_private) {
    sqlite.prepare("UPDATE readathon_shelf SET is_private = :is_private WHERE reader_id = :reader_id AND shelf_id = :shelf_id")
        .run({reader_id, shelf_id: Number(shelf_id) || 0, is_private: is_private ? 1 : 0});
}

// Whether a reader's books show to their teammates (kids' books start hidden) and on their cheer page
function shares_with_team(reader) {
    return reader.share_books_team === null || reader.share_books_team === undefined
        ? reader.age_group !== "kid"
        : Boolean(reader.share_books_team);
}

function shares_on_cheer_page(reader) {
    return Boolean(reader.share_books_cheer);
}

function set_sharing(sqlite, reader_id, {team, cheer}) {
    if(team !== undefined) {
        sqlite.prepare("UPDATE readathon_readers SET share_books_team = :on WHERE reader_id = :reader_id").run({reader_id, on: team ? 1 : 0});
    }
    if(cheer !== undefined) {
        sqlite.prepare("UPDATE readathon_readers SET share_books_cheer = :on WHERE reader_id = :reader_id").run({reader_id, on: cheer ? 1 : 0});
    }
}

// The books other people may see: none unless shared, and never a private one
function shared_books(sqlite, reader, entries, where) {
    const shared = where === "cheer" ? shares_on_cheer_page(reader) : shares_with_team(reader);
    return shared ? books(sqlite, reader.reader_id, entries).filter(book => !book.is_private) : [];
}

function set_finished(sqlite, reader_id, shelf_id, finished_day) {
    sqlite.prepare("UPDATE readathon_shelf SET finished_day = :finished_day WHERE reader_id = :reader_id AND shelf_id = :shelf_id")
        .run({reader_id, shelf_id: Number(shelf_id) || 0, finished_day: finished_day || null});
}

// Only a book with no reading logged can be taken off the shelf (otherwise its time would vanish)
function remove(sqlite, reader_id, shelf_id) {
    const book = get(sqlite, reader_id, shelf_id);
    if(book === null || entries_for(sqlite, reader_id, book.title_key).length > 0) {
        return false;
    }
    sqlite.prepare("DELETE FROM readathon_shelf WHERE shelf_id = :shelf_id").run({shelf_id: book.shelf_id});
    return true;
}

function entries_for(sqlite, reader_id, key) {
    return sqlite.prepare("SELECT entry_id, title, day, minutes FROM readathon_entries WHERE reader_id = :reader_id AND title IS NOT NULL")
        .all({reader_id}).filter(entry => title_key(entry.title) === key);
}

// Every book on the shelf with the reading logged for it:
//   {...row, minutes, sessions, days: [day, ...], last_day, active_ms, finished}
// Books being read come first, the one added or logged most recently at the top (so it's the one the
// timer picks); then finished books, most recently finished first.
function books(sqlite, reader_id, entries) {
    const logged = new Map();
    for(const entry of entries) {
        const key = title_key(entry.title);
        if(key === "") {
            continue;
        }
        const book = logged.get(key) ?? {minutes: 0, sessions: 0, days: new Set(), last_day: entry.day, active_ms: 0};
        book.active_ms = Math.max(book.active_ms, entry.created_ms ?? 0);
        book.minutes += entry.minutes;
        book.sessions += 1;
        book.days.add(entry.day);
        if(entry.day > book.last_day) {
            book.last_day = entry.day;
        }
        logged.set(key, book);
    }
    const rows = sqlite.prepare("SELECT * FROM readathon_shelf WHERE reader_id = :reader_id").all({reader_id});
    return rows.map(row => {
        const log = logged.get(row.title_key) ?? {minutes: 0, sessions: 0, days: new Set(), last_day: null, active_ms: 0};
        return {
            ...row,
            is_private: Boolean(row.is_private),
            minutes: log.minutes,
            sessions: log.sessions,
            days: [...log.days].sort(),
            last_day: log.last_day,
            active_ms: Math.max(log.active_ms, row.created_ms),
            finished: Boolean(row.finished_day),
        };
    }).sort((a, b) =>
        Number(a.finished) - Number(b.finished)
        || (a.finished ? String(b.finished_day).localeCompare(String(a.finished_day)) : 0)
        || b.active_ms - a.active_ms
        || b.shelf_id - a.shelf_id);
}

function current(sqlite, reader_id, entries) {
    return books(sqlite, reader_id, entries).filter(book => !book.finished);
}

function finished_count(sqlite, reader_id) {
    return sqlite.prepare("SELECT COUNT(*) AS n FROM readathon_shelf WHERE reader_id = :reader_id AND finished_day IS NOT NULL")
        .get({reader_id}).n;
}

exports.AUTHOR_MAX = AUTHOR_MAX;
exports.TITLE_MAX = TITLE_MAX;
exports.books = books;
exports.by_title = by_title;
exports.current = current;
exports.ensure = ensure;
exports.finished_count = finished_count;
exports.get = get;
exports.parse_book = parse_book;
exports.remove = remove;
exports.set_finished = set_finished;
exports.set_private = set_private;
exports.set_sharing = set_sharing;
exports.shared_books = shared_books;
exports.shares_on_cheer_page = shares_on_cheer_page;
exports.shares_with_team = shares_with_team;
exports.title_key = title_key;
exports.update = update;
