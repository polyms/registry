import { raw } from 'hono/html'
import type { Child } from 'hono/jsx'

import { markSvg } from './mark.js'

const faviconSvg = 'https://polyms.dev/favicon/favicon.svg'

const pageStyle = `
:root{color-scheme:dark;--bg:#09090b;--fg:#fafafa;--muted:#a1a1aa;--line:rgba(255,255,255,.12);--orange:oklch(75% .19 48);--color-primary-500:oklch(75% .19 48)}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background-color:var(--bg);background-image:radial-gradient(rgba(249,115,22,.22) 1px,transparent 1px);background-size:18px 18px;color:var(--fg);font-family:Quicksand,Inter,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji";-webkit-font-smoothing:antialiased}
main{width:min(560px,calc(100% - 40px));margin:0 auto;padding:72px 0 80px}
.mark{position:relative;display:inline-flex;align-items:center;padding:10px 22px;border:1px solid var(--line);border-radius:999px;background:oklab(0.21 -0.00188151 -0.0179014 / 0.55);color:var(--fg);text-decoration:none}
.mark-lockup{display:inline-flex;align-items:center}
.mark-lockup svg{display:block;width:32px;height:32px;flex:none}
.mark-word{font-size:16px;font-weight:700;letter-spacing:-0.4px;line-height:1}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.eyebrow{margin:48px 0 0;color:var(--orange);font-size:13px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
h1{margin:10px 0 0;font-size:64px;line-height:.95;letter-spacing:-0.04em;font-weight:700}
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
`

export function Page(props: { children?: Child; title: string }) {
	return (
		<html lang='en'>
			<head>
				<meta charset='utf-8' />
				<meta content='width=device-width, initial-scale=1' name='viewport' />
				<meta content='#f97316' name='theme-color' />
				<title>{props.title}</title>
				<link href='https://fonts.googleapis.com' rel='preconnect' />
				<link crossOrigin='' href='https://fonts.gstatic.com' rel='preconnect' />
				<link
					href='https://fonts.googleapis.com/css2?family=Quicksand:wght@500..700&display=swap'
					rel='stylesheet'
				/>
				<link href={faviconSvg} rel='icon' type='image/svg+xml' />
				<link href='https://polyms.dev/favicon/favicon-32x32.png' rel='icon' sizes='32x32' type='image/png' />
				<link href='https://polyms.dev/favicon/favicon-180x180.png' rel='apple-touch-icon' sizes='180x180' />
				<link
					href='https://polyms.dev/favicon/favicon-192x192.png'
					rel='icon'
					sizes='192x192'
					type='image/png'
				/>
				<link
					href='https://polyms.dev/favicon/favicon-512x512.png'
					rel='icon'
					sizes='512x512'
					type='image/png'
				/>
				<link href='https://polyms.dev/manifest.json' rel='manifest' />
				<style>{raw(pageStyle)}</style>
			</head>
			<body>
				<main>
					<a class='mark' href='https://polyms.dev'>
						<span class='mark-lockup'>
							{raw(markSvg)}
							<span class='sr'>P</span>
							<span class='mark-word'>olyms</span>
						</span>
					</a>
					{props.children}
				</main>
			</body>
		</html>
	)
}
