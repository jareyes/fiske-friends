const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Reports = require("../lib/readathon-reports");
const {DatabaseSync} = require("node:sqlite");
const {suite, test} = require("node:test");

suite("lib/readathon-reports.js", () => {
    const sqlite = new DatabaseSync(":memory:");
    const dirpath = path.join(__dirname, "..", "migrations");
    for(const file of fs.readdirSync(dirpath).filter(f => f.endsWith(".sql")).sort()) {
        sqlite.exec(fs.readFileSync(path.join(dirpath, file), "utf8"));
    }

    test("a report needs a message; contact is optional", () => {
        assert.deepStrictEqual(Reports.parse_report({message: "  "}).errors.length, 1);
        const {errors, report} = Reports.parse_report({message: " The Save button did nothing ", from: "/readathon/r/3/log", contact: ""});
        assert.deepStrictEqual(errors, []);
        assert.deepStrictEqual(report, {message: "The Save button did nothing", page: "/readathon/r/3/log", contact: null});
    });

    test("only keeps pages on this site", () => {
        assert.strictEqual(Reports.clean_page("/readathon/teams"), "/readathon/teams");
        assert.strictEqual(Reports.clean_page("https://evil.example/"), null);
        assert.strictEqual(Reports.clean_page("//evil.example/"), null);
        assert.strictEqual(Reports.clean_page(""), null);
    });

    test("open reports are listed until a volunteer marks them done", () => {
        Reports.create_report(sqlite, {message: "Timer froze", page: "/readathon/r/1/timer", contact: "Josh"}, null, "iPhone Safari");
        Reports.create_report(sqlite, {message: "Typo on Help", page: "/readathon/how", contact: null});
        const open = Reports.list_open(sqlite);
        assert.deepStrictEqual(open.map(r => r.message).sort(), ["Timer froze", "Typo on Help"]);
        Reports.resolve(sqlite, open.find(r => r.message === "Timer froze").report_id);
        assert.deepStrictEqual(Reports.list_open(sqlite).map(r => r.message), ["Typo on Help"]);
    });
});
