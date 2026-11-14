import { normalizePkMobile } from '@rung/domain';
import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Adapters } from '../adapters/index.js';
import { ApiError, badRequest, parse, prisma, randomToken, requireUser, sha256, signAccessToken } from '../lib/core.js';

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_SENDS = 3; // per phone number
const OTP_MAX_SENDS_PER_IP = 20; // mobile carriers share IPs (CGNAT), so the IP limit is looser
const OTP_SEND_WINDOW_MS = 15 * 60_000;
const REFRESH_TTL_MS = 30 * 24 * 3600_000;

const phoneSchema = z.string().transform((v, ctx) => {
  const n = normalizePkMobile(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a Pakistani mobile number like 0300 1234567' });
  return n ?? '';
});

async function issueTokens(userId: string, userAgent?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const refreshToken = randomToken();
  await prisma.session.create({
    data: { userId, refreshTokenHash: sha256(refreshToken), userAgent, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
  });
  return { accessToken: await signAccessToken({ id: user.id, roles: user.roles }), refreshToken, user };
}

export async function authRoutes(app: FastifyInstance, adapters: Adapters) {
  app.post('/auth/otp/request', async (req) => {
    const { phone } = parse(z.object({ phone: phoneSchema }), req.body);
    const since = new Date(Date.now() - OTP_SEND_WINDOW_MS);
    const [byPhone, byIp] = await Promise.all([
      prisma.otpCode.count({ where: { phone, createdAt: { gte: since } } }),
      prisma.otpCode.count({ where: { ip: req.ip, createdAt: { gte: since } } }),
    ]);
    if (byPhone >= OTP_MAX_SENDS || byIp >= OTP_MAX_SENDS_PER_IP) throw new ApiError(429, 'OTP_RATE_LIMIT', 'Too many codes requested. Try again in 15 minutes.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await prisma.otpCode.create({ data: { phone, codeHash: sha256(`${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS), ip: req.ip } });
    await adapters.sms.send(phone, `RUNG code: ${code}. Valid for 5 minutes. Do not share it.`);
    return { sent: true, phone, expiresInSeconds: OTP_TTL_MS / 1000 };
  });

  app.post('/auth/otp/verify', async (req) => {
    const { phone, code } = parse(z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }), req.body);
    const otp = await prisma.otpCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw badRequest('OTP_EXPIRED', 'Code expired. Request a new one.');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new ApiError(429, 'OTP_LOCKED', 'Too many wrong attempts. Request a new code.');
    if (otp.codeHash !== sha256(`${phone}:${code}`)) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw badRequest('OTP_INVALID', 'Wrong code.');
    }
    await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    const user = await prisma.user.upsert({
      where: { phone },
      update: { phoneVerifiedAt: new Date() },
      create: { phone, phoneVerifiedAt: new Date() },
    });
    if (user.isBlocked) throw new ApiError(403, 'BLOCKED', 'This account is blocked. Contact support.');
    const t = await issueTokens(user.id, req.headers['user-agent']);
    return { accessToken: t.accessToken, refreshToken: t.refreshToken, user: { id: user.id, phone: user.phone, name: user.name, roles: user.roles } };
  });

  app.post('/auth/refresh', async (req) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(20) }), req.body);
    const s = await prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) } });
    if (!s || s.revokedAt || s.expiresAt < new Date()) throw new ApiError(401, 'INVALID_REFRESH', 'Please log in again.');
    await prisma.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } }); // rotate
    const t = await issueTokens(s.userId, req.headers['user-agent']);
    return { accessToken: t.accessToken, refreshToken: t.refreshToken };
  });

  app.post('/auth/logout', async (req) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string() }), req.body);
    await prisma.session.updateMany({ where: { refreshTokenHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  });

  app.get('/me', async (req) => {
    const u = requireUser(req);
    return prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { id: true, phone: true, name: true, email: true, locale: true, roles: true } });
  });

  app.patch('/me', async (req) => {
    const u = requireUser(req);
    const data = parse(z.object({ name: z.string().min(1).max(80).optional(), email: z.string().email().optional(), locale: z.enum(['en', 'ur']).optional() }), req.body);
    return prisma.user.update({ where: { id: u.id }, data, select: { id: true, phone: true, name: true, email: true, locale: true } });
  });

  const addressSchema = z.object({
    label: z.string().max(40).optional(),
    recipientName: z.string().min(1).max(80),
    recipientPhone: phoneSchema,
    line1: z.string().min(3).max(200),
    line2: z.string().max(200).optional(),
    area: z.string().min(2).max(80),
    zoneId: z.string().optional(),
    landmark: z.string().max(120).optional(),
    isDefault: z.boolean().optional(),
  });

  app.get('/me/addresses', async (req) => prisma.address.findMany({ where: { userId: requireUser(req).id }, orderBy: { createdAt: 'desc' } }));
  app.post('/me/addresses', async (req, reply) => {
    const u = requireUser(req);
    const data = parse(addressSchema, req.body);
    const zoneId = data.zoneId ?? (await prisma.deliveryZone.findFirst({ where: { areas: { has: data.area }, isActive: true } }))?.id;
    reply.code(201);
    return prisma.address.create({ data: { ...data, zoneId, userId: u.id } });
  });
  app.delete('/me/addresses/:id', async (req) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const r = await prisma.address.deleteMany({ where: { id, userId: u.id } });
    return { deleted: r.count };
  });
}
