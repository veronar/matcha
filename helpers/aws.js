const aws = require('aws-sdk');
const multer = require('multer');
const multers3 = require('multer-s3');
const keys = require('../config/keys');

aws.config.update({
	accessKeyId: keys.AWSAccessKeyID,
	secretAccessKey: keys.AWSAccessKeySecret
});

module.exports = {
	uploadImage: multer({
		storage: multers3({
			s3: new aws.S3({}),
			bucket: 'matcha-vesingh',
			acl: 'public-read',
			metadata: (req, file, cb) => {
				cb(null, {
					fieldName: file.fieldname
				});
			},
			key: (req, file, cb) => {
				cb(null, file.originalname);
			},
			rename: (fieldName, fileName) => {
				return fileName.replace(/\w+/g, '-').toLowerCase();
			}
		})
	})
};
