// Minimal ESM resolve hook for `node --test`: lets the source files (which use
// bundler-style extensionless relative imports like `import './dateHelpers'`)
// run under raw Node. Appends `.js` when an extensionless relative specifier
// fails to resolve. Used via: node --import ./scripts/test-loader.mjs --test ...
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

// '@/…' resolves to <cwd>/src/… (mirrors jsconfig paths) so tested modules can
// use the same bundler-style alias as app code.
const SRC = pathToFileURL(join(process.cwd(), 'src') + '/').href;

register(
  'data:text/javascript,' + encodeURIComponent(`
    const SRC = ${JSON.stringify(SRC)};
    export async function resolve(spec, ctx, next) {
      let s = spec;
      if (s.startsWith('@/')) s = SRC + s.slice(2);
      // next/server ใน package exports ของ next ต้องลงท้าย .js เมื่อ resolve ด้วย Node ตรง ๆ
      if (s === 'next/server') s = 'next/server.js';
      if ((s.startsWith('./') || s.startsWith('../') || s.startsWith('file:')) && !/\\.[mc]?js$/.test(s)) {
        try { return await next(s, ctx); } catch { return next(s + '.js', ctx); }
      }
      return next(s, ctx);
    }
  `),
  import.meta.url,
);
