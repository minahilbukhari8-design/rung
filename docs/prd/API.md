# REST API (v1) — endpoint plan

Base `/api/v1`. JSON. Auth: `Authorization: Bearer <access token>`. Money in paisa. Errors: `{ "error": { "code": "ORDER_INVALID_TRANSITION", "message": "…" } }`. List endpoints: `?cursor=&limit=` (max 50). Mutations accept `Idempotency-Key`. An OpenAPI file will be generated from route schemas in Milestone 3.

## Auth
| Method | Path | Who |
|---|---|---|
| POST | `/auth/otp/request` `{phone}` | public (rate-limited) |
| POST | `/auth/otp/verify` `{phone, code}` → tokens | public |
| POST | `/auth/refresh` | public (refresh token) |
| POST | `/auth/logout` | user |
| GET/PATCH | `/me` (name, email, locale) | user |
| GET/POST/PATCH/DELETE | `/me/addresses[/:id]` | customer |

## Catalogue (public)
| GET | `/occasions`, `/occasions/:slug` (products + services) |
|---|---|
| GET | `/categories?kind=PRODUCT\|SERVICE` |
| GET | `/zones` |
| GET | `/products?category=&occasion=&zone=&date=&minPrice=&maxPrice=&q=` |
| GET | `/products/:vendorSlug/:slug` |
| GET | `/products/:id/delivery-slots?zone=&date=` |
| GET | `/services?category=&occasion=&area=&date=&q=` |
| GET | `/services/:vendorSlug/:slug` |
| GET | `/services/:id/availability?month=2026-12` |
| GET | `/vendors/:slug`, `/vendors/:slug/reviews` |
| GET | `/search?q=` (products, services, vendors; EN/UR/Roman Urdu) |

## Cart & checkout (customer)
| GET | `/cart` |
|---|---|
| POST | `/cart/items` `{variantId, quantity, customization}` |
| PATCH/DELETE | `/cart/items/:id` |
| POST | `/checkout/quote` `{groups:[{vendorId, addressId, date, slotStartMinute, …}]}` → totals |
| POST | `/checkout` → OrderGroup + Orders + Payment intent |

## Orders
| GET | `/orders`, `/orders/:number` (customer) |
|---|---|
| POST | `/orders/:number/cancel` (customer) |
| GET | `/vendor/orders?status=` (vendor) |
| POST | `/vendor/orders/:number/transition` `{to, note, photoUrl}` (vendor) |

## Bookings
| POST | `/bookings` `{packageId, eventStart, venue, guestCount, occasionId, notes}` |
|---|---|
| GET | `/bookings`, `/bookings/:number` |
| POST | `/bookings/:number/cancel` → refund preview + confirm |
| POST | `/bookings/:number/reschedule` `{eventStart}` / `.../reschedule/respond` `{accept}` |
| GET | `/vendor/bookings?from=&to=` (calendar) |
| POST | `/vendor/bookings/:number/transition` `{to, note}` |

## Payments
| POST | `/payments` `{purpose, orderGroupId\|bookingId, provider}` → redirect/instructions |
|---|---|
| POST | `/payments/:id/proof` (bank transfer upload) |
| POST | `/webhooks/payments/:provider` (signature verified) |
| GET | `/payments/:id` |

## Vendor management
| POST | `/vendor/apply` (creates Vendor PENDING_REVIEW + owner membership) |
|---|---|
| GET/PATCH | `/vendor/profile` |
| POST | `/vendor/documents` (KYC upload, signed URL) |
| CRUD | `/vendor/products`, `/vendor/products/:id/variants`, `/vendor/products/:id/customizations` |
| CRUD | `/vendor/services`, `/vendor/services/:id/packages`, `/vendor/cancellation-policies` |
| CRUD | `/vendor/zones`, `/vendor/slots`, `/vendor/blackouts` |
| CRUD | `/vendor/staff` (owner only) |
| GET | `/vendor/payouts` |
| POST | `/uploads/sign` `{purpose, contentType}` → presigned PUT |

## Admin
| GET | `/admin/vendors?status=` · POST `/admin/vendors/:id/approve\|reject\|suspend` |
|---|---|
| POST | `/admin/vendor-documents/:id/review` |
| CRUD | `/admin/categories`, `/admin/occasions`, `/admin/zones` |
| GET | `/admin/orders`, `/admin/bookings` · POST `.../:number/override` `{to, reason}` |
| GET/POST | `/admin/refunds`, `/admin/refunds/:id/approve\|reject` |
| POST | `/admin/payouts/generate` `{periodStart, periodEnd}` · `/admin/payouts/:id/mark-paid` |
| POST | `/admin/reviews/:id/hide` |
| GET | `/admin/audit-log` |

## Reviews
| POST | `/orders/:number/review`, `/bookings/:number/review` (once, after DELIVERED/COMPLETED) |
|---|---|
