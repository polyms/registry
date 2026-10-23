import { Page } from './layout.js'

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

const platformOrder = ['dmg', 'exe', 'deb', 'rpm', 'AppImage', 'darwin', 'tar.gz']

function platformRank(platform: string) {
	const base = platform.replace(/_arm64$/, '')
	const index = platformOrder.indexOf(base)
	return index === -1 ? platformOrder.length : index
}

function productTitle(product: string) {
	if (!product) return 'Release'
	return `${product.charAt(0).toUpperCase()}${product.slice(1)}`
}

export function OverviewPage(details: OverviewDetails) {
	const product = productTitle(details.product)
	const notes = details.notes.trim()
	const files = Object.entries(details.files).sort(
		([left], [right]) => platformRank(left) - platformRank(right) || left.localeCompare(right)
	)

	return (
		<Page title={product}>
			<p class='eyebrow'>Downloads</p>
			<h1>{product}</h1>
			<p class='released'>
				<span class='version'>{details.version}</span>
				{details.date ? <span class='when'>{details.date}</span> : null}
			</p>
			{notes ? <p class='notes'>{notes}</p> : null}
			<div class='files'>
				{files.length === 0 ? (
					<p class='empty'>No downloads in this release.</p>
				) : (
					files.map(([platform, file]) => (
						<a class='file' href={file.url} key={platform}>
							<span class='file-copy'>
								<span class='file-name'>{file.name || platform}</span>
								<span class='file-path'>/download/{platform}</span>
							</span>
							<span class='file-size'>{file.size} MB</span>
						</a>
					))
				)}
			</div>
		</Page>
	)
}

export function renderOverview(details: OverviewDetails) {
	return `<!DOCTYPE html>${OverviewPage(details).toString()}`
}
