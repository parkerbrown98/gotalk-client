# Releases

[Documentation](README.md)

## Table of contents

- [Desktop downloads](#desktop-downloads)
- [Hosting the web export](#hosting-the-web-export)
- [Continuous integration](#continuous-integration)
- [Publishing desktop installers](#publishing-desktop-installers)
- [Versioning](#versioning)

## Desktop downloads

Desktop installers are published to [GitHub releases](https://github.com/parkerbrown98/gotalk-client/releases)
for macOS (arm64 and x64), Linux and Windows. Tags with a suffix such as `v0.1.0-beta.1`
are marked as pre-releases.

macOS builds are signed with a Developer ID Application certificate and notarized in the release workflow (requires the `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` repository secrets). Windows installers are currently unsigned, so Windows shows a SmartScreen warning on first launch.
For a local build, see `pnpm desktop:build` in [Development](development.md#commands).

## Hosting the web export

The web export is a single-page app, so any static host works as long as it falls back to `index.html` for
unknown paths.

The official deployment at `app.gotalk.sh` must not be indexed by search engines, because public forum content
is indexed from [gotalk.sh](https://gotalk.sh) and the app would only compete with those pages. The export
already carries a `<meta name="robots" content="noindex">` tag in
[index.html](../apps/app/public/index.html), and [public/_headers](../apps/app/public/_headers) sets
`X-Robots-Tag: noindex` on hosts that read that file (Cloudflare Pages and Netlify). On any other host, add the
header in the host's own configuration.

Do not add a `robots.txt` that disallows crawling. A crawler that cannot fetch the page never sees the
`noindex` instruction, and the URL can still be listed.

## Continuous integration

[CI](../.github/workflows/ci.yml) type-checks, tests and builds the web export, and lints
the Tauri crate with `cargo clippy`, on every pull request and push to `main`.

## Publishing desktop installers

Pushing a `v*` tag runs [the release workflow](../.github/workflows/release.yml). It re-runs
CI, builds desktop installers for every platform above, and publishes them to a GitHub
release.

## Versioning

Before tagging, update `version` in:

- [apps/desktop/src-tauri/tauri.conf.json](../apps/desktop/src-tauri/tauri.conf.json).
- [apps/desktop/src-tauri/Cargo.toml](../apps/desktop/src-tauri/Cargo.toml).
- [apps/desktop/package.json](../apps/desktop/package.json).

The workflow fails if the tag's version does not match `tauri.conf.json`.
