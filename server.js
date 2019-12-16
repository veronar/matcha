const express = require("express");
const exphbs = require("express-handlebars");
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('connect-flash');
// const cookieParser = require('cookie-parser');

//Load models
const Message = require('./models/message');
const User = require('./models/user');

const app = express();

//Load keys file
const Keys = require('./config/keys');

// Load helpers
const {
	requireLogin,
	ensureGuest
} = require('./helpers/auth');

//use body-parser middleware
app.use(bodyParser.urlencoded({
	extended: false
}));
app.use(bodyParser.json());

//confirguration for authentication
app.use(cookieParser());
app.use(session({
	secret: 'mysecret',
	resave: true,
	saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// connect-flash to flash messages
app.use(flash());
app.use((req, res, next) => {
	res.locals.success_msg = req.flash('success_msg');
	res.locals.error_msg = req.flash('error_msg');
	res.locals.error = req.flash('error');
	next();
});

// Setup express static folder to serve js & css files
app.use(express.static('public'));

// Make user global object
app.use((req, res, next) => {
	res.locals.user = req.user || null;
	next();
});

//load Facebook strategy
require('./passport/facebook');
require('./passport/google');

//connect to mLab MongoDB
mongoose.connect(Keys.MongoDB, {
	useNewUrlParser: true,
	useUnifiedTopology: true
}).then(() => {
	console.log('Server is connected to MongoDB')
}).catch((err) => {
	console.log(err);
});

//Environment variable for port
const port = process.env.PORT || 3000;

// setup view engine
app.engine("handlebars", exphbs({
	defaultLayout: "main"
}));
app.set("view engine", "handlebars");

// Home page 
app.get("/", ensureGuest, (req, res) => {
	res.render("home", {
		title: "Home"
	});
});

// About page
app.get("/about", ensureGuest, (req, res) => {
	res.render("about", {
		title: "About"
	});
});
// Contact page
app.get('/contact', ensureGuest, (req, res) => {
	res.render('contact', {
		title: "Contact"
	});
});

// Using passport to authenticate Facebook connection & user
app.get('/auth/facebook', passport.authenticate('facebook', {
	scope: ['email']
}));
app.get('/auth/facebook/callback', passport.authenticate('facebook', {
	successRedirect: '/profile',
	failureRedirect: '/'
}));

// Using passport to authenticate Google connection & user
app.get('/auth/google', passport.authenticate('google', {
	scope: ['profile']
}));
app.get('/auth/google/callback', passport.authenticate('google', {
	successRedirect: '/profile',
	failureRedirect: '/'
}));

// Profile page
app.get('/profile', requireLogin, (req, res) => {
	User.findById({
		_id: req.user._id
	}).then((user) => {
		if (user) {
			user.online = true;
			user.save((err, user) => {
				if (err) {
					throw err;
				} else {
					res.render('profile', {
						title: 'Profile',
						user: user
					});
				}
			});
		}
	});
});

// Creating new Local account
app.get('/newAccount', (req, res) => {
	res.render('newAccount', {
		title: 'Signup'
	});
});

// Handle signup form
app.post('/signup', (req, res) => {
	console.log(req.body);
	let errors = [];

	if (req.body.password !== req.body.password2) {
		errors.push({
			text: 'Passwords do not match'
		});
	}
	if (req.body.password.length < 6) {
		errors.push({
			text: 'Password must be mininum 6 characters'
		});
	}
	if (errors.length > 0) {
		res.render('newAccount', {
			errors: errors, 
			title: 'Error',
			fullname: req.body.username,
			email: req.body.email,
			password: req.body.password,
			password2: req.body.password2
		});
	} else {
		res.send('No Errors! Ready to create new account');
	}
});

// Logout page
app.get('/logout', (req, res) => {
	User.findById({
		_id: req.user._id
	}).then((user) => {
		user.online = false;
		user.save((err, user) => {
			if (err) {
				throw err;
			}
			if (user) {
				req.logout();
				res.redirect('/');
			}
		});
	});

});

// Contact Us page > once you submit a contact message
app.post('/contactUs', (req, res) => {
	console.log(req.body);
	const newMessage = {
		fullname: req.body.fullname,
		email: req.body.email,
		message: req.body.message,
		date: new Date()
	}
	new Message(newMessage).save((err, message) => {
		if (err) {
			throw err;
		} else {
			Message.find({}).then((messages) => {
				if (messages) {
					res.render('newmessage', {
						title: 'Sent',
						messages: messages
					});
				} else {
					res.render('noMessage', {
						title: 'Not Found'
					});
				}
			});
		}
	});
});


// which port the server is on
app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
