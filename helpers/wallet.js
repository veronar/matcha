const keys = require('../config/keys')

module.exports = {
	walletChecker: function (req, res, next) {
		if (req.user.wallet <= 0) {
			res.render('payment', {
				title: 'Payment',
				StripePublishableKey: keys.StripePublishableKey
			});
		} else {
			return next();
		}
	}
}
