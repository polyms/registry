import ms from 'ms'
import semver from 'semver'

const defaultPackage = '@polyms/ui-kit'

export type PackageRelease = {
	publishedAt?: string
	tag: string
	version: string
}

type MatchingRef = {
	object?: { sha?: string; type?: string; url?: string }
	ref?: string
}

type TagObject = {
	commit?: { committer?: { date?: string } }
	tagger?: { date?: string }
}

export function parsePackageNames(value: string | undefined): string[] {
	if (value === undefined) return [defaultPackage]

	const names = value
		.split(',')
		.map(item => item.trim())
		.filter(item => /^@[^/\s]+\/[^/\s]+$/.test(item))

	return [...new Set(names)]
}

export function packageSlug(name: string) {
	return name.slice(name.indexOf('/') + 1)
}

export function selectPackageReleases(
	name: string,
	refs: MatchingRef[]
): Array<PackageRelease & { url?: string }> {
	const prefix = `${packageSlug(name)}@`
	const releases: Array<PackageRelease & { url?: string }> = []

	for (const item of refs) {
		const ref = item.ref ?? ''
		const tag = ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : ''
		if (!tag.startsWith(prefix)) continue

		const version = tag.slice(prefix.length)
		if (!semver.valid(version)) continue

		releases.push({
			tag,
			url: item.object?.url,
			version,
		})
	}

	releases.sort((left, right) => semver.rcompare(left.version, right.version))

	return releases
}

export class PackageCatalog {
	config: { account: string; interval?: number | string; packages: string[]; token?: string }
	lastUpdate: number | null = null
	releases = new Map<string, PackageRelease[]>()

	constructor(config: { account: string; interval?: number | string; packages: string[]; token?: string }) {
		this.config = config
	}

	isOutdated() {
		const { lastUpdate, config } = this
		const { interval = 15 } = config
		const maxAge = (ms as (value: string) => number | undefined)(`${interval}m`)

		if (lastUpdate && maxAge !== undefined && Date.now() - lastUpdate > maxAge) return true

		return false
	}

	async load(name: string) {
		if (!this.lastUpdate || this.isOutdated()) await this.refresh()

		return this.releases.get(name) ?? []
	}

	async loadAll() {
		if (!this.lastUpdate || this.isOutdated()) await this.refresh()

		return this.config.packages.map(name => {
			const latest = this.releases.get(name)?.[0]

			return {
				name,
				publishedAt: latest?.publishedAt,
				version: latest?.version ?? '',
			}
		})
	}

	private headers() {
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github+json',
			'User-Agent': 'polyms-registry',
		}
		const { token } = this.config

		if (token && token.length > 0) headers.Authorization = `token ${token}`

		return headers
	}

	private async refresh() {
		let failed = false

		for (const name of this.config.packages) {
			try {
				this.releases.set(name, await this.loadPackage(name))
			} catch (error) {
				failed = true
				console.error(error)
				if (!this.releases.has(name)) this.releases.set(name, [])
			}
		}

		if (!failed) this.lastUpdate = Date.now()
	}

	private async loadPackage(name: string) {
		const slug = packageSlug(name)
		const url = `https://api.github.com/repos/${this.config.account}/${slug}/git/matching-refs/tags/${slug}@`
		const response = await fetch(url, { headers: this.headers() })

		if (!response.ok) {
			throw new Error(`GitHub API responded with ${response.status} for url ${url}`)
		}

		const data = (await response.json()) as MatchingRef[]
		if (!Array.isArray(data)) throw new Error('GitHub tag list was not an array')

		const selected = selectPackageReleases(name, data)

		return Promise.all(
			selected.map(async release => {
				const publishedAt = await this.publishedAt(release.url)
				return {
					publishedAt,
					tag: release.tag,
					version: release.version,
				}
			})
		)
	}

	private async publishedAt(url: string | undefined) {
		if (!url) return undefined

		try {
			const response = await fetch(url, { headers: this.headers() })
			if (!response.ok) return undefined

			const body = (await response.json()) as TagObject
			return body.tagger?.date ?? body.commit?.committer?.date
		} catch (error) {
			console.error(error)
			return undefined
		}
	}
}
