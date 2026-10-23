const aliases: Record<string, string[]> = {
	AppImage: ['appimage'],
	darwin: ['mac', 'macos', 'osx'],
	deb: ['debian'],
	dmg: ['dmg'],
	exe: ['win32', 'windows', 'win'],
	rpm: ['fedora'],
	'tar.gz': ['targz', 'tarball'],
}

for (const existingPlatform of Object.keys(aliases)) {
	const newPlatform = `${existingPlatform}_arm64`
	const list = aliases[existingPlatform]
	if (!list) continue
	aliases[newPlatform] = list.map(alias => `${alias}_arm64`)
}

export default function checkAlias(platform: string): string | false {
	if (typeof aliases[platform] !== 'undefined') return platform

	for (const guess of Object.keys(aliases)) {
		const list = aliases[guess]
		if (list?.includes(platform)) return guess
	}

	return false
}
