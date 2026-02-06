const User = require("./user");
const LOGIN_URL = "/padlock/login";

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

function session_user(req, res, next) {
    if(req.session.user !== undefined) {
        res.locals.user = req.session.user;
    }
    next();
}

exports.require_authentication = require_authentication;
exports.require_permission = require_permission;
exports.session_user = session_user;
exports.supply = supply;
