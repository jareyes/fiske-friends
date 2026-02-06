#!/usr/bin/env node
const config = require("config");
const process = require("node:process");
const {DatabaseSync} = require("node:sqlite");
const User = require("../lib/model/user");

const SQLITE_FILEPATH = config.get("sqlite.filepath");

async function create_user(sqlite, email, password) {
    // Create user
    const password_hash = await User.hash_password(
        password,
    );
    const user = User.create(sqlite, {
        email,
        password_hash,
    });
    const {user_id} = user;

    // Add admin privileges
    const {group_id} = sqlite.prepare(
        "SELECT group_id FROM groups WHERE name='admin'",
    ).get();

    sqlite.prepare(
        `INSERT INTO permissions (group_id, user_id)
         VALUES (:group_id, :user_id)`,
    ).run({
        group_id,
        user_id,
    });
}

if(require.main === module) {
    const argv = process.argv.slice(2);
    if(argv.length < 2) {
        console.log("Usage: user-create.js <email> <password>");
        process.exit(1);
    }
    const sqlite = new DatabaseSync(SQLITE_FILEPATH);
    const [email, password] = argv;
    (async () => {
        try {
            await create_user(sqlite, email, password);
            console.log(`Added ${email}.`);
        }
        finally {
            sqlite.close();
        }
    })();
}
