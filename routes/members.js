const {Router} = require("express");
const middleware = require("../lib/middleware");

function create(sqlite) {
    const router = new Router();
    // Lock it down
    router.use(middleware.require_authentication);
    router.use(middleware.require_admin(sqlite));
    router.get("/", (req, res) => res.sendStatus(200));
    return router;
}

exports.create = create;
