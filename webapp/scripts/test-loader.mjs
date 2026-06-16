// Minimal ESM resolve hook for `node --test`: lets the source files (which use
// bundler-style extensionless relative imports like `import './dateHelpers'`)
// run under raw Node. Appends `.js` when an extensionless relative specifier
// fails to resolve. Used via: node --import ./scripts/test-loader.mjs --test ...
import { register } from 'node:module';

register(
  'data:text/javascript,' + encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[mc]?js$/.test(spec)) {
        try { return await next(spec, ctx); } catch { return next(spec + '.js', ctx); }
      }
      return next(spec, ctx);
    }
  `),
  import.meta.url,
);
