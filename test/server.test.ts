import { describe, expect, it } from 'vitest'

import { createApp } from '../src/app.js'

describe('Server', () => {
	it('returns 400 when configuration is missing', async () => {
		const app = createApp({ repository: 'hyper' })
		const response = await app.request('http://localhost/')
		const body = (await response.json()) as { error: { code: string; message: string } }

		expect(response.status).toBe(400)
		expect(body.error.code).toBe('missing_configuration_properties')
		expect(body.error.message).toMatch(/ACCOUNT/)
	})

	it('boots when account and repository are set', async () => {
		const app = createApp({
			account: 'zeit',
			repository: 'hyper',
		})
		const response = await app.request('http://localhost/favicon.ico')

		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe('https://polyms.dev/favicon/favicon.svg')
	})
})
