const express = require("express");
const exphbs = require("express-handlebars");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const passport = require("passport");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const flash = require("connect-flash");
const bcrypt = require("bcryptjs");
const formidable = require("formidable");
// const cookieParser = require('cookie-parser');

//Load models
const Message = require("./models/message");
const User = require("./models/user");
const Chat = require("./models/chat");
const Smile = require("./models/smile");
const Post = require("./models/post");

const app = express();

//Load keys file
const Keys = require("./config/keys");

// even though stripe is an npm, it needs the key from keys.js. so we have to load it only after we get keys.js in here
const stripe = require('stripe')(Keys.StripeSecretKey);

// Load helpers
const {
	requireLogin,
	ensureGuest
} = require("./helpers/auth");
//upload image ajax? i think
const {
	uploadImage
} = require("./helpers/aws");
//bring in moment.js to use '? hours ago"
const {
	getLastMoment
} = require('./helpers/moment');
//bring in helper for payment notification, ie wallet is empty
const {
	walletChecker
} = require('./helpers/wallet');

//use body-parser middleware
app.use(
	bodyParser.urlencoded({
		extended: false
	})
);
app.use(bodyParser.json());

//confirguration for authentication
app.use(cookieParser());
app.use(
	session({
		secret: "mysecret",
		resave: true,
		saveUninitialized: true
	})
);
app.use(passport.initialize());
app.use(passport.session());

// connect-flash to flash messages
app.use(flash());
app.use((req, res, next) => {
	res.locals.success_msg = req.flash("success_msg");
	res.locals.error_msg = req.flash("error_msg");
	res.locals.error = req.flash("error");
	next();
});

// Setup express static folder to serve js & css files
app.use(express.static("public"));

// Make user global object
app.use((req, res, next) => {
	res.locals.user = req.user || null;
	next();
});

//load Facebook strategy
require("./passport/facebook");
require("./passport/google");
require("./passport/local");

//connect to mLab MongoDB / mongoAtlas
mongoose.connect(Keys.MongoDB, {
		useNewUrlParser: true,
		useUnifiedTopology: true
	})
	.then(() => {
		console.log("Server is connected to MongoDB");
	})
	.catch(err => {
		console.log(err);
	});

//Environment variable for port
const port = process.env.PORT || 3000;

// setup view engine
app.engine(
	"handlebars",
	exphbs({
		defaultLayout: "main",
		helpers: {
			getLastMoment: getLastMoment
		}
	})
);
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
app.get("/contact", ensureGuest, (req, res) => {
	res.render("contact", {
		title: "Contact"
	});
});

// Using passport to authenticate Facebook connection & user
app.get(
	"/auth/facebook",
	passport.authenticate("facebook", {
		scope: ["email"]
	})
);
app.get(
	"/auth/facebook/callback",
	passport.authenticate("facebook", {
		successRedirect: "/profile",
		failureRedirect: "/"
	})
);

// Using passport to authenticate Google connection & user
app.get(
	"/auth/google",
	passport.authenticate("google", {
		scope: ["profile"]
	})
);
app.get(
	"/auth/google/callback",
	passport.authenticate("google", {
		successRedirect: "/profile",
		failureRedirect: "/"
	})
);

// Profile page / display current users profile page
app.get("/profile", requireLogin, (req, res) => {
	User.findById({
		_id: req.user._id
	}).then(user => {
		if (user) {
			user.online = true;
			user.save((err, user) => {
				if (err) {
					throw err;
				} else {
					Smile.findOne({
						receiver: req.user._id,
						receiverReceived: false
					}).then((newSmile) => {
						Chat.findOne({
							$or: [{
									receiver: req.user._id,
									receiverRead: false
								},
								{
									sender: req.user._id,
									senderRead: false
								}
							]
						}).then((unread) => {
							Post.find({
									postUser: req.user._id
								}).populate('postUser')
								.sort({
									date: 'desc'
								})
								.then((posts) => {
									if (posts) {
										res.render('profile', {
											title: 'Profile',
											user: user,
											newSmile: newSmile,
											unread: unread,
											posts: posts
										});
									} else {
										console.log('User does not have any posts');
										res.render('profile', {
											title: 'Profile',
											user: user,
											newSmile: newSmile,
											unread: unread
										});
									}
								});
						});
					});
				}
			});
		}
	});
});

// update profile page
app.post('/updateProfile', requireLogin, (req, res) => {
	User.findById({
		_id: req.user._id
	}).then((user) => {
		user.fullname = req.body.fullname;
		user.email = req.body.email;
		user.gender = req.body.gender;
		user.about = req.body.about;
		user.save(() => {
			res.redirect('/profile');
		});
	});
});

//confirmation delete account page
app.get('/confirmDelete', requireLogin, (req, res) => {
	res.render('confirmDelete', {
		title: 'Delete Account'
	});
});

// deleting the account page
app.get('/deleteAccount', requireLogin, (req, res) => {
	User.deleteOne({
		_id: req.user._id
	}).then(() => {
		res.render('accDeleted', {
			title: 'Deleted'
		});
	});
});

// Creating new Local account
app.get("/newAccount", (req, res) => {
	res.render("newAccount", {
		title: "Signup"
	});
});

// Handle signup form
app.post("/signup", (req, res) => {
	console.log(req.body);
	let errors = [];

	if (req.body.password !== req.body.password2) {
		errors.push({
			text: "Passwords do not match"
		});
	}
	if (req.body.password.length < 6) {
		errors.push({
			text: "Password must be mininum 6 characters"
		});
	}
	if (errors.length > 0) {
		res.render("newAccount", {
			errors: errors,
			title: "Error",
			fullname: req.body.username,
			email: req.body.email,
			password: req.body.password,
			password2: req.body.password2
		});
	} else {
		User.findOne({
			email: req.body.email
		}).then(user => {
			if (user) {
				let errors = [];
				errors.push({
					text: "Email already exists"
				});
				res.render("newAccount", {
					title: "Signup",
					errors: errors
				});
			} else {
				var salt = bcrypt.genSaltSync(10);
				var hash = bcrypt.hashSync(req.body.password, salt);
				const newUser = {
					fullname: req.body.username,
					email: req.body.email,
					password: hash
				};
				new User(newUser).save((err, user) => {
					if (err) {
						throw err;
					}
					if (user) {
						let success = [];
						success.push({
							text: "Account successfully created"
						});
						res.render("home", {
							success: success
						});
					}
				});
			}
		});
	}
});

// Login page
app.post(
	"/login",
	passport.authenticate("local", {
		successRedirect: "/profile",
		failureRedirect: "/loginErrors"
	})
);

app.get("/loginErrors", (req, res) => {
	let errors = [];
	errors.push({
		text: "User not found or incorrect password"
	});
	res.render("home", {
		errors: errors
	});
});

// Handle get to upload images
app.get("/uploadImage", requireLogin, (req, res) => {
	res.render("uploadImage", {
		title: "Upload"
	});
});

// upload avatar
app.post("/uploadAvatar", requireLogin, (req, res) => {
	User.findById({
		_id: req.user._id
	}).then((user) => {
		user.image = `https://matcha-vesingh.s3.amazonaws.com/${req.body.upload}`;
		user.save((err) => {
			if (err) {
				throw err;
			} else {
				res.redirect("/profile");
			}
		});
	});
});

//ajax upload image
app.post("/uploadFile", requireLogin, uploadImage.any(), (req, res) => {
	const form = new formidable.IncomingForm();
	form.on("file", (field, file) => {
		console.log(file);
	});
	form.on("error", err => {
		console.log(err);
	});
	form.on("end", () => {
		console.log("Image successfully uploaded!");
	});
	form.parse(req);
});

//handle get route for fidning users
app.get('/singles', requireLogin, (req, res) => {
	User.find({})
		.sort({
			date: 'desc'
		})
		.then((singles) => {
			res.render('singles', {
				title: 'Singles',
				singles: singles
			})
		}).catch((err) => {
			console.log(err);
		});
});

// SIngle user profile page
app.get('/userProfile/:id', requireLogin, (req, res) => {
	User.findById({
		_id: req.params.id
	}).then((user) => {
		Smile.findOne({
			receiver: req.params.id
		}).then((smile) => {
			res.render('userProfile', {
				title: 'Profile',
				oneUser: user,
				smile: smile
			});
		})
	});
});

//Start chat process / route
app.get('/startChat/:id', requireLogin, (req, res) => {
	Chat.findOne({
		sender: req.params.id,
		receiver: req.user._id
	}).then((chat) => {
		if (chat) {
			chat.receiverRead = true;
			chat.senderRead = false;
			chat.date = new Date();
			chat.save((err, chat) => {
				if (err) {
					console.log(err);
				}
				if (chat) {
					res.redirect(`/chat/${chat._id}`);
				}
			});
		} else {
			Chat.findOne({
				sender: req.user._id,
				receiver: req.params.id
			}).then((chat) => {
				if (chat) {
					chat.senderRead = true;
					chat.receiverRead = false;
					chat.date = new Date();
					chat.save((err, chat) => {
						if (err) {
							console.log(err);
						}
						if (chat) {
							res.redirect(`/chat/${chat._id}`);
						}
					});
				} else {
					const newChat = {
						sender: req.user._id,
						receiver: req.params.id,
						senderRead: true,
						receiverRead: false,
						date: new Date()
					};
					new Chat(newChat).save((err, chat) => {
						if (err) {
							console.log(err);
						}
						if (chat) {
							res.redirect(`/chat/${chat._id}`);
						}
					});
				}
			});
		}
	});
});

// display chat room
app.get('/chat/:id', requireLogin, (req, res) => {
	Chat.findById({
			_id: req.params.id
		}).populate('sender')
		.populate('receiver')
		.populate('chats.senderName')
		.populate('chats.receiverName')
		.then((chat) => {
			User.findOne({
				_id: req.user._id
			}).then((user) => {
				res.render('chatRoom', {
					title: 'Chat',
					user: user,
					chat: chat
				});
			});
		});
});

// handiling submittin of messages in chatroom (form)
app.post('/chat/:id', requireLogin, walletChecker, (req, res) => {
	Chat.findOne({
			_id: req.params.id,
			sender: req.user._id
		}).populate('sender')
		.populate('receiver')
		.populate('chats.senderName')
		.populate('chats.receiverName')
		.then((chat) => {
			if (chat) {
				//sender sends message here
				chat.senderRead = true;
				chat.receiverRead = false;
				chat.date = new Date();

				const newChat = {
					senderName: req.user._id,
					senderRead: true,
					receiverName: chat.receiver._id,
					receiverRead: false,
					date: new Date(),
					senderMessage: req.body.chat
				};
				chat.chats.push(newChat);
				chat.save((err, chat) => {
					if (err) {
						throw err;
					}
					if (chat) {
						Chat.findOne({
								_id: chat._id
							})
							.sort({
								date: 'desc'
							})
							.populate('sender')
							.populate('receiver')
							.populate('chats.senderName')
							.populate('chats.receiverName')
							.then((chat) => {
								User.findById({
									_id: req.user._id
								}).then((user) => {
									//charge client for each message
									user.wallet = user.wallet - 1;
									user.save((err, user) => {
										if (err) {
											throw err;
										}
										if (user) {
											res.render('chatRoom', {
												title: 'Chat',
												chat: chat,
												user: user
											});
										}
									});
								});
							});
					}
				});
			}
			// receiver sends messages back
			else {
				Chat.findOne({
						_id: req.params.id,
						receiver: req.user._id
					})
					.sort({
						date: 'desc'
					})
					.populate('sender')
					.populate('receiver')
					.populate('chats.senderName')
					.populate('chats.receiverName')
					.then((chat) => {
						chat.senderRead = true;
						chat.receiverRead = false;
						chat.date = new Date();

						const newChat = {
							senderName: chat.sender._id,
							senderRead: false,
							receiverName: req.user._id,
							receiverRead: true,
							receiverMessage: req.body.chat,
							date: new Date()
						};
						chat.chats.push(newChat);
						chat.save((err, chat) => {
							if (err) {
								throw err;
							}
							if (chat) {
								Chat.findOne({
										_id: chat._id
									})
									.sort({
										date: 'desc'
									})
									.populate('sender')
									.populate('receiver')
									.populate('chats.senderName')
									.populate('chats.receiverName')
									.then((chat) => {
										User.findById({
											_id: req.user._id
										}).then((user) => {
											user.wallet = user.wallet - 1;
											user.save((err, user) => {
												if (err) {
													throw err;
												}
												if (user) {
													res.render('chatRoom', {
														title: 'Chat',
														user: user,
														chat: chat
													});
												}
											});
										});
									});
							}
						});
					});
			}
		});
})

// find history of all chats (user based)
app.get('/chats', requireLogin, (req, res) => {
	Chat.find({
			receiver: req.user._id
		}).populate('sender')
		.populate('receiver')
		.populate('chats.senderName')
		.populate('chats.receiverName')
		.sort({
			date: 'desc'
		}).then((received) => {
			Chat.find({
					sender: req.user._id
				}).populate('sender')
				.populate('receiver')
				.populate('chats.senderName')
				.populate('chats.receiverName')
				.sort({
					date: 'desc'
				}).then((sent) => {
					res.render('chat/chats', {
						title: 'Chats History',
						received: received,
						sent: sent
					});
				});
		});
});

//Delete chat
app.get('/deleteChat/:id', requireLogin, (req, res) => {
	Chat.deleteOne({
		_id: req.params.id
	}).then(() => {
		res.redirect('/chats');
	});
});

//to the payment page
app.get('/payment', requireLogin, (req, res) => {
	res.render('payment', {
		title: 'Payment',
		StripePublishableKey: Keys.StripePublishableKey
	});
});

//charge client - payment process ($10)
app.post('/charge10dollars', requireLogin, (req, res) => {
	console.log(req.body);
	const amount = 1000;
	stripe.customers.create({
		email: req.body.stripeEmail,
		source: req.body.stripeToken
	}).then((customer) => {
		stripe.charges.create({
			amount: amount,
			description: '$10 for 20 messages',
			currency: 'usd',
			customer: customer.id,
			receipt_email: customer.email
		}).then((charge) => {
			if (charge) {
				User.findById({
					_id: req.user._id
				}).then((user) => {
					user.wallet += 20;
					user.save()
						.then(() => {
							res.render('success', {
								title: 'Success',
								charge: charge
							})
						});
				});
			}
		}).catch((err) => {
			console.log(err);
		});
	}).catch((err) => {
		console.log(err);
	});
});

//charge client - payment process ($20)
app.post('/charge20dollars', requireLogin, (req, res) => {
	console.log(req.body);
	const amount = 2000;
	stripe.customers.create({
		email: req.body.stripeEmail,
		source: req.body.stripeToken
	}).then((customer) => {
		stripe.charges.create({
			amount: amount,
			description: '$20 for 50 messages',
			currency: 'usd',
			customer: customer.id,
			receipt_email: customer.email
		}).then((charge) => {
			if (charge) {
				User.findById({
					_id: req.user._id
				}).then((user) => {
					user.wallet += 50;
					user.save()
						.then(() => {
							res.render('success', {
								title: 'Success',
								charge: charge
							})
						});
				});
			}
		}).catch((err) => {
			console.log(err);
		});
	}).catch((err) => {
		console.log(err);
	});
});

//charge client - payment process ($20)
app.post('/charge50dollars', requireLogin, (req, res) => {
	console.log(req.body);
	const amount = 5000;
	stripe.customers.create({
		email: req.body.stripeEmail,
		source: req.body.stripeToken
	}).then((customer) => {
		stripe.charges.create({
			amount: amount,
			description: '$50 for 150 messages',
			currency: 'usd',
			customer: customer.id,
			receipt_email: customer.email
		}).then((charge) => {
			if (charge) {
				User.findById({
					_id: req.user._id
				}).then((user) => {
					user.wallet += 150;
					user.save()
						.then(() => {
							res.render('success', {
								title: 'Success',
								charge: charge
							})
						});
				});
			}
		}).catch((err) => {
			console.log(err);
		});
	}).catch((err) => {
		console.log(err);
	});
});


// get route to send smile
app.get('/sendSmile/:id', requireLogin, (req, res) => {
	const newSmile = {
		sender: req.user._id,
		receiver: req.params.id,
		senderSent: true
	};
	new Smile(newSmile).save((err, smile) => {
		if (err) {
			throw err;
		}
		if (smile) {
			res.redirect(`/userProfile/${req.params.id}`);
		}
	});
});

// delte smile
app.get('/deleteSmile/:id', requireLogin, (req, res) => {
	Smile.deleteOne({
		receiver: req.params.id,
		sender: req.user._id
	}).then(() => {
		res.redirect(`/userProfile/${req.params.id}`)
	});
});

// Show smile sender
app.get('/showSmile/:id', requireLogin, (req, res) => {
	Smile.findOne({
			_id: req.params.id
		}).populate('sender')
		.populate('receiver')
		.then((smile) => {
			smile.receiverReceived = true;
			smile.save((err, smile) => {
				if (err) {
					throw err;
				}
				if (smile) {
					res.render('smile/showSmile', {
						title: 'New Smile',
						smile: smile
					});
				}
			});
		});
});

//get method to add post //I think he is creating a feed and this is to add an entry (post) to that feed
app.get('/displayPostForm', requireLogin, (req, res) => {
	res.render('post/displayPostForm', {
		title: 'Create Post'
	});
});

//creating the post
app.post('/createPost', requireLogin, (req, res) => {
	let allowComments = Boolean;

	if (req.body.allowComments) {
		allowComments = true;
	} else {
		allowComments = false;
	};

	const newPost = {
		title: req.body.title,
		body: req.body.body,
		status: req.body.status,
		image: `https://matcha-vesingh.s3.amazonaws.com/${req.body.image}`,
		postUser: req.user._id,
		allowComments: allowComments,
		date: new Date(),
	};

	if (req.body.status === 'public') {
		newPost.icon = 'fa fa-globe';
	} else if (req.body.status === 'private') {
		newPost.icon = 'fa fa-lock';
	} else {
		newPost.icon = 'fa fa-users';
	};

	new Post(newPost).save()
		.then(() => {
			if (req.body.status === 'public') {
				res.redirect('/posts');
			} else {
				res.redirect('/profile');
			}
		});
});

//display all public posts / feed
app.get('/posts', requireLogin, (req, res) => {
	Post.find({
			status: 'public'
		}).populate('postUser')
		.sort({
			date: 'desc'
		})
		.then((posts) => {
			res.render('post/posts', {
				title: 'Posts',
				posts: posts
			});
		});
});

// Logout page
app.get("/logout", (req, res) => {
	User.findById({
		_id: req.user._id
	}).then(user => {
		user.online = false;
		user.save((err, user) => {
			if (err) {
				throw err;
			}
			if (user) {
				req.logout();
				res.redirect("/");
			}
		});
	});
});

// Contact Us page > once you submit a contact message
app.post("/contactUs", (req, res) => {
	console.log(req.body);
	const newMessage = {
		fullname: req.body.fullname,
		email: req.body.email,
		message: req.body.message,
		date: new Date()
	};
	new Message(newMessage).save((err, message) => {
		if (err) {
			throw err;
		} else {
			Message.find({}).then(messages => {
				if (messages) {
					res.render("newmessage", {
						title: "Sent",
						messages: messages
					});
				} else {
					res.render("noMessage", {
						title: "Not Found"
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
