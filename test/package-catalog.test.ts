import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app.js'
import { PackageCatalog, parsePackageNames, selectPackageReleases } from '../src/package-catalog.js'
import { renderOverview } from '../src/views/overview.js'

const packument = {
	time: {
		created: '2026-06-01T00:00:00Z',
		modified: '2026-07-28T11:36:20Z',
		'1.0.4': '2026-07-01T00:00:00Z',
		'1.0.5': '2026-07-28T11:36:20Z',
	},
	versions: {
		'1.0.4': { dist: { tarball: 'https://example.test/steal.tgz' } },
		'1.0.5': { dist: { tarball: 'https://npm.pkg.github.com/download/@polyms/ui-kit/1.0.5/abc' } },
		'not-a-version': {},
	},
}

function packumentResponse(url: string) {
	const href = String(url)
	if (href === 'https://npm.pkg.github.com/@polyms%2Fui-kit') return Response.json(packument)
	if (href === 'https://npm.pkg.github.com/@polyms%2Ficons') return Response.json({ versions: {} })
	return new Response('missing', { status: 404 })
}

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

	it('keeps published versions and sorts the newest semver first', () => {
		const releases = selectPackageReleases(packument)

		expect(releases.map(release => release.version)).toEqual(['1.0.5', '1.0.4'])
		expect(releases[0]?.publishedAt).toBe('2026-07-28T11:36:20Z')
		expect(releases[1]?.publishedAt).toBe('2026-07-01T00:00:00Z')
		expect(selectPackageReleases({ versions: {} })).toEqual([])
	})

	it('reads versions from the npm packument', async () => {
		const fetchMock = vi.fn(async (url: string) => packumentResponse(url))
		vi.stubGlobal('fetch', fetchMock)

		const releases = await new PackageCatalog({
			account: 'polyms',
			packages: ['@polyms/ui-kit'],
			token: 'test-token',
		}).load('@polyms/ui-kit')

		expect(releases.map(release => release.version)).toEqual(['1.0.5', '1.0.4'])
		expect(releases[0]?.publishedAt).toBe('2026-07-28T11:36:20Z')
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(fetchMock).toHaveBeenCalledWith('https://npm.pkg.github.com/@polyms%2Fui-kit', {
			headers: {
				Accept: 'application/json',
				Authorization: 'Bearer test-token',
				'User-Agent': 'polyms-registry',
			},
			redirect: 'manual',
		})
	})

	it('does not follow a packument redirect or any url inside it', async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(null, { headers: { location: 'https://example.test/steal' }, status: 302 })
		})
		vi.stubGlobal('fetch', fetchMock)

		const releases = await new PackageCatalog({
			account: 'polyms',
			packages: ['@polyms/ui-kit'],
			token: 'test-token',
		}).load('@polyms/ui-kit')

		expect(releases).toEqual([])
		expect(fetchMock).toHaveBeenCalledTimes(1)
		expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://npm.pkg.github.com/@polyms%2Fui-kit')
		expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('test-token')
		expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('example.test')
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
			vi.fn(async (url: string) => packumentResponse(url))
		)

		const app = createApp({
			account: 'polyms',
			apps: ['studio'],
			packages: ['@polyms/ui-kit', '@polyms/icons'],
			token: 'test-token',
			url: 'https://registry.polyms.dev',
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
