import type { Hono } from 'hono'

import { createApp, parseAppNames } from './app.js'
import { stripUserinfo } from './github-guard.js'
import { parsePackageNames } from './package-catalog.js'

export type { Hono }

const {
	INTERVAL: interval,
	ACCOUNT: account,
	APPS,
	PRE: pre,
	TOKEN: token,
	PACKAGES,
	URL: privateBaseUrl,
	VERCEL_URL,
	PUBLIC_URL,
} = process.env

const url = stripUserinfo(PUBLIC_URL || VERCEL_URL || privateBaseUrl)

const app = createApp({
	account,
	apps: parseAppNames(APPS),
	interval,
	packages: parsePackageNames(PACKAGES),
	pre,
	token,
	url,
})

export default app
