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
const socket = require("socket.io");
const http = require("http");
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
const stripe = require("stripe")(Keys.StripeSecretKey);

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
} = require("./helpers/moment");
//bring in helper for payment notification, ie wallet is empty
const {
	walletChecker
} = require("./helpers/wallet");

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
mongoose
	.connect(Keys.MongoDB, {
		useNewUrlParser: true,
		useUnifiedTopology: true
	})
	.then(() => {
		console.log("Server is connected to MongoDB");
	})
	.catch((err) => {
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
		title: "Welcome"
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
		successRedirect: "/askMore",
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
		successRedirect: "/askMore",
		failureRedirect: "/"
	})
);

// Profile page / display current users profile page
app.get("/profile", requireLogin, (req, res) => {
	User.findById({
			_id: req.user._id
		})
		.populate("friends.friend")
		.then((user) => {
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
									})
									.populate("postUser")
									.sort({
										date: "desc"
									})
									.then((posts) => {
										if (posts) {
											res.render("profile", {
												title: "My Profile",
												user: user,
												newSmile: newSmile,
												unread: unread,
												posts: posts
											});
										} else {
											console.log("User does not have any posts");
											res.render("profile", {
												title: "My Profile",
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

//upload pictures to profile
app.post("/uploadPictures", requireLogin, (req, res) => {
	User.findById({
		_id: req.user._id
	}).then((user) => {
		const newImage = {
			image: `https://matcha-vesingh.s3.amazonaws.com/${req.body.upload}`,
			date: new Date()
		};
		user.pictures.push(newImage);
		user.save().then(() => {
			res.redirect("/profile");
		});
	});
});

//delete picture
app.get("/deletePicture/:id", requireLogin, (req, res) => {
	User.findById({
		_id: req.user._id
	}).then((user) => {
		user.pictures.id(req.params.id).remove();
		user.save((err) => {
			if (err) {
				throw err;
			} else {
				res.redirect("/profile");
			}
		});
	});
});

// update profile page
app.post("/updateProfile", requireLogin, (req, res) => {
	User.findById({
		_id: req.user._id
	}).then((user) => {
		user.fullname = req.body.fullname;
		user.email = req.body.email;
		user.gender = req.body.gender;
		user.age = req.body.age;
		user.about = req.body.about;
		user.save(() => {
			res.redirect("/profile");
		});
	});
});

//confirmation delete account page
app.get("/confirmDelete", requireLogin, (req, res) => {
	res.render("confirmDelete", {
		title: "Delete Account"
	});
});

// deleting the account page
app.get("/deleteAccount", requireLogin, (req, res) => {
	User.deleteOne({
		_id: req.user._id
	}).then(() => {
		res.render("accDeleted", {
			title: "Account Deleted"
		});
	});
});

// Creating new Local account
app.get("/newAccount", ensureGuest, (req, res) => {
	res.render("newAccount", {
		title: "Register"
	});
});

// Handle signup form
app.post("/signup", ensureGuest, (req, res) => {
	//console.log(req.body);
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
			title: "Register",
			fullname: req.body.username,
			email: req.body.email,
			password: req.body.password,
			password2: req.body.password2
		});
	} else {
		User.findOne({
			email: req.body.email
		}).then((user) => {
			if (user) {
				let errors = [];
				errors.push({
					text: "Email already exists"
				});
				res.render("newAccount", {
					title: "Register",
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
							title: "Welcome",
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
		successRedirect: "/askMore",
		failureRedirect: "/loginErrors"
	})
);

app.get("/loginErrors", ensureGuest, (req, res) => {
	let errors = [];
	errors.push({
		text: "User not found or incorrect password"
	});
	res.render("home", {
		errors: errors
	});
});

//Ask user to complete profile
app.get('/askMore', requireLogin, (req, res) => {
	User.findById({
		_id: req.user._id
	}).then((user) => {
		if (!user.gender || !user.age) {
			res.render('askMore', {
				title: 'Complete Profile',
				user: user
			})
		} else {
			res.redirect('/profile');
		}
	})
});

//complete age and gender from post form
app.post('/askMore', requireLogin, (req, res) => {
	User.findById({
		_id: req.user._id
	}).then((user) => {
		user.gender = req.body.gender;
		user.age = req.body.age;

		user.save()
			.then(() => {
				res.redirect('profile');
			});
	});
});

//forgot password route
app.get("/retrievePwd", ensureGuest, (req, res) => {
	res.render("retrievePwd", {
		title: "Reset Password"
	});
});

//reset the password from form input
app.post("/retrievePwd", ensureGuest, (req, res) => {
	let email = req.body.email.trim();
	let pwd1 = req.body.password.trim();
	let pwd2 = req.body.password2.trim();

	let errors = [];

	if (pwd1 !== pwd2) {
		errors.push({
			text: "Passwords do not match"
		});
	}
	if (pwd1.length < 6) {
		errors.push({
			text: "Password must be mininum 6 characters"
		});
	}
	if (errors.length > 0) {
		res.render("retrievePwd", {
			errors: errors,
			title: "Reset Password",
			email: email,
			password: pwd1,
			password2: pwd2
		});
	}

	User.findOne({
		email: email
	}).then((user) => {
		let salt = bcrypt.genSaltSync(10);
		let hash = bcrypt.hashSync(pwd1, salt);

		user.password = hash;
		user.save((err, user) => {
			if (err) {
				throw err;
			}
			if (user) {
				let success = [];
				success.push({
					text: "Password successfully updated"
				});
				res.render("home", {
					success: success
				});
			}
		});
	});
});

// Handle get to upload images
app.get("/uploadImage", requireLogin, (req, res) => {
	res.render("uploadImage", {
		title: "Upload Image"
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
	form.on("error", (err) => {
		console.log(err);
	});
	form.on("end", () => {
		console.log("Image successfully uploaded!");
	});
	form.parse(req);
});

//handle get route for fidning users
app.get("/singles", requireLogin, (req, res) => {
	User.find({})
		.sort({
			date: "desc"
		})
		.then((singles) => {
			res.render("singles", {
				title: "Discover",
				singles: singles
			});
		})
		.catch((err) => {
			console.log(err);
		});
});

// SIngle user profile page
app.get("/userProfile/:id", requireLogin, (req, res) => {
	User.findById({
			_id: req.params.id
		})
		.populate("friends.friend")
		.then((user) => {
			Smile.findOne({
				receiver: req.params.id
			}).then((smile) => {
				Post.find({
						status: "public",
						postUser: user._id
					})
					.populate("postUser")
					.populate("comments.commentUser")
					.populate("likes.likeUser")
					.then((publicPosts) => {
						res.render("userProfile", {
							title: "Profile",
							oneUser: user,
							smile: smile,
							publicPosts: publicPosts
						});
					});
			});
		});
});

//Start chat process / route
app.get("/startChat/:id", requireLogin, (req, res) => {
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
app.get("/chat/:id", requireLogin, (req, res) => {
	Chat.findById({
			_id: req.params.id
		})
		.populate("sender")
		.populate("receiver")
		.populate("chats.senderName")
		.populate("chats.receiverName")
		.then((chat) => {
			User.findOne({
				_id: req.user._id
			}).then((user) => {
				res.render("chatRoom", {
					title: "Chat",
					user: user,
					chat: chat
				});
			});
		});
});

// handiling submittin of messages in chatroom (form)
app.post("/chat/:id", requireLogin, walletChecker, (req, res) => {
	Chat.findOne({
			_id: req.params.id,
			sender: req.user._id
		})
		.populate("sender")
		.populate("receiver")
		.populate("chats.senderName")
		.populate("chats.receiverName")
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
								date: "desc"
							})
							.populate("sender")
							.populate("receiver")
							.populate("chats.senderName")
							.populate("chats.receiverName")
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
											res.render("chatRoom", {
												title: "Chat",
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
						date: "desc"
					})
					.populate("sender")
					.populate("receiver")
					.populate("chats.senderName")
					.populate("chats.receiverName")
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
										date: "desc"
									})
									.populate("sender")
									.populate("receiver")
									.populate("chats.senderName")
									.populate("chats.receiverName")
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
													res.render("chatRoom", {
														title: "Chat",
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
});

// find history of all chats (user based)
app.get("/chats", requireLogin, (req, res) => {
	Chat.find({
			receiver: req.user._id
		})
		.populate("sender")
		.populate("receiver")
		.populate("chats.senderName")
		.populate("chats.receiverName")
		.sort({
			date: "desc"
		})
		.then((received) => {
			Chat.find({
					sender: req.user._id
				})
				.populate("sender")
				.populate("receiver")
				.populate("chats.senderName")
				.populate("chats.receiverName")
				.sort({
					date: "desc"
				})
				.then((sent) => {
					res.render("chat/chats", {
						title: "Messages",
						received: received,
						sent: sent
					});
				});
		});
});

//Delete chat
app.get("/deleteChat/:id", requireLogin, (req, res) => {
	Chat.deleteOne({
		_id: req.params.id
	}).then(() => {
		res.redirect("/chats");
	});
});

//to the payment page
app.get("/payment", requireLogin, (req, res) => {
	res.render("payment", {
		title: "Purchase",
		StripePublishableKey: Keys.StripePublishableKey
	});
});

//charge client - payment process ($10)
app.post("/charge10dollars", requireLogin, (req, res) => {
	console.log(req.body);
	const amount = 1000;
	stripe.customers
		.create({
			email: req.body.stripeEmail,
			source: req.body.stripeToken
		})
		.then((customer) => {
			stripe.charges
				.create({
					amount: amount,
					description: "$10 for 20 messages",
					currency: "usd",
					customer: customer.id,
					receipt_email: customer.email
				})
				.then((charge) => {
					if (charge) {
						User.findById({
							_id: req.user._id
						}).then((user) => {
							user.wallet += 20;
							user.save().then(() => {
								let success = [];
								success.push({
									text: "Payment successful"
								});
								res.render("success", {
									title: "Payment successful",
									charge: charge
								});
							});
						});
					}
				})
				.catch((err) => {
					console.log(err);
				});
		})
		.catch((err) => {
			console.log(err);
		});
});

//charge client - payment process ($20)
app.post("/charge20dollars", requireLogin, (req, res) => {
	console.log(req.body);
	const amount = 2000;
	stripe.customers
		.create({
			email: req.body.stripeEmail,
			source: req.body.stripeToken
		})
		.then((customer) => {
			stripe.charges
				.create({
					amount: amount,
					description: "$20 for 50 messages",
					currency: "usd",
					customer: customer.id,
					receipt_email: customer.email
				})
				.then((charge) => {
					if (charge) {
						User.findById({
							_id: req.user._id
						}).then((user) => {
							user.wallet += 50;
							user.save().then(() => {
								res.render("success", {
									title: "Payment successful",
									charge: charge
								});
							});
						});
					}
				})
				.catch((err) => {
					console.log(err);
				});
		})
		.catch((err) => {
			console.log(err);
		});
});

//charge client - payment process ($20)
app.post("/charge50dollars", requireLogin, (req, res) => {
	console.log(req.body);
	const amount = 5000;
	stripe.customers
		.create({
			email: req.body.stripeEmail,
			source: req.body.stripeToken
		})
		.then((customer) => {
			stripe.charges
				.create({
					amount: amount,
					description: "$50 for 150 messages",
					currency: "usd",
					customer: customer.id,
					receipt_email: customer.email
				})
				.then((charge) => {
					if (charge) {
						User.findById({
							_id: req.user._id
						}).then((user) => {
							user.wallet += 150;
							user.save().then(() => {
								res.render("success", {
									title: "Payment successful",
									charge: charge
								});
							});
						});
					}
				})
				.catch((err) => {
					console.log(err);
				});
		})
		.catch((err) => {
			console.log(err);
		});
});

// get route to send smile
app.get("/sendSmile/:id", requireLogin, (req, res) => {
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
app.get("/deleteSmile/:id", requireLogin, (req, res) => {
	Smile.deleteOne({
		receiver: req.params.id,
		sender: req.user._id
	}).then(() => {
		res.redirect(`/userProfile/${req.params.id}`);
	});
});

// Show smile sender
app.get("/showSmile/:id", requireLogin, (req, res) => {
	Smile.findOne({
			_id: req.params.id
		})
		.populate("sender")
		.populate("receiver")
		.then((smile) => {
			smile.receiverReceived = true;
			smile.save((err, smile) => {
				if (err) {
					throw err;
				}
				if (smile) {
					res.render("smile/showSmile", {
						title: "New Smile",
						smile: smile
					});
				}
			});
		});
});

//get method to add post //I think he is creating a feed and this is to add an entry (post) to that feed
app.get("/displayPostForm", requireLogin, (req, res) => {
	res.render("post/displayPostForm", {
		title: "Create Post"
	});
});

//creating the post
app.post("/createPost", requireLogin, (req, res) => {
	let allowComments = Boolean;

	if (req.body.allowComments) {
		allowComments = true;
	} else {
		allowComments = false;
	}

	let pic = String;
	if (req.body.image) {
		pic = `https://matcha-vesingh.s3.amazonaws.com/${req.body.image}`;
	} else {
		pic = null;
	}

	const newPost = {
		title: req.body.title,
		body: req.body.body,
		status: req.body.status,
		image: pic,
		postUser: req.user._id,
		allowComments: allowComments,
		date: new Date()
	};

	if (req.body.status === "public") {
		newPost.icon = "fa fa-globe";
	} else if (req.body.status === "private") {
		newPost.icon = "fa fa-lock";
	} else {
		newPost.icon = "fa fa-users";
	}

	new Post(newPost).save().then(() => {
		if (req.body.status === "private") {
			res.redirect("/profile");
		} else {
			res.redirect("/posts");
		}
	});
});

//display all public posts / feed
app.get("/posts", requireLogin, (req, res) => {
	Post.find({
			status: "public"
		})
		.populate("postUser")
		.sort({
			date: "desc"
		})
		.then((posts) => {
			res.render("post/posts", {
				title: "Feed",
				posts: posts
			});
		});
});

//Delete Posts
app.get("/deletePost/:id", requireLogin, (req, res) => {
	Post.deleteOne({
		_id: req.params.id
	}).then(() => {
		res.redirect("/profile");
	});
});

//edit posts
app.get("/editPost/:id", requireLogin, (req, res) => {
	Post.findById({
		_id: req.params.id
	}).then((post) => {
		res.render("post/editPost", {
			title: "Edit Post",
			post: post
		});
	});
});

//submit form to updates Save changes to post
app.post("/editPost/:id", requireLogin, (req, res) => {
	Post.findByIdAndUpdate({
		_id: req.params.id
	}).then((post) => {
		let allowComments = Boolean;
		if (req.body.allowComments) {
			allowComments = true;
		} else {
			allowComments = false;
		}

		let pic = String;
		if (req.body.image) {
			pic = `https://matcha-vesingh.s3.amazonaws.com/${req.body.image}`;
		} else {
			pic = null;
		}

		post.title = req.body.title;
		post.body = req.body.body;
		post.status = req.body.status;
		post.allowComments = allowComments;
		post.image = pic;
		post.date = new Date();

		if (req.body.status === "public") {
			post.icon = "fa fa-globe";
		} else if (req.body.status === "private") {
			post.icon = "fa fa-lock";
		} else {
			post.icon = "fa fa-users";
		}
		post.save().then(() => {
			if (req.body.status === "private") {
				res.redirect("/profile");
			} else {
				res.redirect("/posts");
			}
		});
	});
});

// Like a post
app.get("/likePost/:id", requireLogin, (req, res) => {
	Post.findById({
		_id: req.params.id
	}).then((post) => {
		const newLike = {
			likeUser: req.user._id,
			date: new Date()
		};

		// let newbie = req.user._id;
		// //console.log(newbie);

		// // let exists = post.likes.filter(function (e1) {
		// // 	return (e1['likeUser'] == newbie)
		// // });
		// let exists = post.likes.some(function (e1) {
		// 	return (e1.likeUser == newbie)
		// });
		// console.log(exists);

		// if (exists > 0) {
		// 	console.log(' I got inot the if! yay');
		// 	//let pos = post.likes.splice(req.user._id);
		// 	//console.log(pos);
		// 	//post.likes.splice(pos, 1);
		// } else {
		// 	post.likes.push(newLike);
		// }

		post.likes.push(newLike);
		post.save((err, post) => {
			if (err) {
				throw err;
			}
			if (post) {
				res.redirect(`/fullPost/${post._id}`);
			}
		});
	});
});

//Display full post page
app.get("/fullPost/:id", requireLogin, (req, res) => {
	Post.findById({
			_id: req.params.id
		})
		.populate("postUser")
		.populate("likes.likeUser")
		.populate("comments.commentUser")
		.sort({
			date: "desc"
		})
		.then((post) => {
			res.render("post/fullPost", {
				title: "Post",
				post: post
			});
		});
});

//submit comment to post
app.post("/leaveComment/:id", requireLogin, (req, res) => {
	Post.findById({
		_id: req.params.id
	}).then((post) => {
		const newComment = {
			commentUser: req.user._id,
			commentBody: req.body.commentBody,
			date: new Date()
		};

		post.comments.push(newComment);
		post.save((err, post) => {
			if (err) {
				throw err;
			}
			if (post) {
				res.redirect(`/fullPost/${post._id}`);
			}
		});
	});
});

// start freind request process
app.get("/sendFriendRequest/:id", requireLogin, (req, res) => {
	User.findOne({
		_id: req.params.id
	}).then((user) => {
		let newFriendRequest = {
			friend: req.user._id
		};

		user.friends.push(newFriendRequest);
		user.save((err, user) => {
			if (err) {
				throw err;
			}
			if (user) {
				res.render("friends/friendRequest", {
					title: "Friend Requests",
					newFriend: user
				});
			}
		});
	});
});

//show friend requests received
app.get("/showFriendRequest/:id", requireLogin, (req, res) => {
	User.findOne({
		_id: req.params.id
	}).then((userRequest) => {
		res.render("friends/showFriendRequest", {
			title: "Friend Requests",
			newFriend: userRequest
		});
	});
});

//Accept friend request
app.get("/acceptFriend/:id", requireLogin, (req, res) => {
	User.findById({
			_id: req.user._id
		})
		.populate("friends.friend")
		.then((user) => {
			user.friends.filter((friend) => {
				if ((friend._id = req.params.id)) {
					friend.isFriend = true;

					user.save().then(() => {
						User.findById({
							_id: req.params.id
						}).then((requestSender) => {
							let newFriend = {
								friend: req.user._id,
								isFriend: true
							};

							requestSender.friends.push(newFriend);
							requestSender.save().then(() => {
								User.findById({
										_id: req.user._id
									})
									.populate("friends.friend")
									.sort({
										date: "desc"
									})
									.then((user) => {
										res.render("friends/friendAccepted", {
											title: "Friends",
											userInfo: user
										});
									});
							});
						});
					});
				} else {
					res.render("friends/404", {
						title: "Page Not Found"
					});
				}
			});
		})
		.catch((err) => {
			console.log(err);
		});
});

//decline friend request
app.get("/declineFriend/:id", requireLogin, (req, res) => {
	User.findById({
			_id: req.user._id
		})
		.populate("friends.friend")
		.then((user) => {
			user.friends.filter((friend) => {
				if ((friend._id = req.params.id)) {
					user.friends.pop(friend);
					user.save().then(() => {
						User.findOne({
							_id: req.params.id
						}).then((friend) => {
							res.render("friends/friendDeclined", {
								title: "Friend Requests",
								friend: friend
							});
						});
					});
				} else {
					res.render("friends/404", {
						title: "Page Not Found"
					});
				}
			});
		});
});

// show all friends
app.get("/friends", requireLogin, (req, res) => {
	User.findById({
			_id: req.user._id
		})
		.populate("friends.friend")
		.then((user) => {
			res.render("friends/friends", {
				title: "Friends",
				userFriends: user
			});
		});
});

// page not found
app.get("/404", (req, res) => {
	res.render("friends/404", {
		title: "404"
	});
});

// Logout page
app.get("/logout", (req, res) => {
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
			Message.find({}).then((messages) => {
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

//connect socketio
const server = http.createServer(app);
const io = socket(server);

io.on("connection", (socketio) => {
	console.log("Server is connected to client");

	//emit event
	// socketio.emit('newMessage', {
	// 	title: 'New Message',
	// 	body: 'Hello World',
	// 	sender: 'Vesingh'
	// });

	//listen to event (ID)
	socketio.on('ID', (ID) => {
		//console.log('User Id: ', ID);
		if (ID.ID == null) {
			console.log('No currently logged in user');
			return;
		}

		User.findOne({
			_id: ID.ID
		}).then((currentUser) => {
			User.findOne({
				email: 'admin@matcha.com'
			}).then((admin) => {
				if (admin) {
					Chat.findOne({
							sender: currentUser._id,
							receiver: admin._id
						}).populate('sender')
						.populate('receiver')
						.populate('chats.senderName')
						.populate('chats.receiverName')
						.then((chat) => {
							if (chat) {
								if (chat.receiverRead === false) {
									chat.receiverRead = true;
									chat.senderRead = true;
									chat.save((err, chat) => {
										if (err) {
											throw err;
										}
										if (chat) {
											console.log('Admin has stopped replying');
										}
									})
								}
							} else {
								Chat.findOne({
										sender: admin._id,
										receiver: currentUser._id
									}).populate('sender')
									.populate('receiver')
									.populate('chats.senderName')
									.populate('chats.receiverName')
									.then((chat) => {
										if (chat) {
											if (chat.senderRead === false) {
												chat.receiverRead = true;
												chat.senderRead = true;
												chat.save((err, chat) => {
													if (err) {
														throw err;
													}
													if (chat) {
														console.log('Admin received message, chat stopped');
													}
												})
											}
										} else {
											const chat = {
												sender: admin._id,
												receiver: currentUser._id,
												senderRead: true
											}

											new Chat(chat).save((err, chat) => {
												if (err) {
													throw err;
												}
												if (chat) {
													const newChat = {
														senderName: admin._id,
														senderMessage: 'Welcome to Matcha. We hope you enjoy you experience here. Please feel free to message us with any feedback / issues you may have with Matcha',
														receiverName: currentUser._id,
														senderRead: true
													}

													chat.chats.push(newChat);
													chat.save((err, chat) => {
														if (err) {
															throw err;
														}
														if (chat) {
															Chat.findOne({
																	_id: chat._id
																}).populate('sender')
																.populate('receiver')
																.populate('chats.senderName')
																.populate('chats.receiverName')
																.sort({
																	date: 'desc'
																});
														}
													});
												}
											});
										}
									});
							}
						}).catch((err) => {
							console.log(err)
						});
				} else {
					console.log('Unable to find Admin from MongoDB');
				}
			}).catch((err) => {
				console.log(err)
			});
		}).catch((err) => {
			console.log(err)
		});
	});
});

io.on("disconnection", () => {
	console.log("Server is disconnected from client");
});

// which port the server is on
server.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});
