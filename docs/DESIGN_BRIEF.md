# Truce: Design Brief and Brand Book

**Direction: Night Ticket.** A lit ticket in a dark cinema. The house lights go down, tonight's pick prints out of a slot, and a veto tears the stub.

Chosen by the owner on 2026-11-16 from six mockups. Reference build: [`design/mockups/06-night-ticket/index.html`](../design/mockups/06-night-ticket/index.html). It combines the ticket system of 01 Torn Stub with the dark room of 03 House Lights (see [`design/mockups/DIRECTIONS.md`](../design/mockups/DIRECTIONS.md)). When the app and this brief disagree, fix one of them in the same commit.

## 01 Brand

**Promise:** movie night, settled. One pick, everyone can stream it, and everyone knows why it fits them.

**Principles**
1. **One lit object.** The room is dark; the ticket is the only bright thing. Never put two competing lit surfaces on one screen.
2. **The ticket is the interface.** Content lives on ticket stock: perforations separate sections, the stub holds actions. No generic cards.
3. **Calm until the reveal.** Inputs are quiet and fast. The reveal is the one big moment and gets the motion budget.
4. **Fair and personal.** Every person is named, every person gets a reason, every person gets one veto.
5. **Honest.** Real films only, clear credit to TMDB and JustWatch, no fake urgency.

**Voice:** a friendly usher. Short, warm, a little wry. Second person. Plain verbs.
- Do: "The lights go down when you tap." · "Tear it up and use my veto" · "Everyone gets one."
- Don't: hype ("Amazing pick!"), jargon ("AI-optimised"), emoji, exclamation marks in the UI.

## 02 Wordmark

- `TRUCE` in Alfa Slab One, uppercase, 18 px, tracking 0.06em, `--ink` on a 30 px-high `--stock` lozenge (padding 0 16 px, radius 4 px) with a 5 px half-circle notch cut from each side. It reads as a tiny lit ticket.
- Clear space: at least the lozenge height (30 px) on all sides.
- Minimum size: 24 px high on screen.
- Don't: recolour the lozenge amber or red, add a glow, stretch, rotate, or set the word without the lozenge.
- The TMDB logo, when shown, must be smaller and less prominent than the Truce mark.

## 03 Colour

Paste-ready tokens:

```css
:root {
  /* the room */
  --bg: #0F0D0B;        /* warm-black room */
  --text: #F2EBDD;      /* text on the room */
  --muted: #A39B8C;     /* secondary text on the room */
  --amber: #F5C04A;     /* the one light: primary button, selection tick, light gradients */
  --line: #6B6357;      /* control borders on the room */
  --danger: #FF7A66;    /* error text on the room */
  /* the ticket */
  --stock: #F4ECD8;     /* ticket card stock */
  --stock-lit: #FFF8E4; /* where the light lands */
  --stock-dim: #E4D9BE; /* veto mini-tickets, secondary stock */
  --ink: #1C1611;       /* text, borders, selected fill on stock; text on amber */
  --ink-muted: #5A5046; /* secondary text on stock */
  --bronze: #7A5200;    /* amber as ink: READY stamp, service tag */
  --red: #B3261E;       /* oxblood: veto only */
  --perf: #A89B80;      /* perforations and hairlines (decorative) */
  --shadow: 0 18px 28px -18px rgba(0,0,0,.9);
}
```

**Meaning:** amber = light, selection and go. Oxblood = veto and danger. Everything else is ink on stock or warm white on the room.

**Rules**
- `--red` and `--bronze` only ever sit on ticket stock, never on the dark room.
- Selection never relies on colour alone: selected = ink fill + amber tick + weight 600.
- No glow on cards. Light is drawn as gradients on the room (a house-light spill from the top, a projector pool behind the ticket). Shadows are neutral black.
- Posters come from TMDB in any colour; the UI stays within these tokens so posters never clash.
- Dark only for v1. A light theme is out of scope.

**Contrast** (WCAG 2.x, computed for these exact pairs; all text ≥ 4.5:1)

| Pair | Ratio |
|---|---|
| text on bg | 16.4:1 |
| muted on bg | 7.0:1 (4.9:1 on the brightest house-light area) |
| amber on bg | 11.6:1 |
| ink on amber (primary button) | 10.7:1 |
| ink on stock / stock-lit / stock-dim | 15.2 / 16.9 / 12.8:1 |
| ink-muted on stock / stock-dim | 6.7 / 5.6:1 |
| bronze on stock / stock-lit | 5.9 / 6.5:1 |
| red on stock / stock-lit | 5.6 / 6.2:1 |
| danger on bg | 7.6:1 |
| perf on stock | 2.3:1 (decorative only, never carries meaning) |

## 04 Typography

| Role | Family | Weight | Size / line |
|---|---|---|---|
| Title | Alfa Slab One | 400 | 28 / 32 |
| Body | Work Sans | 400, 500 | 16 / 24 |
| Small | Work Sans | 400 | 14 / 20 |
| Button | Work Sans | 600 | 16 / 24 |
| Label | DM Mono | 500 | 12 / 16, uppercase, tracking 0.12em |
| Room code | DM Mono | 500 | 24 / 30 |

- All from Google Fonts; load with `display=swap`.
- Labels are for ticket metadata (serials, "Admit 3 · Tonight", seat numbers), never as a small tag directly above a heading.
- Few em-dashes in copy; prefer commas, colons or full stops.

## 05 Layout and shape

- Mobile first, designed at 390 px wide. Screen padding 16 px left/right, 20 px top, 24 px bottom.
- Spacing scale: 4, 8, 12, 16, 24, 32 px.
- **Ticket:** `--stock`, radius 14 px, `--shadow`. Sections split by a dashed `--perf` perforation with real half-circle notches cut from both edges (CSS mask, so the room shows through).
- **Controls on stock:** height 44 px, radius 6 px, `1.5px solid var(--ink)`. Segmented rows: 3 px inner padding, 8 px gaps, 4 px radius per segment.
- **Buttons:** full-width, radius 6 px, Work Sans 600. Primary = `--amber` fill with `--ink` text, on the room.
- **Stamp and tag:** `--bronze` text and 1.5 px border, radius 3 px. The READY stamp is rotated −4°.
- **Seat (lobby):** 32 × 26 px, radius 9 9 3 3, seat number printed on it (`A1`…). Ready = ink fill; deciding = dashed outline.
- **Poster:** 2:3, radius 6 px, hotlinked from `image.tmdb.org` only.
- **Printer slot:** 8 px high, radius 4 px, near-black with a `#8A8172` border (5.1:1 on bg).

## 06 Motion

| Moment | Motion |
|---|---|
| Reveal | House lights dim (spill opacity 1 → 0.4, 1200 ms ease-out) · projector pool fades up (900 ms, starts at 500 ms) · ticket feeds out of the slot (900 ms, `steps(16, end)`, starts at 900 ms) · reasons fade in (200 ms each, 120 ms stagger, from 1900 ms) |
| Veto | The stub tears off along the perforation and the house lights come up for a beat, then the runner-up prints |
| Everything else | 150–200 ms opacity or colour changes only |

- No bounce or elastic easing.
- **Reduced motion:** `prefers-reduced-motion: reduce` shows the dimmed room and the finished ticket at once. All animation sits inside `@media (prefers-reduced-motion: no-preference)`.
- Animate only `opacity` and `transform`.

## 07 Components

| Component | Notes |
|---|---|
| Wordmark lozenge | See 02 |
| Ticket | Header row, perforation, body, perforation, stub. Serial number along one edge in Label |
| Chip / segment | 44 px, ink border; selected = ink fill + amber tick + 600 |
| Primary button | Amber on the room |
| Ghost button | Ink outline on stock (e.g. the veto) |
| Seat row | Lobby members: seat + nickname + READY stamp or "deciding…" |
| Room code + QR | Code in DM Mono 24, QR on stock, "Copy invite link" button |
| Reveal ticket | Poster, title, year · runtime, service tag, reasons (bold name lead-in), veto stub with a 3 px oxblood edge |
| Veto tokens | Small `--stock-dim` mini-tickets, one per person |
| Attribution line | "Film data from TMDB · Streaming data by JustWatch", Small, `--muted`, on every reveal and in the about sheet |

## 08 Accessibility

- WCAG AA contrast for all text (see 03).
- Tap targets ≥ 44 × 44 px, 8 px between targets where possible.
- Visible focus ring on every control: 2 px `--amber` outline, 2 px offset (on stock, use `--ink`).
- Never rely on colour alone (selection, ready, veto used).
- Real semantic elements: `button`, headings in order, `aria-live="polite"` for lobby presence and the reveal.
- Respect reduced motion (see 06).
- To check before launch: the mask-based notches in Safari (iOS) and Firefox.

## 09 Attribution and legal

- Footer and about sheet: the TMDB logo (smaller than the Truce mark) and "This product uses TMDB and the TMDB APIs but is not endorsed or certified by TMDB."
- "Streaming data by JustWatch" wherever availability is shown.
- Streaming services appear as text labels, not their logos.
- Design is original: no copied images, layouts or marks from the references (see [`docs/design/references.md`](design/references.md)).
