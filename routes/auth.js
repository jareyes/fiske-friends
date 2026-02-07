const AuthenticationError = require("../lib/authentication_error");
const config = require("config");
const {Router} = require("express");
const middleware = require("../lib/middleware");
const Token = require("../lib/token");
const User = require("../lib/user");

const MOUNTS = config.get("app.mounts");
const MIN_PASSWORD_LENGTH = 8;

function display_login(req, res, next) {
    try {
        const {
            redirect_url=`/${MOUNTS.planning}/events`,
        } = req.query;
        const context = {redirect_url};
        res.render("auth/login", context);
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
            redirect_url,
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
        return res.render("auth/login", locals);
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

function reset_password(req, res, next) {
    try {
        const {token} = req.params;
        const [user_id] = Token.validate(token);
        const context = {
            min_password_length: MIN_PASSWORD_LENGTH,
            token,
            user_id,
        };
        res.render("auth/reset-password", context); 
    }
    catch(err) {
        if(err instanceof AuthenticationError) {
            return res.sendStatus(400);
        }
        next(err);
    }
}

async function update_password(req, res, next, sqlite) {
    try {
        const {
            password1,
            password2,
            token,
            user_id,
        } = req.body;
        const [token_id] = Token.validate(token);
        if(user_id !== token_id) {
            console.log({
                event: "Auth.USER_MISMATCH",
                user_id,
                token_id,
            });
            return res.sendStatus(400);
        }
        const context = {
            min_password_length: MIN_PASSWORD_LENGTH,
            token,
            user_id,
        };
        if(password1 !== password2) {
            context.message = "Passwords do not match";
            return res.render(
                "auth/reset-password",
                context,
            );
        }
        if(password1.length < MIN_PASSWORD_LENGTH) {
            context.message = "Password is too short";
            return res.render(
                "auth/reset-password",
                context,
            );
        }
        const user = User.get_by_id(sqlite, user_id);
        const password_hash = await User.hash_password(password1);
        user.password_hash = password_hash;
        user.updated_ms = Date.now();
        delete user.created_at;
        delete user.updated_at;
        User.update(sqlite, user);
        res.redirect(`/${MOUNTS.auth}/login`);
    }
    catch(err) {
        next(err);
    }
}

function create(sqlite) {
    const router = new Router();
    router.get("/login", display_login);
    router.post(
        "/login",
        middleware.supply(login, sqlite),
    );
    router.get("/logout", logout);
    router.post(
        "/reset",
        middleware.supply(update_password, sqlite),
    );
    router.get("/reset/:token", reset_password);
    return router;
}

exports.create = create;
