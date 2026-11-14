# RUNG (رنگ) Brand Guidelines v1.0

**Har Khushi, Har Rang · ہر خوشی، ہر رنگ**

RUNG is Lahore's all-occasion marketplace. The brand should feel **Pakistani, modern, premium, colourful, elegant and warm**: the joy of a mehndi night, the calm of a well-run shop.

---

## 1. The mark: "Rang Phool"

Six petals, one for each colour of celebration, arranged like a rangoli flower or the star of a Multani tile. Six small dots sit between the petals; a single centre seed holds them together. It reads as a flower (gifting), a firework (celebration) and a palette (rang).

| File | Use |
|---|---|
| `logos/rung-mark.svg` | Primary colour mark (light backgrounds) |
| `logos/rung-mark-mono-dark.svg` / `-mono-light.svg` | One-colour print, embossing, stamps, foil |
| `logos/rung-logo-en-horizontal.svg` (+ `-on-dark`) | Website header, email, invoices |
| `logos/rung-logo-en-stacked.svg` (+ `-on-dark`) | Packaging, square placements |
| `logos/rung-logo-ur.svg` (+ `-on-dark`) | Urdu-first contexts. Mark sits on the **right** (RTL reading start) |
| `logos/rung-logo-bilingual.svg` (+ `-on-dark`) | Default for signage, social bios, launch materials |
| `logos/rung-wordmark-en.svg`, `rung-wordmark-ur.svg` | Wordmark only, when the mark appears elsewhere |
| `logos/png/*@2x.png` | Raster exports for docs and slides |

All logo text is **converted to outlines**, so the SVGs render correctly without fonts installed.

**Clear space:** keep space equal to one petal's length on every side.
**Minimum size:** mark 24px / 8mm; horizontal logo 120px / 35mm wide.
**On dark:** use the `-on-dark` versions (ivory wordmark, gold dots, ivory centre).

**Don't:** recolour individual petals, rotate the mark, add shadows/gradients to the logo, stretch it, put the colour mark on a busy photo (use a solid shape behind it), or set "RUNG" in another font.

## 2. Colour

Named after things every Pakistani celebration already has.

| Name | Hex | Role |
|---|---|---|
| **Shab** (night) | `#2B1236` | Primary dark. Text, headers, app icon ground |
| **Rani** pink | `#D6246E` | Primary brand colour. CTAs, highlights |
| **Genda** marigold | `#F4A21D` | Accent on dark, offers, Eid |
| **Firozi** turquoise | `#0E8C8C` | Services, info, links on dark |
| **Kesar** saffron | `#E8572A` | Urgency, same-day badges |
| **Mehndi** green | `#5B8A3A` | Success, confirmed bookings |
| **Zari** gold | `#C9A04E` | Premium lines, borders, foil |
| **Dupatta** ivory | `#FBF4EA` | Page background (never pure white for large areas) |

**Text-safe deep variants** (for small text on ivory/white, all pass WCAG AA 4.5:1):

| Name | Hex | Contrast on Dupatta |
|---|---|---|
| Rani Deep | `#B0175A` | 6.2 : 1 |
| Firozi Deep | `#0A6B6B` | 5.8 : 1 |
| Mehndi Deep | `#456B2B` | 5.7 : 1 |
| Kesar Deep | `#B8401A` | 5.1 : 1 |

**Measured contrast:** Shab on Dupatta 15.5:1 · Genda on Shab 8.1:1 · Zari on Shab 6.9:1 · White on Rani 4.8:1 · Rani on Dupatta 4.4:1 (large text/buttons only, use Rani Deep for body text). Firozi, Kesar and Mehndi base tones are for fills, icons and text ≥ 24px only.

**Proportion:** ~60% Dupatta or Shab, ~25% one lead colour (usually Rani), ~15% the rest. The six-colour stripe is a signature: use it as a thin band on packaging, email footers and story bottoms, not as a background.

**Occasion accents** (UI chips/headers): Birthday = Rani, Mehndi/Dholki = Mehndi, Eid = Genda, Aqeeqa/Baby = Firozi, Anniversary = Kesar, Wedding/Premium = Zari, Condolence/Get well = Shab at 70% (no rainbow).

## 3. Typography

All four families are free, open-licence (SIL OFL 1.1) Google Fonts. Licence files are in `fonts/`.

| Role | Font | Notes |
|---|---|---|
| English display | **Fraunces** SemiBold 600 | Headlines, logo, prices in hero. Soft, warm serif |
| English UI/body | **Plus Jakarta Sans** 400/500/700 | Buttons, forms, body, Roman Urdu |
| Urdu display | **Noto Nastaliq Urdu** 400/700 | Headlines, logo, social, packaging. Authentic Nastaliq |
| Urdu UI/body | **Noto Naskh Arabic** 400/500/700 | Dense UI (menus, forms, order tables, mobile). Nastaliq needs ~2× line height and is hard to read at small sizes; Naskh keeps the app usable |

**Urdu rules**
- Set `dir="rtl"` and `lang="ur"`; mirror layouts (icons, chevrons, progress) in Urdu mode.
- Nastaliq: line-height **2.0–2.2**, min 18px. Naskh: line-height 1.7, min 15px.
- Never letter-space Urdu. Never fake-bold it.
- Numbers: use Western digits (0–9) in prices and phone numbers for consistency with payments; Urdu-Indic digits only in decorative copy.
- Prices: `Rs 2,500` in English, `2,500 روپے` in Urdu. Store as integer paisa; display without decimals unless non-zero.

**Scale (web):** 56 / 40 / 28 / 22 / 18 / 16 / 14 px. Mobile: 34 / 28 / 22 / 18 / 16 / 14.

## 4. Voice

Warm, helpful, a little playful, never loud. Talk like a well-mannered Lahori friend who knows every good vendor in town.

- English: short sentences. "Your cake is on its way to Ammi."
- Urdu: respectful "آپ". "آپ کا آرڈر کنفرم ہو گیا ہے۔"
- Roman Urdu is welcome in social and notifications: "Mubarak ho! Booking confirm ho gayi."
- Celebrate, don't pressure: no fake countdown timers, no invented discounts.
- For sad occasions (condolence, get well) drop the exclamation marks and the colour stripe.

## 5. Imagery

Real Lahore: real cakes from real vendors, marigold garlands, mehndi hands, string lights, dhol, families. Warm natural light. Never stock photos of foreign weddings. Every product photo is the vendor's own; demo data is labelled **DEMO**.

Pattern: the mark repeated at low opacity (see social posts) on Shab or Dupatta grounds.

## 6. App icon

`app-icon/rung-app-icon-ios.svg` (square, 1024) — iOS masks the corners itself. PNG sizes in `app-icon/png/` (1024, 512, 192, 180, 167, 152, 120, 48, favicon 32). Android adaptive icon: `android-adaptive-foreground.svg` (mark inside the 66% safe zone) on `android-adaptive-background.svg`, plus `android-monochrome.svg` for themed icons. Web: `favicon.svg`.

## 7. Social and packaging concepts

- `social/ig-post-launch.png` — launch teaser (1080×1080)
- `social/ig-post-occasions.png` — browse-by-occasion grid
- `social/ig-post-vendors.png` — vendor recruitment
- `social/ig-story-urdu.png` — Urdu-first story (1080×1920)
- `packaging/cake-box-lid.png` — ivory lid, Rani ribbon cross, Shab seal
- `packaging/gift-bag.png` — Shab bag with gold handle and colour stripe
- `packaging/cards-and-stickers.png` — thank-you/message card, flower tag ("مبارک ہو"), Rani seal sticker, delivery label

These are concept renders, not print-ready dielines. Print files need the printer's dieline and CMYK proofing (foil for Zari).

## 8. Source

Everything here is generated from `source/gen.py` (logos, icons) and `source/mock.py` (social, packaging), so colours or proportions can be changed in one place and re-exported.
