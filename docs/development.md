# Development

[Documentation](README.md)

Start with [Getting started](getting-started.md) for requirements and development servers.
Run the commands below from the repository root.

## Table of contents

- [Commands](#commands)
- [Tests](#tests)
- [API schema](#api-schema)
- [Dependencies](#dependencies)

## Commands

| Command | Purpose |
|---|---|
| `pnpm typecheck` | Type-check every package |
| `pnpm test` | Unit tests with Vitest; see [Tests](#tests) for live-server coverage |
| `pnpm build` | Web export to `apps/app/dist` and generated CSS at `packages/tokens/dist/tokens.css` |
| `pnpm desktop:build` | Desktop installers; runs the web export first |
| `pnpm api:sync` | Refresh [packages/api-client/openapi.json](../packages/api-client/openapi.json) from a running instance and regenerate types |
| `pnpm api:generate` | Regenerate [src/schema.ts](../packages/api-client/src/schema.ts) from the committed spec |

Generated build output may not exist until you run its build command. See
[Architecture](architecture.md) for package responsibilities and [Releases](releases.md)
for CI and installer publishing.

## Tests

`pnpm test` runs the unit tests. Set `GOTALK_TEST_INSTANCE=localhost:18080` to also run
discovery and the gateway against a live server:

```sh
GOTALK_TEST_INSTANCE=localhost:18080 pnpm test
```

This environment-variable syntax is for a POSIX shell. Set the variable using your shell's
syntax on other platforms.

## API schema

`pnpm api:sync` defaults to `http://localhost:18080/api/v1/openapi.json`.
`GOTALK_OPENAPI_URL` overrides the source URL. To regenerate types without fetching a
new document, use `pnpm api:generate`.

The backend contract and API documentation live in
[gotalk-server](https://github.com/parkerbrown98/gotalk-server).

## Dependencies

Inside [apps/app](../apps/app), add dependencies with `npx expo install <pkg>` so versions
match the Expo SDK, and run `npx expo-doctor` after dependency changes.
