import type { Hono } from 'hono'

import { createApp } from './app.js'

export type { Hono }

const {
	INTERVAL: interval,
	ACCOUNT: account,
	REPOSITORY: repository,
	PRE: pre,
	TOKEN: token,
	URL: privateBaseUrl,
	VERCEL_URL,
	PUBLIC_URL,
} = process.env

const url = PUBLIC_URL || VERCEL_URL || privateBaseUrl

const app = createApp({
	account,
	interval,
	pre,
	repository,
	token,
	url,
})

export default app
