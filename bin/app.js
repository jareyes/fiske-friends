#!/usr/bin/env node
const config = require("config");
const authentication_routes = require("../routes/authentication");
const donation_routes = require("../routes/donations");
const express = require("express");
const hbs = require("express-handlebars");
const middleware = require("../lib/middleware");
const path = require("node:path");
const session = require("express-session");
const {DatabaseSync} = require("node:sqlite");

const HBS = hbs.create({
    extname: "hbs",
    defaultLayout: "base",
});
const PORT = config.get("app.port");
const SESSION_SECRET = config.get("session.secret");
const SESSION_SECURE = config.get("session.secure");
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
    
    app.set("trust proxy", 1)
    app.use(session({
    secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: {
            secure: SESSION_SECURE,
        },
    }));
    app.use(middleware.session_user);
    
    // Routes
    app.get("/", (req, res, next) => res.render("home"));
    app.use("/donate", donation_routes);
    app.use("/padlock", authentication_routes.create(sqlite));

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
