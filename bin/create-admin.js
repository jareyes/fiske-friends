#!/usr/bin/env node
const config = require("config");
const Group = require("../lib/group");
const process = require("node:process");
const readline = require("node:readline/promises");
const {DatabaseSync} = require("node:sqlite");
const User = require("../lib/user");

const SQLITE_FILEPATH = config.get("sqlite.filepath");

function get_group_id(sqlite, name) {
    const statement = sqlite.prepare(
            "SELECT group_id FROM groups WHERE name=:name"
    );
    const row = statement.get({name: Group.ADMIN});
    const {group_id} = row;
    return group_id;
}

async function main() {
    const sqlite = new DatabaseSync(SQLITE_FILEPATH);
    const lines = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    try {     
        const first_name = await lines.question("What is your first name? ");
        const last_name = await lines.question("What is your last name? ");
        const email = await lines.question("What is your email address? ");
        const password = await lines.question("What is your password? ");
        const confirmation = await lines.question("Please confirm your password. ");
        
        if(password !== confirmation) {
            console.log("Passwords do not match");
            process.exit(1);
        }

        const password_hash = await User.hash_password(password);
        const user = User.create(
            sqlite,
            {
                first_name,
                last_name,
                email,
                password_hash,
            },
        );
        // Add admin group
        const {user_id} = user;
        const group_id = get_group_id(
            sqlite,
            Group.ADMIN,
        );
       const statement =  sqlite.prepare(
           "INSERT INTO permissions (user_id, group_id) VALUES (:user_id, :group_id)");
        statement.run({group_id, user_id});
        console.log("User created");
    }
    finally {
        lines.close();
        sqlite.close();
    }
}

if(require.main === module) {
    main();
}
