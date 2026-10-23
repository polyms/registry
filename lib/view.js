// Native
const path = require('node:path')
const fs = require('node:fs')
const { promisify } = require('node:util')

// Packages
const { compile } = require('handlebars')

module.exports = async () => {
	const viewPath = path.normalize(path.join(__dirname, '/../views/index.hbs'))
	const viewContent = await promisify(fs.readFile)(viewPath, 'utf8')

	return compile(viewContent)
}
