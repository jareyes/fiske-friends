const auth = require("./auth");
const donations = require("./donations");
const {Router} = require("express");
const members = require("./members");

function create(sqlite) {
    const router = new Router();
    router.use("/donate", donations);
    router.use("/padlock", auth.create(sqlite));
    router.use("/members", members.create(sqlite));
    return router;
}

module.exports = create;

