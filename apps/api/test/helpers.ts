import type { FastifyInstance } from 'fastify';
import { MockGateway, MockSms, type Adapters, BankTransferGateway, CodGateway } from '../src/adapters/index.js';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/core.js';
import { seedDemo, seedReference } from '../src/seed.js';

export { prisma };

export async function resetDb() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

export interface Ctx {
  app: FastifyInstance;
  sms: MockSms;
  mock: MockGateway;
  adapters: Adapters;
}

export async function setup(): Promise<Ctx> {
  await resetDb();
  await seedReference(prisma);
  await seedDemo(prisma);
  const sms = new MockSms();
  const mock = new MockGateway();
  const adapters: Adapters = { sms, payments: { MOCK: mock, COD: new CodGateway(), BANK_TRANSFER: new BankTransferGateway() } };
  const app = await buildApp(adapters);
  return { app, sms, mock, adapters };
}

let ipCounter = 1;
export async function login(ctx: Ctx, phone: string): Promise<string> {
  const ip = `10.0.0.${ipCounter++ % 250}`;
  const r1 = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/otp/request', payload: { phone }, remoteAddress: ip });
  if (r1.statusCode !== 200) throw new Error(`otp request failed ${r1.body}`);
  const e164 = r1.json().phone as string;
  const code = ctx.sms.lastTo(e164)!.text.match(/(\d{6})/)![1];
  const r2 = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/otp/verify', payload: { phone, code }, remoteAddress: ip });
  if (r2.statusCode !== 200) throw new Error(`otp verify failed ${r2.body}`);
  return r2.json().accessToken as string;
}

export function api(ctx: Ctx, token?: string) {
  const h = token ? { authorization: `Bearer ${token}` } : {};
  return {
    get: (url: string) => ctx.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: h }),
    post: (url: string, payload?: unknown) => ctx.app.inject({ method: 'POST', url: `/api/v1${url}`, headers: h, payload: payload as object }),
    put: (url: string, payload?: unknown) => ctx.app.inject({ method: 'PUT', url: `/api/v1${url}`, headers: h, payload: payload as object }),
    patch: (url: string, payload?: unknown) => ctx.app.inject({ method: 'PATCH', url: `/api/v1${url}`, headers: h, payload: payload as object }),
  };
}

/** YYYY-MM-DD in Pakistan time, n days from now. */
export function pktDate(daysAhead: number) {
  return new Date(Date.now() + 5 * 3600_000 + daysAhead * 86_400_000).toISOString().slice(0, 10);
}
