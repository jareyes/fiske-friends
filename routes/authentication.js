const {Router} = require("express");
const User = require("../lib/user");

function display_login(req, res, next) {
    res.render("authentication/login");
}

async function login(req, res, next, sqlite) {
    try {
        const {email, password} = req.body;
        const user = await User.authenticate(sqlite, email, password);
        // Add user to session
        req.session.user = user;
        return res.redirect("/");
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
    router.post("/login", (req, res, next) => login(req, res, next, sqlite));
    router.get("/logout", logout);
    return router;
}

exports.create = create;
