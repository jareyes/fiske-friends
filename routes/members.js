const {Router} = require("express");
const Group = require("../lib/group.js");
const middleware = require("../lib/middleware");

function create(sqlite) {
    const router = new Router();
    // Lock it down
    router.use(middleware.require_authentication);
    router.use(
        middleware.require_permission(
            sqlite,
            Group.ADMIN,
        ),
    );
    router.get("/", (req, res) => res.sendStatus(200));
    return router;
}

exports.create = create;
