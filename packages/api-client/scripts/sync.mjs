// Refreshes the committed OpenAPI snapshot from a running instance.
// Usage: GOTALK_OPENAPI_URL=https://forum.example/api/v1/openapi.json pnpm api:sync
import { writeFile } from 'node:fs/promises';

const url = process.env.GOTALK_OPENAPI_URL ?? 'http://localhost:18080/api/v1/openapi.json';
const res = await fetch(url);
if (!res.ok) {
  console.error(`GET ${url} -> ${res.status} ${res.statusText}`);
  process.exit(1);
}
const spec = await res.json();
await writeFile(new URL('../openapi.json', import.meta.url), JSON.stringify(spec, null, 2) + '\n');
console.log(`synced openapi.json from ${url} (${Object.keys(spec.paths ?? {}).length} paths)`);
