'use client';

import { formatPKR } from '@rung/domain';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Res<T> = { ok: boolean; status: number; data: T & { error?: { code: string; message: string } } };
async function bff<T = any>(path: string, method = 'GET', body?: unknown): Promise<Res<T>> {
  const res = await fetch(`/bff/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}
const rs = (p: number) => formatPKR(p, 'en');
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }) : '—');
const day = (iso: string) => iso.slice(0, 10);
const label = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

function useLoad<T>(path: string | null) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const r = await bff<T>(path);
    if (r.status === 401) return router.push('/login');
    setStatus(r.status);
    setData(r.ok ? r.data : null);
  }, [path, router]);
  useEffect(() => { void reload(); }, [reload]);
  return [data, reload, status] as const;
}

function ErrorText({ msg }: { msg: string }) {
  return msg ? <p className="error" role="alert">{msg}</p> : null;
}
function Denied({ status }: { status: number }) {
  if (status === 403) return <p className="notice" role="alert">Your admin account does not have permission for this section.</p>;
  return <p className="muted">Loading…</p>;
}
function Pill({ s }: { s: string }) {
  return <span className="pill status">{label(s)}</span>;
}

/** Runs an action and reports its error; `ask` adds a required text input (reason / reference). */
function Action({ text, ask, run, kind = 'primary', testId }: { text: string; ask?: string; run: (input: string) => Promise<Res<unknown>>; kind?: 'primary' | 'secondary'; testId?: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setErr('');
    const r = await run(v.trim());
    setBusy(false);
    if (!r.ok) return setErr((r.data as any).error?.message ?? 'Failed');
    setOpen(false); setV('');
  }
  const cls = `btn small ${kind === 'secondary' ? 'secondary' : ''}`;
  if (!ask) return <span data-testid={testId}><button className={cls} disabled={busy} onClick={() => go()}>{text}</button><ErrorText msg={err} /></span>;
  return open ? (
    <form className="row" onSubmit={go} data-testid={testId}>
      <input aria-label={ask} placeholder={ask} value={v} onChange={(e) => setV(e.target.value)} required autoFocus />
      <button className={cls} disabled={busy || !v.trim()}>{text}</button>
      <button type="button" className="btn small secondary" onClick={() => setOpen(false)}>Back</button>
      <ErrorText msg={err} />
    </form>
  ) : <span data-testid={testId}><button className={cls} onClick={() => setOpen(true)}>{text}</button></span>;
}

function Tabs({ values, value, onChange }: { values: string[]; value: string; onChange: (v: string) => void }) {
  return <div className="tabs" role="tablist">{values.map((s) => <button key={s} role="tab" aria-selected={s === value} className={`btn small ${s === value ? '' : 'secondary'}`} onClick={() => onChange(s)}>{label(s || 'ALL')}</button>)}</div>;
}

// ---------------- auth ----------------
export function LogoutButton() {
  const router = useRouter();
  return <button className="btn small secondary" style={{ color: 'inherit', borderColor: 'currentColor' }} onClick={async () => { await bff('auth/logout', 'POST', {}); router.push('/login'); router.refresh(); }}>Log out</button>;
}

export function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  return sent ? (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await bff('auth/otp/verify', 'POST', { phone, code }); if (!r.ok) return setErr(r.data.error?.message ?? ''); router.push('/'); router.refresh(); }}>
      <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required /></label>
      <ErrorText msg={err} /><button className="btn">Verify</button>
    </form>
  ) : (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await bff('auth/otp/request', 'POST', { phone }); if (!r.ok) return setErr(r.data.error?.message ?? ''); setSent(true); }}>
      <label>Mobile number<input type="tel" placeholder="0300 1234567" value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
      <ErrorText msg={err} /><button className="btn">Send code</button>
    </form>
  );
}

// ---------------- overview ----------------
export function Overview() {
  const [me, , meStatus] = useLoad<{ phone: string; permissions: string[] }>('admin/me');
  const [o] = useLoad<any>(me ? 'admin/overview' : null);
  if (meStatus === 403) return <p className="notice" role="alert">This account is not a RUNG admin. Ask a super admin to give you access.</p>;
  if (!me || !o) return <p className="muted">Loading…</p>;
  const tile = (title: string, n: number, href: string, alert = false) => <a className={`tile ${alert && n > 0 ? 'alert' : ''}`} href={href}><span className="muted">{title}</span><b>{n}</b></a>;
  return (
    <>
      <h1>Overview</h1>
      <p className="muted">Signed in as <span className="mono">{me.phone}</span> · permissions: {me.permissions.length ? me.permissions.map(label).join(', ') : 'none (view only)'}</p>
      <h2>Waiting on the team</h2>
      <div className="tiles">
        {tile('Shops to review', o.queues.vendorsPending, '/vendors', true)}
        {tile('KYC documents', o.queues.docsPending, '/documents', true)}
        {tile('Bank transfers to check', o.queues.transfersPending, '/payments', true)}
        {tile('Refunds to send', o.queues.refundsManual, '/refunds', true)}
        {tile('Orders past respond-by', o.queues.lateOrders, '/orders?status=PLACED', true)}
      </div>
      <h2>Activity</h2>
      <div className="tiles">
        {tile('Orders placed today', o.ordersToday, '/orders')}
        {tile('New orders', o.orders.PLACED ?? 0, '/orders?status=PLACED')}
        {tile('Out for delivery', o.orders.OUT_FOR_DELIVERY ?? 0, '/orders?status=OUT_FOR_DELIVERY')}
        {tile('Booking requests', o.bookings.REQUESTED ?? 0, '/bookings?status=REQUESTED')}
        {tile('Confirmed bookings', (o.bookings.CONFIRMED ?? 0) + (o.bookings.FULLY_PAID ?? 0), '/bookings?status=CONFIRMED')}
      </div>
      <p>Delivered in the last 7 days: <b>{rs(o.last7Days.deliveredGmvPaisa)}</b> · commission <b>{rs(o.last7Days.commissionPaisa)}</b></p>
    </>
  );
}

// ---------------- vendors ----------------
function VendorDetail({ id, onChange }: { id: string; onChange: () => void }) {
  const [v, reload] = useLoad<any>(`admin/vendors/${id}`);
  const [pct, setPct] = useState('');
  if (!v) return <p className="muted">Loading…</p>;
  const done = async (r: Res<unknown>) => { if (r.ok) { await reload(); onChange(); } return r; };
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <p className="muted">Phone <span className="mono">{v.phone}</span> · {label(v.kind)} · {v.city} · applied {when(v.createdAt)} · {v._count.products} products, {v._count.services} services, {v._count.orders} orders, {v._count.bookings} bookings</p>
      <p className="muted">Team: {v.members.map((m: any) => `${m.user.phone} (${label(m.role)})`).join(', ')} · Payout account {v.hasPayoutAccount ? 'on file' : 'not added'}</p>
      <div>
        <strong>Documents</strong>
        {v.documents.length === 0 ? <p className="muted">None uploaded yet.</p> : <ul>{v.documents.map((d: any) => <li key={d.id}>{label(d.type)} · <Pill s={d.status} /> <a href={`/bff/files/${d.storageKey}`} target="_blank" rel="noreferrer">Open</a>{d.reviewNote ? ` · “${d.reviewNote}”` : ''}</li>)}</ul>}
      </div>
      <div className="row">
        {v.status !== 'APPROVED' && <Action testId="approve" text="Approve shop" run={async () => done(await bff(`admin/vendors/${id}/approve`, 'POST', {}))} />}
        {v.status === 'PENDING_REVIEW' && <Action text="Reject" ask="Reason for rejecting" kind="secondary" run={async (reason) => done(await bff(`admin/vendors/${id}/reject`, 'POST', { reason }))} />}
        {v.status === 'APPROVED' && <Action text="Suspend" ask="Reason for suspending" kind="secondary" run={async (reason) => done(await bff(`admin/vendors/${id}/suspend`, 'POST', { reason }))} />}
      </div>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); const r = await bff(`admin/vendors/${id}`, 'PATCH', { commissionBps: Math.round(Number(pct) * 100) }); if (r.ok) { setPct(''); await done(r); } }}>
        <label className="row">Commission %<input type="number" step="0.5" min={0} max={50} placeholder={String(v.commissionBps / 100)} value={pct} onChange={(e) => setPct(e.target.value)} style={{ width: 90 }} /></label>
        <button className="btn small secondary" disabled={!pct}>Save commission</button>
      </form>
    </div>
  );
}

export function Vendors() {
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [list, reload, st] = useLoad<any[]>(`admin/vendors?status=${status}`);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <h1>Vendors</h1>
      <Tabs values={['PENDING_REVIEW', 'APPROVED', 'SUSPENDED', 'REJECTED']} value={status} onChange={(s) => { setStatus(s); setOpen(null); }} />
      {!list ? <Denied status={st} /> : list.length === 0 ? <p className="muted">No shops here.</p> : (
        <div className="list">{list.map((v) => (
          <div key={v.id} className="card" data-testid={`vendor-${v.slug}`}>
            <div className="row">
              <strong>{v.name}</strong>{v.nameUr && <span lang="ur">{v.nameUr}</span>}{v.isDemo && <span className="pill demo">DEMO</span>}<Pill s={v.status} />
              {v.isVerified && <span className="pill ok">CNIC verified</span>}
              <span className="muted">{v.commissionBps / 100}% commission</span>
              <button className="btn small secondary" onClick={() => setOpen(open === v.id ? null : v.id)}>{open === v.id ? 'Close' : 'Details'}</button>
            </div>
            {open === v.id && <VendorDetail id={v.id} onChange={reload} />}
          </div>
        ))}</div>
      )}
    </>
  );
}

// ---------------- KYC ----------------
export function Documents() {
  const [status, setStatus] = useState('SUBMITTED');
  const [docs, reload, st] = useLoad<any[]>(`admin/documents?status=${status}`);
  return (
    <>
      <h1>KYC documents</h1>
      <p className="muted">Files are private: only admins and the shop that uploaded them can open them. A shop is marked “CNIC verified” once both sides are accepted.</p>
      <Tabs values={['SUBMITTED', 'ACCEPTED', 'REJECTED']} value={status} onChange={setStatus} />
      {!docs ? <Denied status={st} /> : docs.length === 0 ? <p className="muted">Nothing to review.</p> : (
        <div className="list">{docs.map((d) => (
          <div key={d.id} className="card row" data-testid={`doc-${d.id}`}>
            <strong>{d.vendor.name}</strong><span>{label(d.type)}</span><Pill s={d.status} /><span className="muted">{when(d.createdAt)}</span>
            <a className="btn small secondary" href={`/bff/files/${d.storageKey}`} target="_blank" rel="noreferrer">Open file</a>
            {d.status === 'SUBMITTED' && <>
              <Action text="Accept" run={async () => { const r = await bff(`admin/documents/${d.id}/review`, 'POST', { status: 'ACCEPTED' }); if (r.ok) await reload(); return r; }} />
              <Action text="Reject" kind="secondary" ask="What is wrong with it" run={async (note) => { const r = await bff(`admin/documents/${d.id}/review`, 'POST', { status: 'REJECTED', note }); if (r.ok) await reload(); return r; }} />
            </>}
            {d.reviewNote && <span className="muted">“{d.reviewNote}”</span>}
          </div>
        ))}</div>
      )}
    </>
  );
}

// ---------------- orders / bookings ----------------
function OrderDetail({ number, onChange }: { number: string; onChange: () => void }) {
  const [o, reload] = useLoad<any>(`admin/orders/${number}`);
  if (!o) return <p className="muted">Loading…</p>;
  const canCancel = !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status);
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <p className="muted">Customer <span className="mono">{o.customer.phone}</span> · Sender {o.senderName} · Recipient {o.recipientName} <span className="mono">{o.recipientPhone}</span> · {o.addressSnapshot.line1}, {o.addressSnapshot.area}</p>
      <p className="muted">Shop {o.vendor.name} <span className="mono">{o.vendor.phone}</span> · Delivery {day(o.deliveryDate)} · Commission {rs(o.commissionPaisa)}</p>
      <ul>{o.items.map((i: any) => <li key={i.id}>{i.productTitle} · {i.variantName} × {i.quantity}</li>)}</ul>
      <p className="muted">Payments: {o.group.payments.map((p: any) => `${label(p.provider)} ${rs(p.amountPaisa)} ${label(p.status)}${p.isSandbox ? ' (sandbox)' : ''}`).join('; ') || 'none'}</p>
      {o.refunds.length > 0 && <p className="muted">Refunds: {o.refunds.map((r: any) => `${rs(r.amountPaisa)} ${label(r.status)}`).join('; ')}</p>}
      <ol className="timeline">{o.events.map((e: any) => <li key={e.id}>{label(e.to)} · {label(e.actorType)} · {when(e.createdAt)}{e.note ? ` · “${e.note}”` : ''}</li>)}</ol>
      {o.deliveryProofUrl && <a href={o.deliveryProofUrl.replace('/api/v1', '')} target="_blank" rel="noreferrer">Delivery photo</a>}
      {canCancel && <Action text="Cancel order" kind="secondary" ask="Reason (shown to customer and shop)" run={async (reason) => { const r = await bff(`admin/orders/${number}/cancel`, 'POST', { reason }); if (r.ok) { await reload(); onChange(); } return r; }} />}
    </div>
  );
}

export function Orders({ initialStatus = '' }: { initialStatus?: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [list, reload, st] = useLoad<any[]>(`admin/orders?status=${status}&q=${encodeURIComponent(query)}`);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <h1>Orders</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(q); }} style={{ marginBottom: 12 }}>
        <input aria-label="Search orders" placeholder="Order number or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn small">Search</button>
      </form>
      <Tabs values={['', 'PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REJECTED']} value={status} onChange={setStatus} />
      {!list ? <Denied status={st} /> : list.length === 0 ? <p className="muted">No orders.</p> : (
        <div className="list">{list.map((o) => (
          <div key={o.id} className="card" data-testid={`order-${o.number}`}>
            <div className="row">
              <strong className="mono">{o.number}</strong><Pill s={o.status} /><span>{o.vendor.name}</span><span className="muted">{day(o.deliveryDate)} · {o.customer.phone}</span><span className="price">{rs(o.totalPaisa)}</span>
              {o.status === 'PLACED' && o.vendorRespondBy && new Date(o.vendorRespondBy) < new Date() && <span className="pill demo">Late</span>}
              <button className="btn small secondary" onClick={() => setOpen(open === o.number ? null : o.number)}>{open === o.number ? 'Close' : 'Details'}</button>
            </div>
            {open === o.number && <OrderDetail number={o.number} onChange={reload} />}
          </div>
        ))}</div>
      )}
    </>
  );
}

export function Bookings({ initialStatus = '' }: { initialStatus?: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [list, reload, st] = useLoad<any[]>(`admin/bookings?status=${status}&q=${encodeURIComponent(query)}`);
  return (
    <>
      <h1>Bookings</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(q); }} style={{ marginBottom: 12 }}>
        <input aria-label="Search bookings" placeholder="Booking number or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn small">Search</button>
      </form>
      <Tabs values={['', 'REQUESTED', 'ACCEPTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'FULLY_PAID', 'COMPLETED', 'CANCELLED', 'EXPIRED']} value={status} onChange={setStatus} />
      {!list ? <Denied status={st} /> : list.length === 0 ? <p className="muted">No bookings.</p> : (
        <div className="list">{list.map((b) => (
          <div key={b.id} className="card" data-testid={`booking-${b.number}`}>
            <div className="row">
              <strong className="mono">{b.number}</strong><Pill s={b.status} /><span>{b.vendor.name} · {b.packageName}</span><span className="muted">{when(b.eventStart)} · {b.customer.phone}</span>
              <span className="price">{rs(b.totalPaisa)}</span><span className="muted">paid {rs(b.paidPaisa)}</span>
            </div>
            {!['CANCELLED', 'COMPLETED', 'EXPIRED', 'DECLINED', 'NO_SHOW_VENDOR'].includes(b.status) && (
              <Action text="Cancel booking" kind="secondary" ask="Reason (refund follows the booking’s policy)" run={async (reason) => { const r = await bff(`admin/bookings/${b.number}/cancel`, 'POST', { reason }); if (r.ok) await reload(); return r; }} />
            )}
          </div>
        ))}</div>
      )}
    </>
  );
}

// ---------------- money ----------------
export function Payments() {
  const [status, setStatus] = useState('PENDING');
  const [list, reload, st] = useLoad<any[]>(`admin/payments?status=${status}`);
  return (
    <>
      <h1>Payments</h1>
      <p className="muted">Bank transfers wait here until someone checks RUNG’s bank statement. Confirm only when the money has arrived, and enter the bank’s transaction reference.</p>
      <Tabs values={['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED']} value={status} onChange={setStatus} />
      {!list ? <Denied status={st} /> : list.length === 0 ? <p className="muted">Nothing here.</p> : (
        <div className="scroll"><table className="data"><thead><tr><th>Created</th><th>For</th><th>Customer</th><th>Method</th><th>Amount</th><th>Receipt</th><th /></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.id} data-testid={`payment-${p.id}`}>
              <td>{when(p.createdAt)}</td>
              <td className="mono">{p.orderGroup ? p.orderGroup.orders.map((o: any) => o.number).join(', ') : p.booking?.number}</td>
              <td className="mono">{p.orderGroup?.customer.phone ?? p.booking?.customer.phone}</td>
              <td>{label(p.provider)} {p.isSandbox && <span className="pill sandbox">sandbox</span>}</td>
              <td className="price">{rs(p.amountPaisa)}</td>
              <td>{p.proofUrl ? <a href={p.proofUrl} target="_blank" rel="noreferrer">View</a> : <span className="muted">not uploaded</span>}</td>
              <td>{p.status === 'PENDING' && <div className="stack">
                <Action testId="confirm" text="Confirm received" ask="Bank reference" run={async (reference) => { const r = await bff(`admin/payments/${p.id}/confirm`, 'POST', { reference }); if (r.ok) await reload(); return r; }} />
                <Action text="Not received" kind="secondary" ask="Reason" run={async (reason) => { const r = await bff(`admin/payments/${p.id}/reject`, 'POST', { reason }); if (r.ok) await reload(); return r; }} />
              </div>}{p.providerRef && <span className="mono">{p.providerRef}</span>}</td>
            </tr>
          ))}</tbody></table></div>
      )}
    </>
  );
}

export function Refunds() {
  const [status, setStatus] = useState('APPROVED');
  const [list, reload, st] = useLoad<any[]>(`admin/refunds?status=${status}`);
  return (
    <>
      <h1>Refunds</h1>
      <p className="muted">Sandbox refunds are sent automatically. Bank transfer refunds stay in “Approved” until finance sends the money and records the reference here.</p>
      <Tabs values={['APPROVED', 'REQUESTED', 'PROCESSED', 'REJECTED']} value={status} onChange={setStatus} />
      {!list ? <Denied status={st} /> : list.length === 0 ? <p className="muted">Nothing here.</p> : (
        <div className="scroll"><table className="data"><thead><tr><th>Created</th><th>For</th><th>Method</th><th>Amount</th><th>Reason</th><th /></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.id} data-testid={`refund-${r.id}`}>
              <td>{when(r.createdAt)}</td><td className="mono">{r.order?.number ?? r.booking?.number}</td>
              <td>{label(r.payment.provider)} {r.payment.isSandbox && <span className="pill sandbox">sandbox</span>}</td>
              <td className="price">{rs(r.amountPaisa)}</td><td>{r.reason}</td>
              <td>
                {r.status === 'APPROVED' && <Action text="Mark sent" ask="Transfer reference" run={async (reference) => { const x = await bff(`admin/refunds/${r.id}/mark-paid`, 'POST', { reference }); if (x.ok) await reload(); return x; }} />}
                {r.status === 'REQUESTED' && <div className="row">
                  <Action text="Approve" run={async () => { const x = await bff(`admin/refunds/${r.id}/approve`, 'POST', {}); if (x.ok) await reload(); return x; }} />
                  <Action text="Reject" kind="secondary" ask="Reason" run={async (reason) => { const x = await bff(`admin/refunds/${r.id}/reject`, 'POST', { reason }); if (x.ok) await reload(); return x; }} />
                </div>}
                {r.providerRef && <span className="mono">{r.providerRef}</span>}
              </td>
            </tr>
          ))}</tbody></table></div>
      )}
    </>
  );
}

export function Payouts() {
  const [status, setStatus] = useState('');
  const [list, reload, st] = useLoad<any[]>(`admin/payouts${status ? `?status=${status}` : ''}`);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function generate(e: FormEvent) {
    e.preventDefault(); setErr(''); setMsg('');
    const r = await bff('admin/payouts/generate', 'POST', { from, to });
    if (!r.ok) return setErr(r.data.error?.message ?? '');
    setMsg(`${r.data.created.length} payout(s) created.`);
    await reload();
  }
  return (
    <>
      <h1>Payouts</h1>
      <form className="card row" onSubmit={generate} style={{ marginBottom: 16 }}>
        <strong>Build payouts for a finished period</strong>
        <label className="row">From<input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="row">To<input type="date" required value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn small">Build</button>
        {msg && <span role="status">{msg}</span>}<ErrorText msg={err} />
      </form>
      <Tabs values={['', 'PENDING', 'ON_HOLD', 'PAID']} value={status} onChange={setStatus} />
      {!list ? <Denied status={st} /> : list.length === 0 ? <p className="muted">No payouts yet.</p> : (
        <div className="scroll"><table className="data"><thead><tr><th>Shop</th><th>Period</th><th>Gross</th><th>Commission</th><th>To pay</th><th>Status</th><th /></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.id} data-testid={`payout-${p.vendor.slug}`}>
              <td>{p.vendor.name} {p.vendor.isDemo && <span className="pill demo">DEMO</span>}</td>
              <td>{new Date(new Date(p.periodStart).getTime() + 5 * 3600_000).toISOString().slice(0, 10)} → {new Date(new Date(p.periodEnd).getTime() + 5 * 3600_000).toISOString().slice(0, 10)}</td>
              <td>{rs(p.grossPaisa)}</td><td>{rs(p.commissionPaisa)}</td><td className="price">{rs(p.netPaisa)}</td><td><Pill s={p.status} /></td>
              <td>{p.status !== 'PAID' ? <div className="row">
                <Action text="Mark paid" ask="Bank transfer reference" run={async (reference) => { const r = await bff(`admin/payouts/${p.id}/mark-paid`, 'POST', { reference }); if (r.ok) await reload(); return r; }} />
                {p.status === 'ON_HOLD' ? <Action text="Release" kind="secondary" run={async () => { const r = await bff(`admin/payouts/${p.id}/release`, 'POST', {}); if (r.ok) await reload(); return r; }} />
                  : <Action text="Hold" kind="secondary" run={async () => { const r = await bff(`admin/payouts/${p.id}/hold`, 'POST', {}); if (r.ok) await reload(); return r; }} />}
              </div> : <span className="mono">{p.reference}</span>}</td>
            </tr>
          ))}</tbody></table></div>
      )}
    </>
  );
}

// ---------------- users / audit ----------------
export function Users() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [list, reload, st] = useLoad<any[]>(`admin/users?q=${encodeURIComponent(query)}`);
  return (
    <>
      <h1>Users</h1>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(q); }} style={{ marginBottom: 12 }}>
        <input aria-label="Search users" placeholder="Phone or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn small">Search</button>
      </form>
      {!list ? <Denied status={st} /> : (
        <div className="scroll"><table className="data"><thead><tr><th>Phone</th><th>Name</th><th>Roles</th><th>Orders</th><th>Bookings</th><th>Joined</th><th /></tr></thead>
          <tbody>{list.map((u) => (
            <tr key={u.id} data-testid={`user-${u.phone}`}>
              <td className="mono">{u.phone}</td><td>{u.name ?? '—'}</td>
              <td>{u.roles.map(label).join(', ')}{u.isDemo && <span className="pill demo">DEMO</span>}{u.isBlocked && <span className="pill status">Blocked</span>}</td>
              <td>{u._count.orders}</td><td>{u._count.bookings}</td><td>{day(u.createdAt)}</td>
              <td>{u.isBlocked
                ? <Action text="Unblock" kind="secondary" run={async () => { const r = await bff(`admin/users/${u.id}/unblock`, 'POST', {}); if (r.ok) await reload(); return r; }} />
                : <Action text="Block" kind="secondary" ask="Reason" run={async (reason) => { const r = await bff(`admin/users/${u.id}/block`, 'POST', { reason }); if (r.ok) await reload(); return r; }} />}</td>
            </tr>
          ))}</tbody></table></div>
      )}
    </>
  );
}

export function AuditLog() {
  const [list, , st] = useLoad<any[]>('admin/audit-log');
  return (
    <>
      <h1>Audit log</h1>
      <p className="muted">Every admin action is recorded with who did it, when and from which IP. Latest 200.</p>
      {!list ? <Denied status={st} /> : (
        <div className="scroll"><table className="data"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>{list.map((a) => (
            <tr key={a.id}><td>{when(a.createdAt)}</td><td className="mono">{a.actor?.phone ?? 'system'}</td><td>{a.action}</td><td className="mono">{a.entity} {a.entityId}</td><td className="mono">{a.data ? JSON.stringify(a.data) : ''}</td></tr>
          ))}</tbody></table></div>
      )}
    </>
  );
}

