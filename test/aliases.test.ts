import { describe, expect, it } from 'vitest'

import checkAlias from '../src/aliases.js'

describe('Aliases', () => {
	it('Should return the correct platform', () => {
		const result = checkAlias('mac')
		expect(result).toBe('darwin')
	})

	it('Should return the platform when the platform is provided', () => {
		const result = checkAlias('darwin')
		expect(result).toBe('darwin')
	})

	it('Should return tar.gz when that platform is provided', () => {
		const result = checkAlias('tar.gz')
		expect(result).toBe('tar.gz')
	})

	it('Should return false if no platform is found', () => {
		const result = checkAlias('test')
		expect(result).toBe(false)
	})
})
