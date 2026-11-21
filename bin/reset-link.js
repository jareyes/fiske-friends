#!/usr/bin/env node
const config = require("config");
const process = require("node:process");
const {DatabaseSync} = require("node:sqlite");
const User = require("../lib/user");

const DOMAIN = config.get("app.domain");
const MOUNTS = config.get("app.mounts");
const PROTOCOL = config.get("app.protocol");
const SQLITE_FILEPATH = config.get("sqlite.filepath");

// A link that lets this person choose a new password. It works for a day, and only once.
function generate_link(sqlite, email) {
    const user = User.get_by_email(sqlite, email);
    if(user === null) {
        return null;
    }
    return `${PROTOCOL}://${DOMAIN}/${MOUNTS.auth}/reset/${User.reset_token(user)}`;
}

if(require.main === module) {
    const argv = process.argv.slice(2);
    if(argv.length < 1) {
        console.log("Usage: reset-link.js <email>");
        process.exit(1);
    }
    const sqlite = new DatabaseSync(SQLITE_FILEPATH);
    try {
        const [email] = argv;
        const link = generate_link(sqlite, email);
        if(link === null) {
            console.log(`No admin account for ${email}.`);
            process.exitCode = 1;
        }
        else {
            console.log(link);
        }
    }
    finally {
        sqlite.close();
    }
}

exports.generate_link = generate_link;
