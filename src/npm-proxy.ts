import type { Context, Env, Hono } from 'hono'

import { containsToken, signedDownloadUrl } from './github-guard.js'

const GITHUB_NPM = 'https://npm.pkg.github.com'
const TARBALL_PREFIX = `${GITHUB_NPM}/download/`
const repoConfigKeys = ['bugs', 'directories', 'funding', 'homepage', 'repository'] as const

type VersionDoc = {
	dist?: { tarball?: string }
}

type Packument = {
	versions?: Record<string, VersionDoc>
}

type NpmDocument = Packument & VersionDoc

type TarballRef = {
	id: string
	name: string
	version: string
}

type NpmPath =
	| { kind: 'manifest'; name: string; spec: string }
	| { kind: 'packument'; name: string }
	| { kind: 'tarball'; ref: TarballRef }

function stripRepoConfig(record: object) {
	const target = record as Record<string, unknown>

	for (const key of repoConfigKeys) delete target[key]
}

function samePackageTarball(raw: string, name: string, token?: string) {
	if (containsToken(raw, token)) return null

	let parsed: URL
	try {
		parsed = new URL(raw)
	} catch {
		return null
	}

	if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null

	parsed.search = ''
	parsed.hash = ''

	let path = parsed.pathname
	try {
		path = decodeURIComponent(parsed.pathname)
	} catch {
		return null
	}

	if (parsed.hostname === 'npm.pkg.github.com') {
		if (!path.startsWith(`/download/${name}/`)) return null

		return parsed.toString()
	}

	if (parsed.hostname === 'registry.npmjs.org' && path.startsWith(`/${name}/`)) return parsed.toString()

	return null
}

function rewriteVersion<T extends VersionDoc>(version: T, origin: string, name: string, token?: string): T {
	stripRepoConfig(version)

	const dist = version.dist
	if (!dist?.tarball) return version

	const cleaned = samePackageTarball(dist.tarball, name, token)
	if (!cleaned) {
		delete dist.tarball
		return version
	}

	if (!cleaned.startsWith(TARBALL_PREFIX)) {
		dist.tarball = cleaned
		return version
	}

	dist.tarball = `${origin}/npm/download/${cleaned.slice(TARBALL_PREFIX.length)}`
	return version
}

export function rewritePackument(
	packument: Packument,
	origin: string,
	name: string,
	token?: string
): Packument {
	stripRepoConfig(packument)

	const versions = packument.versions
	if (!versions) return packument

	for (const version of Object.values(versions)) rewriteVersion(version, origin, name, token)

	return packument
}

export function rewriteManifest(
	document: NpmDocument,
	origin: string,
	name: string,
	token?: string
): NpmDocument {
	if (document.versions) return rewritePackument(document, origin, name, token)

	return rewriteVersion(document, origin, name, token)
}

function isSafeSegment(value: string): boolean {
	return value.length > 0 && value.length < 256 && !value.includes('..') && !value.includes('\\')
}

function isVersionSpec(value: string): boolean {
	return isSafeSegment(value) && /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(value)
}

function parseNpmPath(pathname: string, allowed: Set<string>): NpmPath | null {
	const prefix = '/npm/'
	if (!pathname.startsWith(prefix)) return null

	let rest = pathname.slice(prefix.length)
	try {
		rest = decodeURIComponent(rest)
	} catch {
		return null
	}

	if (!rest || rest.includes('..')) return null

	if (rest.startsWith('download/')) {
		const parts = rest.split('/')
		if (parts.length !== 5) return null

		const [, scope, pkg, version, id] = parts
		if (!scope?.startsWith('@') || !pkg || !version || !id) return null
		if (![scope, pkg, version, id].every(isSafeSegment)) return null

		const name = `${scope}/${pkg}`
		if (!allowed.has(name)) return null

		return { kind: 'tarball', ref: { id, name, version } }
	}

	const parts = rest.split('/')
	if (parts.length !== 2 && parts.length !== 3) return null

	const [scope, pkg, spec] = parts
	if (!scope?.startsWith('@') || !pkg) return null
	if (!isSafeSegment(scope) || !isSafeSegment(pkg)) return null

	const name = `${scope}/${pkg}`
	if (!allowed.has(name)) return null

	if (spec === undefined) return { kind: 'packument', name }
	if (!isVersionSpec(spec)) return null

	return { kind: 'manifest', name, spec }
}

function upstreamPackumentUrl(name: string): string {
	const slash = name.indexOf('/')
	return `${GITHUB_NPM}/${name.slice(0, slash)}%2F${name.slice(slash + 1)}`
}

function upstreamManifestUrl(name: string, spec: string): string {
	return `${upstreamPackumentUrl(name)}/${encodeURIComponent(spec)}`
}

function upstreamTarballUrl(ref: TarballRef): string {
	const slash = ref.name.indexOf('/')
	const scope = ref.name.slice(0, slash)
	const pkg = ref.name.slice(slash + 1)
	return `${GITHUB_NPM}/download/${scope}/${encodeURIComponent(pkg)}/${encodeURIComponent(ref.version)}/${encodeURIComponent(ref.id)}`
}

function authHeaders(token: string, accept: string | undefined): Record<string, string> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		'User-Agent': 'polyms-registry',
	}

	if (accept) headers.Accept = accept

	return headers
}

function redirectStatus(status: number): 301 | 302 | 303 | 307 | 308 {
	if (status === 301 || status === 303 || status === 307 || status === 308) return status
	return 302
}

function assertNpmUrl(raw: string) {
	const parsed = new URL(raw)
	if (parsed.protocol !== 'https:' || parsed.hostname !== 'npm.pkg.github.com') {
		throw new Error('Refused npm URL')
	}
	if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Refused npm URL')
}

async function proxyDocument(
	c: Context,
	token: string,
	upstreamUrl: string,
	rewrite: (document: NpmDocument, origin: string) => NpmDocument
): Promise<Response> {
	assertNpmUrl(upstreamUrl)

	const upstream = await fetch(upstreamUrl, {
		headers: authHeaders(token, c.req.header('accept')),
		method: c.req.method,
		redirect: 'manual',
	})

	if (c.req.method === 'HEAD') return c.body(null, upstream.status as 200)

	if (upstream.status >= 300 && upstream.status < 400) {
		return c.json({ error: 'upstream_error' }, 502)
	}

	if (!upstream.ok) return c.json({ error: 'upstream_error' }, upstream.status as 502)

	let document: NpmDocument
	try {
		document = (await upstream.json()) as NpmDocument
	} catch {
		return c.json({ error: 'upstream_error' }, 502)
	}

	const origin = new URL(c.req.url).origin
	const rewritten = rewrite(document, origin)
	if (containsToken(JSON.stringify(rewritten), token)) return c.json({ error: 'upstream_error' }, 502)

	return c.json(rewritten)
}

async function proxyTarball(c: Context, token: string, ref: TarballRef): Promise<Response> {
	const upstreamUrl = upstreamTarballUrl(ref)
	assertNpmUrl(upstreamUrl)

	const upstream = await fetch(upstreamUrl, {
		headers: authHeaders(token, 'application/octet-stream'),
		method: c.req.method,
		redirect: 'manual',
	})

	if (upstream.status >= 300 && upstream.status < 400) {
		const location = signedDownloadUrl(upstream.headers.get('location') ?? '', token)
		if (!location) return c.json({ error: 'upstream_error' }, 502)
		return c.redirect(location, redirectStatus(upstream.status))
	}

	if (!upstream.ok) return c.json({ error: 'upstream_error' }, upstream.status as 502)

	if (c.req.method === 'HEAD') return c.body(null, 200)

	const headers: Record<string, string> = {}
	const type = upstream.headers.get('content-type')
	if (type) headers['content-type'] = type
	const length = upstream.headers.get('content-length')
	if (length) headers['content-length'] = length

	return new Response(upstream.body, { headers, status: 200 })
}

export function mountNpmProxy(app: Hono<Env>, options: { packages: string[]; token?: string }) {
	const token = options.token
	const allowed = new Set(options.packages)

	app.on(['GET', 'HEAD'], '/npm/*', async c => {
		if (!token) return c.json({ error: 'registry_unconfigured' }, 500)

		const parsed = parseNpmPath(c.req.path, allowed)
		if (!parsed) return c.text('Not found', 404)

		if (parsed.kind === 'packument') {
			return proxyDocument(c, token, upstreamPackumentUrl(parsed.name), (document, origin) =>
				rewritePackument(document, origin, parsed.name, token)
			)
		}

		if (parsed.kind === 'manifest') {
			return proxyDocument(c, token, upstreamManifestUrl(parsed.name, parsed.spec), (document, origin) =>
				rewriteManifest(document, origin, parsed.name, token)
			)
		}

		return proxyTarball(c, token, parsed.ref)
	})
}
