import type { Context, Env, Hono } from 'hono'

const GITHUB_NPM = 'https://npm.pkg.github.com'
const TARBALL_PREFIX = `${GITHUB_NPM}/download/`

type Packument = {
	versions?: Record<string, { dist?: { tarball?: string } }>
}

type TarballRef = {
	id: string
	name: string
	version: string
}

type NpmPath = { kind: 'packument'; name: string } | { kind: 'tarball'; ref: TarballRef }

export function rewritePackument(packument: Packument, origin: string): Packument {
	const versions = packument.versions
	if (!versions) return packument

	for (const version of Object.values(versions)) {
		const dist = version.dist
		if (!dist?.tarball?.startsWith(TARBALL_PREFIX)) continue
		dist.tarball = `${origin}/npm/download/${dist.tarball.slice(TARBALL_PREFIX.length)}`
	}

	return packument
}

function isSafeSegment(value: string): boolean {
	return value.length > 0 && value.length < 256 && !value.includes('..') && !value.includes('\\')
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
	if (parts.length !== 2) return null

	const [scope, pkg] = parts
	if (!scope?.startsWith('@') || !pkg) return null
	if (!isSafeSegment(scope) || !isSafeSegment(pkg)) return null

	const name = `${scope}/${pkg}`
	if (!allowed.has(name)) return null

	return { kind: 'packument', name }
}

function upstreamPackumentUrl(name: string): string {
	const slash = name.indexOf('/')
	return `${GITHUB_NPM}/${name.slice(0, slash)}%2F${name.slice(slash + 1)}`
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

async function proxyPackument(c: Context, token: string, name: string): Promise<Response> {
	const upstream = await fetch(upstreamPackumentUrl(name), {
		headers: authHeaders(token, c.req.header('accept')),
		method: c.req.method,
		redirect: 'manual',
	})

	if (c.req.method === 'HEAD') return c.body(null, upstream.status as 200)

	if (upstream.status >= 300 && upstream.status < 400) {
		return c.json({ error: 'upstream_error' }, 502)
	}

	if (!upstream.ok) return c.json({ error: 'upstream_error' }, upstream.status as 502)

	let packument: Packument
	try {
		packument = (await upstream.json()) as Packument
	} catch {
		return c.json({ error: 'upstream_error' }, 502)
	}

	const origin = new URL(c.req.url).origin
	return c.json(rewritePackument(packument, origin))
}

async function proxyTarball(c: Context, token: string, ref: TarballRef): Promise<Response> {
	const upstream = await fetch(upstreamTarballUrl(ref), {
		headers: authHeaders(token, 'application/octet-stream'),
		method: c.req.method,
		redirect: 'manual',
	})

	if (upstream.status >= 300 && upstream.status < 400) {
		const location = upstream.headers.get('location')
		if (!location) return c.body(null, redirectStatus(upstream.status))
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

		if (parsed.kind === 'packument') return proxyPackument(c, token, parsed.name)
		return proxyTarball(c, token, parsed.ref)
	})
}
