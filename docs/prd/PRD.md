# RUNG — Product Requirements (v1, Lahore launch)

_Milestone 2 · 14 Nov 2026 · companion docs: [DATA_MODEL.md](DATA_MODEL.md), [STATE_MACHINES.md](STATE_MACHINES.md), [API.md](API.md)_

## 1. Goal

Let anyone in (or sending to) Lahore celebrate any occasion from one account: **order products** (cakes, flowers, gifts, fashion) and **book services** (decor, catering, beauty, photo/video, venues, entertainment), browsing by product, service, vendor or occasion, in English or Urdu.

**Success at 90 days after launch (targets to confirm):** on-time delivery ≥ 95%, vendor booking response within SLA ≥ 90%, refund rate < 5%, 30% of customers order twice.

## 2. Users and roles

| Role | Who | Can |
|---|---|---|
| Guest | Anyone | Browse, search, view vendors, add to cart (cart saved after login) |
| Customer | Phone-verified user | Order, book, pay, track, cancel, review, manage addresses |
| Vendor owner | Business owner (KYC) | Everything for their vendor: catalogue, packages, zones, slots, calendar, orders, bookings, payouts, staff |
| Vendor staff | Invited by owner | Orders/bookings handling; no payouts or bank details |
| Admin (OPS / FINANCE / SUPPORT / SUPERADMIN) | RUNG team | Vendor approval, catalogue moderation, disputes, refunds, payouts, taxonomy; every action audit-logged |

One account can be both a customer and a vendor member.

## 3. Scope v1

**In:** Lahore only; EN + UR (RTL); phone OTP login; product orders; service bookings; COD, bank transfer (proof upload), mock gateway in dev; JazzCash/Easypaisa/card in sandbox (Milestone 8); WhatsApp/SMS notifications behind mock adapters until accounts exist; reviews; vendor payouts (manual bank transfer, tracked in system).

**Out (v1):** other cities, escrow, own rider fleet, loyalty points, coupons marketplace-wide (vendor discounts only), multi-currency, live chat (WhatsApp link instead).

## 4. Shared requirements

- **Auth:** phone (+92 3XX…) → 6-digit OTP, 5 min expiry, max 5 attempts, max 3 sends per 15 min per number and per IP. OTP stored hashed. Access token 15 min, refresh token 30 days (rotating).
- **Language:** every customer-facing string in EN and UR; listing fields have `title` + `titleUr`; layout mirrors in UR. Search matches English, Urdu script and Roman Urdu spellings (mehndi/mehendi/mehandi).
- **Money:** integer paisa; prices displayed `Rs 2,500` / `2,500 روپے`; totals computed server-side only.
- **Demo data:** anything seeded is `isDemo=true` and shows a **DEMO** badge; demo vendors cannot receive real payments.
- **Trust:** verified badge only after admin accepts KYC; reviews only from completed orders/bookings.

## 5. Browse & discovery

| ID | User story | Acceptance criteria |
|---|---|---|
| B1 | As a customer I browse by **occasion** | Occasion page lists products and services tagged with it; sombre occasions use muted styling |
| B2 | I browse by **category** (product or service) | Filters: price range, area served, delivery date available, rating |
| B3 | I view a **vendor storefront** | Shows products + services, zones, rating, verified badge, policies |
| B4 | I **search** | Matches EN, UR and Roman Urdu; results split into Products / Services / Vendors |
| B5 | I see only things I can actually get | Products hidden/flagged if no vendor slot remains for the chosen date + zone; services show availability for chosen date |

## 6. Product orders

| ID | User story | Acceptance criteria |
|---|---|---|
| P1 | Choose **variant** (size/flavour/colour) | Price updates per variant; out-of-stock variants disabled when `trackInventory` |
| P2 | Add **customisation** (cake text, photo, ribbon choice) | Required options enforced; text max length; image uploaded to private bucket; surcharges shown before adding |
| P3 | **Cart** with items from several vendors | Cart groups by vendor; each vendor group needs its own delivery date/slot; per-vendor minimum order enforced |
| P4 | Pick **delivery date + slot** | Only vendor slots with capacity left; respects product lead time and same-day cut-off; times shown PKT |
| P5 | **Delivery charge** | Vendor's charge for the recipient's zone; if vendor doesn't serve the zone, checkout blocked for that vendor |
| P6 | **Sender ≠ recipient** | Separate recipient name/phone/address; optional "hide my name"; gift message (≤ 250 chars) |
| P7 | **Checkout & pay** | One payment for the whole cart (OrderGroup); methods: COD, bank transfer + proof, wallet/card (sandbox). Order is `PENDING_PAYMENT` until confirmed; COD goes straight to `PLACED` |
| P8 | Vendor **accept/reject** | Vendor must respond within 2 h during opening hours (configurable); otherwise auto-`REJECTED` and refund |
| P9 | **Track** | Timeline of status events; recipient + sender get WhatsApp/SMS at OUT_FOR_DELIVERY and DELIVERED; delivered needs a photo |
| P10 | **Cancel** | Free before vendor accepts; after acceptance only ≥ 24 h before slot (vendor-configurable); admin can always cancel |
| P11 | **Refund** | Prepaid cancellations/rejections create a refund automatically; partial refunds by admin for quality issues |
| P12 | **Inventory** | Stock reserved at `PLACED`, released on cancel/reject; concurrent last-item orders cannot both succeed |

## 7. Service bookings

| ID | User story | Acceptance criteria |
|---|---|---|
| S1 | Compare **packages** | Each package shows inclusions, price, advance %, guest range, cancellation policy |
| S2 | See **availability** | Calendar shows dates where `bookings < maxBookingsPerDay` and no blackout |
| S3 | **Request** a booking | Date/time, venue address, guest count, occasion, notes → `REQUESTED`; vendor must respond within 24 h (`vendorRespondBy`) or it `EXPIRED` |
| S4 | Vendor **accepts/declines** | Accept → advance due within 48 h (`advanceDueBy`) else `EXPIRED`; decline needs reason |
| S5 | Pay **advance** | Advance = total × package `advanceBps`; on success → `CONFIRMED`, slot locked |
| S6 | Pay **remaining** | Before or after event (vendor setting); balance always visible; `FULLY_PAID` when paid ≥ total |
| S7 | **Reschedule** | Either side requests a new date; other side accepts; max 2 reschedules; must be an available date |
| S8 | **Cancel** | Customer refund follows tiers frozen at booking time; vendor/admin cancellation = full refund + vendor penalty flag |
| S9 | **History** | Customer sees upcoming/past bookings with payments and receipts |
| S10 | **Complete** | Vendor marks completed after event; customer can review; NO_SHOW_VENDOR set by admin after dispute |

## 8. Vendor dashboard (summary; detailed in Milestone 5)

Onboarding + KYC upload (CNIC front/back, optional NTN/registration, bank proof), storefront profile EN/UR, products/variants/stock, service packages/policies, zones + charges, delivery slots + capacity, blackout dates, order pipeline, booking calendar, payouts statement, staff invites.

## 9. Admin (summary; detailed in Milestone 6)

Vendor approval queue with KYC review, commission per vendor, taxonomy (categories, occasions, zones), order/booking search, manual status overrides with reason, refunds, disputes, payouts batch, reviews moderation, audit log.

## 10. Notifications

| Event | Customer | Recipient | Vendor |
|---|---|---|---|
| Order placed | ✓ | | ✓ |
| Order accepted / rejected | ✓ | | |
| Out for delivery / delivered | ✓ | ✓ | |
| Booking requested | ✓ | | ✓ |
| Booking accepted (advance due) / declined / expired | ✓ | | ✓ |
| Advance / remaining paid | ✓ | | ✓ |
| Reschedule requested / answered | ✓ | | ✓ |
| Event reminder (24 h before) | ✓ | | ✓ |

Channels: WhatsApp (primary) → SMS fallback → in-app. All behind adapters; mock in dev.

## 11. Non-functional

- p95 API latency < 300 ms for browse; checkout < 800 ms excluding gateway.
- Mobile-first web; Lighthouse mobile ≥ 85.
- WCAG AA contrast, keyboard navigable, RTL focus order.
- Personal data (phones, addresses, CNIC images) in private storage, signed URLs, least-privilege admin.
- Daily DB backups (Milestone 10).

## 12. Open decisions (for Minahil)

1. Commission %: placeholder 12% products / 10% services until vendor interviews.
2. Default vendor response SLA: 2 h (orders) / 24 h (bookings).
3. COD limit for first-time customers (suggest Rs 5,000) to cut fake orders.
