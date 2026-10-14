/**
 * Express 4 does not catch rejected promises from async route handlers: a
 * Prisma error (e.g. Postgres restarting) became an unhandled rejection, which
 * crashes Node 20 and takes the API down. This patch forwards them to next(err)
 * (same approach as the express-async-errors package). Import before routes.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Layer = require('express/lib/router/layer');

const original = Layer.prototype.handle_request;
if (!original.__asyncPatched) {
  const patched = function handle_request(this: { handle: (...a: unknown[]) => unknown }, req: unknown, res: unknown, next: (err?: unknown) => void) {
    const fn = this.handle;
    if (fn.length > 3) return original.call(this, req, res, next); // error handlers
    try {
      const ret = fn(req, res, next) as { catch?: (cb: (e: unknown) => void) => void } | undefined;
      if (ret && typeof ret.catch === 'function') ret.catch((err) => next(err ?? new Error('Route failed')));
    } catch (err) {
      next(err);
    }
  };
  (patched as unknown as { __asyncPatched: boolean }).__asyncPatched = true;
  Layer.prototype.handle_request = patched;
}

export {};
