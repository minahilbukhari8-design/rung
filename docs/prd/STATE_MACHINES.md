# Order and booking state machines

Implemented in `packages/domain/src/order-state.ts` and `booking-state.ts`; covered by `packages/domain/test/domain.test.ts` (which also checks the enums match `schema.prisma`). Every transition writes an `OrderStatusEvent` / `BookingStatusEvent` with actor and note.

## Product order

```mermaid
stateDiagram-v2
  [*] --> PENDING_PAYMENT: checkout (online)
  [*] --> PLACED: checkout (COD)
  PENDING_PAYMENT --> PLACED: payment ok [SYSTEM]
  PENDING_PAYMENT --> CANCELLED: abandoned / failed
  PLACED --> ACCEPTED: vendor
  PLACED --> REJECTED: vendor / SLA timeout
  PLACED --> CANCELLED: customer (free)
  ACCEPTED --> PREPARING: vendor
  ACCEPTED --> CANCELLED: customer ≥ cutoff before slot / admin
  PREPARING --> OUT_FOR_DELIVERY: vendor
  PREPARING --> CANCELLED: admin
  OUT_FOR_DELIVERY --> DELIVERED: vendor + photo
  OUT_FOR_DELIVERY --> FAILED_DELIVERY: vendor
  FAILED_DELIVERY --> OUT_FOR_DELIVERY: re-attempt
  FAILED_DELIVERY --> CANCELLED: admin
  DELIVERED --> [*]
  CANCELLED --> [*]
  REJECTED --> [*]
```

Side effects: stock reserved on PLACED, released on CANCELLED/REJECTED; prepaid CANCELLED/REJECTED → Refund(REQUESTED); DELIVERED → eligible for payout + review.

## Service booking

```mermaid
stateDiagram-v2
  [*] --> REQUESTED
  REQUESTED --> ACCEPTED: vendor
  REQUESTED --> DECLINED: vendor
  REQUESTED --> EXPIRED: no response by vendorRespondBy
  REQUESTED --> CANCELLED: customer
  ACCEPTED --> CONFIRMED: advance paid [SYSTEM]
  ACCEPTED --> EXPIRED: advance not paid by advanceDueBy
  ACCEPTED --> CANCELLED
  CONFIRMED --> RESCHEDULE_REQUESTED: either side (max 2)
  RESCHEDULE_REQUESTED --> CONFIRMED: agreed / withdrawn
  CONFIRMED --> FULLY_PAID: remaining paid before event
  CONFIRMED --> COMPLETED: vendor after event
  COMPLETED --> FULLY_PAID: remaining paid after event
  FULLY_PAID --> COMPLETED: vendor after event
  CONFIRMED --> CANCELLED: tiered refund
  FULLY_PAID --> CANCELLED: tiered refund
  CONFIRMED --> NO_SHOW_VENDOR: admin
  FULLY_PAID --> NO_SHOW_VENDOR: admin
```

A booking is "closed" when it is COMPLETED **and** paidPaisa ≥ totalPaisa.

**Refund rule:** customer cancellation uses the policy tiers frozen in `policySnapshot` (first tier whose `hoursBefore` is met). Vendor/admin cancellation and NO_SHOW_VENDOR refund 100% of what was paid.
