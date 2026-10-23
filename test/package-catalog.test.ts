import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app.js'
import { PackageCatalog, parsePackageNames, selectPackageReleases } from '../src/package-catalog.js'
import { renderOverview } from '../src/views/overview.js'

const tags = [
	{
		object: { sha: 'old', type: 'tag', url: 'https://api.github.com/repos/polyms/ui-kit/git/tags/old' },
		ref: 'refs/tags/ui-kit@1.0.4',
	},
	{
		object: { sha: 'docs', type: 'tag', url: 'https://api.github.com/repos/polyms/ui-kit/git/tags/docs' },
		ref: 'refs/tags/docs@0.4.38',
	},
	{
		object: { sha: 'new', type: 'tag', url: 'https://api.github.com/repos/polyms/ui-kit/git/tags/new' },
		ref: 'refs/tags/ui-kit@1.0.5',
	},
	{
		object: { sha: 'bad', type: 'tag', url: 'https://api.github.com/repos/polyms/ui-kit/git/tags/bad' },
		ref: 'refs/tags/ui-kit@not-a-version',
	},
]

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('package catalog', () => {
	it('parses package names from the env string', () => {
		expect(parsePackageNames(undefined)).toEqual(['@polyms/ui-kit'])
		expect(parsePackageNames('@polyms/ui-kit, @polyms/icons, nope, @polyms/.., @a/b/c')).toEqual([
			'@polyms/ui-kit',
			'@polyms/icons',
		])
		expect(parsePackageNames('')).toEqual([])
	})

	it('keeps tags for the named package and sorts the newest semver first', () => {
		const releases = selectPackageReleases('@polyms/ui-kit', tags)

		expect(releases.map(release => release.version)).toEqual(['1.0.5', '1.0.4'])
		expect(releases[0]?.tag).toBe('ui-kit@1.0.5')
		expect(selectPackageReleases('@polyms/icons', tags)).toEqual([])
	})

	it('reads the tagger date for each release', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (String(url).includes('matching-refs')) return Response.json(tags)
				if (String(url).endsWith('/new')) {
					return Response.json({ tagger: { date: '2026-07-28T11:36:20Z' } })
				}
				if (String(url).endsWith('/old')) {
					return Response.json({ tagger: { date: '2026-07-01T00:00:00Z' } })
				}
				return new Response('missing', { status: 404 })
			})
		)

		const releases = await new PackageCatalog({
			account: 'polyms',
			packages: ['@polyms/ui-kit'],
		}).load('@polyms/ui-kit')

		expect(releases.map(release => release.version)).toEqual(['1.0.5', '1.0.4'])
		expect(releases[0]?.publishedAt).toBe('2026-07-28T11:36:20Z')
		expect(releases[1]?.publishedAt).toBe('2026-07-01T00:00:00Z')
	})

	it('does not send the token to a tag object outside the repo', async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (String(url).includes('matching-refs')) {
				return Response.json([
					{
						object: { url: 'https://example.test/steal' },
						ref: 'refs/tags/ui-kit@1.2.0',
					},
					{
						object: { url: 'https://api.github.com/repos/other/secret/contents/.env' },
						ref: 'refs/tags/ui-kit@1.1.0',
					},
					{
						object: { url: 'https://api.github.com/repos/polyms/ui-kit/git/tags/ok' },
						ref: 'refs/tags/ui-kit@1.0.0',
					},
				])
			}

			return Response.json({ tagger: { date: '2026-07-28T11:36:20Z' } })
		})
		vi.stubGlobal('fetch', fetchMock)

		const releases = await new PackageCatalog({
			account: 'polyms',
			packages: ['@polyms/ui-kit'],
			token: 'test-token',
		}).load('@polyms/ui-kit')

		expect(releases.map(release => release.version)).toEqual(['1.2.0', '1.1.0', '1.0.0'])
		expect(releases[0]?.publishedAt).toBeUndefined()
		expect(releases[1]?.publishedAt).toBeUndefined()
		expect(releases[2]?.publishedAt).toBe('2026-07-28T11:36:20Z')

		const urls = fetchMock.mock.calls.map(call => String(call[0]))
		expect(urls.every(url => url.startsWith('https://api.github.com/repos/polyms/ui-kit/'))).toBe(true)
		expect(urls.join('\n')).not.toContain('example.test')
		expect(urls.join('\n')).not.toContain('other/secret')
		expect(urls.join('\n')).not.toContain('test-token')
	})
})

describe('home', () => {
	it('renders apps and packages as two sections', () => {
		const html = renderOverview({
			apps: [
				{
					date: '2 hours ago',
					files: {},
					notes: '',
					product: 'studio',
					releasesHref: '/studio/releases',
					version: 'v0.2.8',
				},
			],
			packages: [
				{
					date: '3 days ago',
					name: '@polyms/ui-kit',
					releasesHref: '/ui-kit/releases',
					title: 'ui-kit',
					version: '1.0.5',
				},
				{
					date: '',
					name: '@polyms/icons',
					releasesHref: '/icons/releases',
					title: 'icons',
					version: '0.2.0',
				},
			],
		})

		const apps = html.indexOf('>Apps<')
		const studio = html.indexOf('>Studio<')
		const packages = html.indexOf('>Packages<')
		const uiKit = html.indexOf('>ui-kit<')
		const icons = html.indexOf('>icons<')

		expect(apps).toBeGreaterThan(-1)
		expect(studio).toBeGreaterThan(apps)
		expect(packages).toBeGreaterThan(studio)
		expect(uiKit).toBeGreaterThan(packages)
		expect(icons).toBeGreaterThan(uiKit)
		expect(html).not.toContain('Downloads')
		expect(html).not.toContain('>Package<')
		expect(html.match(/class="display"/g)).toHaveLength(3)
		const pnpm = html.indexOf('pnpm add @polyms/ui-kit')
		const npm = html.indexOf('npm install @polyms/ui-kit')
		const yarn = html.indexOf('yarn add @polyms/ui-kit')

		expect(html).toContain('>1.0.5<')
		expect(pnpm).toBeGreaterThan(uiKit)
		expect(npm).toBeGreaterThan(pnpm)
		expect(yarn).toBeGreaterThan(npm)
		expect(icons).toBeGreaterThan(yarn)
		expect(html.match(/pnpm add @polyms\/ui-kit/g)).toHaveLength(2)
		expect(html.match(/npm install @polyms\/ui-kit/g)).toHaveLength(2)
		expect(html.match(/yarn add @polyms\/ui-kit/g)).toHaveLength(2)
		expect(html).toContain('pnpm add @polyms/icons')
		expect(html).toContain('npm install @polyms/icons')
		expect(html).toContain('yarn add @polyms/icons')
		expect(html).not.toContain('>@polyms/ui-kit<')
		expect(html).not.toContain('>npm<')
		expect(html.match(/>Copy</g)).toHaveLength(6)
		expect(html).toContain('navigator.clipboard.writeText')
		expect(html).toContain('href="/ui-kit/releases"')
		expect(html).toContain('All ui-kit releases')
		expect(html).toContain('href="/icons/releases"')
		expect(html).toContain('href="/studio/releases"')
	})

	it('omits the packages section when none are configured', () => {
		const html = renderOverview({
			apps: [
				{
					date: '',
					files: {},
					notes: '',
					product: 'studio',
					releasesHref: '/studio/releases',
					version: '',
				},
			],
			packages: [],
		})

		expect(html).toContain('>Apps<')
		expect(html).toContain('>Studio<')
		expect(html).not.toContain('>Packages<')
		expect(html).not.toContain('pnpm add')
		expect(html).not.toContain('npm install')
		expect(html).not.toContain('yarn add')
	})

	it('serves one releases page for the app and each package', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (String(url).includes('matching-refs')) return Response.json(tags)
				if (String(url).endsWith('/new')) {
					return Response.json({ tagger: { date: '2026-07-28T11:36:20Z' } })
				}
				return Response.json({ tagger: { date: '2026-07-01T00:00:00Z' } })
			})
		)

		const app = createApp({
			account: 'polyms',
			apps: ['studio'],
			packages: ['@polyms/ui-kit', '@polyms/icons'],
		})
		const uiKit = await app.request('http://localhost:3000/ui-kit/releases')
		const html = await uiKit.text()
		const icons = await app.request('http://localhost:3000/icons/releases')
		const missing = await app.request('http://localhost:3000/other/releases')

		expect(uiKit.status).toBe(200)
		expect(uiKit.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
		expect(uiKit.headers.get('vercel-cdn-cache-control')).toBe(
			'public, s-maxage=300, stale-while-revalidate=600'
		)
		expect(html).toContain('<h1>ui-kit</h1>')
		expect(html.indexOf('>1.0.5<')).toBeLessThan(html.indexOf('>1.0.4<'))
		expect(html).toContain('pnpm add @polyms/ui-kit@1.0.5')
		expect(html).toContain('pnpm add @polyms/ui-kit@1.0.4')
		expect(html).toContain('>Copy<')
		expect(html).toContain('navigator.clipboard.writeText')
		expect(html).toContain("button.textContent = 'Copied'")
		expect(html).not.toContain('github.com')
		expect(html).not.toContain('<h2>')
		expect(html).not.toContain('npm install')
		expect(html).not.toContain('yarn add')
		expect(html).not.toContain('>@polyms/ui-kit<')
		expect(html).toContain('href="/"')
		expect(icons.status).toBe(200)
		expect(await icons.text()).toContain('<h1>icons</h1>')
		expect(missing.status).toBe(404)
		expect(missing.headers.get('vercel-cdn-cache-control')).toBeNull()
	})
})
