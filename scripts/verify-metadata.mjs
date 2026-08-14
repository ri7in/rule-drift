import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { PACKAGE_NAME, VERSION } from '../dist/version.js';

const packageMetadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const serverMetadata = JSON.parse(await readFile(new URL('../server.json', import.meta.url)));
const [registryPackage] = serverMetadata.packages ?? [];

assert.equal(PACKAGE_NAME, packageMetadata.name, 'Compiled package name is out of sync.');
assert.equal(VERSION, packageMetadata.version, 'Compiled package version is out of sync.');
assert.equal(serverMetadata.name, packageMetadata.mcpName, 'MCP names are out of sync.');
assert.equal(serverMetadata.version, packageMetadata.version, 'MCP version is out of sync.');
assert.equal(registryPackage?.identifier, packageMetadata.name, 'MCP package name is out of sync.');
assert.equal(
  registryPackage?.version,
  packageMetadata.version,
  'MCP package version is out of sync.',
);
assert.deepEqual(
  registryPackage?.packageArguments,
  [{ type: 'positional', value: 'mcp' }],
  'MCP package arguments must start the server.',
);
