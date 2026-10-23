import { extname } from 'node:path'

const directCache = ['exe', 'dmg', 'rpm', 'deb', 'AppImage', 'tar.gz']

export default function checkPlatform(fileName: string): string | false {
	const extension = fileName.endsWith('.tar.gz') ? 'tar.gz' : extname(fileName).slice(1)
	const arch = fileName.includes('arm64') || fileName.includes('aarch64') ? '_arm64' : ''

	if ((fileName.includes('mac') || fileName.includes('darwin')) && extension === 'zip') {
		return `darwin${arch}`
	}

	return directCache.includes(extension) ? extension + arch : false
}
