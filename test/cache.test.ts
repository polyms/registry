import { afterEach, describe, expect, it, vi } from 'vitest'

import Cache from '../src/cache.js'

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('Cache', () => {
	it('should throw when account is not defined', () => {
		expect(() => {
			const config = { repository: 'hyper' }
			new Cache(config)
		}).toThrow(/ACCOUNT/)
	})

	it('should throw when repository is not defined', () => {
		expect(() => {
			const config = { account: 'zeit' }
			new Cache(config)
		}).toThrow(/REPOSITORY/)
	})

	it('should throw when token is defined and url is not', () => {
		expect(() => {
			const config = { account: 'zeit', repository: 'hyper', token: 'abc' }
			new Cache(config)
		}).toThrow(/URL/)
	})

	it('should run without errors', () => {
		const config = {
			account: 'zeit',
			repository: 'hyper',
			token: process.env.TOKEN,
			url: process.env.URL,
		}

		new Cache(config)
	})

	it('should refresh the cache', async () => {
		const config = {
			account: 'zeit',
			repository: 'hyper',
			token: process.env.TOKEN,
			url: process.env.URL,
		}

		const cache = new Cache(config)
		const storage = await cache.loadCache()

		expect(typeof storage.version).toBe('string')
		expect(typeof storage.platforms).toBe('object')
	})

	it('should set platforms correctly', async () => {
		const config = {
			account: 'zeit',
			repository: 'hyper',
			token: process.env.TOKEN,
			url: process.env.URL,
		}

		const cache = new Cache(config)
		const storage = await cache.loadCache()

		console.log(storage.platforms?.darwin)
	})

	it('does not follow a release list redirect to another repository', async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (String(url).includes('/repos/other/secret')) return Response.json([{ tag_name: 'v9.9.9' }])

			return new Response(null, {
				headers: { Location: 'https://api.github.com/repos/other/secret/releases?per_page=100' },
				status: 301,
			})
		})
		vi.stubGlobal('fetch', fetchMock)

		const cache = new Cache({ account: 'zeit', repository: 'hyper', url: 'https://registry.example' })

		await expect(cache.loadCache()).rejects.toThrow(/Refused release asset redirect/)
		expect(fetchMock.mock.calls.map(call => String(call[0])).join('\n')).not.toContain('other/secret')
	})
})
