import { describe, expect, it } from 'vitest'

import checkPlatform from '../src/platform.js'

describe('Platform', () => {
	it('Should parse mac', () => {
		const result = checkPlatform('hyper-2.1.1-mac.zip')
		expect(result).toBe('darwin')
	})

	it('Should parse other platforms', () => {
		const result = checkPlatform('hyper_2.1.1_amd64.deb')
		expect(result).toBe('deb')
	})

	it('Should parse dmg', () => {
		const result = checkPlatform('hyper-2.1.1.dmg')
		expect(result).toBe('dmg')
	})

	it('Should parse tar.gz', () => {
		const result = checkPlatform('Polyms.Studio_0.2.8_universal.app.tar.gz')
		expect(result).toBe('tar.gz')
	})

	it('Should parse arm64 tar.gz', () => {
		const result = checkPlatform('Polyms.Studio_0.2.8_aarch64.app.tar.gz')
		expect(result).toBe('tar.gz_arm64')
	})

	it('Should return false for unknown files', () => {
		const result = checkPlatform('hi.txt')
		expect(result).toBe(false)
	})
})
