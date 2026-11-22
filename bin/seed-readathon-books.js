#!/usr/bin/env node
// Adds the read-a-thon's sample books (seeds/readathon-books.sql) to a database. Migrations don't include
// them, so the live site only gets them if someone runs this on purpose. Does nothing if there are already
// books, so running it twice won't make duplicates. Edit books afterward at /readathon/desk/books.
//
//   node bin/seed-readathon-books.js
const config = require("config");
const fs = require("node:fs");
const path = require("node:path");
const {DatabaseSync} = require("node:sqlite");

const SEED_FILEPATH = path.join(__dirname, "..", "seeds", "readathon-books.sql");

// Returns how many books were added (0 if it already had some)
function seed_books(sqlite) {
    if(sqlite.prepare("SELECT COUNT(*) AS n FROM readathon_books").get().n > 0) {
        return 0;
    }
    sqlite.exec("BEGIN");
    try {
        sqlite.exec(fs.readFileSync(SEED_FILEPATH, "utf8"));
        sqlite.exec("COMMIT");
    }
    catch(err) {
        sqlite.exec("ROLLBACK");
        throw err;
    }
    return sqlite.prepare("SELECT COUNT(*) AS n FROM readathon_books").get().n;
}

if(require.main === module) {
    const sqlite = new DatabaseSync(config.get("sqlite.filepath"));
    const added = seed_books(sqlite);
    console.log(added > 0
        ? `Added ${added} sample books. Edit them at /${config.get("app.mounts.readathon")}/desk/books.`
        : "There are already books, so nothing was added.");
}

exports.seed_books = seed_books;
