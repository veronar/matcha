const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new Schema({
	fullname: {
		type: String
	},
	email: {
		type: String
	},
	message: {
		type: String
	},
	date: {
		type: Date,
		default: Date.now
	}
});

// mongoose.model(<collection name>, validators?)
module.exports = mongoose.model('Message', messageSchema);