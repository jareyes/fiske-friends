#!/usr/bin/env node
const config = require("config");
const readline = require("node:readline/promises");
const process = require("node:process");
const {DatabaseSync} = require("node:sqlite");
const User = require("../lib/user");

const SQLITE_FILEPATH = config.get("sqlite.filepath");

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
        
        const user = await User.create({first_name, last_name, email, password});
        User.save(sqlite, user);
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
