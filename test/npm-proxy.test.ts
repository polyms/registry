import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app.js'

const token = 'test-token'

function appWithToken() {
	return createApp({
		account: 'polyms',
		apps: ['studio'],
		token,
		url: 'http://localhost:3000',
	})
}

function packumentResponse() {
	return new Response(
		JSON.stringify({
			name: '@polyms/ui-kit',
			versions: {
				'1.0.5': {
					dist: {
						integrity: 'sha512-abc',
						tarball: 'https://npm.pkg.github.com/download/@polyms/ui-kit/1.0.5/abc',
					},
				},
				'1.0.4': {
					dist: {
						tarball: 'https://registry.npmjs.org/@polyms/ui-kit/-/ui-kit-1.0.4.tgz',
					},
				},
			},
		}),
		{ headers: { 'content-type': 'application/json' }, status: 200 }
	)
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('npm proxy', () => {
	it('returns 500 when TOKEN is missing', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)

		const app = createApp({ account: 'polyms', apps: ['studio'] })
		const response = await app.request('http://localhost:3000/npm/@polyms%2fui-kit')
		const body = (await response.json()) as { error: string }

		expect(response.status).toBe(500)
		expect(body.error).toBe('registry_unconfigured')
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('rewrites packument tarball URLs and sends the server token as Bearer', async () => {
		const fetchMock = vi.fn().mockResolvedValue(packumentResponse())
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/@polyms%2fui-kit', {
			headers: { Accept: 'application/vnd.npm.install-v1+json' },
		})
		const body = (await response.json()) as {
			versions: Record<string, { dist: { integrity?: string; tarball: string } }>
		}

		expect(response.status).toBe(200)
		expect(body.versions['1.0.5'].dist.tarball).toBe(
			'http://localhost:3000/npm/download/@polyms/ui-kit/1.0.5/abc'
		)
		expect(body.versions['1.0.5'].dist.integrity).toBe('sha512-abc')
		expect(body.versions['1.0.4'].dist.tarball).toBe(
			'https://registry.npmjs.org/@polyms/ui-kit/-/ui-kit-1.0.4.tgz'
		)

		expect(fetchMock).toHaveBeenCalledWith(
			'https://npm.pkg.github.com/@polyms%2Fui-kit',
			expect.objectContaining({
				headers: expect.objectContaining({
					Accept: 'application/vnd.npm.install-v1+json',
					Authorization: `Bearer ${token}`,
				}),
				method: 'GET',
				redirect: 'manual',
			})
		)

		const calledUrl = String(fetchMock.mock.calls[0]?.[0])
		expect(calledUrl).not.toContain(token)
	})

	it('accepts an unencoded package path', async () => {
		const fetchMock = vi.fn().mockResolvedValue(packumentResponse())
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/@polyms/ui-kit')

		expect(response.status).toBe(200)
		expect(fetchMock).toHaveBeenCalledOnce()
	})

	it('returns 404 for packages outside the allowlist', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/@polyms%2ficons')

		expect(response.status).toBe(404)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('redirects a tarball to the signed upstream location', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(null, {
				headers: { Location: 'https://pkg.example/signed' },
				status: 302,
			})
		)
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/download/@polyms/ui-kit/1.0.5/abc')

		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe('https://pkg.example/signed')
		expect(fetchMock).toHaveBeenCalledWith(
			'https://npm.pkg.github.com/download/@polyms/ui-kit/1.0.5/abc',
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: `Bearer ${token}`,
				}),
				redirect: 'manual',
			})
		)

		const calledUrl = String(fetchMock.mock.calls[0]?.[0])
		expect(calledUrl).not.toContain(token)
	})

	it('streams a tarball when upstream returns the body', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response('tarball-bytes', {
				headers: { 'content-type': 'application/octet-stream' },
				status: 200,
			})
		)
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/download/@polyms/ui-kit/1.0.5/abc')

		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toContain('application/octet-stream')
		expect(await response.text()).toBe('tarball-bytes')
	})

	it('still redirects the favicon', async () => {
		const app = appWithToken()
		const response = await app.request('http://localhost:3000/favicon.ico')

		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe('https://polyms.dev/favicon/favicon.svg')
	})
})
