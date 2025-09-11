function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.session.user && res.locals.isAdmin) {
        return next();
    }
    res.status(403).send('Forbidden: Admins only');
}

module.exports = {
    isAuthenticated,
    isAdmin
};
