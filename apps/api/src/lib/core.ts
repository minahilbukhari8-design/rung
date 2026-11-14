import { PrismaClient, type Role } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';

export const prisma = new PrismaClient();

// ---------- errors ----------
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'Not allowed') => new ApiError(403, 'FORBIDDEN', msg);
export const badRequest = (code: string, msg: string) => new ApiError(400, code, msg);
export const conflict = (code: string, msg: string) => new ApiError(409, code, msg);

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  }
  return r.data;
}

// ---------- hashing / ids ----------
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export function humanNumber(prefix: 'RG' | 'RB'): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(alphabet.length)];
  return `${prefix}-${s}`;
}

// ---------- auth ----------
const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET must be set (≥16 chars)');
  return new TextEncoder().encode(s);
};

export interface AuthUser {
  id: string;
  roles: Role[];
}

export async function signAccessToken(u: AuthUser): Promise<string> {
  return new SignJWT({ roles: u.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret());
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function authenticate(req: FastifyRequest): Promise<void> {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return;
  try {
    const { payload } = await jwtVerify(h.slice(7), secret());
    req.user = { id: String(payload.sub), roles: (payload.roles as Role[]) ?? [] };
  } catch {
    throw new ApiError(401, 'INVALID_TOKEN', 'Access token is invalid or expired');
  }
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
  return req.user;
}

export async function requireAdmin(req: FastifyRequest): Promise<AuthUser> {
  const u = requireUser(req);
  const db = await prisma.user.findUnique({ where: { id: u.id } });
  if (!db?.roles.includes('ADMIN')) throw forbidden('Admin only');
  return u;
}

/** Returns the vendor the user belongs to (first membership), checking role when needed. */
export async function requireVendor(req: FastifyRequest, ownerOnly = false) {
  const u = requireUser(req);
  const m = await prisma.vendorMember.findFirst({ where: { userId: u.id }, include: { vendor: true } });
  if (!m) throw forbidden('Vendor account required');
  if (ownerOnly && m.role !== 'OWNER') throw forbidden('Vendor owner only');
  return { user: u, vendor: m.vendor, role: m.role };
}

export type Reply = FastifyReply;
