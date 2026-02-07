const auth = require("./auth");
const config = require("config");
const donations = require("./donations");
const Event = require("../lib/event");
const {Router} = require("express");
const members = require("./members");
const middleware = require("../lib/middleware");
const planning = require("./planning");

const MOUNTS = config.get("app.mounts");

function home(req, res, next, sqlite) {
    try {
        const now_ms = Date.now();
        const events = Event.list_published(
            sqlite,
            now_ms,
        );
        const context = {events};
        res.render("home", context);
    }
    catch(err) {
        next(err);
    }
}

function create(sqlite) {
    const router = new Router();
    router .get(
        "/",
        middleware.supply(home, sqlite),
    );
    router.get(
        "/minutes",
        (req, res, next) => res.render("minutes"),
    );
    router.use(`/${MOUNTS.auth}`, auth.create(sqlite));
    router.use(`/${MOUNTS.donations}`, donations);
    router.use(
        `/${MOUNTS.members}`,
        members.create(sqlite),
    );
    router.use(
        `/${MOUNTS.planning}`,
        planning.create(sqlite),
    );
    return router;
}

module.exports = create;

