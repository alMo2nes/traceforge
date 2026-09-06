import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../web/dist');
const target = resolve(here, '../media/web');

// Copy the Vite build into the extension so the packaged VSIX is self-contained.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });

console.log(`TraceForge Webview assets copied from ${source} to ${target}`);
