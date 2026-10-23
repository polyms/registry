export type DownloadTarget = 'darwin' | 'dmg' | 'exe'

const appleMobile = /iPhone|iPad|iPod/i
const macDesktop = /Macintosh|Mac OS X/i
const windowsNt = /Windows NT/i
const windowsPhone = /Windows Phone/i

export function downloadTarget(userAgent: string, isUpdate: boolean): DownloadTarget | null {
	if (appleMobile.test(userAgent)) return null
	if (macDesktop.test(userAgent)) return isUpdate ? 'darwin' : 'dmg'
	if (windowsNt.test(userAgent) && !windowsPhone.test(userAgent)) return 'exe'
	return null
}
