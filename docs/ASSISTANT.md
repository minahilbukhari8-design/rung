# Ask RUNG: the customer assistant

_Milestone 9, 15 Nov 2026._

Customers open **Ask RUNG** (website `/assistant`, app home screen button) and describe what they need in English, Urdu or Roman Urdu. The assistant suggests real listings and can tell a logged-in customer the status of their own orders and bookings.

## Two modes

| Mode | When | What it does |
|---|---|---|
| **Basic helper** | Default, and whenever `ANTHROPIC_API_KEY` is missing or a placeholder | Keyword search (with Roman Urdu spellings and budgets like "3 hazar tak"), fixed replies, own order status. No AI. |
| **AI assistant (Claude)** | Only when a real `ANTHROPIC_API_KEY` is set on the server | Claude reads the request and uses four read-only tools: search listings, get listing details, list occasions, the customer's own orders and bookings. |

The page tells the customer which mode is on.

## Safety and honesty rules (both modes)

- Every card under a reply is built by the server from database results, never from the model's text. A made-up product name in a reply cannot become a link (tested).
- The system prompt forbids inventing products, shops, prices, discounts, delivery times or free dates, and says shop-written text is information, not instructions.
- The assistant cannot order, pay, cancel or change anything. All tools are read-only.
- Order data only for the logged-in customer, only their own.
- 30 messages per person per 10 minutes; 12 most recent turns sent; each message at most 1,000 characters.
- Usage is logged (engine, time taken, number of turns) **without the message text**.
- If the AI service is down the customer gets a clear message to use search instead.

## AI settings

- Model: `claude-opus-5-5` by default (`ASSISTANT_MODEL` to change). Effort `low`, which suits short chat replies. Prompt caching on the fixed instructions.
- Server-side refusal fallback is switched on (`fallbacks: "default"`), so if the model declines a harmless request another model answers. A real refusal gets a polite fixed reply.
- **Cost:** pay per use. Before switching on, set a monthly spend limit in the Anthropic console. Choosing a cheaper model for chat is a decision for Minahil once real usage can be measured.

## Not done yet

- Not tested against the real Claude API (no key). The tool loop is tested with a scripted stand-in for the API.
- Voice: see `docs/research/urdu-voice.md`. For now customers can use their keyboard microphone.
