import { raw } from 'hono/html'

import { Page } from './layout.js'

export type OverviewFile = {
	name: string
	size: number
	url: string
}

export type OverviewPackage = {
	date: string
	name: string
	releasesHref: string
	title: string
	version: string
}

export type OverviewApp = {
	date: string
	files: Record<string, OverviewFile>
	notes: string
	product: string
	releasesHref: string
	version: string
}

export type OverviewDetails = {
	apps: OverviewApp[]
	packages: OverviewPackage[]
}

const copyScript = `document.querySelectorAll('[data-copy]').forEach((button) => {
	button.addEventListener('click', () => {
		const command = button.getAttribute('data-copy')
		if (!command || !navigator.clipboard) return
		navigator.clipboard.writeText(command).then(() => {
			button.textContent = 'Copied'
			window.setTimeout(() => {
				button.textContent = 'Copy'
			}, 1600)
		}, () => {})
	})
})`

const platformOrder = ['dmg', 'exe', 'deb', 'rpm', 'AppImage', 'darwin', 'tar.gz']

function platformRank(platform: string) {
	const base = platform.replace(/_arm64$/, '')
	const index = platformOrder.indexOf(base)
	return index === -1 ? platformOrder.length : index
}

export function productTitle(product: string) {
	if (!product) return 'Release'
	return `${product.charAt(0).toUpperCase()}${product.slice(1)}`
}

function AppBlock(app: OverviewApp) {
	const product = productTitle(app.product)
	const notes = app.notes.trim()
	const files = Object.entries(app.files).sort(
		([left], [right]) => platformRank(left) - platformRank(right) || left.localeCompare(right)
	)

	return (
		<article class='product' key={app.product}>
			<h3 class='display'>{product}</h3>
			<p class='released'>
				{app.version ? <span class='version'>{app.version}</span> : null}
				{app.date ? <span class='when'>{app.date}</span> : null}
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
								<span class='file-path'>{file.url}</span>
							</span>
							<span class='file-size'>{file.size} MB</span>
						</a>
					))
				)}
			</div>
			<a class='more' href={app.releasesHref}>
				All {product} releases
			</a>
		</article>
	)
}

export function OverviewPage(details: OverviewDetails) {
	return (
		<Page home title='Polyms'>
			<div class='columns'>
				<section class='catalog'>
					<h2 class='eyebrow'>Apps</h2>
					{details.apps.map(app => (
						<AppBlock {...app} key={app.product} />
					))}
				</section>
				{details.packages.length > 0 ? (
					<section class='catalog'>
						<h2 class='eyebrow'>Packages</h2>
						{details.packages.map(pkg => {
							const commands = [`pnpm add ${pkg.name}`, `npm install ${pkg.name}`, `yarn add ${pkg.name}`]

							return (
								<article class='product' key={pkg.name}>
									<h3 class='display'>{pkg.title}</h3>
									{pkg.version ? (
										<p class='released'>
											<span class='version'>{pkg.version}</span>
											{pkg.date ? <span class='when'>{pkg.date}</span> : null}
										</p>
									) : (
										<p class='empty'>No release yet.</p>
									)}
									<div class='files'>
										{commands.map(command => (
											<div class='file' key={command}>
												<code class='file-path'>{command}</code>
												<button class='copy' data-copy={command} type='button'>
													Copy
												</button>
											</div>
										))}
									</div>
									<a class='more' href={pkg.releasesHref}>
										All {pkg.title} releases
									</a>
								</article>
							)
						})}
					</section>
				) : null}
			</div>
			<script>{raw(copyScript)}</script>
		</Page>
	)
}

export function renderOverview(details: OverviewDetails) {
	return `<!DOCTYPE html>${OverviewPage(details).toString()}`
}
