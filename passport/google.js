const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth').OAuthStrategy;

const User = require('../models/user');
const keys = require('../config/keys');

passport.serializeUser((user, done) => {
	return done(null, user.id);
});

passport.deserializeUser((id, done) => {
	User.findById(id, (err, user) => {
		return done(err, user);
	});
});


