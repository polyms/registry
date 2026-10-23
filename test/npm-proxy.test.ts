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

	it('reads a dist-tag from the packument and rewrites its tarball', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					'dist-tags': { latest: '1.2.3' },
					name: '@polyms/ui-kit',
					versions: {
						'1.2.3': {
							dist: {
								integrity: 'sha512-abc',
								tarball: 'https://npm.pkg.github.com/download/@polyms/ui-kit/1.2.3/abc',
							},
							name: '@polyms/ui-kit',
							repository: { url: 'https://github.com/polyms/ui-kit' },
							version: '1.2.3',
						},
					},
				}),
				{ headers: { 'content-type': 'application/json' }, status: 200 }
			)
		)
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/@polyms%2fui-kit/latest', {
			headers: { Accept: 'application/json' },
		})
		const body = (await response.json()) as {
			dist: { integrity?: string; tarball: string }
			repository?: unknown
			version: string
		}

		expect(response.status).toBe(200)
		expect(body.version).toBe('1.2.3')
		expect(body.dist.tarball).toBe('http://localhost:3000/npm/download/@polyms/ui-kit/1.2.3/abc')
		expect(body.dist.integrity).toBe('sha512-abc')
		expect(body.repository).toBeUndefined()
		expect(fetchMock).toHaveBeenCalledWith(
			'https://npm.pkg.github.com/@polyms%2Fui-kit',
			expect.objectContaining({
				headers: expect.objectContaining({
					Accept: 'application/json',
					Authorization: `Bearer ${token}`,
				}),
				method: 'GET',
				redirect: 'manual',
			})
		)
	})

	it('reads an exact version from the packument', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					'dist-tags': { latest: '1.2.3' },
					versions: {
						'1.2.3-beta.1': { name: '@polyms/ui-kit', version: '1.2.3-beta.1' },
					},
				}),
				{ headers: { 'content-type': 'application/json' }, status: 200 }
			)
		)
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/@polyms/ui-kit/1.2.3-beta.1')
		const body = (await response.json()) as { version: string }

		expect(response.status).toBe(200)
		expect(body.version).toBe('1.2.3-beta.1')
		expect(fetchMock).toHaveBeenCalledOnce()
		expect(fetchMock.mock.calls[0]?.[0]).toBe('https://npm.pkg.github.com/@polyms%2Fui-kit')
	})

	it('returns 404 when the packument has no such version', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ 'dist-tags': { latest: '1.2.3' }, versions: {} }), {
				headers: { 'content-type': 'application/json' },
				status: 200,
			})
		)
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/@polyms/ui-kit/latest')
		const body = (await response.json()) as { error: string }

		expect(response.status).toBe(404)
		expect(body.error).toBe('version_not_found')
	})

	it('returns 404 for a version outside the allowlist or an unsafe spec', async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const outside = await app.request('http://localhost:3000/npm/@polyms/icons/latest')
		const unsafe = await app.request('http://localhost:3000/npm/@polyms/ui-kit/..')
		const extra = await app.request('http://localhost:3000/npm/@polyms/ui-kit/latest/extra')

		expect(outside.status).toBe(404)
		expect(unsafe.status).toBe(404)
		expect(extra.status).toBe(404)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('accepts an unencoded package path', async () => {
		const fetchMock = vi.fn().mockResolvedValue(packumentResponse())
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/@polyms/ui-kit')

		expect(response.status).toBe(200)
		expect(fetchMock).toHaveBeenCalledOnce()
	})

	it('forwards an upstream 403 without the upstream body', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ message: 'Permission denied' }), {
				headers: { 'content-type': 'application/json' },
				status: 403,
			})
		)
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/@polyms/ui-kit')
		const body = (await response.json()) as { error: string }

		expect(response.status).toBe(403)
		expect(body.error).toBe('upstream_error')
		expect(JSON.stringify(body)).not.toContain('Permission denied')
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
				headers: { Location: 'https://release-assets.githubusercontent.com/signed' },
				status: 302,
			})
		)
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/download/@polyms/ui-kit/1.0.5/abc')

		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe('https://release-assets.githubusercontent.com/signed')
		expect(response.headers.get('location')).not.toContain(token)
	})

	it('drops another package tarball and repository metadata', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					name: '@polyms/ui-kit',
					repository: { type: 'git', url: 'git+https://github.com/other/secret.git' },
					versions: {
						'1.0.5': {
							dist: {
								tarball: 'https://npm.pkg.github.com/download/@other/secret/1.0.5/abc?token=test-token',
							},
							repository: { url: 'https://github.com/other/secret' },
						},
					},
				}),
				{ headers: { 'content-type': 'application/json' }, status: 200 }
			)
		)
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/@polyms/ui-kit')
		const body = (await response.json()) as {
			repository?: unknown
			versions: Record<string, { dist?: { tarball?: string }; repository?: unknown }>
		}
		const serialized = JSON.stringify(body)

		expect(response.status).toBe(200)
		expect(body.repository).toBeUndefined()
		expect(body.versions['1.0.5'].repository).toBeUndefined()
		expect(body.versions['1.0.5'].dist?.tarball).toBeUndefined()
		expect(serialized).not.toContain('other/secret')
		expect(serialized).not.toContain(token)
	})

	it('does not redirect a tarball to an untrusted host', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(null, {
				headers: { Location: 'https://evil.example/steal?access_token=test-token' },
				status: 302,
			})
		)
		vi.stubGlobal('fetch', fetchMock)

		const app = appWithToken()
		const response = await app.request('http://localhost:3000/npm/download/@polyms/ui-kit/1.0.5/abc')
		const body = await response.text()

		expect(response.status).toBe(502)
		expect(response.headers.get('location')).toBeNull()
		expect(body).not.toContain(token)
		expect(body).not.toContain('evil.example')
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
