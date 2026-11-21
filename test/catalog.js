const assert = require("node:assert");
const Catalog = require("../lib/catalog");
const {suite, test} = require("node:test");

const SETTINGS = {
    search_url: "https://catalog.example/#search:ExpertSearch?ST0=T&M0=c&SF0={title}&B1=A&ST1=N&M1=c&SF1={author}",
    title_search_url: "https://catalog.example/#search:ExpertSearch?ST0=T&M0=c&SF0={title}",
};

suite("lib/catalog.js", () => {
    test("uses the author's last name, however the name is written", () => {
        assert.strictEqual(Catalog.surname("Donald Hall"), "Hall");
        assert.strictEqual(Catalog.surname("Hall, Donald"), "Hall");
        assert.strictEqual(Catalog.surname("Ruth Krauss and Crockett Johnson"), "Krauss");
        assert.strictEqual(Catalog.surname("Martin Luther King Jr."), "King");
        assert.strictEqual(Catalog.surname("Jane Yolen & Heidi Stemple"), "Yolen");
        assert.strictEqual(Catalog.surname("Homer"), "Homer");
        assert.strictEqual(Catalog.surname(""), "");
        assert.strictEqual(Catalog.surname(null), "");
    });

    test("searches the main title, without a subtitle", () => {
        assert.strictEqual(Catalog.main_title("The Lincoln Highway: A Novel"), "The Lincoln Highway");
        assert.strictEqual(Catalog.main_title("Owl Moon (Caldecott Edition)"), "Owl Moon");
        assert.strictEqual(Catalog.main_title("Ox-Cart Man"), "Ox-Cart Man");
    });

    test("builds a title-and-author search, or title only without an author", () => {
        assert.strictEqual(Catalog.book_url({title: "Ox-Cart Man", author: "Donald Hall"}, SETTINGS),
            "https://catalog.example/#search:ExpertSearch?ST0=T&M0=c&SF0=Ox-Cart%20Man&B1=A&ST1=N&M1=c&SF1=Hall");
        assert.strictEqual(Catalog.book_url({title: "Beowulf", author: ""}, SETTINGS),
            "https://catalog.example/#search:ExpertSearch?ST0=T&M0=c&SF0=Beowulf");
        assert.match(Catalog.book_url({title: "Tom & Jerry's #1 Day?", author: "A. Writer"}, SETTINGS), /SF0=Tom%20%26%20Jerry's%20%231%20Day%3F&/);
        assert.strictEqual(Catalog.book_url({title: ""}, SETTINGS), null);
        assert.strictEqual(Catalog.book_url({title: "Owl Moon", author: "Jane Yolen"}, {}), null, "no catalog set up");
    });

    test("the configured catalog link matches the library's Advanced search", () => {
        const url = Catalog.book_url({title: "Ox-cart man", author: "Donald Hall"});
        assert.ok(url.startsWith("https://fiskefreenh.booksys.net/opac/fiskefreenh/index.html#search:ExpertSearch?"));
        assert.match(url, /ST0=T&M0=c&SF0=Ox-cart%20man&B1=A&ST1=N&M1=c&SF1=Hall$/);
    });
});
