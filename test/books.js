const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Books = require("../lib/readathon-books");
const Readathon = require("../lib/readathon");
const {DatabaseSync} = require("node:sqlite");
const {suite, test} = require("node:test");

function database() {
    const sqlite = new DatabaseSync(":memory:");
    const dirpath = path.join(__dirname, "..", "migrations");
    for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
        sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
    }
    return sqlite;
}

function family(sqlite, email, names) {
    const id = Readathon.create_household(sqlite, {email, city: "Claremont", state: "NH", source: "online",
        readers: names.map(name => ({name, age_group: "kid", birth_year: 2016, goal_minutes: 300}))});
    return Readathon.list_readers(sqlite, id);
}

function recommend(sqlite, title, author, why = null) {
    Readathon.create_recommendation(sqlite, null, {title, author, list: "community", audience: "Kids", why, recommended_by: "Ana", read_during: 1});
    const [pending] = Readathon.list_recommendations(sqlite, "pending");
    Readathon.review_recommendation(sqlite, pending.recommendation_id, "approved");
}

const OX = Books.book_key("Ox-Cart Man", "Donald Hall");

suite("lib/readathon-books.js", () => {
    test("the same book from staff and a reader is one card, with the reader's recommendation counted", () => {
        const sqlite = database();
        const before = Books.browse(sqlite).length;
        recommend(sqlite, "ox cart man!", "Hall, Donald");
        const all = Books.browse(sqlite);
        assert.strictEqual(all.length, before, "no duplicate");
        const ox = all.find(b => b.key === OX);
        assert.deepStrictEqual([ox.title, ox.recommend_count, ox.recommend_label], ["Ox-Cart Man", 1, "Recommended by 1 reader"]);
        assert.ok(ox.lists.includes("community") && ox.lists.includes("local"));
    });

    test("each reader recommends a book once, and can take it back", () => {
        const sqlite = database();
        const [katie, sam] = family(sqlite, "a@example.org", ["Katie", "Sam"]);
        Books.vote(sqlite, katie.reader_id, OX);
        Books.vote(sqlite, katie.reader_id, OX);
        Books.vote(sqlite, sam.reader_id, OX);
        const ox = () => Books.browse(sqlite, {reader_id: katie.reader_id}).find(b => b.key === OX);
        assert.deepStrictEqual([ox().recommend_count, ox().voted], [2, true]);
        assert.strictEqual(ox().recommend_label, "Recommended by 2 readers");
        Books.vote(sqlite, katie.reader_id, OX, false);
        assert.deepStrictEqual([ox().recommend_count, ox().voted], [1, false]);
    });

    test("most recommended first, or A to Z ignoring The and A", () => {
        const sqlite = database();
        const [katie, sam] = family(sqlite, "b@example.org", ["Katie", "Sam"]);
        const snow = Books.book_key("The Snow Child", "Eowyn Ivey");
        Books.vote(sqlite, katie.reader_id, snow);
        Books.vote(sqlite, sam.reader_id, snow);
        Books.vote(sqlite, katie.reader_id, OX);
        const popular = Books.browse(sqlite);
        assert.deepStrictEqual(popular.slice(0, 2).map(b => b.title), ["The Snow Child", "Ox-Cart Man"]);
        const titles = Books.browse(sqlite, {sort: "title"}).map(b => b.title.replace(/^(The|A|An) /, "").toLowerCase());
        assert.deepStrictEqual(titles, [...titles].sort((a, b) => a.localeCompare(b)));
    });

    test("an age shows books for that age and for everyone", () => {
        const sqlite = database();
        const teens = Books.browse(sqlite, {age: "Teens"});
        assert.ok(teens.length > 0);
        assert.ok(teens.every(b => !b.audience || ["Teens", "All ages"].includes(b.audience)));
        assert.ok(!teens.some(b => b.audience === "Little kids"));
    });

    test("each reader has their own reading list, newest first", () => {
        const sqlite = database();
        const [katie, sam] = family(sqlite, "c@example.org", ["Katie", "Sam"]);
        const snow = Books.book_key("The Snow Child", "Eowyn Ivey");
        sqlite.prepare("INSERT INTO readathon_book_saves (reader_id, book_key, created_ms) VALUES (?, ?, 1), (?, ?, 2)").run(katie.reader_id, OX, katie.reader_id, snow);
        assert.deepStrictEqual(Books.reading_list(sqlite, katie.reader_id).map(b => b.title), ["The Snow Child", "Ox-Cart Man"]);
        assert.deepStrictEqual(Books.reading_list(sqlite, sam.reader_id), []);
        assert.deepStrictEqual(Books.browse(sqlite, {mine: true, reader_id: katie.reader_id}).map(b => b.key).sort(), [OX, snow].sort());
        Books.save(sqlite, katie.reader_id, OX, false);
        assert.strictEqual(Books.reading_list(sqlite, katie.reader_id).length, 1);
    });

    test("only books on the lists can be found", () => {
        const sqlite = database();
        assert.strictEqual(Books.find(sqlite, OX).title, "Ox-Cart Man");
        assert.strictEqual(Books.find(sqlite, "made up|book"), null);
    });
});
