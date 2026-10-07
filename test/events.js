const assert = require("node:assert");
const {parse_sponsorship} = require("../routes/events");
const {suite, test} = require("node:test");

const ZOMBIES = ["Aunt Linda", "Big Mike"];
const VALID = {
    zombie: "Big Mike",
    amount: "25",
    first_name: " Josh ",
    last_name: "Reyes",
    email: "josh@example.com",
    payment_method_id: "pm_123",
};

suite("routes/events.js parse_sponsorship", () => {
    test("accepts a zombie from the list", () => {
        const {errors, sponsorship} = parse_sponsorship(VALID, ZOMBIES);
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(sponsorship.zombie, "Big Mike");
        assert.strictEqual(sponsorship.zombie_source, "list");
        assert.strictEqual(sponsorship.amount_usd, 25);
        assert.strictEqual(sponsorship.first_name, "Josh");
    });

    test("accepts a written-in zombie and tidies whitespace", () => {
        const body = {...VALID, zombie: "__write_in", zombie_write_in: "  Grandpa   Joe "};
        const {errors, sponsorship} = parse_sponsorship(body, ZOMBIES);
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(sponsorship.zombie, "Grandpa Joe");
        assert.strictEqual(sponsorship.zombie_source, "write-in");
    });

    test("accepts the whole horde", () => {
        const {errors, sponsorship} = parse_sponsorship({...VALID, zombie: "__horde"}, ZOMBIES);
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(sponsorship.zombie, "The Whole Horde");
        assert.strictEqual(sponsorship.zombie_source, "horde");
    });

    test("rejects a zombie that isn't on the list", () => {
        const {errors} = parse_sponsorship({...VALID, zombie: "Nobody"}, ZOMBIES);
        assert.strictEqual(errors.length, 1);
    });

    test("rejects an empty write-in", () => {
        const body = {...VALID, zombie: "__write_in", zombie_write_in: "   "};
        const {errors} = parse_sponsorship(body, ZOMBIES);
        assert.strictEqual(errors.length, 1);
    });

    test("parses a custom amount with a dollar sign and rounds to cents", () => {
        const body = {...VALID, amount: "other", amount_other: "$1,000.555"};
        const {errors, sponsorship} = parse_sponsorship(body, ZOMBIES);
        assert.deepStrictEqual(errors, []);
        assert.strictEqual(sponsorship.amount_usd, 1000.56);
    });

    test("rejects amounts under the minimum or missing", () => {
        for(const amount_other of ["4.99", "", "abc", "-20"]) {
            const body = {...VALID, amount: "other", amount_other};
            const {errors} = parse_sponsorship(body, ZOMBIES);
            assert.strictEqual(errors.length, 1, amount_other);
        }
    });

    test("requires a name, email, and payment method", () => {
        const body = {...VALID, first_name: "", email: "nope"};
        assert.strictEqual(parse_sponsorship(body, ZOMBIES).errors.length, 2);
        const no_card = {...VALID, payment_method_id: ""};
        assert.strictEqual(parse_sponsorship(no_card, ZOMBIES).errors.length, 1);
    });
});
