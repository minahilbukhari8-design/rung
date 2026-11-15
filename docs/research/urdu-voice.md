# Urdu voice for the RUNG assistant: speech-to-text and text-to-speech

_Milestone 9, 15 Nov 2026. Desk research only. Nothing here has been tested on real audio yet, because each option needs an account._

## What we need

- **Speech-to-text (STT):** customers in Lahore speak Urdu mixed with English ("Ammi ki birthday ke liye cake chahiye, 3 hazar tak"). The text must come out clean enough for search, in Urdu script or Roman Urdu.
- **Text-to-speech (TTS):** optional. Read the assistant's reply aloud in a natural Pakistani Urdu voice.
- Low cost per minute, a sandbox or free tier for testing, and a clear data policy (voice is personal data).

## Options found

| Provider | STT Urdu | TTS Urdu | Notes | Source |
|---|---|---|---|---|
| Microsoft Azure AI Speech | Listed (ur-PK, ur-IN) | Listed: ur-PK neural voices Uzma (female) and Asad (male) | One account covers both. Pakistan region availability and price to confirm. | [Azure language support](https://learn.microsoft.com/azure/ai-services/speech-service/language-support), [voice list](https://json2video.com/ai-voices/azure/voices/ur-pk-uzmaneural/) |
| Google Cloud Speech-to-Text / Text-to-Speech | Listed (ur-PK) | Urdu voice availability to confirm | Check which models (Chirp) support ur-PK. | [STT languages](https://cloud.google.com/speech-to-text/docs/languages), [Chirp 3 HD voices](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd?authuser=1) |
| ElevenLabs | Urdu STT page (Scribe) | Urdu and "Pakistani accent" voices | Strong voice quality reputation; price per minute to compare. | [Urdu STT](https://elevenlabs.io/speech-to-text/urdu), [Urdu TTS](https://elevenlabs.io/hi/text-to-speech/urdu) |
| Uplift AI | Urdu STT (listed as a Pipecat service) | Urdu TTS | Startup focused on Pakistani languages (YC S25). Check maturity and terms. | [Pipecat docs](https://docs.pipecat.ai/api-reference/server/services/stt/upliftai.md), [launch post](https://hackernews-cn.vercel.app/item/44950661) |
| Soniox | Urdu STT and live translation | No | Publishes its own Urdu comparison against Azure (vendor-written, so treat as marketing). | [Soniox Urdu](https://soniox.com/compare-stt/soniox-vs-azure/urdu) |
| Phone keyboard dictation (Gboard, iOS) | Yes, on the phone | n/a | **Free, no account, works today.** The customer taps the mic on their keyboard. | (built into phones) |

No accuracy or price numbers are given here on purpose: published figures are vendor claims and are not measured on Lahori code-switched speech.

## Recommendation

1. **Now (built):** text chat in English, Urdu and Roman Urdu, with a hint to use the keyboard microphone. This gives voice input at zero cost and no new account.
2. **Bake-off before choosing a paid voice provider:** record 30 to 50 real voice notes (different ages, Urdu/English mix, background noise), run them through **Azure, ElevenLabs and Uplift AI**, and score word errors on product words (cake, mehndi, phool, budget numbers) plus speed and price per minute.
3. **TTS** comes after STT and only if customers ask for spoken replies. Azure's ur-PK voices are the easiest first test because the same account covers STT.

Needs from Minahil: accounts (free trials are enough) for the 2 or 3 providers to test, and permission to record test voice notes from people who agree to it.
