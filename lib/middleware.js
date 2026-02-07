const config = require("config");
const Group = require("./group");
const User = require("./user");

const MOUNTS = config.get("app.mounts");
const LOGIN_URL = `/${MOUNTS.auth}/login`;


function require_admin(sqlite) {
    return require_permission(sqlite, Group.ADMIN);
}

function require_authentication(req, res, next) {
    try {
        const {user} = req.session;
        const target_url = req.originalUrl;
        const redirect_url = `${LOGIN_URL}?redirect_url=${target_url}`;
        if(user === undefined) {
            return res.redirect(redirect_url);
        }
        next();
    }
    catch(err) {
        next(err);
    }
}

function require_permission(sqlite, group_name) {
    return (req, res, next) => {
        try {
            const {user} = req.session;
            const has_permission = User.has_permission(
                sqlite,
                user?.user_id,
                group_name,
            );
            if(has_permission) {
                return next();
            }
            console.log({
                event: "Middleware.UNAUTHORIZED",
                url: req.originalUrl,
                user,
            });
            return res.sendStatus(403);
        }
        catch(err) {
            next(err);
        }
    };
}

function supply(route, ...args) {
    return (req, res, next) => route(
        req,
        res,
        next,
        ...args,
    ); 
}

function template_mounts(req, res, next) {
    res.locals.mounts = MOUNTS;
    next();
}

function template_session_user(req, res, next) {
    if(req.session.user !== undefined) {
        res.locals.user = req.session.user;
    }
    next();
}

exports.require_admin = require_admin;
exports.require_authentication = require_authentication;
exports.require_permission = require_permission;
exports.supply = supply;
exports.template_mounts = template_mounts;
exports.template_session_user = template_session_user;
