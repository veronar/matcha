const express = require("express");
const exphbs = require("express-handlebars");
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const session = require('express-session');
// const cookieParser = require('cookie-parser');

//Load models
const Message = require('./models/message');
const User = require('./models/user');

const app = express();

//Load keys file
const Keys = require('./config/keys');

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

//load Facebook strategy
require('./passport/facebook');

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

app.get("/", (req, res) => {
	res.render("home", {
		title: "Home"
	});
});

app.get("/about", (req, res) => {
	res.render("about", {
		title: "About"
	});
});

app.get('/contact', (req, res) => {
	res.render('contact', {
		title: "Contact"
	});
});

app.get('/auth/facebook', passport.authenticate('facebook', {
	scope: ['email']
}));
app.get('/auth/facebook/callback', passport.authenticate('facebook', {
	successRedirect: '/profile',
	failureRedirect: '/'
}));

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

app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
