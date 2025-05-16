#!/usr/bin/env node
const config = require("config");
const donation_routes = require("../lib/donation_routes.js");
const express = require("express");
const hbs = require("express-handlebars");
const path = require("node:path");
const session = require("express-session");

const HBS = hbs.create({
    extname: "hbs",
    defaultLayout: "base",
});
const PORT = config.get("app.port");
const SESSION_SECRET = config.get("session.secret");
const SESSION_SECURE = config.get("session.secure");
const VIEWS_DIRPATH = path.join(__dirname, "..", "views");

const app = express();

// Templates
app.engine("hbs", HBS.engine);
app.set("view engine", "hbs");
app.set("views", VIEWS_DIRPATH);

// Middleware
app.use(express.static("static"));
app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.set("trust proxy", 1);
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: SESSION_SECURE,
	sameSite: "strict",
	domain: "fiskefriends.org",
    },
}));

// Routes
app.get("/", (req, res, next) => res.render("home"));
app.use("/donate", donation_routes);

if(require.main === module) {
    app.listen(
        PORT,
        () => console.log({
            event: "App.START",
            port: PORT,
        }),
    );
}

module.exports = app;
