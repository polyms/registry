import { describe, expect, it } from 'vitest'

import { downloadTarget } from '../src/download-target.js'

const mac =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const windows =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const iphone =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

describe('downloadTarget', () => {
	it('maps a Mac browser to dmg', () => {
		expect(downloadTarget(mac, false)).toBe('dmg')
	})

	it('maps a Mac update check to darwin', () => {
		expect(downloadTarget(mac, true)).toBe('darwin')
	})

	it('maps Windows to exe', () => {
		expect(downloadTarget(windows, false)).toBe('exe')
	})

	it('does not treat iPhone as Mac', () => {
		expect(downloadTarget(iphone, false)).toBeNull()
	})

	it('returns null for an empty user agent', () => {
		expect(downloadTarget('', false)).toBeNull()
	})
})
