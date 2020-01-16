module.exports = {
	walletChecker: function (req, res, next) {
		if (req.user.wallet <= 0) {
			res.render('payment', {
				title: 'Payment'
			});
		} else {
			return next();
		}
	}
}
