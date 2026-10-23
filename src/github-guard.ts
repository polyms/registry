import checkPlatform from './platform.js'

const blockedAsset = /\.(pem|p12|key|cer|crt|env|ya?ml|json|xml|plist|mobileprovision|p8)$/i

function secretPattern() {
	return /\b(?:ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9]{20,})\b/g
}

export function isSafeSlug(value: string) {
	return /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(value) && !value.includes('..')
}

export function isSafePackageName(value: string) {
	const match = /^@([^/\s]+)\/([^/\s]+)$/.exec(value)
	if (!match?.[1] || !match[2]) return false

	return isSafeSlug(match[1]) && isSafeSlug(match[2])
}

export function containsToken(value: string, token?: string) {
	return Boolean(token && token.length >= 8 && value.includes(token))
}

export function redactNotes(value: string, token?: string) {
	let next = value.replace(secretPattern(), '[redacted]')

	if (token && token.length >= 8) next = next.split(token).join('[redacted]')

	return next
}

function parseHttps(raw: string) {
	try {
		const parsed = new URL(raw)
		if (parsed.protocol !== 'https:') return null
		if (parsed.username || parsed.password) return null
		if (parsed.pathname.includes('..') || parsed.pathname.includes('\\')) return null

		return parsed
	} catch {
		return null
	}
}

export function isAllowedRepoFetch(raw: string, account: string, repo: string) {
	if (!isSafeSlug(account) || !isSafeSlug(repo)) return false

	const parsed = parseHttps(raw)
	if (!parsed) return false

	const path = parsed.pathname

	if (parsed.hostname === 'api.github.com') {
		const prefix = `/repos/${account}/${repo}/`
		if (!path.startsWith(prefix)) return false

		const rest = path.slice(prefix.length)

		return (
			rest === 'releases' ||
			rest.startsWith('releases/') ||
			rest.startsWith('git/matching-refs/') ||
			rest.startsWith('git/tags/') ||
			rest.startsWith('git/commits/')
		)
	}

	if (parsed.hostname === 'github.com') {
		return path.startsWith(`/${account}/${repo}/releases/download/`)
	}

	return false
}

export function isRepoGitObjectUrl(raw: string, account: string, repo: string) {
	if (!isAllowedRepoFetch(raw, account, repo)) return false

	const path = new URL(raw).pathname
	const prefix = `/repos/${account}/${repo}/git/`

	return path.startsWith(`${prefix}tags/`) || path.startsWith(`${prefix}commits/`)
}

export function isSignedDownloadHost(hostname: string) {
	const host = hostname.toLowerCase()

	if (host.endsWith('.githubusercontent.com')) return true
	if (host.endsWith('.blob.core.windows.net')) return true
	if (host === 'npm.pkg.github.com') return true

	return false
}

export function sameRepoApiRedirect(location: string, token?: string) {
	const parsed = parseHttps(location)
	if (parsed?.hostname !== 'api.github.com') return null
	if (containsToken(parsed.href, token)) return null
	if (!/^\/repositories\/\d+\/(?:releases(?:\/|$)|git\/)/.test(parsed.pathname)) return null

	return parsed.href
}

export function signedDownloadUrl(location: string, token?: string) {
	const parsed = parseHttps(location)
	if (!parsed || !isSignedDownloadHost(parsed.hostname)) return null
	if (containsToken(location, token) || containsToken(parsed.href, token)) return null

	return parsed.href
}

export function ownedBrowserDownload(raw: string, account: string, repo: string) {
	if (!isAllowedRepoFetch(raw, account, repo)) return null

	const parsed = new URL(raw)
	if (parsed.hostname !== 'github.com') return null

	return `https://github.com${parsed.pathname}`
}

export function publicBaseHost(base: string | undefined) {
	if (!base) return null

	try {
		const parsed = new URL(base.includes('://') ? base : `https://${base}`)
		if (parsed.pathname !== '/' && parsed.pathname !== '') return null
		if (parsed.search || parsed.hash) return null

		return parsed.host
	} catch {
		return null
	}
}

export function stripUserinfo(value: string | undefined) {
	if (!value?.includes('@')) return value

	return publicBaseHost(value) ?? undefined
}

export function ownedReleaseUrl(
	raw: string,
	account: string,
	repo: string,
	base: string | undefined,
	proxy: boolean
) {
	if (!isSafeSlug(account) || !isSafeSlug(repo)) return null

	const parsed = parseHttps(raw)
	if (parsed?.hostname !== 'github.com') return null

	const marker = `/${account}/${repo}/releases/`
	if (!parsed.pathname.startsWith(marker)) return null

	const rest = parsed.pathname.slice(marker.length)
	if (!rest || rest.includes('..')) return null

	if (!proxy) return `https://github.com${parsed.pathname}`

	const host = publicBaseHost(base)
	if (!host) return null

	return `https://${host}/${repo}/${rest}`
}

export function isPublicReleaseAsset(fileName: string) {
	if (
		!fileName ||
		fileName.startsWith('.') ||
		fileName.includes('..') ||
		fileName.includes('/') ||
		fileName.includes('\\')
	) {
		return false
	}

	if (blockedAsset.test(fileName)) return false
	if (/builder-debug|builder-effective-config|id_rsa|credential/i.test(fileName)) return false

	return checkPlatform(fileName) !== false
}

function safeRelativeAsset(raw: string) {
	if (
		raw.includes('://') ||
		raw.startsWith('//') ||
		raw.includes('..') ||
		raw.includes('\\') ||
		/[?#]/.test(raw)
	) {
		return null
	}

	const fileName = raw.split('/').pop() ?? raw
	if (!isPublicReleaseAsset(fileName)) return null

	return raw
}

type RawLatest = {
	notes?: unknown
	platforms?: Record<string, { signature?: unknown; url?: unknown }>
	pub_date?: unknown
	version?: unknown
}

export type SanitizedLatest = {
	notes?: string
	platforms: Record<string, { signature?: string; url?: string }>
	pub_date?: string
	version?: string
}

export function sanitizeLatestJson(
	raw: RawLatest,
	input: { account: string; base?: string; proxy: boolean; repo: string; token?: string }
) {
	const platforms: SanitizedLatest['platforms'] = {}

	for (const [key, platform] of Object.entries(raw.platforms ?? {})) {
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/.test(key)) continue

		const entry: { signature?: string; url?: string } = {}

		if (typeof platform?.signature === 'string' && !containsToken(platform.signature, input.token)) {
			entry.signature = platform.signature
		}

		if (typeof platform?.url === 'string') {
			const url =
				ownedReleaseUrl(platform.url, input.account, input.repo, input.base, input.proxy) ??
				safeRelativeAsset(platform.url)

			if (url && !containsToken(url, input.token)) entry.url = url
		}

		if (entry.url || entry.signature) platforms[key] = entry
	}

	const result: SanitizedLatest = { platforms }

	if (typeof raw.notes === 'string') result.notes = redactNotes(raw.notes, input.token)
	if (typeof raw.pub_date === 'string' && !containsToken(raw.pub_date, input.token)) {
		result.pub_date = raw.pub_date
	}
	if (typeof raw.version === 'string' && !containsToken(raw.version, input.token))
		result.version = raw.version

	return result
}

export async function fetchRepo(
	raw: string,
	token: string | undefined,
	accept: string,
	account: string,
	repo: string
) {
	if (!isAllowedRepoFetch(raw, account, repo)) throw new Error('Refused GitHub URL')

	const headers: Record<string, string> = { Accept: accept }

	if (token && token.length > 0) headers.Authorization = `token ${token}`

	let response = await fetch(raw, { headers, redirect: 'manual' })

	if (response.status >= 300 && response.status < 400) {
		const apiRedirect = sameRepoApiRedirect(response.headers.get('location') ?? '', token)
		if (apiRedirect) response = await fetch(apiRedirect, { headers, redirect: 'manual' })
	}

	for (let hop = 0; hop < 2 && response.status >= 300 && response.status < 400; hop++) {
		const location = signedDownloadUrl(response.headers.get('location') ?? '', token)
		if (!location) throw new Error('Refused release asset redirect')

		response = await fetch(location, { redirect: 'manual' })
	}

	if (response.status >= 300 && response.status < 400) throw new Error('Refused release asset redirect')

	return response
}

export async function releaseAssetLocation(raw: string, token: string, account: string, repo: string) {
	if (!isAllowedRepoFetch(raw, account, repo)) return null

	const parsed = new URL(raw)
	if (!parsed.pathname.includes('/releases/assets/')) return null

	const response = await fetch(raw, {
		headers: {
			Accept: 'application/octet-stream',
			Authorization: `token ${token}`,
		},
		redirect: 'manual',
	})

	if (response.status < 300 || response.status >= 400) return null

	return signedDownloadUrl(response.headers.get('location') ?? '', token)
}
