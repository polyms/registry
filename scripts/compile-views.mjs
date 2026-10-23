// Vercel traces `from './overview.js'` by retrying `overview.ts` only.
// The pages are `.tsx`, so they never land in the function. Emit `.js` beside them.

import { spawnSync } from 'node:child_process'
import { cpSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc')
const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.views.json'], { stdio: 'inherit' })

if (result.error) {
	console.error(result.error)
	process.exit(1)
}

if (result.status !== 0) process.exit(result.status ?? 1)

const outDir = 'dist/views'
const destDir = 'src/views'

for (const name of readdirSync(outDir)) {
	if (!name.endsWith('.js')) continue
	cpSync(join(outDir, name), join(destDir, name))
}
