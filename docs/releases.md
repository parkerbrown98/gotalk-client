# Releases

[Documentation](README.md)

## Table of contents

- [Desktop downloads](#desktop-downloads)
- [Continuous integration](#continuous-integration)
- [Publishing desktop installers](#publishing-desktop-installers)
- [Versioning](#versioning)

## Desktop downloads

Desktop installers are published to [GitHub releases](https://github.com/parkerbrown98/gotalk-client/releases)
for macOS (arm64 and x64), Linux and Windows. Tags with a suffix such as `v0.1.0-beta.1`
are marked as pre-releases.

Installers are currently unsigned, so macOS and Windows show a warning on first launch.
For a local build, see `pnpm desktop:build` in [Development](development.md#commands).

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
