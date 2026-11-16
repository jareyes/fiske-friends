const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
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

suite("managing a household after joining", () => {
    const sqlite = database();
    const id = Readathon.create_household(sqlite, {email: "fam@example.com", city: "Claremont", state: "NH", readers: [
        {name: "Josh", age_group: "adult", birth_year: 1980},
    ]});

    test("parse_reader checks the name and birth year, and picks a goal", () => {
        assert.deepStrictEqual(Readathon.parse_reader({name: "", birth_year: "17"}, "2026-11-16").errors, [
            "Enter the reader's first name.",
            "Add the year they were born, like 2017.",
        ]);
        const {errors, reader} = Readathon.parse_reader({name: " Maya ", birth_year: "2017", age_group: "kid", goal: "120"}, "2026-11-16");
        assert.deepStrictEqual(errors, []);
        assert.deepStrictEqual(reader, {name: "Maya", age_group: "kid", birth_year: 2017, goal_minutes: 120});
        assert.strictEqual(Readathon.parse_reader({name: "A", birth_year: "2000", goal: "7"}).reader.goal_minutes, 300, "unknown goals get the default");
    });

    test("adding a reader gives them the next color", () => {
        const maya_id = Readathon.add_reader(sqlite, id, {name: "Maya", age_group: "kid", birth_year: 2017, goal_minutes: 120});
        const maya = Readathon.get_reader(sqlite, maya_id);
        assert.deepStrictEqual([maya.name, maya.household_id, maya.color, maya.goal_minutes], ["Maya", id, 1, 120]);
    });

    test("changing kid, teen or grown-up clears bingo squares; other changes keep them", () => {
        const maya = Readathon.list_readers(sqlite, id).find(r => r.name === "Maya");
        Readathon.set_mark(sqlite, maya.reader_id, 3, true);
        Readathon.update_reader(sqlite, maya.reader_id, {name: "Maya B", age_group: "kid", birth_year: 2016});
        assert.deepStrictEqual(Readathon.list_marks(sqlite, maya.reader_id), [3]);
        Readathon.update_reader(sqlite, maya.reader_id, {name: "Maya B", age_group: "teen", birth_year: 2012});
        assert.deepStrictEqual(Readathon.list_marks(sqlite, maya.reader_id), []);
        const changed = Readathon.get_reader(sqlite, maya.reader_id);
        assert.deepStrictEqual([changed.name, changed.age_group, changed.birth_year], ["Maya B", "teen", 2012]);
    });

    test("a reader can be removed only if nothing would be lost", () => {
        const [josh, maya] = Readathon.list_readers(sqlite, id);
        assert.strictEqual(Readathon.why_not_remove(sqlite, maya), null);
        Readathon.add_entry(sqlite, josh.reader_id, {day: "2027-01-02", minutes: 20});
        assert.match(Readathon.why_not_remove(sqlite, josh), /already has reading/);
        assert.strictEqual(Readathon.remove_reader(sqlite, josh), false);
        assert.strictEqual(Readathon.remove_reader(sqlite, maya), true);
        assert.strictEqual(Readathon.get_reader(sqlite, maya.reader_id), null);
        assert.match(Readathon.why_not_remove(sqlite, Readathon.get_reader(sqlite, josh.reader_id)), /at least one reader/);
    });

    test("household details: email must be valid and not someone else's", () => {
        Readathon.create_household(sqlite, {email: "taken@example.com", readers: [{name: "Ava", age_group: "adult"}]});
        assert.deepStrictEqual(Readathon.parse_household(sqlite, id, {email: "Taken@Example.com", city: "Newport", state: "NH"}).errors,
            ["taken@example.com is already used by another household."]);
        assert.strictEqual(Readathon.parse_household(sqlite, id, {email: "nope", city: "", state: "ZZ"}).errors.length, 2);
        const same = Readathon.parse_household(sqlite, id, {email: "fam@example.com", city: "Newport", state: "vt", wants_updates: "1"});
        assert.deepStrictEqual(same.errors, [], "keeping your own email is fine");
        Readathon.update_household(sqlite, id, same.household);
        const saved = Readathon.get_household(sqlite, id);
        assert.deepStrictEqual([saved.email, saved.city, saved.state, saved.wants_updates], ["fam@example.com", "Newport", "VT", 1]);
    });
});
