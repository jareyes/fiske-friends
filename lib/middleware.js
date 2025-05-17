function session_user(req, res, next) {
    if(req.session.user !== undefined) {
        res.locals.user = req.session.user;
    }
    next();
}

exports.session_user = session_user;
