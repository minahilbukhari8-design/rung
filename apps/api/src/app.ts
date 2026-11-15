import Fastify, { type FastifyInstance } from 'fastify';
import { createAdapters, type Adapters } from './adapters/index.js';
import { ApiError, authenticate } from './lib/core.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { bookingRoutes } from './routes/bookings.js';
import { catalogRoutes } from './routes/catalog.js';
import { commerceRoutes } from './routes/commerce.js';
import { manageRoutes } from './routes/manage.js';
import { paymentRoutes } from './routes/payments.js';
import { simulatorRoutes } from './routes/simulator.js';
import { vendorRoutes } from './routes/vendor.js';

export async function buildApp(adapters: Adapters = createAdapters()): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : { level: 'info' }, trustProxy: true, bodyLimit: 1_000_000 });

  app.addHook('onRequest', async (req) => {
    await authenticate(req);
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) return reply.code(err.status).send({ error: { code: err.code, message: (err as Error).message } });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: { code: 'BAD_REQUEST', message: (err as Error).message } });
    app.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  });

  app.get('/health', async () => ({ ok: true }));

  await app.register(
    async (v1) => {
      await authRoutes(v1, adapters);
      await catalogRoutes(v1);
      await commerceRoutes(v1, adapters);
      await bookingRoutes(v1, adapters);
      await manageRoutes(v1, adapters);
      await vendorRoutes(v1, adapters);
      await adminRoutes(v1, adapters);
      await paymentRoutes(v1, adapters);
      // local wallet simulator: development / automated tests only
      if (process.env.PAYMENT_SIMULATOR === '1' && process.env.NODE_ENV !== 'production') await simulatorRoutes(v1);
    },
    { prefix: '/api/v1' },
  );
  return app;
}
