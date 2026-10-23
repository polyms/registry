const aliases = {
	AppImage: ['appimage'],
	darwin: ['mac', 'macos', 'osx'],
	deb: ['debian'],
	dmg: ['dmg'],
	exe: ['win32', 'windows', 'win'],
	rpm: ['fedora'],
}

for (const existingPlatform of Object.keys(aliases)) {
	const newPlatform = `${existingPlatform}_arm64`
	aliases[newPlatform] = aliases[existingPlatform].map(alias => `${alias}_arm64`)
}

module.exports = platform => {
	if (typeof aliases[platform] !== 'undefined') {
		return platform
	}

	for (const guess of Object.keys(aliases)) {
		const list = aliases[guess]

		if (list.includes(platform)) {
			return guess
		}
	}

	return false
}
