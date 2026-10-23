import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { HonoBase } from 'hono/hono-base'
import { RegExpRouter } from 'hono/router/reg-exp-router'
import { SmartRouter } from 'hono/router/smart-router'
import { TrieRouter } from 'hono/router/trie-router'
import semver from 'semver'

import checkAlias from './aliases.js'
import Cache, { type CacheConfig, type LatestCache } from './cache.js'
import { downloadTarget } from './download-target.js'
import { renderOverview } from './views/overview.js'

const faviconSvg = 'https://polyms.dev/favicon/favicon.svg'

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

function buildApp(cache: Cache, config: CacheConfig & { account: string; repository: string }) {
	const app = createHono()
	const { account, repository, token, url } = config
	const shouldProxyPrivateDownload = typeof token === 'string' && token.length > 0

	app.get('/favicon.ico', c => c.redirect(faviconSvg, 302))

	app.get('/', async c => {
		const latest = await cache.loadCache()

		try {
			const files: Record<string, { name: string; size: number; url: string }> = {}

			for (const [platform, platformData] of Object.entries(latest.platforms ?? {})) {
				files[platform] = {
					name: platformData.name,
					size: platformData.size,
					url: `/download/${platform}`,
				}
			}

			const publishedAt = latest.pub_date ?? ''
			const html = renderOverview({
				date: publishedAt ? formatDistanceToNow(publishedAt, { addSuffix: true }) : '',
				files,
				notes: latest.notes ?? '',
				product: repository,
				version: latest.version ?? '',
			})

			return c.html(html)
		} catch (error) {
			console.error(error)
			return c.text('Error reading overview file', 500)
		}
	})

	app.get('/latest.json', async c => {
		try {
			const releaseUrl = `https://api.github.com/repos/${account}/${repository}/releases/latest`
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
					platformData.url = platformData.url.replace(`github.com/${account}/${repository}/releases`, url)
				}
			}

			return c.json(latestJson)
		} catch (error) {
			console.error(error)
			return c.json({ error: 'Error fetching latest.json' }, 500)
		}
	})

	app.get('/download', async c => {
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

	app.get('/download/:version/:file', async c => {
		const version = c.req.param('version')
		const filename = c.req.param('file')

		if (!/^v\d+/.test(version)) return c.text('The specified platform is not valid', 500)

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
	})

	app.get('/download/:platform', async c => {
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

	app.get('/update/win32/:version/RELEASES', async c => {
		const latest = await cache.loadCache()
		const content = latest.files?.RELEASES

		if (!content) return c.body(null, 204)

		return c.body(content, 200, {
			'content-type': 'application/octet-stream',
		})
	})

	app.get('/update/:platform/:version', async c => {
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
			return c.json(updatePayload(latest, asset.url, shouldProxyPrivateDownload, url, platformName))
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
	platformName: string
) {
	return {
		name: latest.version,
		notes: latest.notes,
		pub_date: latest.pub_date,
		url: shouldProxyPrivateDownload && url ? `${url}/download/${platformName}?update=true` : assetUrl,
	}
}

export function createApp(config: CacheConfig) {
	try {
		const cache = new Cache(config)

		if (!config.account || !config.repository) {
			throw new Error('Neither ACCOUNT, nor REPOSITORY are defined')
		}

		return buildApp(cache, { ...config, account: config.account, repository: config.repository })
	} catch (error) {
		if (!isCodedError(error)) throw error

		const app = createHono()
		const { code, message } = error
		app.all('*', c => c.json({ error: { code, message } }, 400))
		return app
	}
}
