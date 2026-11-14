'use client';

import { formatPKR } from '@rung/domain';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { statusLabel, t, type Locale } from '@/lib/i18n';

type Res<T> = { ok: boolean; status: number; data: T & { error?: { code: string; message: string } } };
async function bff<T = any>(path: string, method = 'GET', body?: unknown): Promise<Res<T>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`/bff/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}
const rs = (v: string) => Math.round(Number(v) * 100);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const pkt = (iso: string) => new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });

function useLoad<T>(path: string | null) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    const r = await bff<T>(path);
    if (r.status === 401) return router.push('/login');
    setData(r.data);
  }, [path, router]);
  useEffect(() => { void reload(); }, [reload]);
  return [data, reload] as const;
}

function ErrorText({ msg }: { msg: string }) {
  return msg ? <p className="error" role="alert">{msg}</p> : null;
}

async function fileToUpload(file: File, purpose: string): Promise<Res<{ key: string; url: string }>> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return bff('uploads', 'POST', { purpose, contentType: file.type, dataBase64: btoa(bin) });
}

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  return <button className="btn small secondary" style={{ color: 'inherit', borderColor: 'currentColor' }} onClick={async () => { await bff('auth/logout', 'POST', {}); router.push('/login'); router.refresh(); }}>{label}</button>;
}

export function LoginForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  return sent ? (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await bff('auth/otp/verify', 'POST', { phone, code }); if (!r.ok) return setErr(r.data.error?.message ?? ''); router.push('/'); router.refresh(); }}>
      <label>{t(locale, 'code')}<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required /></label>
      <ErrorText msg={err} /><button className="btn">{t(locale, 'verify')}</button>
    </form>
  ) : (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await bff('auth/otp/request', 'POST', { phone }); if (!r.ok) return setErr(r.data.error?.message ?? ''); setSent(true); }}>
      <label>{t(locale, 'phone')}<input type="tel" dir="ltr" placeholder="0300 1234567" value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
      <ErrorText msg={err} /><button className="btn">{t(locale, 'sendCode')}</button>
    </form>
  );
}

// ---------------- overview / apply ----------------
interface Vendor { id: string; slug: string; name: string; status: string; isDemo: boolean; kind: string }

function ApplyForm({ locale, onDone }: { locale: Locale; onDone: () => void }) {
  const [f, setF] = useState({ name: '', nameUr: '', slug: '', kind: 'PRODUCTS', phone: '' });
  const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    const r = await bff('vendor/apply', 'POST', { ...f, nameUr: f.nameUr || undefined });
    if (!r.ok) return setErr(r.data.error?.message ?? '');
    onDone();
  }
  return (
    <form className="stack card" onSubmit={submit} style={{ maxWidth: 560 }}>
      <h1>{t(locale, 'applyTitle')}</h1>
      <label>{t(locale, 'shopName')}<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.slug || '' })} /></label>
      <label>{t(locale, 'shopNameUr')}<input dir="rtl" value={f.nameUr} onChange={(e) => setF({ ...f, nameUr: e.target.value })} /></label>
      <label>{t(locale, 'shopLink')}<input required dir="ltr" pattern="[a-z0-9]+(-[a-z0-9]+)*" value={f.slug} placeholder={f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} /></label>
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend>{t(locale, 'kind')}</legend>
        {(['PRODUCTS', 'SERVICES', 'BOTH'] as const).map((k) => <label key={k} className="radio"><input type="radio" checked={f.kind === k} onChange={() => setF({ ...f, kind: k })} />{t(locale, k === 'PRODUCTS' ? 'kindProducts' : k === 'SERVICES' ? 'kindServices' : 'kindBoth')}</label>)}
      </fieldset>
      <label>{t(locale, 'shopPhone')}<input required type="tel" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
      <ErrorText msg={err} /><button className="btn">{t(locale, 'submit')}</button>
    </form>
  );
}

export function Overview({ locale }: { locale: Locale }) {
  const [me, reloadMe] = useLoad<{ vendor: Vendor | null; role: string | null }>('vendor/me');
  const [stats] = useLoad<{ orders: Record<string, number>; bookings: Record<string, number>; lowStockVariants: number }>(me?.vendor ? 'vendor/stats' : null);
  if (!me) return <p className="muted">…</p>;
  if (!me.vendor) return <ApplyForm locale={locale} onDone={reloadMe} />;
  const v = me.vendor;
  const tile = (label: string, n: number | undefined, href: string) => <a className="tile" href={href}><span className="muted">{label}</span><b>{n ?? 0}</b></a>;
  return (
    <>
      <h1>{v.name} {v.isDemo && <span className="pill demo">{t(locale, 'demo')}</span>} <span className="pill status">{statusLabel(locale, v.status)}</span></h1>
      {v.status === 'PENDING_REVIEW' && <p className="notice">{t(locale, 'pendingReview')}</p>}
      {stats && (
        <div className="tiles">
          {tile(statusLabel(locale, 'PLACED') + ' · ' + t(locale, 'orders'), stats.orders.PLACED, '/orders?status=PLACED')}
          {tile(statusLabel(locale, 'PREPARING'), (stats.orders.ACCEPTED ?? 0) + (stats.orders.PREPARING ?? 0), '/orders?status=ACCEPTED')}
          {tile(statusLabel(locale, 'REQUESTED') + ' · ' + t(locale, 'bookings'), stats.bookings.REQUESTED, '/bookings')}
          {tile(statusLabel(locale, 'CONFIRMED'), (stats.bookings.CONFIRMED ?? 0) + (stats.bookings.FULLY_PAID ?? 0), '/bookings')}
          {tile(t(locale, 'stock') + ' ≤ 2', stats.lowStockVariants, '/catalogue')}
        </div>
      )}
      <h2>{t(locale, 'needsAction')}</h2>
      <OrdersBoard locale={locale} initialStatus="PLACED" compact />
    </>
  );
}

// ---------------- orders ----------------
interface Order { number: string; status: string; totalPaisa: number; deliveryDate: string; slotStartMinute: number; slotEndMinute: number; recipientName: string; recipientPhone: string; addressSnapshot: { line1: string; area: string; landmark?: string }; giftMessage?: string; vendorRespondBy?: string; items: { id: string; productTitle: string; variantName: string; quantity: number; customization: Record<string, string> }[] }
const ORDER_TABS = ['PLACED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

function OrderCard({ locale, o, onChange }: { locale: Locale; o: Order; onChange: () => void }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  async function go(to: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setErr('');
    const r = await bff(`vendor/orders/${o.number}/transition`, 'POST', { to, ...extra });
    setBusy(false);
    if (!r.ok) return setErr(r.data.error?.message ?? '');
    onChange();
  }
  async function deliver() {
    if (!photo) return setErr('Add a delivery photo first');
    setBusy(true);
    const up = await fileToUpload(photo, 'DELIVERY_PROOF');
    setBusy(false);
    if (!up.ok) return setErr(up.data.error?.message ?? '');
    await go('DELIVERED', { photoKey: up.data.key });
  }
  return (
    <div className="card" data-testid={`order-${o.number}`}>
      <div className="row"><strong>{o.number}</strong><span className="pill status">{statusLabel(locale, o.status)}</span><span className="muted">{o.deliveryDate.slice(0, 10)} · {hhmm(o.slotStartMinute)}–{hhmm(o.slotEndMinute)}</span><span className="price">{formatPKR(o.totalPaisa, locale)}</span></div>
      <ul>{o.items.map((i) => <li key={i.id}>{i.productTitle} · {i.variantName} × {i.quantity}{Object.values(i.customization ?? {}).length ? ` — “${Object.values(i.customization).join(' · ')}”` : ''}</li>)}</ul>
      <p className="muted">{o.recipientName} · <span dir="ltr">{o.recipientPhone}</span> · {o.addressSnapshot.line1}, {o.addressSnapshot.area}{o.giftMessage ? ` · 🎁 “${o.giftMessage}”` : ''}</p>
      {o.status === 'PLACED' && o.vendorRespondBy && <p className="muted">{t(locale, 'respondBy')}: {pkt(o.vendorRespondBy)}</p>}
      <div className="row">
        {o.status === 'PLACED' && <>
          <button className="btn small" disabled={busy} onClick={() => go('ACCEPTED')}>{t(locale, 'accept')}</button>
          <input aria-label={t(locale, 'reason')} placeholder={t(locale, 'reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn small secondary" disabled={busy || !reason} onClick={() => go('REJECTED', { note: reason })}>{t(locale, 'reject')}</button>
        </>}
        {o.status === 'ACCEPTED' && <button className="btn small" disabled={busy} onClick={() => go('PREPARING')}>{t(locale, 'preparing')}</button>}
        {(o.status === 'PREPARING' || o.status === 'FAILED_DELIVERY') && <button className="btn small" disabled={busy} onClick={() => go('OUT_FOR_DELIVERY')}>{t(locale, 'outForDelivery')}</button>}
        {o.status === 'OUT_FOR_DELIVERY' && <>
          <label className="radio">{t(locale, 'deliveryPhoto')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
          <button className="btn small" disabled={busy} onClick={deliver}>{t(locale, 'delivered')}</button>
          <button className="btn small secondary" disabled={busy} onClick={() => go('FAILED_DELIVERY')}>{t(locale, 'failed')}</button>
        </>}
      </div>
      <ErrorText msg={err} />
    </div>
  );
}

export function OrdersBoard({ locale, initialStatus = 'PLACED', compact = false }: { locale: Locale; initialStatus?: string; compact?: boolean }) {
  const [status, setStatus] = useState(initialStatus);
  const [orders, reload] = useLoad<Order[]>(`vendor/orders?status=${status}`);
  return (
    <>
      {!compact && <div className="tabs" role="tablist">{ORDER_TABS.map((s) => <button key={s} role="tab" aria-selected={s === status} className={`btn small ${s === status ? '' : 'secondary'}`} onClick={() => setStatus(s)}>{statusLabel(locale, s)}</button>)}</div>}
      {orders === null ? <p className="muted">…</p> : orders.length === 0 ? <p className="muted">{t(locale, 'noneNow')}</p> : <div className="list">{orders.map((o) => <OrderCard key={o.number} locale={locale} o={o} onChange={reload} />)}</div>}
    </>
  );
}

// ---------------- bookings ----------------
interface Booking { number: string; status: string; eventStart: string; packageName: string; totalPaisa: number; paidPaisa: number; guestCount?: number; notes?: string; venueSnapshot: { address: string; area: string }; vendorRespondBy: string; customer: { name?: string; phone: string } }

export function BookingsBoard({ locale }: { locale: Locale }) {
  const [list, reload] = useLoad<Booking[]>('vendor/bookings');
  const [reason, setReason] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  async function go(n: string, to: string) {
    const r = await bff(`vendor/bookings/${n}/transition`, 'POST', { to, note: reason[n] || undefined });
    setErr({ ...err, [n]: r.ok ? '' : r.data.error?.message ?? '' });
    if (r.ok) void reload();
  }
  if (!list) return <p className="muted">…</p>;
  if (!list.length) return <p className="muted">{t(locale, 'noneNow')}</p>;
  return (
    <div className="list">
      {list.map((b) => {
        const past = new Date(b.eventStart) < new Date();
        return (
          <div key={b.number} className="card" data-testid={`booking-${b.number}`}>
            <div className="row"><strong>{b.number}</strong><span className="pill status">{statusLabel(locale, b.status)}</span><span>{pkt(b.eventStart)}</span><span className="price">{formatPKR(b.totalPaisa, locale)}</span><span className="muted">paid {formatPKR(b.paidPaisa, locale)}</span></div>
            <p className="muted">{b.packageName} · {b.customer.name ?? ''} <span dir="ltr">{b.customer.phone}</span> · {b.venueSnapshot.address}, {b.venueSnapshot.area}{b.guestCount ? ` · ${b.guestCount} guests` : ''}{b.notes ? ` · “${b.notes}”` : ''}</p>
            {b.status === 'REQUESTED' && <p className="muted">{t(locale, 'respondBy')}: {pkt(b.vendorRespondBy)}</p>}
            <div className="row">
              {b.status === 'REQUESTED' && <button className="btn small" onClick={() => go(b.number, 'ACCEPTED')}>{t(locale, 'accept')}</button>}
              {['REQUESTED', 'ACCEPTED', 'CONFIRMED', 'FULLY_PAID'].includes(b.status) && <>
                <input aria-label={t(locale, 'reason')} placeholder={t(locale, 'reason')} value={reason[b.number] ?? ''} onChange={(e) => setReason({ ...reason, [b.number]: e.target.value })} />
                {b.status === 'REQUESTED'
                  ? <button className="btn small secondary" disabled={!reason[b.number]} onClick={() => go(b.number, 'DECLINED')}>{t(locale, 'decline')}</button>
                  : <button className="btn small secondary" disabled={!reason[b.number]} onClick={() => go(b.number, 'CANCELLED')}>{t(locale, 'cancel')}</button>}
              </>}
              {['CONFIRMED', 'FULLY_PAID'].includes(b.status) && past && <button className="btn small" onClick={() => go(b.number, 'COMPLETED')}>{t(locale, 'complete')}</button>}
            </div>
            <ErrorText msg={err[b.number] ?? ''} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------- catalogue ----------------
interface Variant { id: string; name: string; pricePaisa: number; stock: number; trackInventory: boolean }
interface Product { id: string; slug: string; title: string; status: string; isDemo: boolean; variants: Variant[]; images: { id: string; url: string }[] }
interface Pkg { id: string; name: string; pricePaisa: number; advanceBps: number; isActive: boolean }
interface Service { id: string; title: string; status: string; isDemo: boolean; maxBookingsPerDay: number; packages: Pkg[] }
interface Category { id: string; slug: string; name: string; nameUr: string }

function VariantRow({ locale, v, onSaved }: { locale: Locale; v: Variant; onSaved: () => void }) {
  const [price, setPrice] = useState(String(v.pricePaisa / 100));
  const [stock, setStock] = useState(String(v.stock));
  const [msg, setMsg] = useState('');
  return (
    <tr className="inline">
      <td>{v.name}</td>
      <td><input aria-label={`${t(locale, 'price')} ${v.name}`} type="number" min={1} step="1" value={price} onChange={(e) => setPrice(e.target.value)} /></td>
      <td><input aria-label={`${t(locale, 'stock')} ${v.name}`} type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} /></td>
      <td><button className="btn small secondary" onClick={async () => { const r = await bff(`vendor/variants/${v.id}`, 'PATCH', { pricePaisa: rs(price), stock: Number(stock) }); setMsg(r.ok ? '✓' : r.data.error?.message ?? ''); onSaved(); }}>{t(locale, 'save')}</button> {msg}</td>
    </tr>
  );
}

function NewProduct({ locale, onDone }: { locale: Locale; onDone: () => void }) {
  const [cats] = useLoad<Category[]>('categories?kind=PRODUCT');
  const [f, setF] = useState({ title: '', titleUr: '', slug: '', categoryId: '', description: '', lead: '4' });
  const [variants, setVariants] = useState([{ name: '', price: '', stock: '10' }]);
  const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    const slug = f.slug || f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const r = await bff('vendor/products', 'POST', {
      slug, title: f.title, titleUr: f.titleUr || undefined, categoryId: f.categoryId, description: f.description || undefined, leadTimeMinutes: Math.round(Number(f.lead) * 60), status: 'DRAFT',
      variants: variants.map((v) => ({ name: v.name, pricePaisa: rs(v.price), stock: Number(v.stock) })),
    });
    if (!r.ok) return setErr(r.data.error?.message ?? '');
    onDone();
  }
  return (
    <details className="card"><summary><strong>{t(locale, 'addProduct')}</strong></summary>
      <form className="stack" onSubmit={submit} style={{ marginTop: 12 }}>
        <label>{t(locale, 'title')}<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label>{t(locale, 'titleUr')}<input dir="rtl" value={f.titleUr} onChange={(e) => setF({ ...f, titleUr: e.target.value })} /></label>
        <label>{t(locale, 'category')}<select required value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">—</option>{cats?.map((c) => <option key={c.id} value={c.id}>{locale === 'ur' ? c.nameUr : c.name}</option>)}</select></label>
        <label>{t(locale, 'description')}<textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label>{t(locale, 'leadTime')}<input type="number" min={0} value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })} /></label>
        <fieldset style={{ border: 0, padding: 0 }}><legend>{t(locale, 'variants')}</legend>
          {variants.map((v, i) => (
            <div key={i} className="row inline">
              <input aria-label={t(locale, 'variantName')} placeholder={t(locale, 'variantName')} required value={v.name} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input aria-label={t(locale, 'price')} placeholder={t(locale, 'price')} required type="number" min={1} value={v.price} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
              <input aria-label={t(locale, 'stock')} type="number" min={0} value={v.stock} onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, stock: e.target.value } : x)))} />
            </div>
          ))}
          <button type="button" className="btn small secondary" onClick={() => setVariants([...variants, { name: '', price: '', stock: '10' }])}>+</button>
        </fieldset>
        <ErrorText msg={err} /><button className="btn">{t(locale, 'save')}</button>
      </form>
    </details>
  );
}

function NewService({ locale, onDone }: { locale: Locale; onDone: () => void }) {
  const [cats] = useLoad<Category[]>('categories?kind=SERVICE');
  const [f, setF] = useState({ title: '', categoryId: '', description: '', perDay: '1', pkgName: '', price: '', advance: '30', t1: '168', r1: '100', t2: '48', r2: '50' });
  const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    const r = await bff('vendor/services', 'POST', {
      slug: f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), title: f.title, categoryId: f.categoryId, description: f.description || undefined, maxBookingsPerDay: Number(f.perDay), status: 'DRAFT',
      cancellationTiers: [{ hoursBefore: Number(f.t1), refundBps: Number(f.r1) * 100 }, { hoursBefore: Number(f.t2), refundBps: Number(f.r2) * 100 }, { hoursBefore: 0, refundBps: 0 }],
      packages: [{ name: f.pkgName, pricePaisa: rs(f.price), advanceBps: Number(f.advance) * 100 }],
    });
    if (!r.ok) return setErr(r.data.error?.message ?? '');
    onDone();
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <details className="card"><summary><strong>{t(locale, 'addService')}</strong></summary>
      <form className="stack" onSubmit={submit} style={{ marginTop: 12 }}>
        <label>{t(locale, 'title')}<input required value={f.title} onChange={set('title')} /></label>
        <label>{t(locale, 'category')}<select required value={f.categoryId} onChange={set('categoryId')}><option value="">—</option>{cats?.map((c) => <option key={c.id} value={c.id}>{locale === 'ur' ? c.nameUr : c.name}</option>)}</select></label>
        <label>{t(locale, 'description')}<textarea rows={3} value={f.description} onChange={set('description')} /></label>
        <label>{t(locale, 'perDay')}<input type="number" min={1} value={f.perDay} onChange={set('perDay')} /></label>
        <div className="row inline"><label>{t(locale, 'packages')}<input required placeholder="Basic" value={f.pkgName} onChange={set('pkgName')} /></label><label>{t(locale, 'price')}<input required type="number" min={1} value={f.price} onChange={set('price')} /></label><label>{t(locale, 'advancePct')}<input type="number" min={0} max={100} value={f.advance} onChange={set('advance')} /></label></div>
        <fieldset style={{ border: 0, padding: 0 }}><legend>{t(locale, 'policy')}</legend>
          <div className="row inline">≥ <input type="number" value={f.t1} onChange={set('t1')} aria-label="hours 1" /> h → <input type="number" value={f.r1} onChange={set('r1')} aria-label="refund 1" />%</div>
          <div className="row inline">≥ <input type="number" value={f.t2} onChange={set('t2')} aria-label="hours 2" /> h → <input type="number" value={f.r2} onChange={set('r2')} aria-label="refund 2" />%</div>
          <div className="muted">&lt; {f.t2} h → 0%</div>
        </fieldset>
        <ErrorText msg={err} /><button className="btn">{t(locale, 'save')}</button>
      </form>
    </details>
  );
}

export function Catalogue({ locale }: { locale: Locale }) {
  const [products, reloadP] = useLoad<Product[]>('vendor/products');
  const [services, reloadS] = useLoad<Service[]>('vendor/services');
  const [err, setErr] = useState('');
  async function setStatus(kind: 'products' | 'services', id: string, status: string) {
    const r = await bff(`vendor/${kind}/${id}`, 'PATCH', { status });
    setErr(r.ok ? '' : r.data.error?.message ?? '');
    void (kind === 'products' ? reloadP() : reloadS());
  }
  async function addImage(p: Product, file: File) {
    const up = await fileToUpload(file, 'LISTING_IMAGE');
    if (!up.ok) return setErr(up.data.error?.message ?? '');
    const r = await bff(`vendor/products/${p.id}/images`, 'POST', { key: up.data.key, alt: p.title });
    setErr(r.ok ? '' : r.data.error?.message ?? '');
    void reloadP();
  }
  return (
    <>
      <ErrorText msg={err} />
      <h2>{t(locale, 'products')}</h2>
      <NewProduct locale={locale} onDone={reloadP} />
      <div className="list" style={{ marginTop: 12 }}>
        {products?.map((p) => (
          <div key={p.id} className="card" data-testid={`product-${p.slug}`}>
            <div className="row"><strong>{p.title}</strong>{p.isDemo && <span className="pill demo">{t(locale, 'demo')}</span>}<span className="pill status">{statusLabel(locale, p.status)}</span>
              {p.status === 'ACTIVE' ? <button className="btn small secondary" onClick={() => setStatus('products', p.id, 'PAUSED')}>{t(locale, 'pause')}</button> : <button className="btn small" onClick={() => setStatus('products', p.id, 'ACTIVE')}>{t(locale, 'publish')}</button>}
            </div>
            <div className="row">{p.images.map((i) => <img key={i.id} src={i.url.replace('/api/v1', '')} alt="" style={{ height: 56, borderRadius: 8 }} />)}
              <label className="btn small secondary">+ 📷<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && addImage(p, e.target.files[0])} /></label></div>
            <table><thead><tr><th>{t(locale, 'variantName')}</th><th>{t(locale, 'price')}</th><th>{t(locale, 'stock')}</th><th /></tr></thead>
              <tbody>{p.variants.map((v) => <VariantRow key={v.id} locale={locale} v={v} onSaved={reloadP} />)}</tbody></table>
          </div>
        ))}
      </div>
      <h2 style={{ marginTop: 32 }}>{t(locale, 'services')}</h2>
      <NewService locale={locale} onDone={reloadS} />
      <div className="list" style={{ marginTop: 12 }}>
        {services?.map((s) => (
          <div key={s.id} className="card">
            <div className="row"><strong>{s.title}</strong>{s.isDemo && <span className="pill demo">{t(locale, 'demo')}</span>}<span className="pill status">{statusLabel(locale, s.status)}</span>
              {s.status === 'ACTIVE' ? <button className="btn small secondary" onClick={() => setStatus('services', s.id, 'PAUSED')}>{t(locale, 'pause')}</button> : <button className="btn small" onClick={() => setStatus('services', s.id, 'ACTIVE')}>{t(locale, 'publish')}</button>}
              <span className="muted">{t(locale, 'perDay')}: {s.maxBookingsPerDay}</span></div>
            <ul>{s.packages.map((p) => <li key={p.id}>{p.name} · {formatPKR(p.pricePaisa, locale)} · {t(locale, 'advancePct')} {p.advanceBps / 100}%</li>)}</ul>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------- settings ----------------
interface Zone { id: string; name: string; nameUr?: string }
interface VZone { zoneId: string; chargePaisa: number; minOrderPaisa: number; sameDayCutoffMinute: number | null }
interface Slot { dayOfWeek: number; startMinute: number; endMinute: number; capacity: number }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Settings({ locale }: { locale: Locale }) {
  const [zones] = useLoad<Zone[]>('zones');
  const [vz, reloadVz] = useLoad<VZone[]>('vendor/zones');
  const [slots, reloadSlots] = useLoad<Slot[]>('vendor/slots');
  const [blackouts, reloadB] = useLoad<{ id: string; date: string; reason?: string }[]>('vendor/blackouts');
  const [rows, setRows] = useState<Record<string, { on: boolean; charge: string; min: string; cutoff: string }>>({});
  const [slotRows, setSlotRows] = useState<{ days: number[]; from: string; to: string; cap: string }[]>([]);
  const [newClosed, setNewClosed] = useState({ date: '', reason: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!zones || !vz) return;
    setRows(Object.fromEntries(zones.map((z) => { const m = vz.find((x) => x.zoneId === z.id); return [z.id, { on: Boolean(m), charge: m ? String(m.chargePaisa / 100) : '0', min: m ? String(m.minOrderPaisa / 100) : '0', cutoff: m?.sameDayCutoffMinute != null ? hhmm(m.sameDayCutoffMinute) : '' }]; })));
  }, [zones, vz]);
  useEffect(() => {
    if (!slots) return;
    const groups = new Map<string, number[]>();
    for (const s of slots) { const k = `${s.startMinute}-${s.endMinute}-${s.capacity}`; groups.set(k, [...(groups.get(k) ?? []), s.dayOfWeek]); }
    setSlotRows([...groups.entries()].map(([k, days]) => { const [a, b, c] = k.split('-').map(Number); return { days, from: hhmm(a!), to: hhmm(b!), cap: String(c) }; }));
  }, [slots]);

  async function saveZones() {
    const body = Object.entries(rows).filter(([, r]) => r.on).map(([zoneId, r]) => ({ zoneId, chargePaisa: rs(r.charge), minOrderPaisa: rs(r.min), sameDayCutoffMinute: r.cutoff ? toMin(r.cutoff) : null }));
    const r = await bff('vendor/zones', 'PUT', body);
    setMsg(r.ok ? '✓' : r.data.error?.message ?? ''); void reloadVz();
  }
  async function saveSlots() {
    const body = slotRows.flatMap((r) => r.days.map((d) => ({ dayOfWeek: d, startMinute: toMin(r.from), endMinute: toMin(r.to), capacity: Number(r.cap) })));
    const r = await bff('vendor/slots', 'PUT', body);
    setMsg(r.ok ? '✓' : r.data.error?.message ?? ''); void reloadSlots();
  }
  const Section = ({ title, children }: { title: string; children: ReactNode }) => <div className="card" style={{ marginBottom: 16 }}><h2>{title}</h2>{children}</div>;
  return (
    <>
      {msg && <p role="status">{msg}</p>}
      <Section title={t(locale, 'zones')}>
        <table><thead><tr><th /><th>{t(locale, 'charge')}</th><th>{t(locale, 'minOrder')}</th><th>{t(locale, 'sameDay')}</th></tr></thead><tbody>
          {zones?.map((z) => { const r = rows[z.id]; if (!r) return null; const set = (p: Partial<typeof r>) => setRows({ ...rows, [z.id]: { ...r, ...p } }); return (
            <tr key={z.id} className="inline"><td><label className="radio"><input type="checkbox" checked={r.on} onChange={(e) => set({ on: e.target.checked })} />{locale === 'ur' && z.nameUr ? z.nameUr : z.name}</label></td>
              <td><input aria-label={`${z.name} ${t(locale, 'charge')}`} type="number" min={0} value={r.charge} onChange={(e) => set({ charge: e.target.value })} /></td>
              <td><input aria-label={`${z.name} ${t(locale, 'minOrder')}`} type="number" min={0} value={r.min} onChange={(e) => set({ min: e.target.value })} /></td>
              <td><input aria-label={`${z.name} ${t(locale, 'sameDay')}`} type="time" value={r.cutoff} onChange={(e) => set({ cutoff: e.target.value })} /></td></tr>); })}
        </tbody></table>
        <button className="btn small" onClick={saveZones} style={{ marginTop: 10 }}>{t(locale, 'save')}</button>
      </Section>
      <Section title={t(locale, 'slots')}>
        {slotRows.map((r, i) => { const set = (p: Partial<typeof r>) => setSlotRows(slotRows.map((x, j) => (j === i ? { ...x, ...p } : x))); return (
          <div key={i} className="row inline" style={{ marginBottom: 8 }}>
            {DAYS.map((d, di) => <label key={d} className="radio"><input type="checkbox" checked={r.days.includes(di)} onChange={(e) => set({ days: e.target.checked ? [...r.days, di] : r.days.filter((x) => x !== di) })} />{d}</label>)}
            <input type="time" aria-label={t(locale, 'from')} value={r.from} onChange={(e) => set({ from: e.target.value })} />–<input type="time" aria-label={t(locale, 'to')} value={r.to} onChange={(e) => set({ to: e.target.value })} />
            <input type="number" min={1} aria-label={t(locale, 'capacity')} value={r.cap} onChange={(e) => set({ cap: e.target.value })} />
            <button className="btn small secondary" onClick={() => setSlotRows(slotRows.filter((_, j) => j !== i))}>×</button>
          </div>); })}
        <div className="row"><button className="btn small secondary" onClick={() => setSlotRows([...slotRows, { days: [0, 1, 2, 3, 4, 5, 6], from: '12:00', to: '15:00', cap: '5' }])}>+</button><button className="btn small" onClick={saveSlots}>{t(locale, 'save')}</button></div>
      </Section>
      <Section title={t(locale, 'closedDays')}>
        <ul>{blackouts?.map((b) => <li key={b.id}>{b.date.slice(0, 10)} {b.reason ?? ''} <button className="btn small secondary" onClick={async () => { await bff(`vendor/blackouts/${b.id}`, 'DELETE'); void reloadB(); }}>×</button></li>)}</ul>
        <div className="row"><input type="date" aria-label={t(locale, 'addClosedDay')} value={newClosed.date} onChange={(e) => setNewClosed({ ...newClosed, date: e.target.value })} /><input placeholder={t(locale, 'reason')} value={newClosed.reason} onChange={(e) => setNewClosed({ ...newClosed, reason: e.target.value })} />
          <button className="btn small" disabled={!newClosed.date} onClick={async () => { await bff('vendor/blackouts', 'POST', { date: newClosed.date, reason: newClosed.reason || undefined }); setNewClosed({ date: '', reason: '' }); void reloadB(); }}>{t(locale, 'addClosedDay')}</button></div>
      </Section>
      <StaffSection locale={locale} />
    </>
  );
}

function StaffSection({ locale }: { locale: Locale }) {
  const [staff, reload] = useLoad<{ id: string; role: string; user: { phone: string; name?: string } }[]>('vendor/staff');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  if (!staff || !Array.isArray(staff)) return null; // staff members (non-owners) don't see this
  return (
    <div className="card"><h2>{t(locale, 'staff')}</h2>
      <ul>{staff.map((m) => <li key={m.id}><span dir="ltr">{m.user.phone}</span> {m.user.name ?? ''} · {m.role}{m.role === 'STAFF' && <button className="btn small secondary" onClick={async () => { await bff(`vendor/staff/${m.id}`, 'DELETE'); void reload(); }}>×</button>}</li>)}</ul>
      <div className="row"><input type="tel" dir="ltr" aria-label={t(locale, 'addStaff')} placeholder="03XX XXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} /><button className="btn small" onClick={async () => { const r = await bff('vendor/staff', 'POST', { phone }); setErr(r.ok ? '' : r.data.error?.message ?? ''); setPhone(''); void reload(); }}>{t(locale, 'addStaff')}</button></div>
      <ErrorText msg={err} />
    </div>
  );
}

// ---------------- documents ----------------
export function Documents({ locale }: { locale: Locale }) {
  const [docs, reload] = useLoad<{ id: string; type: string; status: string; reviewNote?: string; createdAt: string }[]>('vendor/documents');
  const [type, setType] = useState('CNIC_FRONT');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState('');
  async function upload(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!file) return;
    const up = await fileToUpload(file, 'KYC');
    if (!up.ok) return setErr(up.data.error?.message ?? '');
    const r = await bff('vendor/documents', 'POST', { type, key: up.data.key });
    if (!r.ok) return setErr(r.data.error?.message ?? '');
    setFile(null); void reload();
  }
  return (
    <>
      <form className="stack card" onSubmit={upload} style={{ maxWidth: 520 }}>
        <label>{t(locale, 'docType')}<select value={type} onChange={(e) => setType(e.target.value)}>{['CNIC_FRONT', 'CNIC_BACK', 'NTN_CERTIFICATE', 'BUSINESS_REGISTRATION', 'BANK_PROOF', 'OTHER'].map((d) => <option key={d}>{d}</option>)}</select></label>
        <label>{t(locale, 'file')}<input type="file" accept="image/jpeg,image/png,application/pdf" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <ErrorText msg={err} /><button className="btn">{t(locale, 'uploadDoc')}</button>
      </form>
      <table style={{ marginTop: 16 }}><tbody>{Array.isArray(docs) && docs.map((d) => <tr key={d.id}><td>{d.type}</td><td><span className="pill status">{statusLabel(locale, d.status)}</span></td><td className="muted">{d.reviewNote ?? ''}</td><td className="muted">{d.createdAt.slice(0, 10)}</td></tr>)}</tbody></table>
    </>
  );
}

// ---------------- earnings ----------------
export function Earnings({ locale }: { locale: Locale }) {
  const [e] = useLoad<{ error?: unknown; orders: { count: number; netPaisa: number; commissionPaisa: number }; bookings: { count: number; collectedPaisa: number; commissionPaisa: number }; paidOutPaisa: number; note: string; payouts: { id: string; periodStart: string; periodEnd: string; netPaisa: number; status: string }[] }>('vendor/earnings');
  if (!e) return <p className="muted">…</p>;
  if (e.error) return <p className="muted">Only the shop owner can see earnings.</p>;
  const tile = (label: string, v: number) => <div className="tile"><span className="muted">{label}</span><b>{formatPKR(v, locale)}</b></div>;
  return (
    <>
      <div className="tiles">
        {tile(`${t(locale, 'earned')} (${e.orders.count})`, e.orders.netPaisa)}
        {tile(`${t(locale, 'collected')} (${e.bookings.count})`, e.bookings.collectedPaisa)}
        {tile(t(locale, 'commission'), e.orders.commissionPaisa + e.bookings.commissionPaisa)}
        {tile(t(locale, 'paidOut'), e.paidOutPaisa)}
      </div>
      <p className="notice">{e.note}</p>
      <h2>{t(locale, 'payouts')}</h2>
      <table><tbody>{e.payouts.map((p) => <tr key={p.id}><td>{p.periodStart.slice(0, 10)} → {p.periodEnd.slice(0, 10)}</td><td>{formatPKR(p.netPaisa, locale)}</td><td>{p.status}</td></tr>)}</tbody></table>
    </>
  );
}
