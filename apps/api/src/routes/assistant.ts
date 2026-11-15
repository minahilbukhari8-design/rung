/** Customer chat assistant. Works logged in or out; order questions need a login. Read-only. */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError, parse, prisma } from '../lib/core.js';
import { assistantFromEnv, type AssistantEngine } from '../lib/assistant.js';

const chatBody = z.object({
  locale: z.enum(['en', 'ur']).default('en'),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1000) })).min(1).max(20),
});

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 30;

export async function assistantRoutes(app: FastifyInstance, engine: AssistantEngine = assistantFromEnv()) {
  const hits = new Map<string, number[]>();
  const allow = (key: string) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) return false;
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
    return true;
  };

  app.get('/assistant/status', async () => ({ engine: engine.name }));

  app.post('/assistant/chat', async (req) => {
    const body = parse(chatBody, req.body);
    if (body.messages[body.messages.length - 1]!.role !== 'user') throw new ApiError(400, 'BAD_CHAT', 'The last message must be from the customer');
    const key = req.user ? `u:${req.user.id}` : `ip:${req.ip}`;
    if (!allow(key)) throw new ApiError(429, 'ASSISTANT_RATE_LIMIT', 'Too many messages. Please wait a few minutes.');
    const started = Date.now();
    try {
      const out = await engine.reply({ messages: body.messages.slice(-12), locale: body.locale, userId: req.user?.id });
      return out;
    } catch (e) {
      req.log.error(e, 'assistant failed');
      throw new ApiError(503, 'ASSISTANT_UNAVAILABLE', 'The assistant is not available right now. Please use search instead.');
    } finally {
      // usage log without message text (privacy): who, which engine, how long
      await prisma.auditLog.create({ data: { action: 'assistant.chat', entity: 'Assistant', entityId: engine.name, actorId: req.user?.id, data: { ms: Date.now() - started, turns: body.messages.length } } }).catch(() => undefined);
    }
  });
}
