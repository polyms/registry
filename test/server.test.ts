import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp, parseAppNames } from '../src/app.js'

afterEach(() => {
	vi.unstubAllGlobals()
})

function githubRelease(repo: string, version: string, notes: string, fileName: string) {
	return {
		assets: [
			{
				browser_download_url: `https://github.com/polyms/${repo}/releases/download/${version}/${fileName}`,
				content_type: 'application/octet-stream',
				name: fileName,
				size: 2_000_000,
				url: `https://api.github.com/repos/polyms/${repo}/releases/assets/1`,
			},
		],
		body: notes,
		draft: false,
		prerelease: false,
		published_at: '2026-01-01T00:00:00Z',
		tag_name: version,
	}
}

function releaseResponse(repo: string, version: string, notes: string, fileName: string) {
	return Response.json([githubRelease(repo, version, notes, fileName)])
}

describe('Server', () => {
	it('returns 400 when configuration is missing', async () => {
		const missingAccount = createApp({ apps: ['hyper'] })
		const missingApps = createApp({ account: 'polyms', apps: [] })
		const accountResponse = await missingAccount.request('http://localhost/')
		const appsResponse = await missingApps.request('http://localhost/')
		const accountBody = (await accountResponse.json()) as { error: { code: string; message: string } }
		const appsBody = (await appsResponse.json()) as { error: { code: string; message: string } }

		expect(accountResponse.status).toBe(400)
		expect(accountBody.error.code).toBe('missing_configuration_properties')
		expect(accountBody.error.message).toMatch(/ACCOUNT/)
		expect(appsResponse.status).toBe(400)
		expect(appsBody.error.code).toBe('missing_configuration_properties')
		expect(appsBody.error.message).toMatch(/ACCOUNT/)
	})

	it('boots when account and apps are set', async () => {
		const app = createApp({
			account: 'zeit',
			apps: ['hyper'],
		})
		const response = await app.request('http://localhost/favicon.ico')

		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe('https://polyms.dev/favicon/favicon.svg')
	})

	it('serves one app on scoped routes', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (String(url).includes('/repos/polyms/studio/releases')) {
					return releaseResponse('studio', 'v0.2.8', 'studio notes', 'Studio.dmg')
				}
				return new Response('missing', { status: 404 })
			})
		)

		const app = createApp({
			account: 'polyms',
			apps: ['studio'],
			packages: [],
		})
		const home = await app.request('http://localhost/')
		const html = await home.text()
		const releases = await app.request('http://localhost/studio/releases')
		const unscopedDownload = await app.request('http://localhost/download')
		const unscopedLatest = await app.request('http://localhost/latest.json')

		expect(home.status).toBe(200)
		expect(html).toContain('>Apps<')
		expect(html).toContain('>Studio<')
		expect(html).toContain('>v0.2.8<')
		expect(html).toContain('studio notes')
		expect(html).toContain('href="/studio/download/dmg"')
		expect(html).not.toContain('href="/download/')
		expect(html).toContain('href="/studio/releases"')
		expect(html).toContain('All Studio releases')
		expect(html).not.toContain('>Packages<')
		expect(html).not.toContain('Downloads')
		expect(releases.status).toBe(200)
		expect(await releases.text()).toContain('href="/studio/download/v0.2.8/Studio.dmg"')
		expect(unscopedDownload.status).toBe(404)
		expect(unscopedLatest.status).toBe(404)
	})

	it('shows the version from latest.json instead of the git tag', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const href = String(url)
				if (href.endsWith('/releases/assets/15')) return Response.json({ version: '0.2.15' })
				if (href.endsWith('/repos/polyms/studio/releases/tags/v0.2.15')) {
					return Response.json({
						assets: [
							{
								browser_download_url: 'https://github.com/polyms/studio/releases/download/v0.2.15/Studio.dmg',
								name: 'Studio.dmg',
							},
						],
					})
				}
				if (href.includes('/repos/polyms/studio/releases')) {
					return Response.json([
						{
							assets: [
								{
									browser_download_url:
										'https://github.com/polyms/studio/releases/download/v0.2.15/latest.json',
									content_type: 'application/json',
									name: 'latest.json',
									size: 100,
									url: 'https://api.github.com/repos/polyms/studio/releases/assets/15',
								},
								{
									browser_download_url:
										'https://github.com/polyms/studio/releases/download/v0.2.15/Studio.dmg',
									content_type: 'application/octet-stream',
									name: 'Studio.dmg',
									size: 2_000_000,
									url: 'https://api.github.com/repos/polyms/studio/releases/assets/16',
								},
							],
							body: 'studio notes',
							draft: false,
							prerelease: false,
							published_at: '2026-10-23T19:39:22Z',
							tag_name: 'v0.2.15',
						},
					])
				}
				return new Response('missing', { status: 404 })
			})
		)

		const app = createApp({
			account: 'polyms',
			apps: ['studio'],
			packages: [],
		})
		const home = await app.request('http://localhost/')
		const homeHtml = await home.text()
		const releases = await app.request('http://localhost/studio/releases')
		const html = await releases.text()
		const download = await app.request('http://localhost/studio/download/0.2.15/Studio.dmg')

		expect(home.status).toBe(200)
		expect(homeHtml).toContain('>0.2.15<')
		expect(homeHtml).not.toContain('>v0.2.15<')
		expect(html).toContain('<h2>0.2.15</h2>')
		expect(html).not.toContain('<h2>v0.2.15</h2>')
		expect(html).toContain('href="/studio/download/0.2.15/Studio.dmg"')
		expect(download.status).toBe(302)
		expect(download.headers.get('location')).toBe(
			'https://github.com/polyms/studio/releases/download/v0.2.15/Studio.dmg'
		)
	})

	it('renders two app blocks and serves the second app releases', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const href = String(url)
				if (href.includes('/matching-refs/')) return Response.json([])
				if (href.includes('/releases/tags/')) {
					if (href.includes('/repos/polyms/other/')) {
						return Response.json(githubRelease('other', 'v2.0.0', 'other notes', 'Other.dmg'))
					}
					return Response.json(githubRelease('studio', 'v0.2.8', 'studio notes', 'Studio.dmg'))
				}
				if (href.includes('/repos/polyms/studio/releases')) {
					return releaseResponse('studio', 'v0.2.8', 'studio notes', 'Studio.dmg')
				}
				if (href.includes('/repos/polyms/other/releases')) {
					return releaseResponse('other', 'v2.0.0', 'other notes', 'Other.dmg')
				}
				return new Response('missing', { status: 404 })
			})
		)

		const app = createApp({
			account: 'polyms',
			apps: ['studio', 'other'],
			packages: ['@polyms/other'],
		})
		const home = await app.request('http://localhost/')
		const html = await home.text()
		const studioAt = html.indexOf('>Studio<')
		const otherAt = html.indexOf('>Other<')
		const second = await app.request('http://localhost/other/releases')
		const secondHtml = await second.text()
		const scoped = await app.request('http://localhost/other/download/v2.0.0/Other.dmg')
		const unscoped = await app.request('http://localhost/download/v2.0.0/Other.dmg')

		expect(home.status).toBe(200)
		expect(studioAt).toBeGreaterThan(-1)
		expect(otherAt).toBeGreaterThan(studioAt)
		expect(html).toContain('studio notes')
		expect(html).toContain('other notes')
		expect(html).toContain('href="/studio/download/dmg"')
		expect(html).toContain('href="/other/download/dmg"')
		expect(html).not.toContain('href="/download/')
		expect(second.status).toBe(200)
		expect(secondHtml).toContain('<h1>Other</h1>')
		expect(secondHtml).toContain('v2.0.0')
		expect(secondHtml).not.toContain('v0.2.8')
		expect(secondHtml).toContain('href="/other/download/v2.0.0/Other.dmg"')
		expect(scoped.status).toBe(302)
		expect(scoped.headers.get('location')).toContain('/polyms/other/')
		expect(unscoped.status).toBe(404)
	})

	it('rewrites private latest.json urls onto that app path', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const href = String(url)
				if (href.endsWith('/repos/polyms/other/releases/latest')) {
					return Response.json({
						assets: [
							{
								name: 'latest.json',
								url: 'https://api.github.com/repos/polyms/other/releases/assets/9',
							},
						],
					})
				}
				if (href.endsWith('/releases/assets/9')) {
					return Response.json({
						platforms: {
							darwin: {
								url: 'https://github.com/polyms/other/releases/download/v2.0.0/Other.app.tar.gz',
							},
						},
					})
				}
				return new Response('missing', { status: 404 })
			})
		)

		const app = createApp({
			account: 'polyms',
			apps: ['studio', 'other'],
			packages: [],
			token: 'test-token',
			url: 'registry.polyms.dev',
		})
		const response = await app.request('http://localhost/other/latest.json')
		const body = (await response.json()) as { platforms: { darwin: { url: string } } }

		expect(response.status).toBe(200)
		expect(body.platforms.darwin.url).toBe(
			'https://registry.polyms.dev/other/download/v2.0.0/Other.app.tar.gz'
		)
	})

	it('rewrites private latest.json asset api urls onto the installer file', async () => {
		const installer = 'Polyms.Studio_0.2.12_universal.app.tar.gz'
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const href = String(url)
				if (href.endsWith('/repos/polyms/studio/releases/latest')) {
					return Response.json({
						assets: [
							{
								name: 'latest.json',
								url: 'https://api.github.com/repos/polyms/studio/releases/assets/9',
							},
							{
								name: installer,
								url: 'https://api.github.com/repos/polyms/studio/releases/assets/659',
							},
							{
								name: 'secret.env',
								url: 'https://api.github.com/repos/polyms/studio/releases/assets/1',
							},
						],
						tag_name: 'v0.2.12',
					})
				}
				if (href.endsWith('/releases/assets/9')) {
					return Response.json({
						platforms: {
							'darwin-aarch64': {
								signature: 'sig',
								url: 'https://api.github.com/repos/polyms/studio/releases/assets/659',
							},
							'darwin-x86_64': {
								signature: 'sig',
								url: 'https://api.github.com/repos/other/studio/releases/assets/659',
							},
							leak: {
								signature: 'sig',
								url: 'https://api.github.com/repos/polyms/studio/releases/assets/1',
							},
						},
						version: '0.2.12',
					})
				}
				if (href.endsWith('/repos/polyms/studio/releases/tags/v0.2.12')) {
					return Response.json({
						assets: [
							{
								name: installer,
								url: 'https://api.github.com/repos/polyms/studio/releases/assets/659',
							},
						],
					})
				}
				if (href.endsWith('/releases/assets/659')) {
					return new Response(null, {
						headers: {
							location:
								'https://release-assets.githubusercontent.com/github-production-release-asset/studio.tar.gz',
						},
						status: 302,
					})
				}
				return new Response('missing', { status: 404 })
			})
		)

		const app = createApp({
			account: 'polyms',
			apps: ['studio'],
			packages: [],
			token: 'test-token',
			url: 'registry.polyms.dev',
		})
		const response = await app.request('http://localhost/studio/latest.json')
		const body = (await response.json()) as {
			platforms: Record<string, { signature?: string; url?: string }>
		}
		const download = await app.request(`http://localhost/studio/download/v0.2.12/${installer}`)

		expect(response.status).toBe(200)
		expect(body.platforms['darwin-aarch64']?.url).toBe(
			`https://registry.polyms.dev/studio/download/v0.2.12/${installer}`
		)
		expect(body.platforms['darwin-x86_64']?.url).toBeUndefined()
		expect(body.platforms.leak?.url).toBeUndefined()
		expect(JSON.stringify(body)).not.toContain('api.github.com')
		expect(download.status).toBe(302)
		expect(download.headers.get('location')).toContain('githubusercontent.com')
	})

	it('parses app names and rejects an empty list', async () => {
		expect(parseAppNames(undefined)).toEqual([])
		expect(parseAppNames(' studio, other, studio, , ../secret, studio/../x')).toEqual(['studio', 'other'])

		const app = createApp({
			account: 'polyms',
			apps: [],
			packages: [],
		})
		const home = await app.request('http://localhost/')
		const body = (await home.json()) as { error: { code: string } }

		expect(home.status).toBe(400)
		expect(body.error.code).toBe('missing_configuration_properties')
	})

	it('does not proxy config, keys, or another repo from release metadata', async () => {
		const fetchMock = vi.fn(async (url: string) => {
			const href = String(url)
			if (href.includes('evil.example')) return new Response('secret', { status: 200 })
			if (href.endsWith('/repos/polyms/studio/releases/latest')) {
				return Response.json({
					assets: [
						{ name: 'latest.json', url: 'https://api.github.com/repos/polyms/studio/releases/assets/9' },
					],
				})
			}
			if (href.endsWith('/releases/assets/9')) {
				return Response.json({
					notes: 'leak ghp_abcdefghijklmnopqrstuvwxyz123456',
					platforms: {
						darwin: {
							signature: 'sig',
							url: 'https://github.com/other/secret/releases/download/v1/Secret.dmg',
						},
						dmg: {
							url: 'https://user:test-token@github.com/polyms/studio/releases/download/v1/Studio.dmg?token=test-token',
						},
						exe: { url: 'https://github.com/polyms/studio/releases/download/v0.2.8/Studio.exe' },
					},
					token: 'test-token',
				})
			}
			if (href.includes('/repos/polyms/studio/releases')) {
				return Response.json([
					{
						assets: [
							{
								browser_download_url:
									'https://evil.example/polyms/studio/releases/download/v0.2.8/Studio.dmg',
								content_type: 'application/octet-stream',
								name: 'Studio.dmg',
								size: 2_000_000,
								url: 'https://evil.example/repos/polyms/studio/releases/assets/1',
							},
						],
						body: 'notes ghp_abcdefghijklmnopqrstuvwxyz123456',
						draft: false,
						prerelease: false,
						published_at: '2026-01-01T00:00:00Z',
						tag_name: 'v0.2.8',
					},
				])
			}
			return new Response('missing', { status: 404 })
		})
		vi.stubGlobal('fetch', fetchMock)

		const app = createApp({
			account: 'polyms',
			apps: ['studio', '../other'],
			packages: ['@polyms/..'],
			token: 'test-token',
			url: 'https://user:test-token@registry.polyms.dev',
		})
		const secretFile = await app.request('http://localhost/studio/download/v0.2.8/builder-debug.yml')
		const envFile = await app.request('http://localhost/studio/download/v0.2.8/.env')
		const keyFile = await app.request('http://localhost/studio/download/v0.2.8/certs.pem')
		const latest = await app.request('http://localhost/studio/latest.json')
		const latestBody = await latest.text()
		const home = await app.request('http://localhost/')
		const homeBody = await home.text()
		const download = await app.request('http://localhost/studio/download/dmg')
		const calls = fetchMock.mock.calls.map(call => String(call[0]))

		expect(secretFile.status).toBe(404)
		expect(envFile.status).toBe(404)
		expect(keyFile.status).toBe(404)
		expect(latest.status).toBe(200)
		expect(latestBody).not.toContain('other/secret')
		expect(latestBody).not.toContain('ghp_')
		expect(latestBody).not.toContain('test-token')
		expect(latestBody).not.toContain('user:')
		expect(latestBody).toContain('"signature":"sig"')
		expect(latestBody).toContain('https://registry.polyms.dev/studio/download/v0.2.8/Studio.exe')
		expect(home.status).toBe(200)
		expect(homeBody).not.toContain('ghp_')
		expect(homeBody).not.toContain('test-token')
		expect(download.status).toBe(404)
		expect(calls.every(url => url.startsWith('https://api.github.com/repos/polyms/studio/'))).toBe(true)
		expect(calls.join('\n')).not.toContain('evil.example')
		expect(calls.join('\n')).not.toContain('test-token')
	})

	it('redirects a private asset only to the signed download host', async () => {
		const location = 'https://release-assets.githubusercontent.com/asset?name=Studio.dmg'
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				const href = String(url)
				if (href === 'https://api.github.com/repos/polyms/studio/releases/assets/1') {
					return new Response(null, { headers: { Location: location }, status: 302 })
				}
				if (href.includes('/repos/polyms/studio/releases'))
					return releaseResponse('studio', 'v0.2.8', 'notes', 'Studio.dmg')
				return new Response('missing', { status: 404 })
			})
		)

		const app = createApp({
			account: 'polyms',
			apps: ['studio'],
			packages: [],
			token: 'test-token',
			url: 'registry.polyms.dev',
		})
		const response = await app.request('http://localhost/studio/download/dmg')

		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe(location)
		expect(response.headers.get('location')).not.toContain('test-token')
	})
})
