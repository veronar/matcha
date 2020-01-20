const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
	facebook: {
		type: String
	},
	google: {
		type: String
	},
	firstname: {
		type: String
	},
	lastname: {
		type: String
	},
	fullname: {
		type: String
	},
	image: {
		type: String,
		default: '/img/user.png'
	},
	email: {
		type: String
	},
	city: {
		type: String
	},
	country: {
		type: String
	},
	age: {
		type: String
	},
	gender: {
		type: String
	},
	about: {
		type: String,
		default: "Hmm I haven't bothered filling this in yet, a bot just wrote it out. Why don't you drop me a message, perhaps then I'll care about filling it in ;)"
	},
	online: {
		type: Boolean,
		default: false
	},
	wallet: {
		type: Number,
		default: 3
	},
	password: {
		type: String
	},
	date: {
		type: Date,
		default: Date.now
	},
	friends: [{
		friend: {
			type: Schema.Types.ObjectId,
			ref: 'User'
		},
		isFriend: {
			type: Boolean,
			default: false
		}
	}],
	pictures: [{
		image: {
			type: String
		},
		date: {
			type: Date,
			default: Date.now
		}
	}]
});

module.exports = mongoose.model('User', userSchema);
