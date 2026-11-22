// The book lists: books picked by staff and volunteers (edited at /readathon/desk/books), plus approved
// recommendations from readers; each reader's reading list (starred books); and "recommend this too".
//
// A book is known by its key: its main title and its author's last name, lowercased with the punctuation
// and a leading "The", "A" or "An" taken off. So "Ox-Cart Man" by Donald Hall from staff and "ox cart man"
// by "Hall, Donald" from a reader are one book, shown once, with their recommendations added together.
// Saves and recommendations are stored by key, and move with a book when its title or author is edited.
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

// The words of some text for searching: lowercase, without accents or punctuation
function search_words(text) {
    return String(text ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

// For "A to Z": the title without a leading "The", "A" or "An"
function sort_title(title) {
    return String(title).replace(/^(the|a|an)\s+/i, "").toLowerCase();
}

// ---------- lists ----------

// The lists, in order. Hidden ones only when asked (for the editor).
function lists(sqlite, {include_hidden = false} = {}) {
    return sqlite.prepare(
        `SELECT list_id AS id, name, blurb, sort, is_hidden FROM readathon_book_lists
         ${include_hidden ? "" : "WHERE is_hidden = 0"} ORDER BY sort, name`,
    ).all().map(list => ({...list, is_hidden: !!list.is_hidden}));
}

function list_slug(name) {
    return words(name).replace(/ /g, "-").slice(0, 40) || "list";
}

function create_list(sqlite, {name, blurb = ""}, now_ms = Date.now()) {
    let id = list_slug(name);
    for(let n = 2; sqlite.prepare("SELECT 1 FROM readathon_book_lists WHERE list_id = ?").get(id); n++) {
        id = `${list_slug(name)}-${n}`;
    }
    const {sort} = sqlite.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS sort FROM readathon_book_lists").get();
    sqlite.prepare("INSERT INTO readathon_book_lists (list_id, name, blurb, sort, created_ms) VALUES (?, ?, ?, ?, ?)")
        .run(id, name, blurb, sort, now_ms);
    return id;
}

function update_list(sqlite, id, {name, blurb, is_hidden}) {
    sqlite.prepare("UPDATE readathon_book_lists SET name = :name, blurb = :blurb, is_hidden = :is_hidden WHERE list_id = :id")
        .run({id, name, blurb: blurb ?? "", is_hidden: is_hidden ? 1 : 0});
}

// Moves a list one place up (-1) or down (+1)
function move_list(sqlite, id, direction) {
    const all = lists(sqlite, {include_hidden: true});
    const i = all.findIndex(list => list.id === id);
    const j = i + Math.sign(direction);
    if(i < 0 || j < 0 || j >= all.length) {
        return;
    }
    [all[i], all[j]] = [all[j], all[i]];
    const set = sqlite.prepare("UPDATE readathon_book_lists SET sort = ? WHERE list_id = ?");
    all.forEach((list, n) => set.run(n + 1, list.id));
}

// ---------- books ----------

function book_lists(sqlite, book_id) {
    return sqlite.prepare("SELECT list_id FROM readathon_book_list_links WHERE book_id = ?").all(book_id).map(row => row.list_id);
}

function get_book(sqlite, book_id) {
    const row = sqlite.prepare("SELECT * FROM readathon_books WHERE book_id = ?").get(Number(book_id));
    return row ? {...row, is_hidden: !!row.is_hidden, read_during: !!row.read_during, lists: book_lists(sqlite, row.book_id)} : null;
}

// How many readers' approved recommendations each book has, by key
function community_counts(sqlite) {
    const by_key = new Map();
    for(const rec of sqlite.prepare("SELECT title, author FROM readathon_recommendations WHERE status = 'approved'").all()) {
        const key = book_key(rec.title, rec.author);
        by_key.set(key, (by_key.get(key) ?? 0) + 1);
    }
    return by_key;
}

// Approved reader recommendations nobody has edited into a book yet
function reader_picks(sqlite) {
    return sqlite.prepare(
        `SELECT r.* FROM readathon_recommendations r
         WHERE r.status = 'approved'
           AND NOT EXISTS (SELECT 1 FROM readathon_books b WHERE b.recommendation_id = r.recommendation_id)
         ORDER BY r.created_ms`,
    ).all();
}

// Every listed book, once each: books from the desk first, then approved recommendations of other books.
// Hidden books (and hidden lists) are left out unless include_hidden; keep_hidden_lists keeps the
// hidden lists on visible books (for the desk's count of each list).
function all_books(sqlite, {include_hidden = false, keep_hidden_lists = false} = {}) {
    const visible_lists = new Set(lists(sqlite, {include_hidden: include_hidden || keep_hidden_lists}).map(list => list.id));
    const communities = community_counts(sqlite);
    const by_key = new Map();
    const hidden_keys = new Set();
    for(const row of sqlite.prepare("SELECT * FROM readathon_books ORDER BY book_id").all()) {
        const key = book_key(row.title, row.author);
        if(row.is_hidden && !include_hidden) {
            hidden_keys.add(key);
            continue;
        }
        if(by_key.has(key)) {
            continue;
        }
        by_key.set(key, {
            book_id: row.book_id,
            title: row.title,
            author: row.author,
            why: row.why,
            recommended_by: row.recommended_by || "a reader",
            audience: row.audience,
            read_during: !!row.read_during,
            is_hidden: !!row.is_hidden,
            lists: book_lists(sqlite, row.book_id).filter(id => visible_lists.has(id)),
        });
    }
    for(const rec of reader_picks(sqlite)) {
        const key = book_key(rec.title, rec.author);
        const found = by_key.get(key);
        if(hidden_keys.has(key)) {
            continue;
        }
        const rec_lists = ["community", rec.list].filter(id => visible_lists.has(id));
        if(found) {
            found.lists = [...new Set([...found.lists, ...rec_lists])];
            found.why = found.why || rec.why;
            found.audience = found.audience || rec.audience;
            found.read_during = found.read_during || !!rec.read_during;
            continue;
        }
        by_key.set(key, {
            recommendation_id: rec.recommendation_id,
            title: rec.title,
            author: rec.author,
            why: rec.why,
            recommended_by: rec.recommended_by || "a reader",
            audience: rec.audience,
            read_during: !!rec.read_during,
            is_hidden: false,
            lists: [...new Set(rec_lists)],
        });
    }
    return [...by_key.entries()].map(([key, book]) => ({...book, key, community: communities.get(key) ?? 0}));
}

function votes_by_key(sqlite) {
    return new Map(sqlite.prepare("SELECT book_key, COUNT(*) AS n FROM readathon_book_votes GROUP BY book_key").all()
        .map(row => [row.book_key, row.n]));
}

function keys_for(sqlite, table, reader_id) {
    if(!reader_id) {
        return new Set();
    }
    return new Set(sqlite.prepare(`SELECT book_key FROM ${table} WHERE reader_id = :reader_id`).all({reader_id}).map(row => row.book_key));
}

function by_title(a, b) {
    return sort_title(a.title).localeCompare(sort_title(b.title));
}

// The books to show families. filters: {list, age, sort, mine, reader_id}; mine shows the reader's list.
function browse(sqlite, {list = null, age = null, sort = "popular", mine = false, reader_id = null} = {}) {
    const votes = votes_by_key(sqlite);
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
    books.sort(sort === "title" ? by_title : (a, b) => b.recommend_count - a.recommend_count || by_title(a, b));
    return books.map((book, i) => ({...book, color: i % 4}));
}

// How many books families see on each list, hidden lists included (for the desk)
function list_counts(sqlite) {
    const counts = new Map();
    for(const book of all_books(sqlite, {keep_hidden_lists: true})) {
        for(const id of book.lists) {
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }
    }
    return counts;
}

// The ids of lists that have at least one book to show (for the chips)
function lists_with_books(sqlite) {
    return new Set(all_books(sqlite).flatMap(book => book.lists));
}

// The book with this key, if it's on the lists
function find(sqlite, key) {
    return all_books(sqlite).find(book => book.key === key) ?? null;
}

// ---------- editing books at the desk ----------

// Checks the book form: {errors, book, list_ids}
function parse_book(body, valid_list_ids) {
    const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const title = clean(body.title, 150);
    const errors = title ? [] : ["Give the book a title."];
    const chosen = Array.isArray(body.lists) ? body.lists : (body.lists === undefined ? [] : [body.lists]);
    const list_ids = [...new Set(chosen.map(String))].filter(id => valid_list_ids.includes(id));
    if(list_ids.length === 0) {
        errors.push("Pick at least one list for it to show up on.");
    }
    return {
        errors,
        list_ids,
        book: {
            title,
            author: clean(body.author, 100) || null,
            why: clean(body.why, 280) || null,
            recommended_by: clean(body.recommended_by, 60) || null,
            audience: content.AUDIENCES.includes(body.audience) ? body.audience : "All ages",
            read_during: body.read_during ? 1 : 0,
            is_hidden: body.is_hidden ? 1 : 0,
        },
    };
}

function set_links(sqlite, book_id, list_ids) {
    sqlite.prepare("DELETE FROM readathon_book_list_links WHERE book_id = ?").run(book_id);
    const insert = sqlite.prepare("INSERT OR IGNORE INTO readathon_book_list_links (book_id, list_id) VALUES (?, ?)");
    for(const list_id of list_ids) {
        insert.run(book_id, list_id);
    }
}

function create_book(sqlite, book, list_ids, now_ms = Date.now()) {
    const {lastInsertRowid} = sqlite.prepare(
        `INSERT INTO readathon_books (title, author, why, recommended_by, audience, read_during, is_hidden, recommendation_id, created_ms, updated_ms)
         VALUES (:title, :author, :why, :recommended_by, :audience, :read_during, :is_hidden, :recommendation_id, :now_ms, :now_ms)`,
    ).run({
        title: book.title,
        author: book.author ?? null,
        why: book.why ?? null,
        recommended_by: book.recommended_by ?? null,
        audience: book.audience ?? null,
        read_during: book.read_during ? 1 : 0,
        is_hidden: book.is_hidden ? 1 : 0,
        recommendation_id: book.recommendation_id ?? null,
        now_ms,
    });
    const book_id = Number(lastInsertRowid);
    set_links(sqlite, book_id, list_ids);
    return book_id;
}

// Saves and recommendations follow a book to its new key when its title or author changes
function move_key(sqlite, old_key, new_key) {
    if(old_key === new_key) {
        return;
    }
    for(const table of ["readathon_book_saves", "readathon_book_votes"]) {
        sqlite.prepare(`UPDATE OR IGNORE ${table} SET book_key = :new_key WHERE book_key = :old_key`).run({old_key, new_key});
        // Anyone who had both keys already keeps the new one
        sqlite.prepare(`DELETE FROM ${table} WHERE book_key = :old_key`).run({old_key});
    }
}

function update_book(sqlite, book_id, book, list_ids, now_ms = Date.now()) {
    const before = get_book(sqlite, book_id);
    if(!before) {
        return false;
    }
    sqlite.exec("BEGIN");
    try {
        sqlite.prepare(
            `UPDATE readathon_books SET title = :title, author = :author, why = :why, recommended_by = :recommended_by,
               audience = :audience, read_during = :read_during, is_hidden = :is_hidden, updated_ms = :now_ms
             WHERE book_id = :book_id`,
        ).run({
            title: book.title,
            author: book.author ?? null,
            why: book.why ?? null,
            recommended_by: book.recommended_by ?? null,
            audience: book.audience ?? null,
            read_during: book.read_during ? 1 : 0,
            is_hidden: book.is_hidden ? 1 : 0,
            book_id: before.book_id,
            now_ms,
        });
        set_links(sqlite, before.book_id, list_ids);
        move_key(sqlite, book_key(before.title, before.author), book_key(book.title, book.author));
        sqlite.exec("COMMIT");
    }
    catch(err) {
        sqlite.exec("ROLLBACK");
        throw err;
    }
    return true;
}

// Another book from the desk with the same title and author (hidden ones too), or null. Two would show as
// one card, so the desk adds to the one that's there instead.
function same_book(sqlite, title, author, except_book_id = null) {
    const key = book_key(title, author);
    const row = sqlite.prepare("SELECT book_id, title, author FROM readathon_books ORDER BY book_id").all()
        .find(b => b.book_id !== Number(except_book_id) && book_key(b.title, b.author) === key);
    return row ?? null;
}

// Turns an approved reader recommendation into a book that can be edited. Returns the book's id.
function adopt_recommendation(sqlite, recommendation_id, now_ms = Date.now()) {
    const existing = sqlite.prepare("SELECT book_id FROM readathon_books WHERE recommendation_id = ?").get(Number(recommendation_id));
    if(existing) {
        return existing.book_id;
    }
    const rec = sqlite.prepare("SELECT * FROM readathon_recommendations WHERE recommendation_id = ? AND status = 'approved'").get(Number(recommendation_id));
    if(!rec) {
        return null;
    }
    const valid = new Set(lists(sqlite, {include_hidden: true}).map(list => list.id));
    return create_book(sqlite, {
        title: rec.title,
        author: rec.author,
        why: rec.why,
        recommended_by: rec.recommended_by,
        audience: rec.audience,
        read_during: rec.read_during,
        recommendation_id: rec.recommendation_id,
    }, ["community", rec.list].filter(id => valid.has(id)), now_ms);
}

// Everything for the editor: books from the desk (hidden ones too) and reader picks not yet edited
function for_editor(sqlite) {
    const names = new Map(lists(sqlite, {include_hidden: true}).map(list => [list.id, list.name]));
    const votes = votes_by_key(sqlite);
    const communities = community_counts(sqlite);
    const describe = (book, list_ids) => {
        const key = book_key(book.title, book.author);
        return {
            ...book,
            list_names: list_ids.map(id => names.get(id)).filter(Boolean),
            recommend_count: (communities.get(key) ?? 0) + (votes.get(key) ?? 0),
        };
    };
    const books = sqlite.prepare("SELECT * FROM readathon_books").all()
        .map(row => describe({...row, is_hidden: !!row.is_hidden}, book_lists(sqlite, row.book_id)))
        .sort(by_title);
    const picks = reader_picks(sqlite).map(rec => ({...describe(rec, [...new Set(["community", rec.list])]), lists: [...new Set(["community", rec.list])]})).sort(by_title);
    return {books, picks};
}

// ---------- reading lists and recommending ----------

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
exports.adopt_recommendation = adopt_recommendation;
exports.book_key = book_key;
exports.browse = browse;
exports.create_book = create_book;
exports.create_list = create_list;
exports.find = find;
exports.for_editor = for_editor;
exports.get_book = get_book;
exports.lists = lists;
exports.list_counts = list_counts;
exports.lists_with_books = lists_with_books;
exports.move_list = move_list;
exports.parse_book = parse_book;
exports.same_book = same_book;
exports.reading_list = reading_list;
exports.save = save;
exports.search_words = search_words;
exports.update_book = update_book;
exports.update_list = update_list;
exports.vote = vote;
