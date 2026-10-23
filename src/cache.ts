import retry from 'async-retry'
import ms from 'ms'

import checkPlatform from './platform.js'

export type CacheConfig = {
	account?: string
	interval?: number | string
	pre?: string
	repository?: string
	token?: string
	url?: string
}

type PlatformAsset = {
	api_url: string
	content_type: string
	name: string
	size: number
	url: string
}

export type LatestCache = {
	files?: {
		RELEASES?: string
	}
	notes?: string
	platforms?: Record<string, PlatformAsset>
	pub_date?: string
	version?: string
}

export type ListedFile = {
	name: string
	platform: string
	size: number
}

export type ListedRelease = {
	files: ListedFile[]
	publishedAt?: string
	version: string
}

type GitHubAsset = {
	browser_download_url: string
	content_type: string
	name: string
	size: number
	url: string
}

type GitHubRelease = {
	assets?: GitHubAsset[]
	body?: string
	draft?: boolean
	prerelease?: boolean
	published_at?: string
	tag_name?: string
}

export default class Cache {
	config: CacheConfig
	latest: LatestCache = {}
	lastUpdate: number | null = null
	releases: ListedRelease[] = []

	constructor(config: CacheConfig) {
		const { account, repository, token, url } = config
		this.config = config

		if (!account || !repository) {
			const error = new Error('Neither ACCOUNT, nor REPOSITORY are defined')
			;(error as NodeJS.ErrnoException).code = 'missing_configuration_properties'
			throw error
		}

		if (token && !url) {
			const error = new Error(
				'Neither VERCEL_URL, nor URL are defined, which are mandatory for private repo mode'
			)
			;(error as NodeJS.ErrnoException).code = 'missing_configuration_properties'
			throw error
		}
	}

	async cacheReleaseList(url: string) {
		const { token } = this.config
		const headers: Record<string, string> = { Accept: 'application/vnd.github.preview' }

		if (token && typeof token === 'string' && token.length > 0) {
			headers.Authorization = `token ${token}`
		}

		const response = await retry(
			async () => {
				const result = await fetch(url, { headers })

				if (result.status !== 200) {
					throw new Error(`Tried to cache RELEASES, but failed fetching ${url}, status ${result.status}`)
				}

				return result
			},
			{ retries: 3 }
		)

		let content = await response.text()
		const matches = content.match(/[^ ]*\.nupkg/gim)

		if (!matches || matches.length === 0) {
			throw new Error(`Tried to cache RELEASES, but failed. RELEASES content doesn't contain nupkg`)
		}

		for (const match of matches) {
			const nuPKG = url.replace('RELEASES', match)
			content = content.replace(match, nuPKG)
		}

		return content
	}

	async refreshCache() {
		const { account, repository, pre, token } = this.config
		const repo = `${account}/${repository}`
		const url = `https://api.github.com/repos/${repo}/releases?per_page=100`
		const headers: Record<string, string> = { Accept: 'application/vnd.github.preview' }

		if (token && typeof token === 'string' && token.length > 0) {
			headers.Authorization = `token ${token}`
		}

		const response = await retry(
			async () => {
				const result = await fetch(url, { headers })

				if (result.status !== 200) {
					throw new Error(`GitHub API responded with ${result.status} for url ${url}`)
				}

				return result
			},
			{ retries: 3 }
		)

		const data = (await response.json()) as GitHubRelease[]

		if (!Array.isArray(data) || data.length === 0) return

		const visible = data.filter(item => {
			const isPre = Boolean(pre) === Boolean(item.prerelease)
			return !item.draft && isPre
		})

		this.releases = visible.flatMap(item => {
			if (!item.tag_name) return []

			return [
				{
					files: filesForRelease(item),
					publishedAt: item.published_at,
					version: item.tag_name,
				},
			]
		})

		const release = visible[0]

		if (!release?.assets || !Array.isArray(release.assets)) return

		const { tag_name } = release

		if (this.latest.version === tag_name) {
			console.log('Cached version is the same as latest')
			this.lastUpdate = Date.now()
			return
		}

		console.log(`Caching version ${tag_name}...`)

		this.latest.version = tag_name
		this.latest.notes = release.body
		this.latest.pub_date = release.published_at
		this.latest.platforms = {}

		for (const asset of release.assets) {
			const { name, browser_download_url, url: assetUrl, content_type, size } = asset

			if (name === 'RELEASES') {
				try {
					this.latest.files ??= {}
					this.latest.files.RELEASES = await this.cacheReleaseList(browser_download_url)
				} catch (err) {
					console.error(err)
				}
				continue
			}

			const platform = checkPlatform(name)

			if (!platform) continue

			this.latest.platforms[platform] = {
				api_url: assetUrl,
				content_type,
				name,
				size: Math.round((size / 1000000) * 10) / 10,
				url: browser_download_url,
			}
		}

		console.log(`Finished caching version ${tag_name}`)
		this.lastUpdate = Date.now()
	}

	isOutdated() {
		const { lastUpdate, config } = this
		const { interval = 15 } = config
		const maxAge = (ms as (value: string) => number | undefined)(`${interval}m`)

		if (lastUpdate && maxAge !== undefined && Date.now() - lastUpdate > maxAge) return true

		return false
	}

	async loadCache() {
		if (!this.lastUpdate || this.isOutdated()) await this.refreshCache()

		return { ...this.latest }
	}

	async loadReleases() {
		await this.loadCache()

		return this.releases
	}
}

function filesForRelease(release: GitHubRelease): ListedFile[] {
	const files: ListedFile[] = []

	for (const asset of release.assets ?? []) {
		const platform = checkPlatform(asset.name)
		if (!platform) continue

		files.push({
			name: asset.name,
			platform,
			size: Math.round((asset.size / 1000000) * 10) / 10,
		})
	}

	return files
}
