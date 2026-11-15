import { buildApp } from './app.js';
import { createAdapters } from './adapters/index.js';
import { productionProblems } from './lib/config.js';
import { runScheduledJobs } from './routes/manage.js';

const problems = productionProblems();
if (problems.length) {
  console.error(`RUNG API will not start:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

const adapters = createAdapters();
const app = await buildApp(adapters);
const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });

// time-based jobs while the server is awake; on free hosting an outside scheduler also calls POST /api/v1/jobs/run
const JOB_EVERY_MS = 5 * 60_000;
setInterval(() => {
  runScheduledJobs(adapters).then((r) => { if (r.ordersRejected || r.bookingsExpired) app.log.info(r, 'scheduled jobs'); }).catch((e) => app.log.error(e, 'scheduled jobs failed'));
}, JOB_EVERY_MS).unref();
