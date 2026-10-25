import ms from 'ms'
import semver from 'semver'

import { isSafePackageName } from './github-guard.js'
import { fetchPackument } from './npm-proxy.js'

const defaultPackage = '@polyms/ui-kit'

export type PackageRelease = {
	publishedAt?: string
	version: string
}

type PackagePackument = {
	time?: Record<string, string>
	versions?: Record<string, unknown>
}

export function parsePackageNames(value: string | undefined): string[] {
	if (value === undefined) return [defaultPackage]

	const names = value
		.split(',')
		.map(item => item.trim())
		.filter(item => isSafePackageName(item))

	return [...new Set(names)]
}

export function packageSlug(name: string) {
	return name.slice(name.indexOf('/') + 1)
}

export function selectPackageReleases(packument: PackagePackument): PackageRelease[] {
	const versions = packument.versions ?? {}
	const time = packument.time ?? {}
	const releases: PackageRelease[] = []

	for (const version of Object.keys(versions)) {
		if (semver.valid(version) !== version) continue

		const publishedAt = time[version]
		releases.push({
			publishedAt: typeof publishedAt === 'string' ? publishedAt : undefined,
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
		const { token } = this.config
		if (!isSafePackageName(name) || !token) throw new Error('Refused npm package')

		return selectPackageReleases(await fetchPackument(name, token))
	}
}
