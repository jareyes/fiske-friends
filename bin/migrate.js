#!/usr/bin/env node
const config = require("config");
const file = require("../lib/file");
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const {DatabaseSync} = require("node:sqlite");

const CREATE_MIGRATIONS_TABLE_QUERY = `
CREATE TABLE IF NOT EXISTS migrations (
  migration_id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;`;
const INSERT_MIGRATION_QUERY = `
INSERT INTO migrations (filename) VALUES (:filename);`;
const SELECT_MIGRATION_QUERY = `
SELECT COUNT(*) AS count FROM migrations WHERE filename = :filename`;
const SQLITE_FILEPATH = config.get("sqlite.filepath");

function migrate(db, filepath, query) {
    // See if we've already run this migration
    const filename = path.basename(filepath);
    const select = db.prepare(SELECT_MIGRATION_QUERY);
    const [row] = select.all({filename});
    if(row.count > 0) {
        console.log("Skipping", filename);
        return;
    }

    // Run the migration
    try {
        db.exec("BEGIN");
        const insert = db.prepare(INSERT_MIGRATION_QUERY);
        insert.run({filename});

        db.exec("COMMIT");
        console.log("Migrated", filename);
    }
    catch(err) {
        db.exec("ROLLBACK");
        console.log(`Error migration ${filename}`);
        console.log(err.stack);
    }
}

async function main(dirpath) {
    // Open database
    const db = new DatabaseSync(SQLITE_FILEPATH);

    // Create migrations table
    db.exec(CREATE_MIGRATIONS_TABLE_QUERY);

    // Run each migration
    const filepaths = await file.readdir(dirpath);
    filepaths.sort();

    for(const filepath of filepaths) {
        if(!filepath.endsWith(".sql")) {
            continue;
        }
        const query = await fs.promises.readFile(filepath);
        await migrate(db, filepath, query);
    }
}

if(require.main === module) {
    const migrations_dirpath = process.argv[2];
    if(migrations_dirpath === undefined) {
        console.log("Usage: migrate.js <migrations dirpath>");
        process.exit(1);
    }
    main(migrations_dirpath);
}
