const auth = require("./auth");
const config = require("config");
const donations = require("./donations");
const {Router} = require("express");
const members = require("./members");
const planning = require("./planning");

const MOUNTS = config.get("app.mounts");

function create(sqlite) {
    const router = new Router();
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

