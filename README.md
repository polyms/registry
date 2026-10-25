# Polyms Registry

Update server for desktop apps. It reads [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), caches them in memory, and serves download pages plus updater feeds. One [Hono](https://hono.dev) app, deployed as a Vercel function (`src/index.ts`).

Downloads redirect to the GitHub asset. With a token, private assets are fetched through the GitHub API and the client is redirected to the signed URL.

## Setup

Set `ACCOUNT` and `APPS` to the GitHub owner and the repository names that publish the apps, then deploy on Vercel (or run `vercel dev` locally).

Point the updater at the deployment:

```js
const { app, autoUpdater } = require('electron')

const server = '<your-deployment-url>'
const name = '<app-name>'
const url = `${server}/${name}/update/${process.platform}/${app.getVersion()}`

autoUpdater.setFeedURL({ url })
```

Tauri’s updater reads `GET /<app-name>/latest.json`, which returns the `latest.json` asset from that app’s latest GitHub release.

## npm

`GET /npm/<name>` proxies the GitHub Packages packument for every name in `PACKAGES`. `GET /npm/<name>/<version>` returns one manifest from that packument: `<version>` is a SemVer (`1.2.3`) or a dist-tag (`latest`). GitHub Packages answers `/{name}/{version}` with 405, so this host does not call that URL. The consumer does not send a token. The server uses `TOKEN` (GitHub `read:packages`), then rewrites each tarball URL back through this host. A tarball request redirects to GitHub’s signed download URL.

```ini
@polyms:registry=https://registry.polyms.dev/npm
```

```bash
pnpm add @polyms/ui-kit
```

## Environment

| Variable     | Required           | Purpose                                                                                                                        |
| ------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `ACCOUNT`    | yes                | GitHub user or org                                                                                                             |
| `APPS`       | yes                | Comma-separated repository names under `ACCOUNT`, such as `studio` or `studio,other`. At least one name is required.           |
| `INTERVAL`   | no                 | Cache lifetime in minutes. Default `15`                                                                                        |
| `PACKAGES`   | no                 | Comma-separated npm names, such as `@polyms/ui-kit`. Default `@polyms/ui-kit`                                                  |
| `PRE`        | no                 | Any non-empty value caches pre-releases only. Unset caches stable releases only                                                |
| `TOKEN`      | private repos, npm | Classic personal access token (`ghp_`) with `read:packages`. Fine-grained `github_pat_` tokens are rejected by GitHub Packages |
| `PUBLIC_URL` | private repos      | Public base URL written into update payloads. Falls back to `VERCEL_URL`, then `URL`                                           |

`TOKEN` without a base URL fails at startup (`PUBLIC_URL`, `VERCEL_URL`, or `URL` must be set). The npm proxy needs a classic token: GitHub Packages returns 403 for a fine-grained `github_pat_` token. Draft releases are ignored. The release list requests up to 100 releases.

## Routes

### `GET /`

Overview of each app's cached latest release, in list order: version, notes, and a download link per detected platform. Every app links to `/{app}/download/{platform}`.

### `GET /:name/releases`

Release history for one product. Each app is `/:name/releases`, with a title-cased heading. When a release includes `latest.json`, the version on the page is that file's `version`, not the git tag. File links on that page are `/{app}/download/{version}/{file}`. Each npm name in `PACKAGES` is `/{package}/releases`, using the name after the scope. Versions come from that package’s GitHub Packages packument, with the publish time from its `time` map. The same page renders both. An app name wins when it is also a package slug.

Each app name below is one repository from `APPS`. Unknown names → `404`. There is no unscoped `/download`, `/latest.json`, or `/update` alias.

### `GET /:app/latest.json`

Fetches `latest.json` from that app’s latest GitHub release (Tauri updater). In private mode, platform URLs that point at `github.com/<account>/<app>/releases` or at that repo’s release asset API are rewritten to `{base}/{app}/download/{version}/{file}`. `500` when the release or the asset cannot be read.

### `GET /:app/download`

Picks a platform from the `User-Agent`, then redirects to that app’s asset.

- Mac desktop → `dmg` (`darwin` when `?update` is set)
- Windows desktop → `exe`
- iPhone, iPad, and anything else → `404`

### `GET /:app/download/:platform`

Redirects to the cached asset for a platform key or alias. `mac` and `mac_arm64` map to `dmg` / `dmg_arm64` unless `?update` is set. Unknown platform → `500`. No asset → `404`.

### `GET /:app/download/:version/:file`

Redirects to one asset on a tagged release of that app. `:version` must look like `v1` (`v` plus digits). Missing release or asset → `404`.

### `GET /:app/update/:platform/:version`

Electron auto-updater check for that app. `:version` must be SemVer and `:platform` must resolve to a known alias.

- `204` when that platform has no asset, or the cached version equals `:version`
- JSON `{ name, notes, pub_date, url }` when an update is available
- `500` JSON (`version_invalid` or `invalid_platform`) when the inputs do not resolve

In private mode, `url` is `{base}/{app}/download/{platform}?update=true`. Otherwise it is the GitHub asset URL.

### `GET /:app/update/win32/:version/RELEASES`

Squirrel.Windows `RELEASES` body from that app’s cached release, with `.nupkg` names rewritten to absolute asset URLs. `204` when that file was not cached. This route is registered before `/:app/update/:platform/:version`.

## Platforms

An asset is cached when its filename matches one of these. `arm64` or `aarch64` in the name stores it as `<platform>_arm64`.

| Platform   | Filename                                     |
| ---------- | -------------------------------------------- |
| `dmg`      | `.dmg`                                       |
| `exe`      | `.exe`                                       |
| `deb`      | `.deb`                                       |
| `rpm`      | `.rpm`                                       |
| `AppImage` | `.AppImage`                                  |
| `darwin`   | `.zip` whose name contains `mac` or `darwin` |
| `tar.gz`   | `.tar.gz`                                    |

Aliases accepted by `/:app/download/:platform` and `/:app/update/:platform/:version` (each also has an `_arm64` form):

| Platform   | Aliases                   |
| ---------- | ------------------------- |
| `darwin`   | `mac`, `macos`, `osx`     |
| `exe`      | `win32`, `windows`, `win` |
| `deb`      | `debian`                  |
| `rpm`      | `fedora`                  |
| `AppImage` | `appimage`                |
| `dmg`      | `dmg`                     |
| `tar.gz`   | `targz`, `tarball`        |

## Development

[pnpm](https://pnpm.io) `12`. [Vercel CLI](https://vercel.com/docs/cli) for the local server.

```sh
pnpm install
vercel dev
```

```sh
pnpm test    # biome lint, then vitest
pnpm check   # biome check and prettier
```

`createApp` from `src/app.ts` builds the Hono app from the same config object (`account`, `apps`, `packages`, `interval`, `pre`, `token`, `url`). `apps` is required and must contain at least one repository name.
