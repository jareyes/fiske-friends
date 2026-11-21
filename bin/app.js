#!/usr/bin/env node
const config = require("config");
const express = require("express");
const hbs = require("express-handlebars");
const middleware = require("../lib/middleware");
const path = require("node:path");
const routes = require("../routes");
const session = require("express-session");
const SqliteStore = require("../lib/session-store");
const template = require("../lib/template");
const {DatabaseSync} = require("node:sqlite");

const HBS = hbs.create({
    extname: "hbs",
    defaultLayout: "base",
    partialsDir: path.join(__dirname, "..", "views", "partials"),
    helpers: template,
});
const PORT = config.get("app.port");
const SESSION_CONFIG = config.get("session");
const SQLITE_FILEPATH = config.get("sqlite.filepath");
const VIEWS_DIRPATH = path.join(__dirname, "..", "views");

function create(sqlite) {
    const app = express();
    
    // Templates
    app.engine("hbs", HBS.engine);
    app.set("view engine", "hbs");
    app.set("views", VIEWS_DIRPATH);
    
    // Middleware
    app.use(express.static("static"));
    app.use(express.json());
    app.use(express.urlencoded({extended: true}));

    // Session middleware
    app.set("trust proxy", 1);
    // Sign-ins are kept in the database (sessions table), so restarts don't sign people out
    app.use(session({...SESSION_CONFIG, store: new SqliteStore(sqlite)}));

    // Template context middleware
    app.use(middleware.template_mounts);
    app.use(middleware.template_session_user);
    
    // Routes
    app.use(routes(sqlite));
    return app;
}

if(require.main === module) {
    const database = new DatabaseSync(SQLITE_FILEPATH);
    const app = create(database);

    app.listen(
        PORT,
        () => console.log({
            event: "App.START",
            port: PORT,
            // false means SMTP isn't set up: emails wait in the outbox at /plan/emails instead of sending
            email_sending: require("../lib/mailer").status().live,
            email_problem: require("../lib/mailer").status().problem ?? undefined,
        }),
    );
}

exports.create = create;
