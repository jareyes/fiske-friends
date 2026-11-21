// The book lists: staff picks (lib/readathon-content.js) plus approved recommendations from readers, each
// reader's reading list (starred books), and "recommend this too".
//
// A book is known by its key: its main title and its author's last name, lowercased with the punctuation
// and a leading "The", "A" or "An" taken off. So "Ox-Cart Man" by Donald Hall from staff and "ox cart man"
// by "Hall, Donald" from a reader are one book, shown once, with their recommendations added together.
const Catalog = require("./catalog");
const content = require("./readathon-content");

const AGES = content.AUDIENCES.filter(name => name !== "All ages");
const SORTS = ["popular", "title"];

function words(text) {
    return String(text ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
        .replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function book_key(title, author) {
    return `${words(Catalog.main_title(title))}|${words(Catalog.surname(author))}`;
}

// For "A to Z": the title without a leading "The", "A" or "An"
function sort_title(title) {
    return String(title).replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

// Every listed book, once each: staff picks first, then approved recommendations of other books.
// community: how many readers' approved recommendations it has.
function all_books(sqlite) {
    const by_key = new Map();
    const add = (book, from_reader) => {
        const key = book_key(book.title, book.author);
        const found = by_key.get(key);
        if(!found) {
            by_key.set(key, {...book, key, lists: [...book.lists], community: from_reader ? 1 : 0});
            return;
        }
        // The same book again: one card, with the lists and recommendations added together
        found.lists = [...new Set([...found.lists, ...book.lists])];
        found.community += from_reader ? 1 : 0;
        found.why = found.why || book.why;
        found.audience = found.audience || book.audience;
        found.read_during = found.read_during || book.read_during;
    };
    for(const book of content.BOOKS) {
        add(book, false);
    }
    const approved = sqlite.prepare(
        "SELECT * FROM readathon_recommendations WHERE status = 'approved' ORDER BY created_ms",
    ).all();
    for(const rec of approved) {
        add({
            title: rec.title,
            author: rec.author,
            why: rec.why,
            recommended_by: rec.recommended_by || "a reader",
            audience: rec.audience,
            read_during: !!rec.read_during,
            lists: ["community", rec.list],
        }, true);
    }
    return [...by_key.values()];
}

function counts(sqlite) {
    return new Map(sqlite.prepare("SELECT book_key, COUNT(*) AS n FROM readathon_book_votes GROUP BY book_key").all()
        .map(row => [row.book_key, row.n]));
}

function keys_for(sqlite, table, reader_id) {
    if(!reader_id) {
        return new Set();
    }
    return new Set(sqlite.prepare(`SELECT book_key FROM ${table} WHERE reader_id = :reader_id`).all({reader_id}).map(row => row.book_key));
}

// The books to show. filters: {list, age, sort, mine, reader_id}; mine shows the reader's list.
function browse(sqlite, {list = null, age = null, sort = "popular", mine = false, reader_id = null} = {}) {
    const votes = counts(sqlite);
    const saved = keys_for(sqlite, "readathon_book_saves", reader_id);
    const voted = keys_for(sqlite, "readathon_book_votes", reader_id);
    const books = all_books(sqlite)
        .filter(book => !list || book.lists.includes(list))
        // An age shows books for that age and books for everyone
        .filter(book => !age || !book.audience || book.audience === age || book.audience === "All ages")
        .filter(book => !mine || saved.has(book.key))
        .map(book => {
            const recommend_count = book.community + (votes.get(book.key) ?? 0);
            return {
                ...book,
                recommend_count,
                recommend_label: recommend_count === 0 ? null
                    : `Recommended by ${recommend_count} ${recommend_count === 1 ? "reader" : "readers"}`,
                saved: saved.has(book.key),
                voted: voted.has(book.key),
                catalog_url: Catalog.book_url(book),
                initial: book.title.replace(/^(The|A|An) /, "").charAt(0).toUpperCase(),
            };
        });
    const by_title = (a, b) => sort_title(a.title).localeCompare(sort_title(b.title));
    books.sort(sort === "title" ? by_title : (a, b) => b.recommend_count - a.recommend_count || by_title(a, b));
    return books.map((book, i) => ({...book, color: i % 4}));
}

// The book with this key, if it's on the lists
function find(sqlite, key) {
    return all_books(sqlite).find(book => book.key === key) ?? null;
}

function set_mark(sqlite, table, reader_id, key, on, now_ms = Date.now()) {
    if(on) {
        sqlite.prepare(`INSERT OR IGNORE INTO ${table} (reader_id, book_key, created_ms) VALUES (:reader_id, :key, :now_ms)`)
            .run({reader_id, key, now_ms});
    }
    else {
        sqlite.prepare(`DELETE FROM ${table} WHERE reader_id = :reader_id AND book_key = :key`).run({reader_id, key});
    }
}

// Star a book for a reader's reading list (on = false takes it off)
function save(sqlite, reader_id, key, on = true) {
    set_mark(sqlite, "readathon_book_saves", reader_id, key, on);
}

// A reader recommends a book that's already listed (on = false takes it back)
function vote(sqlite, reader_id, key, on = true) {
    set_mark(sqlite, "readathon_book_votes", reader_id, key, on);
}

// A reader's reading list, most recently starred first
function reading_list(sqlite, reader_id) {
    const order = sqlite.prepare("SELECT book_key FROM readathon_book_saves WHERE reader_id = :reader_id ORDER BY created_ms DESC")
        .all({reader_id}).map(row => row.book_key);
    const books = new Map(browse(sqlite, {reader_id, mine: true}).map(book => [book.key, book]));
    return order.map(key => books.get(key)).filter(Boolean);
}

exports.AGES = AGES;
exports.SORTS = SORTS;
exports.book_key = book_key;
exports.browse = browse;
exports.find = find;
exports.reading_list = reading_list;
exports.save = save;
exports.vote = vote;
