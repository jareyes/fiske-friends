const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Books = require("../lib/readathon-books");
const Readathon = require("../lib/readathon");
const {DatabaseSync} = require("node:sqlite");
const {seed_books} = require("../bin/seed-readathon-books");
const {suite, test} = require("node:test");

function database() {
    const sqlite = new DatabaseSync(":memory:");
    const dirpath = path.join(__dirname, "..", "migrations");
    for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
        sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
    }
    // The sample books aren't a migration; the demo loads them the same way
    seed_books(sqlite);
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

suite("lib/readathon-books.js editing at the desk", () => {
    test("lists can be added, renamed, hidden and reordered; empty ones don't get a chip", () => {
        const sqlite = database();
        const id = Books.create_list(sqlite, {name: "Snow Day Picks!", blurb: "For a day off"});
        assert.strictEqual(id, "snow-day-picks");
        assert.strictEqual(Books.create_list(sqlite, {name: "Snow day picks"}), "snow-day-picks-2");
        assert.ok(!Books.lists_with_books(sqlite).has(id), "no books yet");
        assert.strictEqual(Books.lists(sqlite).at(-2).id, id, "new lists go at the end");
        Books.move_list(sqlite, id, -1);
        Books.move_list(sqlite, id, -1);
        const order = Books.lists(sqlite).map(l => l.id);
        assert.strictEqual(order.indexOf(id), order.length - 4);
        Books.update_list(sqlite, "cozy", {name: "Cozy", blurb: "Warm.", is_hidden: true});
        assert.ok(!Books.lists(sqlite).some(l => l.id === "cozy"));
        assert.ok(Books.browse(sqlite).every(b => !b.lists.includes("cozy")), "books stay, just not under that list");
        assert.strictEqual(Books.lists(sqlite, {include_hidden: true}).find(l => l.id === "cozy").name, "Cozy");
    });

    test("a book needs a title and a list", () => {
        const valid = ["library", "kids"];
        const {errors} = Books.parse_book({title: " ", lists: "nope"}, valid);
        assert.deepStrictEqual(errors, ["Give the book a title.", "Pick at least one list for it to show up on."]);
        const {book, list_ids} = Books.parse_book({title: " Owl  Moon ", author: "Jane Yolen", lists: ["kids", "kids", "x"], audience: "Kids"}, valid);
        assert.deepStrictEqual([book.title, book.audience, list_ids], ["Owl Moon", "Kids", ["kids"]]);
    });

    test("editing a book's title keeps who saved and recommended it", () => {
        const sqlite = database();
        const [katie] = family(sqlite, "d@example.org", ["Katie"]);
        const id = Books.create_book(sqlite, {title: "Snowy Owl Expres", author: "Jo Nest", audience: "Kids"}, ["kids"]);
        const typo = Books.book_key("Snowy Owl Expres", "Jo Nest");
        Books.save(sqlite, katie.reader_id, typo);
        Books.vote(sqlite, katie.reader_id, typo);
        Books.update_book(sqlite, id, {title: "Snowy Owl Express", author: "Jo Nest", why: null, recommended_by: "Staff", audience: "Kids", read_during: 0, is_hidden: 0}, ["kids", "cozy"]);
        const [book] = Books.browse(sqlite, {reader_id: katie.reader_id}).filter(b => b.book_id === id);
        assert.deepStrictEqual([book.title, book.saved, book.voted, book.recommend_count], ["Snowy Owl Express", true, true, 1]);
        assert.deepStrictEqual(Books.get_book(sqlite, id).lists.sort(), ["cozy", "kids"]);
    });

    test("hiding a book hides it everywhere, including readers' picks of the same book, until it's shown again", () => {
        const sqlite = database();
        recommend(sqlite, "Ox-Cart Man", "Donald Hall");
        const ox = Books.browse(sqlite).find(b => b.key === OX);
        const book = Books.get_book(sqlite, ox.book_id);
        Books.update_book(sqlite, book.book_id, {...book, is_hidden: 1}, book.lists);
        assert.strictEqual(Books.find(sqlite, OX), null);
        assert.ok(Books.for_editor(sqlite).books.find(b => b.book_id === book.book_id).is_hidden, "still in the editor");
        Books.update_book(sqlite, book.book_id, {...book, is_hidden: 0}, book.lists);
        assert.ok(Books.find(sqlite, OX));
    });

    test("a reader's approved pick can be adopted into an editable book, once", () => {
        const sqlite = database();
        recommend(sqlite, "Hatchet Too", "Gary Paulsen", "So good");
        const [pick] = Books.for_editor(sqlite).picks;
        assert.strictEqual(pick.title, "Hatchet Too");
        const id = Books.adopt_recommendation(sqlite, pick.recommendation_id);
        assert.strictEqual(Books.adopt_recommendation(sqlite, pick.recommendation_id), id);
        assert.strictEqual(Books.for_editor(sqlite).picks.length, 0);
        const book = Books.get_book(sqlite, id);
        assert.deepStrictEqual([book.title, book.why, book.lists], ["Hatchet Too", "So good", ["community"]]);
        const listed = Books.browse(sqlite).filter(b => b.title === "Hatchet Too");
        assert.deepStrictEqual([listed.length, listed[0].recommend_count], [1, 1], "still one card, still counted");
    });

    test("a book that's already there is found, so it isn't added twice", () => {
        const sqlite = database();
        const ox = Books.same_book(sqlite, "ox-cart man", "Hall, Donald");
        assert.strictEqual(ox.title, "Ox-Cart Man");
        assert.strictEqual(Books.same_book(sqlite, "Ox-Cart Man", "Donald Hall", ox.book_id), null, "not itself, when editing it");
        assert.strictEqual(Books.same_book(sqlite, "A Brand New Book", "Someone"), null);
    });

    test("search words ignore capitals, accents and punctuation", () => {
        assert.deepStrictEqual(Books.search_words("Ox-Cart  Man, by Hall!"), ["ox", "cart", "man", "by", "hall"]);
        assert.deepStrictEqual(Books.search_words("Éowyn Ivey"), ["eowyn", "ivey"]);
        assert.deepStrictEqual(Books.search_words("  "), []);
    });

    test("list counts are what families see, reader picks included, hidden lists too", () => {
        const sqlite = database();
        recommend(sqlite, "Hatchet Too", "Gary Paulsen");
        const before = Books.list_counts(sqlite);
        assert.strictEqual(before.get("community"), 1);
        Books.update_list(sqlite, "cozy", {name: "Cozy", blurb: "", is_hidden: true});
        assert.strictEqual(Books.list_counts(sqlite).get("cozy"), before.get("cozy"), "a hidden list still shows its count");
    });
});
