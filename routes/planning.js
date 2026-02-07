const config = require("config");
const Event = require("../lib/event");
const {Router} = require("express");
const middleware = require("../lib/middleware");
const time = require("../lib/time");

const MOUNTS = config.get("app.mounts");

function list_events(req, res, next, sqlite) {
    try {
        const events = Event.list(sqlite);
        const context = {events};
        res.render("planning/events-list", context);
    }
    catch(err) {
        next(err);
    }
}

function edit_event(req, res, next, sqlite) {
    try {
        const {slug} = req.params;
        const event = Event.get_by_slug(sqlite, slug);
        if(event === null) {
            return res.sendStatus(404);
        }
        const context = {event};
        res.render("planning/event-edit", context);
    }
    catch(err) {
        next(err);
    }
}

function save_event(req, res, next, sqlite) {
    try {
        const event = req.body;
        event.start_ms = time.parse_datetime_local(event.start);
        event.end_ms = time.parse_datetime_local(event.end);
        delete event.start;
        delete event.end;
        event.is_published = (event.is_published?.length > 0)? 1 : 0;
        const now_ms = Date.now();
        event.updated_ms = now_ms;
        if(event.event_id === "") {
            // Clean up even more
            delete event.event_id;
            event.created_ms = now_ms;
            Event.create(sqlite, event);
            console.log({
                event: "Planning.CREATE",
                slug: event.slug,
            });
        }
        else {
            Event.update(sqlite, event);
            console.log({
                event: "Planning.UPDATE",
                slug: event.slug,
            });
        }
        const redirect_url = `/${MOUNTS.planning}/events`;
        res.redirect(redirect_url);
    }
    catch(err) {
        next(err);
    }
}

function create(sqlite) {
    const router = new Router();
    router.use(middleware.require_authentication);
    router.use(middleware.require_admin(sqlite));
    router.get(
        "/event/:slug",
        middleware.supply(edit_event, sqlite),
    );
    router.get(
        "/events",
        middleware.supply(list_events, sqlite),
    );
    router.post(
        "/events/save",
        middleware.supply(save_event, sqlite),
    );
    return router;
}

exports.create = create;
