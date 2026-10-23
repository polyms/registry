const hazel = require('./index')

const {
	INTERVAL: interval,
	ACCOUNT: account,
	REPOSITORY: repository,
	PRE: pre,
	TOKEN: token,
	URL: PRIVATE_BASE_URL,
	VERCEL_URL,
	PUBLIC_URL,
} = process.env

const url = PUBLIC_URL || VERCEL_URL || PRIVATE_BASE_URL

module.exports = hazel({
	account,
	interval,
	pre,
	repository,
	token,
	url,
})
