# Accounts and keys RUNG needs

**Why this list exists:** Claude cannot create accounts, verify identity, sign contracts or enter payment details on your behalf. These accounts must be opened by you (or your company) in your own name. Nothing below has been signed up for. Prices are indicative, from public pricing as last known; **check the provider's page before paying**. Never paste keys into chat or commit them: they go into the hosting provider's secret settings, and the repo only gets `.env.example`.

Legend: 🟢 free / free tier is enough to build · 🟡 small paid · 🔴 needs business documents or a contract

## Needed now (Milestones 2–3)

| # | Account | Why | Cost note | What I need from you |
|---|---|---|---|---|
| 1 | **GitHub** (you already have `Minahil8-art`) — create an empty **private repo `rung`** | All code, one PR per milestone | 🟢 Free | Create the repo on github.com, then in this project go to [Connect GitHub](https://claude.ai/connect-github) and give Claude access to that repo. I'll push Milestone 1 into it as the first PR. |
| 2 | **Postgres** — Neon or Supabase (recommended: Neon) | Database | 🟢 Free tier for dev; ~US$19–25/mo when live | Sign up, create project `rung`, put the connection string in hosting secrets (not chat) |
| 3 | **Object storage** — Cloudflare R2 (recommended) or AWS S3 | Product photos, vendor documents, delivery proofs | 🟢 R2 has a free tier and no egress fees | Create bucket + API token |

## Needed for website / dashboards launch (Milestones 4–6)

| # | Account | Why | Cost note | What I need |
|---|---|---|---|---|
| 4 | **Web hosting** — Vercel (Next.js) | Customer site, vendor and admin dashboards | 🟡 Hobby plan is free but **non-commercial only**; Pro ~US$20/user/mo for a business | Account + link GitHub repo |
| 5 | **API hosting** — Railway, Render or Fly.io | REST API | 🟡 ~US$5–20/mo to start | Account |
| 6 | **Domain** — e.g. `rung.pk` via a PKNIC registrar (or `.com`) | Brand, email, SMS links | 🟡 a few thousand PKR/yr **(verify availability)** | Buy it in your name |
| 7 | **Transactional email** — Resend or Postmark | Receipts, vendor notices | 🟢 free tier to start | Account + verified domain |
| 8 | **Google Maps Platform** (optional) | Address autocomplete, delivery zones | 🟡 monthly free credit, then pay-per-use; needs a billing card | Account + restricted API key |
| 9 | **Error monitoring** — Sentry | Catch bugs in production | 🟢 free tier | Account |

## Phone OTP and messaging

| # | Account | Why | Cost note | What I need |
|---|---|---|---|---|
| 10 | **SMS OTP provider** — a PTA-compliant local aggregator (branded sender ID "RUNG") or an international API (Twilio Verify / Message Central) | Pakistani phone login | 🟡 per-SMS; local branded SMS is cheaper but needs a **registered sender ID** (company docs, can take weeks). International APIs cost more per SMS but start instantly. Get 2–3 quotes. | Choose provider; for branded sender ID: NTN/business docs |
| 11 | **WhatsApp Business Platform** (Meta Cloud API) | Order updates, OTP fallback, reorders | 🟡 Meta charges per template message, rates vary by category and country; needs **Meta Business verification** 🔴 | Meta Business account, a phone number not used on the WhatsApp app, business verification |

## Payments (Milestone 8) — sandbox first, real money only with your go-ahead

| # | Account | Why | Cost note | What I need |
|---|---|---|---|---|
| 12 | **JazzCash merchant** (online payment gateway) | Wallet + card payments | 🔴 merchant fee (MDR) per transaction, agreed in contract. Sandbox credentials come after registering on JazzCash's merchant/sandbox portal | Business registration (NTN), business bank account, CNIC, website with policies (refund, privacy, terms) |
| 13 | **Easypaisa / Easypay merchant** | Wallet payments | 🔴 MDR per transaction | Same documents as above |
| 14 | **Card gateway** — a Pakistani PSP (e.g. Safepay, PayFast) or your bank's gateway | Visa/Mastercard, overseas senders | 🔴 MDR per transaction | Same documents; some offer instant sandbox keys |
| 15 | **Business bank account** | Receive payments, pay vendors | depends on bank | Business registration |

**Status (Milestone 8):** JazzCash and Easypaisa wallet payments are **built**, and tested only against a local simulator that RUNG runs itself. They are **not connected** to the real gateways. To test them for real I need, for each wallet, the **sandbox** credentials from its merchant portal:
- JazzCash: Merchant ID, Password, Integrity Salt (and confirmation of the sandbox post URL).
- Easypaisa (Easypay): Store ID, Hash Key, and the inquiry API username, password and account number.

They go into the server's environment, never into the code. The steps after that are in `docs/PAYMENTS.md`. A card gateway is not chosen yet, so card payments are not built.

Until then the app offers **cash on delivery, manual bank transfer, and a clearly marked test payment**. I will not claim any gateway works until a real sandbox test passes.

## AI assistant (Milestone 9)

| # | Account | Why | Cost note | What I need |
|---|---|---|---|---|
| 16 | **LLM API** — Anthropic (Claude) | Assistant reasoning + tool calls on the RUNG database | 🟡 pay-as-you-go per token; set a monthly spend limit | API key in hosting secrets |
| 17 | **Speech-to-text** (Urdu) — compare: ElevenLabs Scribe, Soniox, OpenAI, Google Cloud STT, Azure Speech | Voice notes → text | 🟡 per audio minute; most have free trial credit | Accounts for the 2–3 we shortlist for the bake-off |
| 18 | **Text-to-speech** (Urdu) — compare: Azure Speech (ur-PK neural voices), ElevenLabs, Google Cloud TTS | Spoken replies in Urdu | 🟡 per character | Same |

**Status (Milestone 9):** the assistant is built and runs in a basic no-AI mode until #16 exists. With a real Anthropic API key it switches to Claude automatically (see `docs/ASSISTANT.md`); set a monthly spend limit first. Voice: desk comparison in `docs/research/urdu-voice.md`; the bake-off on real voice notes needs free-trial accounts for 2–3 providers (Azure, ElevenLabs, Uplift AI suggested).

## Mobile apps (Milestone 7)

| # | Account | Why | Cost note | What I need |
|---|---|---|---|---|
| 19 | **Expo / EAS** | Build and submit the React Native app | 🟢 free tier (queued builds) | Account |
| 20 | **Google Play Console** | Android release | 🟡 US$25 one-time | Your ID verification; an organisation account needs a D-U-N-S number |
| 21 | **Apple Developer Program** | iOS release | 🟡 US$99/year | Apple ID with 2FA; organisation enrolment needs a D-U-N-S number |

## Legal / business (ask a professional; Claude won't file these)

- **Company registration** (SECP) or sole proprietorship + **NTN** (FBR): needed for merchant accounts and branded SMS.
- **Trademark search and filing** for "RUNG / رنگ" with IPO-Pakistan before printing packaging.
- Terms of service, privacy policy, refund and cancellation policy, vendor agreement: I can draft templates later, but a lawyer should review them.

## Suggested order

1. GitHub repo (today) → 2. Neon + R2 (free) → 3. SMS provider quotes → 4. Company/NTN paperwork (it gates payments, branded SMS and WhatsApp) → 5. Vercel/Railway when we deploy → 6. App store accounts before Milestone 7 → 7. Payment merchants before Milestone 8.
