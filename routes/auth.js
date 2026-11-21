// Password sign-in for the board's admin pages (/plan), mounted at /auth. Read-a-thon desk volunteers
// sign in at /readathon/volunteer, and families with an emailed link at /readathon/sign-in.
const config = require("config");
const {Router} = require("express");
const Emails = require("../lib/readathon-emails");
const FormGuard = require("../lib/form-guard");
const Mailer = require("../lib/mailer");
const middleware = require("../lib/middleware");
const SignIn = require("../lib/sign-in");
const Throttle = require("../lib/throttle");
const User = require("../lib/user");

const MOUNTS = config.get("app.mounts");
const MIN_PASSWORD_LENGTH = 8;
const DEFAULT_REDIRECT = `/${MOUNTS.planning}`;
const failed_sign_ins = new SignIn.FailedSignIns();
// Reset emails: one per address every couple of minutes and a few a day, so the form can't flood an inbox
const reset_per_email = new Throttle({min_gap_ms: 2 * 60 * 1000, per_day: 5});
const reset_per_ip = new Throttle({per_day: 30});

function show_login(req, res, locals = {}) {
    res.render("auth/login", {
        title: "Sign in",
        head: '<link rel="stylesheet" href="/css/admin.css">',
        redirect_url: SignIn.safe_redirect(req.query.redirect_url, DEFAULT_REDIRECT),
        cookie_problem: SignIn.cookie_problem(req),
        password_updated: req.query.reset === "done",
        ...locals,
    });
}

function display_login(req, res, next) {
    try {
        show_login(req, res);
    }
    catch(err) {
        next(err);
    }
}

async function login(req, res, next, sqlite) {
    const email = String(req.body.email ?? "").trim().slice(0, 200);
    const redirect_url = SignIn.safe_redirect(req.body.redirect_url, DEFAULT_REDIRECT);
    try {
        if(failed_sign_ins.blocked(email, req.ip)) {
            console.log({event: "Auth.SIGN_IN_LIMITED", ip: req.ip});
            res.status(429);
            return show_login(req, res, {email, redirect_url, error_message: "Too many wrong passwords. Wait 15 minutes, then try again."});
        }
        const user = await User.authenticate(sqlite, email, String(req.body.password ?? ""));
        failed_sign_ins.clear(email);
        await SignIn.start_user_session(req, user);
        console.log({event: "Auth.SIGNED_IN", user_id: user.user_id});
        return res.redirect(redirect_url);
    }
    catch(err) {
        if(!(err instanceof User.AuthenticationError)) {
            return next(err);
        }
        failed_sign_ins.record(email, req.ip);
        res.status(401);
        // Keep the email and where they were going, so they only retype the password
        return show_login(req, res, {email, redirect_url, error_message: "That email and password don't match. Check for typos and try again."});
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

// ---------- forgot your password? ----------

function show_forgot(req, res, locals = {}) {
    res.render("auth/forgot", {
        title: "Forgot your password?",
        head: '<link rel="stylesheet" href="/css/admin.css">',
        form_stamp: FormGuard.stamp(),
        ...locals,
    });
}

function forgot_password(req, res, next, sqlite) {
    try {
        const email = String(req.body.email ?? "").trim().slice(0, 200);
        const guard = FormGuard.check(req.body);
        if(guard === "too_fast") {
            res.status(400);
            return show_forgot(req, res, {email, error_message: FormGuard.TOO_FAST_MESSAGE});
        }
        const user = guard === "honeypot" ? null : User.get_by_email(sqlite, email);
        if(user !== null && reset_per_email.attempt(user.email.toLowerCase()) && reset_per_ip.attempt(req.ip)) {
            // In the background, so the page takes just as long whether or not the email has an account
            Mailer.deliver(sqlite, () => Emails.password_reset_for(user));
            console.log({event: "Auth.RESET_EMAILED", user_id: user.user_id});
        }
        else if(user !== null) {
            console.log({event: "Auth.RESET_THROTTLED", user_id: user.user_id});
        }
        // The same answer either way, so the form can't be used to find out who has an account
        show_forgot(req, res, {sent: true, email});
    }
    catch(err) {
        next(err);
    }
}

// ---------- choosing a new password ----------

function show_reset(res, locals) {
    res.render("auth/reset-password", {
        title: "Choose a new password",
        head: '<link rel="stylesheet" href="/css/admin.css">',
        min_password_length: MIN_PASSWORD_LENGTH,
        ...locals,
    });
}

function reset_password(req, res, next, sqlite) {
    try {
        const {token} = req.params;
        if(User.user_from_reset_token(sqlite, token) === null) {
            res.status(400);
            return show_reset(res, {expired: true});
        }
        show_reset(res, {token});
    }
    catch(err) {
        next(err);
    }
}

async function update_password(req, res, next, sqlite) {
    try {
        const token = String(req.body.token ?? "");
        const password1 = String(req.body.password1 ?? "");
        const password2 = String(req.body.password2 ?? "");
        // Expired, altered, or already used to change the password
        const user = User.user_from_reset_token(sqlite, token);
        if(user === null) {
            res.status(400);
            return show_reset(res, {expired: true});
        }
        const context = {token};
        if(password1.length < MIN_PASSWORD_LENGTH) {
            res.status(400);
            return show_reset(res, {...context, message: `That's too short. Use at least ${MIN_PASSWORD_LENGTH} characters.`});
        }
        if(password1 !== password2) {
            res.status(400);
            return show_reset(res, {...context, message: "The two passwords don't match. Type them again."});
        }
        User.set_password_hash(sqlite, user.user_id, await User.hash_password(password1));
        console.log({event: "Auth.PASSWORD_RESET", user_id: user.user_id});
        res.redirect(`/${MOUNTS.auth}/login?reset=done`);
    }
    catch(err) {
        next(err);
    }
}

function create(sqlite) {
    const router = new Router();
    router.get("/login", display_login);
    router.post("/login", middleware.supply(login, sqlite));
    router.get("/logout", logout);
    router.get("/forgot", (req, res) => show_forgot(req, res));
    router.post("/forgot", middleware.supply(forgot_password, sqlite));
    router.post("/reset", middleware.supply(update_password, sqlite));
    router.get("/reset/:token", middleware.supply(reset_password, sqlite));
    return router;
}

exports.create = create;
