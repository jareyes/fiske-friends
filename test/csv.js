const assert = require("node:assert");
const csv = require("../lib/csv");
const {Readable} = require("node:stream");
const {suite, test} = require("node:test");

suite.todo("lib/csv.js", () => {
    test.todo("Can parse a CSV file", async () => {
        const headers = ["column1", "column2", "column3"];
        const text = `column1, column2, column3
"First row", "Second column", third_value
"Second row", column_2, "Third value"`;
        const readable = Readable.from(text);
        const rows = await csv.parse(readable, headers);
        assert.deepStrictEqual(rows, [
            {
                column1: 'First row',
                column2: 'Second column',
                column3: 'third_value'
            },
            {
                column1: 'Second row',
                column2: 'column_2',
                column3: 'Third value'
            },
        ]);
    });
});
