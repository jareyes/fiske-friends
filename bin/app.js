#!/usr/bin/env node
const config = require("config");
const express = require("express");
const hbs = require("express-handlebars");
const path = require("node:path");

const HBS = hbs.create({
    extname: "hbs",
    defaultLayout: "base",
});
const PORT = config.get("app.port");
const VIEWS_DIRPATH = path.join(__dirname, "..", "views");

const app = express();

// Templates
app.engine("hbs", HBS.engine);
app.set("view engine", "hbs");
app.set("views", VIEWS_DIRPATH);

app.use(express.static("static"));
app.get("/", (req, res, next) => res.render("home"));

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
