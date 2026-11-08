# Design

Status: direction approved 2026-11-01. Companion docs: `prd.md`, `architecture.md`.

## 1. Subject and audience

The Caesura is a back-of-house tool. The main user is a barista in a stockroom or behind the counter, on a phone or tablet, with one free hand and thirty seconds. The secondary user is the owner at a laptop reviewing waste and fixing data. The design should feel like the paperwork of a stockroom: shelf-edge labels, delivery notes, a highlighter pen. It should be fast to read and hard to misread.

## 2. Direction

**Utilitarian and numbers-first, with one memorable device: highlighter flags.**

When the AI reads a delivery note, anything the system is unsure about is marked like a highlighter stroke on paper. The yellow is used for nothing else in the product, so it always means "check this". Everything around it stays quiet.

Plan reviewed against common generated-design defaults. Avoided on purpose: warm cream with a terracotta accent, near-black with an acid accent, newspaper-style hairlines with zero radius, a grid of identical rounded cards with soft shadows, gradient washes, tracked all-caps eyebrow labels above headings, numbered markers on non-sequential content, monospace for small data labels, arrows appended to buttons. The palette is cool and slightly green-grey instead of warm, tables are ruled rather than carded, and the dashboard is a work list rather than tiles of big numbers.

## 3. Tokens

Contrast ratios below were estimated by hand. Verify every text and background pair with a contrast checker before adopting, and adjust values rather than the target (4.5:1 for text, 3:1 for large text and UI boundaries).

```css
@import "tailwindcss";

@theme {
  /* surfaces */
  --color-paper: #F3F5F2;        /* page */
  --color-panel: #FFFFFF;        /* raised areas, forms, popovers */
  --color-line: #D5DCD8;         /* dividers, table rules */

  /* text */
  --color-ink: #14262B;
  --color-ink-muted: #4A5B60;

  /* action */
  --color-primary: #0E6F68;
  --color-primary-ink: #FFFFFF;

  /* the highlighter: "check this", used for nothing else */
  --color-flag: #F4C531;
  --color-flag-ink: #14262B;

  /* stock status: always paired with an icon and a word */
  --color-fresh: #2F7D4B;     --color-fresh-ink: #1E5A35;   --color-fresh-bg: #E3F1E8;
  --color-soon: #9A5B00;      --color-soon-ink: #744400;    --color-soon-bg: #FBEBD0;
  --color-expired: #B3261E;   --color-expired-ink: #8F1D17; --color-expired-bg: #F8DEDB;

  /* shape */
  --radius-field: 4px;         /* inputs, chips, buttons */
  --radius-panel: 8px;         /* sheets, dialogs, form panels */

  /* type */
  --font-display: "Archivo", sans-serif;
  --font-body: "IBM Plex Sans", system-ui, sans-serif;
}
```

Rules:

- Hierarchy through radius: fields 4 px, panels 8 px, tables and rows 0. No shadows on content; separate with 1 px lines. Only popovers and dialogs may use a shadow.
- Use the `-ink` variants for text on status backgrounds.
- The flag colour is never used for decoration, branding or status. Only for fields that need review.
- Light theme only in v1. Tokens are variables so a dark theme can be added later.

## 4. Typography

- **Archivo** (variable, use the width axis): headings, large quantities, navigation labels. It carries the shipping-label feel. Condensed widths for dense numbers, normal width for headings.
- **IBM Plex Sans**: body, forms, tables.
- Two families only, clearly different.
- `font-variant-numeric: tabular-nums` on every table, quantity and price.
- Scale (px): 12, 14, 16, 20, 28, 40. Base 16 (inputs at 16 or larger so iOS does not zoom). Body line height 1.5, headings 1.2.
- Line length under 80 characters for prose.
- Sentence case everywhere. No all-caps labels.

## 5. Layout

- Mobile first, designed at 360 px. Tablet and desktop add a left rail.
- Mobile: bottom bar with four destinations (Today, Stock, Receive, More). Primary action per screen is a full-width button anchored to the bottom, above the safe area.
- Desktop: left rail (Today, Stock, Receive, Use, Waste, Catalogue, Settings), content column up to 1080 px, left-aligned. Forms up to 640 px.
- Text and tables are left-aligned. Numbers are right-aligned in table columns with the unit in the column header.
- Touch targets at least 44 by 44 px.

### Sign in

One primary button, "Try as a guest", with one line under it: "Instant temporary account. Everyone shares the demo data, reset every night." A quieter text link, "Owner sign in", opens the email and password form. No sign-up form, no social buttons. If a guest session was removed by the reset, show "Your guest session ended. Start a new one." with the same button.

### Today (home): a work list, not a dashboard

```
+--------------------------------------------+
| Today                         Tue 3 Nov    |
+--------------------------------------------+
| Write off (2)                              |
|  Whole milk 1 L   2.0 L   expired 2 days   |
|                          [ Write off ]     |
|  Croissants       6 each  expired today    |
|                          [ Write off ]     |
+--------------------------------------------+
| Use first (3)                              |
|  Oat milk 1 L    8.0 L    2 days left      |
|                          [ Record usage ]  |
|  ...                                       |
+--------------------------------------------+
| Reorder (4)                                |
|  Espresso beans  0.9 kg   below 2.0 kg     |
|  Supplier: Northside Roasters, 2 days      |
+--------------------------------------------+
```

Sections are ruled lists, not cards. A section with nothing in it says so in one line ("Nothing to write off.").

### Stock

Table: product, usable, expired, reorder point, status chip. Search field on top, filter chips for Low, Use soon, Expired. On phones the table collapses to rows with product, quantity and chip.

### Product detail

Header with usable quantity in large Archivo. Below: batches table (received, expiry, on hand, cost) sorted in FEFO order, then movement history with type, quantity, who, when, note.

### Receive: choose method

Two plain options: "Read from photo" and "Enter by hand". Photo is the first option on mobile.

### Receive from photo: the signature screen

```
Desktop                                          Mobile
+----------------------+---------------------+   +------------------+
|  [ photo of note ]   | Supplier  [Northside]|   | Supplier         |
|  zoom, pan           | Date      [02 Nov  ] |   | Date             |
|                      | Ref       [DN-4471 ] |   | [photo thumbnail]|
|                      |----------------------|   |------------------|
|                      | Printed   Item  Packs|   | Whole milk 1 L   |
|                      | whole mlk  [Whole..] |   |  Packs  [ 4 ]    |
|                      |           [ 4 ] 12 L |   |  Expiry [ 6 Nov ]|
|                      | ~~~~~~~~~ (flag) ~~~ |   |  est.            |
|                      |----------------------|   |------------------|
|                      | 6 of 7 lines ready   |   | 6 of 7 ready     |
|                      | [ Confirm receipt ]  |   | [ Confirm ]      |
+----------------------+---------------------+   +------------------+
```

- The photo stays visible while reviewing. Desktop: side by side. Mobile: collapsible thumbnail that opens full screen.
- Each line shows printed text, matched item (combobox), pack count, base-unit total, unit cost, expiry.
- Flags render as a yellow highlighter fill behind the specific field that needs checking (the item cell, the price, the expiry), not as a banner on the whole row. Each flagged field has a short plain reason beneath it ("No match found", "Price times packs does not equal line total", "Expiry required — enter a date").
- Resolving a flag (choosing an item, editing a value, accepting an estimate) fades the highlight over 150 ms. This is the one piece of motion that answers a user action.
- Estimated expiry shows an "est." tag and a dotted underline. It is not a flag unless the product tracks expiry and shelf life is missing.
- "Confirm receipt" stays disabled while any line is unmatched. The counter beside it says how many lines are still open. A line can be removed.
- On extraction failure (`failed_model` or `failed_validation`): "Couldn't read this photo. You can enter the delivery by hand, your photo stays visible." When the AI service or quota is unavailable (`ai_unavailable`): "Photo reading is unavailable right now. Enter the delivery by hand — your photo stays visible." In both cases, the manual form opens with the photo beside it.

### Use, Waste

One field for product (search), one for quantity with unit toggle (L or ml, kg or g), a result preview ("Takes 4 L from batch expiring 3 Nov and 2 L from batch expiring 6 Nov"), then the button. Waste adds a reason segmented control.

## 6. Components

Start from shadcn/ui primitives and restyle to the tokens above.

- **Status chip**: icon plus text plus colour. Fresh (check), Use soon (clock, "3 days"), Expired (x, "2 days ago"). Never colour alone.
- **Quantity**: number in Archivo, unit in Plex, muted. `12.0 L`, `450 g`, `6 each`. Show L or kg at 1000 or more of ml or g.
- **Money**: `₱1,250.00`, Archivo with tabular numerals, right-aligned in tables, produced only by the shared formatter (`Intl.NumberFormat('en-PH')`).
- **Day count**: "today", "tomorrow", "3 days", "expired 2 days ago". Never raw dates in lists; show the date on detail.
- **Highlighter field**: input or cell with `--color-flag` background and `--color-flag-ink` text, plus a reason line.
- **Tables**: ruled rows, no zebra, sticky header, right-aligned numerics.
- **Buttons**: primary (teal fill), secondary (outline), destructive (expired red) for write-off confirmation only.

## 7. Motion

- No entrance animations and no hover effects as decoration.
- Allowed: the 150 ms highlighter fade, dialog open and close, toast in and out, a brief row highlight after a successful action.
- Respect `prefers-reduced-motion`: remove the fade, keep the state change.

## 8. Accessibility

- Visible focus ring: 2 px `--color-primary`, 2 px offset, on every interactive element.
- Full keyboard operation, including the review table and comboboxes.
- Every input has a label. Errors are linked to fields and announced.
- Status always has text and an icon. Flags always have a reason line.
- Target WCAG 2.2 AA. Check contrast, focus order and the 360 px layout before each release.

## 9. Writing

Plain verbs, sentence case, active voice. One name per action across buttons, toasts and errors.

| Action | Button | Success toast |
|---|---|---|
| Receive stock | Confirm receipt | Receipt confirmed |
| Use stock | Record usage | Usage recorded |
| Discard stock | Write off | Written off |
| Admin correction | Save adjustment | Adjustment saved |
| Read photo | Read from photo | n/a |
| Start demo | Try as a guest | n/a |

- Errors say what happened and what to do: "Only 14 L of milk is usable. You need 6 L more." No apologies, no "Oops".
- Empty states invite action: "No deliveries yet. Receive your first delivery."
- AI copy is plain and modest: "Check the highlighted fields before you confirm." Not "AI-powered".
- Do not call anything "smart" or "magic".

## 10. Screen inventory

| Screen | Role | Notes |
|---|---|---|
| Sign in | all | Guest button in demo mode; owner login link |
| Today | all | Work list |
| Stock, Product detail | all | |
| Receive, Receive from photo, Receive by hand | all | |
| Use, Waste | all | |
| Adjust | admin | Mandatory note |
| Catalogue (products, suppliers, supplier items) | admin | |
| Waste report | admin | Value, reason, product, date range |
| Settings | admin | Business name, currency, timezone, warning days, caps |
