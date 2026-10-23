import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { HonoBase } from 'hono/hono-base'
import { RegExpRouter } from 'hono/router/reg-exp-router'
import { SmartRouter } from 'hono/router/smart-router'
import { TrieRouter } from 'hono/router/trie-router'
import semver from 'semver'

import checkAlias from './aliases.js'
import Cache, { type CacheConfig, type LatestCache, type ListedRelease } from './cache.js'
import { downloadTarget } from './download-target.js'
import { mountNpmProxy } from './npm-proxy.js'
import { PackageCatalog, type PackageRelease, packageSlug, parsePackageNames } from './package-catalog.js'
import { productTitle, renderOverview } from './views/overview.js'
import { renderPackageReleases } from './views/package-releases.js'
import { type ReleaseView, renderReleases } from './views/releases.js'

const faviconSvg = 'https://polyms.dev/favicon/favicon.svg'

const htmlCacheHeaders = {
	'Cache-Control': 'public, max-age=0, must-revalidate',
	'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
}

function createHono() {
	return new HonoBase({
		router: new SmartRouter({
			routers: [new RegExpRouter(), new TrieRouter()],
		}),
	})
}

type CodedError = Error & { code: string }

type ReleaseAsset = {
	browser_download_url?: string
	name?: string
	url?: string
}

type LatestJson = {
	platforms?: Record<string, { url?: string }>
}

function isCodedError(error: unknown): error is CodedError {
	return error instanceof Error && 'code' in error && typeof error.code === 'string'
}

function githubHeaders(token: string | undefined, accept: string) {
	const headers: Record<string, string> = { Accept: accept }

	if (token && token.length > 0) {
		headers.Authorization = `token ${token}`
	}

	return headers
}

async function fetchPrivateAsset(assetUrl: string, token: string | undefined, accept: string) {
	return fetch(assetUrl, { headers: githubHeaders(token, accept) })
}

async function privateDownloadLocation(apiUrl: string, token: string) {
	const assetResponse = await fetch(apiUrl, {
		headers: githubHeaders(token, 'application/octet-stream'),
		redirect: 'manual',
	})

	return assetResponse.headers.get('Location')
}

const platformOrder = ['dmg', 'exe', 'deb', 'rpm', 'AppImage', 'darwin', 'tar.gz']

function platformRank(platform: string) {
	const base = platform.replace(/_arm64$/, '')
	const index = platformOrder.indexOf(base)
	return index === -1 ? platformOrder.length : index
}

function appReleaseViews(releases: ListedRelease[], appName: string): ReleaseView[] {
	return releases.map(release => ({
		date: release.publishedAt ? formatDistanceToNow(release.publishedAt, { addSuffix: true }) : '',
		files: [...release.files]
			.sort(
				(left, right) =>
					platformRank(left.platform) - platformRank(right.platform) || left.name.localeCompare(right.name)
			)
			.map(file => {
				const fileName = encodeURIComponent(file.name)
				const href = `/${appName}/download/${release.version}/${fileName}`
				return { href, name: file.name, path: href, size: file.size }
			}),
		version: release.version,
	}))
}

export function parseAppNames(value: string | undefined): string[] {
	if (value === undefined) return []

	return [
		...new Set(
			value
				.split(',')
				.map(item => item.trim())
				.filter(item => item.length > 0)
		),
	]
}

function packageReleaseViews(releases: PackageRelease[]) {
	return releases.map(release => ({
		date: release.publishedAt ? formatDistanceToNow(release.publishedAt, { addSuffix: true }) : '',
		version: release.version,
	}))
}

async function packageSummaries(catalog: PackageCatalog) {
	try {
		const loaded = await catalog.loadAll()

		return loaded.map(item => ({
			date: item.publishedAt ? formatDistanceToNow(item.publishedAt, { addSuffix: true }) : '',
			name: item.name,
			releasesHref: `/${packageSlug(item.name)}/releases`,
			title: packageSlug(item.name),
			version: item.version,
		}))
	} catch (error) {
		console.error(error)
		return []
	}
}

function buildApp(
	caches: Cache[],
	config: CacheConfig & { account: string; apps: string[]; packages: string[] }
) {
	const app = createHono()
	const { account, apps, interval, packages, token, url } = config
	const cacheFor = new Map(apps.map((name, index) => [name, caches[index]]))
	const shouldProxyPrivateDownload = typeof token === 'string' && token.length > 0
	const packageCatalog = new PackageCatalog({ account, interval, packages, token })

	mountNpmProxy(app, { packages, token })

	app.get('/favicon.ico', c => c.redirect(faviconSvg, 302))

	app.get('/', async c => {
		try {
			const appBlocks = await Promise.all(
				apps.map(async (name, index) => {
					const latest = await caches[index]?.loadCache()
					const files: Record<string, { name: string; size: number; url: string }> = {}

					for (const [platform, platformData] of Object.entries(latest?.platforms ?? {})) {
						files[platform] = {
							name: platformData.name,
							size: platformData.size,
							url: `/${name}/download/${platform}`,
						}
					}

					const publishedAt = latest?.pub_date ?? ''
					return {
						date: publishedAt ? formatDistanceToNow(publishedAt, { addSuffix: true }) : '',
						files,
						notes: latest?.notes ?? '',
						product: name,
						releasesHref: `/${name}/releases`,
						version: latest?.version ?? '',
					}
				})
			)
			const html = renderOverview({
				apps: appBlocks,
				packages: await packageSummaries(packageCatalog),
			})

			return c.html(html, 200, htmlCacheHeaders)
		} catch (error) {
			console.error(error)
			return c.text('Error reading overview file', 500)
		}
	})

	app.get('/:product/releases', async c => {
		const product = c.req.param('product')

		try {
			const appCache = cacheFor.get(product)
			if (appCache) {
				const releases = await appCache.loadReleases()
				return c.html(
					renderReleases(productTitle(product), appReleaseViews(releases, product)),
					200,
					htmlCacheHeaders
				)
			}

			const name = packages.find(item => packageSlug(item) === product)
			if (!name) return c.text('Not found', 404)

			const releases = await packageCatalog.load(name)
			return c.html(
				renderPackageReleases(packageSlug(name), name, packageReleaseViews(releases)),
				200,
				htmlCacheHeaders
			)
		} catch (error) {
			console.error(error)
			return c.text('Error reading releases', 500)
		}
	})

	app.get('/:name/latest.json', async c => {
		const name = c.req.param('name')
		if (!cacheFor.has(name)) return c.text('Not found', 404)

		try {
			const releaseUrl = `https://api.github.com/repos/${account}/${name}/releases/latest`
			const releaseResponse = await fetchPrivateAsset(releaseUrl, token, 'application/vnd.github.v3+json')

			if (!releaseResponse.ok) {
				throw new Error(`Failed to fetch release info: ${releaseResponse.statusText}`)
			}

			const releaseData = (await releaseResponse.json()) as { assets?: ReleaseAsset[] }
			const latestJsonAsset = releaseData.assets?.find(asset => asset.name === 'latest.json')

			if (!latestJsonAsset?.url) throw new Error('latest.json not found in release assets')

			const response = await fetchPrivateAsset(latestJsonAsset.url, token, 'application/octet-stream')

			if (!response.ok) throw new Error(`Failed to fetch latest.json: ${response.statusText}`)

			const latestJson = (await response.json()) as LatestJson

			if (shouldProxyPrivateDownload && latestJson.platforms && url) {
				for (const platformData of Object.values(latestJson.platforms)) {
					if (!platformData.url) continue
					platformData.url = platformData.url.replace(
						`github.com/${account}/${name}/releases`,
						`${url}/${name}`
					)
				}
			}

			return c.json(latestJson)
		} catch (error) {
			console.error(error)
			return c.json({ error: 'Error fetching latest.json' }, 500)
		}
	})

	app.get('/:name/download', async c => {
		const name = c.req.param('name')
		const cache = cacheFor.get(name)
		if (!cache) return c.text('Not found', 404)

		const platform = downloadTarget(c.req.header('user-agent') ?? '', Boolean(c.req.query('update')))
		const { platforms } = await cache.loadCache()
		const asset = platform ? platforms?.[platform] : undefined

		if (!platform || !asset) return c.text('No download available for your platform!', 404)

		if (shouldProxyPrivateDownload && token) {
			const location = await privateDownloadLocation(asset.api_url, token)
			if (!location) return c.body(null, 302)
			return c.redirect(location, 302)
		}

		return c.redirect(asset.url, 302)
	})

	async function sendTaggedDownload(
		c: {
			body: (data: null, status: 302) => Response
			redirect: (location: string, status: 302) => Response
			text: (body: string, status: 404 | 500) => Response
		},
		repository: string,
		version: string,
		filename: string
	) {
		if (!version || !/^v\d+/.test(version)) return c.text('The specified platform is not valid', 500)

		try {
			const releaseUrl = `https://api.github.com/repos/${account}/${repository}/releases/tags/${version}`
			const releaseResponse = await fetchPrivateAsset(releaseUrl, token, 'application/vnd.github.v3+json')

			if (!releaseResponse.ok) return c.text('Release not found', 404)

			const releaseData = (await releaseResponse.json()) as { assets?: ReleaseAsset[] }
			const asset = releaseData.assets?.find(item => item.name === filename)

			if (!asset) return c.text('Asset not found', 404)

			if (shouldProxyPrivateDownload && token && asset.url) {
				const location = await privateDownloadLocation(asset.url, token)
				if (!location) return c.body(null, 302)
				return c.redirect(location, 302)
			}

			if (!asset.browser_download_url) return c.text('Asset not found', 404)

			return c.redirect(asset.browser_download_url, 302)
		} catch (error) {
			console.error(error)
			return c.text('Error downloading release asset', 500)
		}
	}

	app.get('/:name/download/:version/:file', async c => {
		const name = c.req.param('name')
		if (!cacheFor.has(name)) return c.text('Not found', 404)
		return sendTaggedDownload(c, name, c.req.param('version'), c.req.param('file'))
	})

	app.get('/:name/download/:platform', async c => {
		const name = c.req.param('name')
		const cache = cacheFor.get(name)
		if (!cache) return c.text('Not found', 404)

		let platform = c.req.param('platform')
		const isUpdate = Boolean(c.req.query('update'))

		if (/^v\d+/.test(platform)) return c.text('Invalid release path', 400)

		if (platform === 'mac' && !isUpdate) platform = 'dmg'
		if (platform === 'mac_arm64' && !isUpdate) platform = 'dmg_arm64'

		const latest = await cache.loadCache()
		const resolved = checkAlias(platform)

		if (!resolved) return c.text('The specified platform is not valid', 500)

		const asset = latest.platforms?.[resolved]
		if (!asset) return c.text('No download available for your platform', 404)

		if (shouldProxyPrivateDownload && token) {
			const location = await privateDownloadLocation(asset.api_url, token)
			if (!location) return c.body(null, 302)
			return c.redirect(location, 302)
		}

		return c.redirect(asset.url, 302)
	})

	app.get('/:name/update/win32/:version/RELEASES', async c => {
		const name = c.req.param('name')
		const cache = cacheFor.get(name)
		if (!cache) return c.text('Not found', 404)

		const latest = await cache.loadCache()
		const content = latest.files?.RELEASES

		if (!content) return c.body(null, 204)

		return c.body(content, 200, {
			'content-type': 'application/octet-stream',
		})
	})

	app.get('/:name/update/:platform/:version', async c => {
		const name = c.req.param('name')
		const cache = cacheFor.get(name)
		if (!cache) return c.text('Not found', 404)

		const platformName = c.req.param('platform')
		const version = c.req.param('version')

		if (!semver.valid(version)) {
			return c.json(
				{
					error: 'version_invalid',
					message: 'The specified version is not SemVer-compatible',
				},
				500
			)
		}

		const platform = checkAlias(platformName)

		if (!platform) {
			return c.json(
				{
					error: 'invalid_platform',
					message: 'The specified platform is not valid',
				},
				500
			)
		}

		const latest = await cache.loadCache()
		const asset = latest.platforms?.[platform]

		if (!asset) return c.body(null, 204)

		if (!latest.version || semver.compare(latest.version, version) !== 0) {
			return c.json(updatePayload(latest, asset.url, shouldProxyPrivateDownload, url, platformName, name))
		}

		return c.body(null, 204)
	})

	return app
}

function updatePayload(
	latest: LatestCache,
	assetUrl: string,
	shouldProxyPrivateDownload: boolean,
	url: string | undefined,
	platformName: string,
	appName: string
) {
	return {
		name: latest.version,
		notes: latest.notes,
		pub_date: latest.pub_date,
		url:
			shouldProxyPrivateDownload && url ? `${url}/${appName}/download/${platformName}?update=true` : assetUrl,
	}
}

export function createApp(
	config: Omit<CacheConfig, 'repository'> & { apps?: string[]; packages?: string[] }
) {
	try {
		const apps = [...new Set((config.apps ?? []).map(name => name.trim()).filter(name => name.length > 0))]

		if (!config.account || apps.length === 0) {
			const error = new Error('Neither ACCOUNT, nor REPOSITORY are defined')
			;(error as NodeJS.ErrnoException).code = 'missing_configuration_properties'
			throw error
		}

		const caches = apps.map(repository => new Cache({ ...config, repository }))
		const packages = config.packages ?? parsePackageNames(undefined)

		return buildApp(caches, {
			...config,
			account: config.account,
			apps,
			packages,
		})
	} catch (error) {
		if (!isCodedError(error)) throw error

		const app = createHono()
		const { code, message } = error
		app.all('*', c => c.json({ error: { code, message } }, 400))
		return app
	}
}
