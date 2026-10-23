import { Page } from './layout.js'

export type ReleaseFileView = {
	href: string
	name: string
	path: string
	size?: number
}

export type ReleaseView = {
	date: string
	files: ReleaseFileView[]
	version: string
}

export function ReleasesPage(props: { product: string; releases: ReleaseView[] }) {
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
				props.releases.map(release => (
					<section class='release' key={release.version}>
						<h2>{release.version}</h2>
						{release.date ? <p class='released'>{release.date}</p> : null}
						<div class='files'>
							{release.files.length === 0 ? (
								<p class='empty'>No downloads in this release.</p>
							) : (
								release.files.map(file => (
									<a class='file' href={file.href} key={file.href}>
										<span class='file-copy'>
											<span class='file-name'>{file.name}</span>
											<span class='file-path'>{file.path}</span>
										</span>
										{file.size !== undefined ? <span class='file-size'>{file.size} MB</span> : null}
									</a>
								))
							)}
						</div>
					</section>
				))
			)}
		</Page>
	)
}

export function renderReleases(product: string, releases: ReleaseView[]) {
	return `<!DOCTYPE html>${ReleasesPage({ product, releases }).toString()}`
}
