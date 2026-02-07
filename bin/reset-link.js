#!/usr/bin/env node
const config = require("config");
const process = require("node:process");
const {DatabaseSync} = require("node:sqlite");
const User = require("../lib/user");
const Token = require("../lib/token");

const DOMAIN = config.get("app.domain");
const MOUNTS = config.get("app.mounts");
const PROTOCOL = config.get("app.protocol");
const SQLITE_FILEPATH = config.get("sqlite.filepath");

function generate_link(sqlite, email) {
    const user = User.get(sqlite, email);
    const payload = Token.assemble(user.user_id);
    const token = Token.sign(payload);
    const link = `${PROTOCOL}://${DOMAIN}/${MOUNTS.auth}/reset/${token}`;
    return link;
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
        console.log(link);
    }
    finally {
        sqlite.close();
    }
}
