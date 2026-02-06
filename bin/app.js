#!/usr/bin/env node
const config = require("config");
const express = require("express");
const hbs = require("express-handlebars");
const middleware = require("../lib/middleware");
const path = require("node:path");
const routes = require("../routes");
const session = require("express-session");
const {DatabaseSync} = require("node:sqlite");

const HBS = hbs.create({
    extname: "hbs",
    defaultLayout: "base",
});
const PORT = config.get("app.port");
const SESSION_CONFIG = config.get("session");
console.log(SESSION_CONFIG);
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
    app.use(session(SESSION_CONFIG));
    
    // Custom session middleware
    app.use(middleware.session_user);
    
    // Routes
    app.get("/", (req, res, next) => res.render("home"));
    app.get("/minutes", (req, res, next) => res.render("minutes"));
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
        }),
    );
}

exports.create = create;
