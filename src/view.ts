export type OverviewFile = {
	name: string
	size: number
	url: string
}

export type OverviewDetails = {
	date: string
	files: Record<string, OverviewFile>
	notes: string
	product: string
	version: string
}

const faviconSvg = 'https://polyms.dev/favicon/favicon.svg'

const platformOrder = ['dmg', 'exe', 'deb', 'rpm', 'AppImage', 'darwin', 'tar.gz']

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
}

function platformRank(platform: string) {
	const base = platform.replace(/_arm64$/, '')
	const index = platformOrder.indexOf(base)
	return index === -1 ? platformOrder.length : index
}

export function renderOverview(details: OverviewDetails) {
	const productName = details.product
		? `${details.product.charAt(0).toUpperCase()}${details.product.slice(1)}`
		: 'Release'
	const product = escapeHtml(productName)
	const date = escapeHtml(details.date)
	const version = escapeHtml(details.version)
	const notes = escapeHtml(details.notes).trim()

	const files = Object.entries(details.files)
		.sort(([left], [right]) => platformRank(left) - platformRank(right) || left.localeCompare(right))
		.map(([platform, file]) => {
			const label = escapeHtml(platform)
			const name = escapeHtml(file.name || platform)
			const href = escapeHtml(file.url)
			const size = escapeHtml(String(file.size))

			return `<a class="file" href="${href}"><span class="file-copy"><span class="file-name">${name}</span><span class="file-path">/download/${label}</span></span><span class="file-size">${size} MB</span></a>`
		})
		.join('')

	const fileList = files || '<p class="empty">No downloads in this release.</p>'
	const noteBlock = notes ? `<p class="notes">${notes}</p>` : ''
	const when = date ? `<span class="when">${date}</span>` : ''

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f97316">
<title>${product}</title>
<link rel="icon" href="${faviconSvg}" type="image/svg+xml">
<link rel="icon" href="https://polyms.dev/favicon/favicon-32x32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" sizes="180x180" href="https://polyms.dev/favicon/favicon-180x180.png">
<link rel="icon" href="https://polyms.dev/favicon/favicon-192x192.png" sizes="192x192" type="image/png">
<link rel="icon" href="https://polyms.dev/favicon/favicon-512x512.png" sizes="512x512" type="image/png">
<link rel="manifest" href="https://polyms.dev/manifest.json">
<style>
:root{color-scheme:dark;--bg:#09090b;--fg:#fafafa;--muted:#a1a1aa;--line:rgba(255,255,255,.08);--orange:#f97316}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background-color:var(--bg);background-image:radial-gradient(rgba(249,115,22,.22) 1px,transparent 1px);background-size:18px 18px;color:var(--fg);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{width:min(560px,calc(100% - 40px));margin:0 auto;padding:72px 0 80px}
.mark{display:inline-flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border:1px solid var(--line);border-radius:999px;background:rgba(9,9,11,.8);color:var(--fg);text-decoration:none}
.mark img{width:28px;height:28px;display:block}
.mark span{font-weight:600;letter-spacing:-.02em}
.eyebrow{margin:48px 0 0;color:var(--orange);font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
h1{margin:10px 0 0;font-size:64px;line-height:.95;letter-spacing:-.045em;font-weight:500}
.released{display:flex;align-items:center;gap:10px;margin:18px 0 0;color:var(--muted);font-size:15px}
.version{padding:2px 8px;border-radius:999px;background:var(--orange);color:#09090b;font-size:13px;font-weight:700}
.notes{margin:28px 0 0;color:var(--muted);white-space:pre-wrap;line-height:1.5}
.files{display:flex;flex-direction:column;gap:10px;margin:36px 0 0;padding:0}
.file{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border:1px solid var(--line);border-radius:16px;background:rgba(9,9,11,.72);color:inherit;text-decoration:none}
.file:hover{border-color:rgba(249,115,22,.7)}
.file-copy{display:flex;flex-direction:column;gap:4px;min-width:0}
.file-name{font-weight:600;overflow-wrap:anywhere}
.file-path{color:var(--muted);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.file-size{color:var(--muted);white-space:nowrap}
.empty{margin:36px 0 0;color:var(--muted)}
</style>
</head>
<body>
<main>
<a class="mark" href="https://polyms.dev"><img src="${faviconSvg}" alt=""><span>Polyms</span></a>
<p class="eyebrow">Downloads</p>
<h1>${product}</h1>
<p class="released"><span class="version">${version}</span>${when}</p>
${noteBlock}
<div class="files">
${fileList}
</div>
</main>
</body>
</html>`
}
