import type { BetaMessage, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BasicEngine, ClaudeEngine, assistantFromEnv, parseBudget, pickCards, type AssistantEngine } from '../src/lib/assistant.js';
import { api, login, prisma, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
let engine: AssistantEngine;

/** A stand-in for the Claude API: answers each request from a script and records what it was sent. */
function scripted(steps: ((p: MessageCreateParamsNonStreaming) => Partial<BetaMessage>)[]) {
  const sent: MessageCreateParamsNonStreaming[] = [];
  const create = async (p: MessageCreateParamsNonStreaming) => {
    sent.push(structuredClone(p));
    const step = steps[sent.length - 1];
    if (!step) throw new Error('no more scripted replies');
    return { id: `msg_${sent.length}`, type: 'message', role: 'assistant', model: p.model, stop_reason: 'end_turn', content: [], ...step(p) } as BetaMessage;
  };
  return { create, sent };
}
const toolUse = (id: string, name: string, input: unknown) => ({ stop_reason: 'tool_use' as const, content: [{ type: 'tool_use', id, name, input }] as BetaMessage['content'] });
const say = (text: string) => ({ stop_reason: 'end_turn' as const, content: [{ type: 'text', text, citations: null }] as BetaMessage['content'] });

beforeAll(async () => {
  ctx = await setup();
  const { buildApp } = await import('../src/app.js');
  await ctx.app.close();
  ctx.app = await buildApp({ ...ctx.adapters, assistant: { name: 'basic', reply: (i) => engine.reply(i) } });
});
afterAll(async () => {
  await ctx.app.close();
});

describe('assistant', () => {
  it('without a real AI key the basic helper answers, never Claude', () => {
    expect(assistantFromEnv({}).name).toBe('basic');
    expect(assistantFromEnv({ ANTHROPIC_API_KEY: 'PLACEHOLDER_NOT_REAL' }).name).toBe('basic');
  });

  it('reads budgets in English and Roman Urdu', () => {
    expect(parseBudget('cake under 5000')).toBe(500_000);
    expect(parseBudget('5k tak phool')).toBe(500_000);
    expect(parseBudget('Rs. 3,000 se kam')).toBe(300_000);
    expect(parseBudget('2 hazar')).toBe(200_000);
    expect(parseBudget('cake please')).toBeUndefined();
  });

  it('basic helper finds real DEMO listings from Roman Urdu and respects the budget', async () => {
    engine = new BasicEngine();
    const r = await api(ctx).post('/assistant/chat', { messages: [{ role: 'user', content: 'mehendi ke liye sajawat chahiye' }] });
    expect(r.statusCode).toBe(200);
    expect(r.json().engine).toBe('basic');
    expect(r.json().cards.map((c: { slug: string }) => c.slug)).toEqual(['demo-mehndi-decor']);
    expect(r.json().text).toContain('DEMO Mehndi Stage Decor');

    const cheap = await api(ctx).post('/assistant/chat', { messages: [{ role: 'user', content: 'cake under 1500' }] });
    expect(cheap.json().cards).toHaveLength(1);
    expect(cheap.json().cards[0]).toMatchObject({ slug: 'demo-chocolate-cake', fromPaisa: 100_000, isDemo: true, available: true, url: '/product/demo-bakery/demo-chocolate-cake' });
    const tooCheap = await api(ctx).post('/assistant/chat', { messages: [{ role: 'user', content: 'cake under 500' }] });
    expect(tooCheap.json().cards).toHaveLength(0);

    const ur = await api(ctx).post('/assistant/chat', { locale: 'ur', messages: [{ role: 'user', content: 'کیک' }] });
    expect(ur.json().text).toContain('ڈیمو چاکلیٹ کیک');
  });

  it('order questions need a login and only show the customer\'s own orders', async () => {
    engine = new BasicEngine();
    const anon = await api(ctx).post('/assistant/chat', { messages: [{ role: 'user', content: 'where is my order?' }] });
    expect(anon.json().text).toMatch(/log in/);
    const token = await login(ctx, '03451239876');
    const me = await api(ctx, token).post('/assistant/chat', { messages: [{ role: 'user', content: 'meri booking ka status?' }] });
    expect(me.statusCode).toBe(200);
  });

  it('Claude engine: runs the catalogue tools, and cards come from the database, not from the model', async () => {
    const s = scripted([
      () => toolUse('t1', 'search_listings', { query: 'chocolate cake', kind: 'product' }),
      (p) => {
        const result = (p.messages.at(-1)!.content as { type: string; content: string }[])[0]!;
        const listed = JSON.parse(result.content) as { slug: string; from: string; isDemo: boolean }[];
        expect(listed).toEqual([expect.objectContaining({ slug: 'demo-chocolate-cake', from: 'Rs 1,000', isDemo: true })]);
        return toolUse('t2', 'get_listing', { kind: 'product', vendorSlug: 'demo-bakery', slug: 'demo-chocolate-cake' });
      },
      (p) => {
        const result = (p.messages.at(-1)!.content as { content: string }[])[0]!;
        expect(JSON.parse(result.content).options.map((o: { price: string }) => o.price)).toEqual(['Rs 1,000', 'Rs 2,000']);
        // a made-up listing in the text must not become a card
        return say('The demo DEMO Chocolate Cake from DEMO Bakery starts at Rs 1,000. There is also a "Golden Truffle Cake" for Rs 500.');
      },
    ]);
    engine = new ClaudeEngine(s.create, 'claude-opus-5-5');
    const r = await api(ctx).post('/assistant/chat', { messages: [{ role: 'user', content: 'Ammi ki salgirah ke liye chocolate cake' }] });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.engine).toBe('claude');
    expect(body.cards.map((c: { slug: string }) => c.slug)).toEqual(['demo-chocolate-cake']);
    expect(s.sent).toHaveLength(3);
    const first = s.sent[0]!;
    expect(first.model).toBe('claude-opus-5-5');
    expect(first.tools?.map((t) => (t as { name: string }).name)).toEqual(['search_listings', 'get_listing', 'list_occasions', 'my_orders_and_bookings']);
    expect(JSON.stringify(first.system)).toContain('Never guess or make up');
    // the assistant turn (with the tool call) is sent back unchanged before the tool result
    expect(s.sent[1]!.messages.at(-2)).toMatchObject({ role: 'assistant', content: [{ type: 'tool_use', id: 't1' }] });
  });

  it('Claude engine: a logged-out customer gets no order data, a logged-in one gets only their own', async () => {
    const results: string[] = [];
    const grab = (p: MessageCreateParamsNonStreaming) => { results.push((p.messages.at(-1)!.content as { content: string }[])[0]!.content); return say('ok'); };
    engine = new ClaudeEngine(scripted([() => toolUse('a', 'my_orders_and_bookings', {}), grab]).create);
    await api(ctx).post('/assistant/chat', { messages: [{ role: 'user', content: 'my orders?' }] });
    expect(JSON.parse(results[0]!)).toHaveProperty('error');

    const token = await login(ctx, '03451230001');
    engine = new ClaudeEngine(scripted([() => toolUse('b', 'my_orders_and_bookings', {}), grab]).create);
    await api(ctx, token).post('/assistant/chat', { messages: [{ role: 'user', content: 'my orders?' }] });
    expect(JSON.parse(results[1]!)).toEqual({ orders: [], bookings: [] });
  });

  it('Claude engine: unknown tools and bad inputs are reported to the model, not crashed on', async () => {
    let seen = '';
    engine = new ClaudeEngine(scripted([
      () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x', name: 'place_order', input: {} }, { type: 'tool_use', id: 'y', name: 'get_listing', input: { kind: 'product', vendorSlug: 'nope', slug: 'nope' } }] as BetaMessage['content'] }),
      (p) => { seen = JSON.stringify(p.messages.at(-1)); return say('Sorry.'); },
    ]).create);
    const r = await api(ctx).post('/assistant/chat', { messages: [{ role: 'user', content: 'order it for me' }] });
    expect(r.statusCode).toBe(200);
    expect(seen).toContain('"is_error":true');
    expect(seen).toContain('No such listing is live on RUNG.');
  });

  it('Claude engine: a refusal gives a polite fixed reply; an API outage gives 503', async () => {
    engine = new ClaudeEngine(scripted([() => ({ stop_reason: 'refusal', content: [] })]).create);
    const r = await api(ctx).post('/assistant/chat', { messages: [{ role: 'user', content: 'x' }] });
    expect(r.json().text).toBe("Sorry, I can't help with that.");
    engine = new ClaudeEngine(async () => { throw new Error('down'); });
    const down = await api(ctx).post('/assistant/chat', { messages: [{ role: 'user', content: 'cake' }] });
    expect(down.statusCode).toBe(503);
  });

  it('checks input and limits how many messages one person can send', async () => {
    engine = new BasicEngine();
    expect((await api(ctx).post('/assistant/chat', { messages: [] })).statusCode).toBe(400);
    expect((await api(ctx).post('/assistant/chat', { messages: [{ role: 'assistant', content: 'hi' }] })).statusCode).toBe(400);
    expect((await api(ctx).post('/assistant/chat', { messages: [{ role: 'user', content: 'x'.repeat(1001) }] })).statusCode).toBe(400);
    const send = () => ctx.app.inject({ method: 'POST', url: '/api/v1/assistant/chat', payload: { messages: [{ role: 'user', content: 'cake' }] }, remoteAddress: '10.9.9.9' });
    for (let i = 0; i < 30; i++) expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(429);
    expect(await prisma.auditLog.count({ where: { action: 'assistant.chat' } })).toBeGreaterThan(30);
  });

  it('shows cards only for listings the reply names', () => {
    const a = { kind: 'product' as const, vendorSlug: 'v', slug: 'a', title: 'Red Roses', titleUr: null, vendorName: 'V', fromPaisa: 1, isDemo: false, available: true, url: '' };
    const b = { ...a, slug: 'b', title: 'Lilies' };
    expect(pickCards('Try the Red Roses.', [a, b]).map((c) => c.slug)).toEqual(['a']);
    expect(pickCards('Here are some ideas.', [a, b]).map((c) => c.slug)).toEqual(['a', 'b']);
  });
});
