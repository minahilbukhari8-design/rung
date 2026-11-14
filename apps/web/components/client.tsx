'use client';

import { formatPKR } from '@rung/domain';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { t, type Locale } from '@/lib/i18n';

async function bff<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: { code: string; message: string } } }> {
  const res = await fetch(`/bff/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button className="btn small secondary" style={{ color: 'inherit', borderColor: 'currentColor' }} onClick={async () => { await bff('auth/logout', 'POST', {}); router.push('/'); router.refresh(); }}>
      {label}
    </button>
  );
}

// ---------------- login ----------------
export function LoginForm({ locale, next }: { locale: Locale; next: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    const r = await bff('auth/otp/request', 'POST', { phone });
    setBusy(false);
    if (!r.ok) return setErr(r.data.error?.message ?? 'Error');
    setSent(true);
  }
  async function verify(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    const r = await bff('auth/otp/verify', 'POST', { phone, code });
    setBusy(false);
    if (!r.ok) return setErr(r.data.error?.message ?? 'Error');
    router.push(next); router.refresh();
  }
  return sent ? (
    <form className="stack" onSubmit={verify}>
      <label>{t(locale, 'code')}<input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required /></label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn" disabled={busy}>{t(locale, 'verify')}</button>
    </form>
  ) : (
    <form className="stack" onSubmit={send}>
      <label>{t(locale, 'phone')}<input type="tel" inputMode="tel" autoComplete="tel" placeholder="0300 1234567" value={phone} onChange={(e) => setPhone(e.target.value)} required dir="ltr" /></label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn" disabled={busy}>{t(locale, 'sendCode')}</button>
    </form>
  );
}

// ---------------- product: add to cart ----------------
interface Variant { id: string; name: string; nameUr?: string | null; pricePaisa: number; stock: number; trackInventory: boolean }
interface Custom { id: string; label: string; labelUr?: string | null; type: 'TEXT' | 'IMAGE' | 'CHOICE'; isRequired: boolean; maxLength?: number | null; extraPricePaisa: number; choices?: { value: string; label: string; extraPaisa?: number }[] | null }

export function AddToCart({ locale, variants, customizations, loggedIn }: { locale: Locale; variants: Variant[]; customizations: Custom[]; loggedIn: boolean }) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const v = variants.find((x) => x.id === variantId);
  const extras = customizations.reduce((a, c) => {
    const val = values[c.id];
    if (!val) return a;
    const choice = c.type === 'CHOICE' ? c.choices?.find((x) => x.value === val)?.extraPaisa ?? 0 : 0;
    return a + c.extraPricePaisa + choice;
  }, 0);

  async function add(e: FormEvent) {
    e.preventDefault(); setErr(''); setMsg('');
    if (!loggedIn) return router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
    const customization = Object.fromEntries(Object.entries(values).filter(([, x]) => x !== ''));
    const r = await bff('cart/items', 'POST', { variantId, quantity: qty, customization });
    if (!r.ok) return setErr(r.data.error?.message ?? 'Error');
    setMsg(t(locale, 'added')); router.refresh();
  }
  return (
    <form className="stack card" onSubmit={add}>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {variants.map((x) => {
          const out = x.trackInventory && x.stock < 1;
          return (
            <label key={x.id} className="radio">
              <input type="radio" name="variant" value={x.id} checked={variantId === x.id} disabled={out} onChange={() => setVariantId(x.id)} />
              {locale === 'ur' && x.nameUr ? x.nameUr : x.name} · <strong>{formatPKR(x.pricePaisa, locale)}</strong> {out && <span className="muted">(sold out)</span>}
            </label>
          );
        })}
      </fieldset>
      {customizations.map((c) => (
        <label key={c.id}>
          {locale === 'ur' && c.labelUr ? c.labelUr : c.label} {c.isRequired && <span className="muted">({t(locale, 'required')})</span>}
          {c.type === 'CHOICE' ? (
            <select value={values[c.id] ?? ''} required={c.isRequired} onChange={(e) => setValues({ ...values, [c.id]: e.target.value })}>
              <option value="">—</option>
              {c.choices?.map((ch) => <option key={ch.value} value={ch.value}>{ch.label}{ch.extraPaisa ? ` (+${formatPKR(ch.extraPaisa, locale)})` : ''}</option>)}
            </select>
          ) : (
            <input value={values[c.id] ?? ''} maxLength={c.maxLength ?? undefined} required={c.isRequired} onChange={(e) => setValues({ ...values, [c.id]: e.target.value })} />
          )}
        </label>
      ))}
      <label>{t(locale, 'quantity')}<input type="number" min={1} max={20} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></label>
      {v && <div className="price">{t(locale, 'total')}: {formatPKR((v.pricePaisa + extras) * qty, locale)}</div>}
      {err && <p className="error" role="alert">{err}</p>}
      {msg && <p role="status">{msg} · <a href="/cart">{t(locale, 'cart')} →</a></p>}
      <button className="btn" disabled={!v}>{t(locale, 'addToCart')}</button>
    </form>
  );
}

// ---------------- cart + checkout ----------------
interface CartItem { id: string; quantity: number; customization: Record<string, string>; variant: { id: string; name: string; pricePaisa: number; product: { id: string; title: string; titleUr?: string | null; vendorId: string; vendor?: { name: string; nameUr?: string | null; isDemo: boolean } } } }
interface Address { id: string; label?: string; recipientName: string; area: string; line1: string; zoneId?: string | null }
interface Slot { startMinute: number; endMinute: number; remaining: number }
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const pktToday = (plus: number) => new Date(Date.now() + 5 * 3600_000 + plus * 86_400_000).toISOString().slice(0, 10);

export function CartCheckout({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[] | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState('');
  const [choice, setChoice] = useState<Record<string, { date: string; slot?: number; slots: Slot[]; gift: string }>>({});
  const [provider, setProvider] = useState<'COD' | 'MOCK' | 'BANK_TRANSFER'>('MOCK');
  const [senderName, setSenderName] = useState('');
  const [hideSender, setHideSender] = useState(false);
  const [quote, setQuote] = useState<{ grandTotalPaisa: number; groups: { vendorId: string; subtotalPaisa: number; deliveryChargePaisa: number }[] } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [key] = useState(newKey);
  const [newAddr, setNewAddr] = useState({ recipientName: '', recipientPhone: '', line1: '', area: '' });

  async function load() {
    const [c, a] = await Promise.all([bff<{ items: CartItem[] }>('cart'), bff<Address[]>('me/addresses')]);
    if (c.status === 401) return router.push('/login?next=/cart');
    setItems(c.data.items ?? []);
    const list = Array.isArray(a.data) ? a.data : [];
    setAddresses(list);
    if (list[0] && !addressId) setAddressId(list[0].id);
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const m = new Map<string, CartItem[]>();
    for (const it of items ?? []) m.set(it.variant.product.vendorId, [...(m.get(it.variant.product.vendorId) ?? []), it]);
    return [...m.entries()];
  }, [items]);
  const zoneId = addresses.find((a) => a.id === addressId)?.zoneId;

  async function loadSlots(vendorId: string, productId: string, date: string) {
    const prev = choice[vendorId] ?? { date, slots: [], gift: '' };
    if (!zoneId) return setChoice((c) => ({ ...c, [vendorId]: { ...prev, date, slots: [], slot: undefined } }));
    const r = await bff<{ slots: Slot[] }>(`products/${productId}/delivery-slots?zone=${zoneId}&date=${date}`);
    const slots = r.data.slots ?? [];
    setChoice((c) => ({ ...c, [vendorId]: { ...prev, date, slots, slot: slots[0]?.startMinute } }));
  }
  useEffect(() => {
    groups.forEach(([vendorId, its]) => void loadSlots(vendorId, its[0]!.variant.product.id, choice[vendorId]?.date ?? pktToday(1)));
  }, [groups.length, zoneId]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupPayload = () => groups.map(([vendorId]) => ({ vendorId, addressId, date: choice[vendorId]?.date ?? pktToday(1), slotStartMinute: choice[vendorId]?.slot ?? -1, giftMessage: choice[vendorId]?.gift || undefined, hideSenderName: hideSender }));
  const ready = addressId && groups.length > 0 && groups.every(([v]) => choice[v]?.slot !== undefined);

  useEffect(() => {
    if (!ready) return setQuote(null);
    void bff<NonNullable<typeof quote>>('checkout/quote', 'POST', { groups: groupPayload() }).then((r) => (r.ok ? (setQuote(r.data), setErr('')) : setErr(r.data.error?.message ?? '')));
  }, [ready, JSON.stringify(choice), addressId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveAddress(e: FormEvent) {
    e.preventDefault(); setErr('');
    const r = await bff<Address>('me/addresses', 'POST', newAddr);
    if (!r.ok) return setErr(r.data.error?.message ?? 'Error');
    if (!r.data.zoneId) setErr('We do not deliver to this area yet.');
    setAddresses([r.data, ...addresses]); setAddressId(r.data.id);
  }
  async function remove(id: string) { await bff(`cart/items/${id}`, 'DELETE'); await load(); router.refresh(); }
  async function place() {
    setBusy(true); setErr('');
    const r = await bff<{ orders: string[]; payment: { status: string } }>('checkout', 'POST', { provider, idempotencyKey: key, senderName, groups: groupPayload() });
    setBusy(false);
    if (!r.ok) return setErr(r.data.error?.message ?? 'Error');
    router.push(`/orders/${r.data.orders[0]}?placed=1`); router.refresh();
  }

  if (items === null) return <p className="muted">…</p>;
  if (!items.length) return <p>{t(locale, 'emptyCart')} <a href="/products">{t(locale, 'products')} →</a></p>;
  return (
    <div className="two">
      <div>
        {groups.map(([vendorId, its]) => {
          const c = choice[vendorId];
          return (
            <div key={vendorId} className="card" style={{ marginBottom: 16 }} data-testid="vendor-group">
              <h3>{(locale === 'ur' && its[0]!.variant.product.vendor?.nameUr) || its[0]!.variant.product.vendor?.name}</h3>
              <table><tbody>{its.map((it) => (
                <tr key={it.id}>
                  <td>{locale === 'ur' && it.variant.product.titleUr ? it.variant.product.titleUr : it.variant.product.title} · {it.variant.name} × {it.quantity}</td>
                  <td>{formatPKR(it.variant.pricePaisa * it.quantity, locale)}</td>
                  <td><button className="btn small secondary" onClick={() => remove(it.id)} aria-label="Remove">×</button></td>
                </tr>
              ))}</tbody></table>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                <label>{t(locale, 'deliveryDate')}<input type="date" min={pktToday(0)} value={c?.date ?? pktToday(1)} onChange={(e) => loadSlots(vendorId, its[0]!.variant.product.id, e.target.value)} /></label>
                <label>{t(locale, 'slot')}
                  <select value={c?.slot ?? ''} onChange={(e) => setChoice({ ...choice, [vendorId]: { ...c!, slot: Number(e.target.value) } })} disabled={!c?.slots.length}>
                    {c?.slots.map((s) => <option key={s.startMinute} value={s.startMinute}>{hhmm(s.startMinute)}–{hhmm(s.endMinute)}</option>)}
                  </select>
                </label>
              </div>
              {c && !c.slots.length && <p className="muted">{t(locale, 'noSlots')}</p>}
              <label style={{ marginTop: 10 }}>{t(locale, 'giftMessage')}<textarea maxLength={250} rows={2} value={c?.gift ?? ''} onChange={(e) => setChoice({ ...choice, [vendorId]: { ...c!, gift: e.target.value } })} /></label>
            </div>
          );
        })}
      </div>
      <div className="card">
        <h2>{t(locale, 'checkout')}</h2>
        <h3>{t(locale, 'deliverTo')}</h3>
        {addresses.map((a) => (
          <label key={a.id} className="radio"><input type="radio" name="addr" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />{a.recipientName}, {a.line1}, {a.area}</label>
        ))}
        <details open={!addresses.length} style={{ margin: '10px 0' }}>
          <summary>{t(locale, 'newAddress')}</summary>
          <form className="stack" onSubmit={saveAddress} style={{ marginTop: 10 }}>
            <label>{t(locale, 'recipientName')}<input required value={newAddr.recipientName} onChange={(e) => setNewAddr({ ...newAddr, recipientName: e.target.value })} /></label>
            <label>{t(locale, 'recipientPhone')}<input required type="tel" dir="ltr" value={newAddr.recipientPhone} onChange={(e) => setNewAddr({ ...newAddr, recipientPhone: e.target.value })} /></label>
            <label>{t(locale, 'addressLine')}<input required value={newAddr.line1} onChange={(e) => setNewAddr({ ...newAddr, line1: e.target.value })} /></label>
            <label>{t(locale, 'area')}<input required placeholder="Gulberg, DHA, Johar Town…" value={newAddr.area} onChange={(e) => setNewAddr({ ...newAddr, area: e.target.value })} /></label>
            <button className="btn secondary">{t(locale, 'saveAddress')}</button>
          </form>
        </details>
        <label>{t(locale, 'senderName')}<input required value={senderName} onChange={(e) => setSenderName(e.target.value)} /></label>
        <label className="radio" style={{ marginTop: 8 }}><input type="checkbox" checked={hideSender} onChange={(e) => setHideSender(e.target.checked)} />{t(locale, 'hideSender')}</label>
        <h3 style={{ marginTop: 16 }}>{t(locale, 'payment')}</h3>
        {(['MOCK', 'COD', 'BANK_TRANSFER'] as const).map((p) => (
          <label key={p} className="radio"><input type="radio" name="pay" checked={provider === p} onChange={() => setProvider(p)} />{t(locale, p === 'MOCK' ? 'mockPay' : p === 'COD' ? 'cod' : 'bankTransfer')}</label>
        ))}
        {quote && (
          <table style={{ marginTop: 12 }}><tbody>
            <tr><td>{t(locale, 'subtotal')}</td><td>{formatPKR(quote.groups.reduce((a, g) => a + g.subtotalPaisa, 0), locale)}</td></tr>
            <tr><td>{t(locale, 'delivery')}</td><td>{formatPKR(quote.groups.reduce((a, g) => a + g.deliveryChargePaisa, 0), locale)}</td></tr>
            <tr><th>{t(locale, 'total')}</th><th data-testid="grand-total">{formatPKR(quote.grandTotalPaisa, locale)}</th></tr>
          </tbody></table>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn" style={{ marginTop: 12, width: '100%' }} disabled={!ready || !senderName || busy || !quote} onClick={place}>{t(locale, 'placeOrder')}</button>
      </div>
    </div>
  );
}

// ---------------- order cancel ----------------
export function CancelOrder({ locale, number }: { locale: Locale; number: string }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  return (
    <>
      <button className="btn secondary small" onClick={async () => { const r = await bff(`orders/${number}/cancel`, 'POST', {}); if (!r.ok) setErr(r.data.error?.message ?? ''); router.refresh(); }}>{t(locale, 'cancel')}</button>
      {err && <p className="error">{err}</p>}
    </>
  );
}

// ---------------- booking ----------------
interface Pkg { id: string; name: string; nameUr?: string | null; pricePaisa: number; advanceBps: number; inclusions: string[]; minGuests?: number | null; maxGuests?: number | null }

export function BookingForm({ locale, serviceId, packages, loggedIn }: { locale: Locale; serviceId: string; packages: Pkg[]; loggedIn: boolean }) {
  const router = useRouter();
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [venue, setVenue] = useState({ address: '', area: '' });
  const [guests, setGuests] = useState('');
  const [notes, setNotes] = useState('');
  const [days, setDays] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const pkg = packages.find((p) => p.id === packageId);

  useEffect(() => {
    if (!date) return;
    void bff<{ days: { date: string; available: boolean }[] }>(`services/${serviceId}/availability?month=${date.slice(0, 7)}`).then((r) => setDays(Object.fromEntries((r.data.days ?? []).map((d) => [d.date, d.available]))));
  }, [date.slice(0, 7)]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!loggedIn) return router.push(`/login?next=${encodeURIComponent(location.pathname)}`);
    setBusy(true);
    const eventStart = `${date}T${time}:00+05:00`;
    const r = await bff<{ number: string }>('bookings', 'POST', { packageId, eventStart, venue, guestCount: guests ? Number(guests) : undefined, notes: notes || undefined });
    setBusy(false);
    if (!r.ok) return setErr(r.data.error?.message ?? 'Error');
    router.push(`/bookings/${r.data.number}`); router.refresh();
  }
  return (
    <form className="stack card" onSubmit={submit}>
      {packages.map((p) => (
        <label key={p.id} className="radio" style={{ alignItems: 'flex-start' }}>
          <input type="radio" name="pkg" checked={packageId === p.id} onChange={() => setPackageId(p.id)} />
          <span><strong>{locale === 'ur' && p.nameUr ? p.nameUr : p.name}</strong> · {formatPKR(p.pricePaisa, locale)}<br />
            <span className="muted">{t(locale, 'advance')}: {formatPKR(Math.floor((p.pricePaisa * p.advanceBps + 5000) / 10000), locale)}{p.inclusions.length ? ` · ${t(locale, 'inclusions')}: ${p.inclusions.join(', ')}` : ''}</span></span>
        </label>
      ))}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
        <label>{t(locale, 'eventDate')}<input type="date" required min={pktToday(1)} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>&nbsp;<input type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      {date && days[date] === false && <p className="error">That date is fully booked.</p>}
      <label>{t(locale, 'venue')}<input required value={venue.address} onChange={(e) => setVenue({ ...venue, address: e.target.value })} /></label>
      <label>{t(locale, 'area')}<input required value={venue.area} onChange={(e) => setVenue({ ...venue, area: e.target.value })} /></label>
      <label>{t(locale, 'guests')}<input type="number" min={pkg?.minGuests ?? 1} max={pkg?.maxGuests ?? 5000} value={guests} onChange={(e) => setGuests(e.target.value)} /></label>
      <label>{t(locale, 'notes')}<textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn" disabled={busy || days[date] === false}>{t(locale, 'bookNow')}</button>
    </form>
  );
}

export function BookingActions({ locale, number, status, canPayRemaining }: { locale: Locale; number: string; status: string; canPayRemaining: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function pay(stage: 'advance' | 'remaining') {
    setBusy(true); setErr('');
    const r = await bff(`bookings/${number}/pay`, 'POST', { stage, provider: 'MOCK', idempotencyKey: newKey() });
    setBusy(false);
    if (!r.ok) setErr(r.data.error?.message ?? ''); router.refresh();
  }
  async function cancel() {
    setBusy(true);
    const r = await bff(`bookings/${number}/cancel`, 'POST', {});
    setBusy(false);
    if (!r.ok) setErr(r.data.error?.message ?? ''); router.refresh();
  }
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {status === 'ACCEPTED' && <button className="btn" disabled={busy} onClick={() => pay('advance')}>{t(locale, 'payAdvance')}</button>}
      {canPayRemaining && <button className="btn" disabled={busy} onClick={() => pay('remaining')}>{t(locale, 'payRemaining')}</button>}
      {['REQUESTED', 'ACCEPTED', 'CONFIRMED', 'FULLY_PAID'].includes(status) && <button className="btn secondary" disabled={busy} onClick={cancel}>{t(locale, 'cancel')}</button>}
      {(status === 'ACCEPTED' || canPayRemaining) && <span className="muted">{t(locale, 'mockPay')}</span>}
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}
