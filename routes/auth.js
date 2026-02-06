const {Router} = require("express");
const middleware = require("../lib/middleware");
const User = require("../lib/user");

function display_login(req, res, next) {
    try {
        const {redirect_url} = req.query;
        const context = {redirect_url};
        res.render("authentication/login", context);
    }
    catch(err) {
        next(err);
    }
}

async function login(req, res, next, sqlite) {
    try {
        const {
            email,
            password,
            redirect_url="/",
        } = req.body;
        const user = await User.authenticate(
            sqlite,
            email,
            password,
        );
        // Add user to session
        req.session.user = user;
        return res.redirect(redirect_url);
    }
    catch(err) {
        if(!(err instanceof User.AuthenticationError)) {
            return next(err);
        }
        const locals = {
            error_message: "That email doesn't go with that password.",
        }
        return res.render("authentication/login", locals);
    }
}

function logout(req, res, next) {
    req.session.destroy((err) => {
        if(err) {
            return next(err);
        }
        return res.redirect("/");
    });
}

function create(sqlite) {
    const router = new Router();
    router.get("/login", display_login);
    router.post(
        "/login",
        middleware.supply(login, sqlite),
    );
    router.get("/logout", logout);
    return router;
}

exports.create = create;
