import { raw } from 'hono/html'

import { Page } from './layout.js'

export type PackageReleaseView = {
	date: string
	version: string
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

export function PackageReleasesPage(props: {
	name: string
	product: string
	releases: PackageReleaseView[]
}) {
	return (
		<Page title={`${props.product} releases`}>
			<p class='eyebrow'>Releases</p>
			<h1>{props.product}</h1>
			<a class='more' href='/'>
				Latest
			</a>
			{props.releases.length === 0 ? (
				<p class='empty'>No releases yet.</p>
			) : (
				<div class='files'>
					{props.releases.map(release => {
						const command = `pnpm add ${props.name}@${release.version}`

						return (
							<div class='file' key={release.version}>
								<span class='file-copy'>
									<span class='released'>
										<span class='version'>{release.version}</span>
										{release.date ? <span class='when'>{release.date}</span> : null}
									</span>
									<code class='file-path'>{command}</code>
								</span>
								<button class='copy' data-copy={command} type='button'>
									Copy
								</button>
							</div>
						)
					})}
				</div>
			)}
			<script>{raw(copyScript)}</script>
		</Page>
	)
}

export function renderPackageReleases(product: string, name: string, releases: PackageReleaseView[]) {
	return `<!DOCTYPE html>${PackageReleasesPage({ name, product, releases }).toString()}`
}
