#!/usr/bin/env node
// Run with: npm run generate:hap-defaults
// Re-run whenever @homebridge/hap-nodejs is updated.

import { Service, Characteristic } from '@homebridge/hap-nodejs';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../src/hapDefaults.ts');

const toSnakeCase = (displayName) => displayName.toLowerCase().replace(/\s+/g, '_');

// service UUID → first required characteristic UUID
const defaultCharMap = {};
for (const key of Object.keys(Service)) {
  const entry = Service[key];
  if (typeof entry !== 'function' || !('UUID' in entry)) continue;
  try {
    const instance = new entry('');
    const primary = instance.characteristics[0];
    if (primary) defaultCharMap[entry.UUID] = primary.UUID;
  } catch {}
}

// attribute (snake_case display name) → characteristic UUID
const attributeToUUIDMap = {};
for (const key of Object.keys(Characteristic)) {
  const entry = Characteristic[key];
  if (typeof entry !== 'function' || !('UUID' in entry)) continue;
  try {
    const instance = new entry();
    if (instance.displayName) {
      attributeToUUIDMap[toSnakeCase(instance.displayName)] = entry.UUID;
    }
  } catch {}
}

const formatEntries = (map) => Object.entries(map).map(([k, v]) => `  '${k}': '${v}',`).join('\n');

const content = `// THIS FILE IS AUTO-GENERATED — DO NOT EDIT MANUALLY.
// Re-generate by running: npm run generate:hap-defaults
// Re-run whenever @homebridge/hap-nodejs is updated.

/** Maps service UUID → default (first required) characteristic UUID. */
export const defaultCharacteristicByServiceUUID: Readonly<Record<string, string>> = {
${formatEntries(defaultCharMap)}
};

/** Maps snake_case attribute name → characteristic UUID. */
export const characteristicUUIDByAttribute: Readonly<Record<string, string>> = {
${formatEntries(attributeToUUIDMap)}
};
`;

writeFileSync(outPath, content, 'utf8');
console.log(`Written ${Object.keys(defaultCharMap).length} service entries and ${Object.keys(attributeToUUIDMap).length} characteristic entries to ${outPath}`);
