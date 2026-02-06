const { Router } = require('express');
const passport = require('passport');

const router = Router();

// GET /auth/login - Redirect to Discord OAuth2
router.get('/login', passport.authenticate('discord'));

// GET /auth/callback - Handle Discord OAuth2 callback
router.get(
  '/callback',
  passport.authenticate('discord', {
    successRedirect: '/',
    failureRedirect: '/auth/login',
  })
);

// GET /auth/logout - Log out and redirect home
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect('/');
  });
});

module.exports = router;
