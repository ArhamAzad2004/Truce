# Truce — five design directions

Build specs for the Phase 1 mockups. Each direction is self-contained: build it from its section plus the shared section below, without asking questions. Research basis: `docs/design/references.md`. Product flow: `docs/IMPLEMENTATION_PLAN.md`.

Contrast ratios were computed with the WCAG 2.x formula for the exact hex pairs listed. Font families are named from memory of the Google Fonts catalogue and were not re-checked online; confirm each loads before building.

| # | Folder | Direction | Mode | One line |
|---|---|---|---|---|
| 01 | `01-torn-stub` | Torn Stub | Light, mint card stock | The pick is tonight's ticket; a veto tears it. |
| 02 | `02-programme-notes` | Programme Notes | Light, black on cool white | A festival programme set in huge condensed type. |
| 03 | `03-house-lights` | House Lights | Dark, warm black | A dim auditorium where the reasons arrive as subtitles. |
| 04 | `04-kitchen-note` | Kitchen Note | Light, cream paper | A friend's note taped to the fridge. |
| 05 | `05-signed-truce` | Signed Truce | Dark green with parchment | A mock-formal peace treaty the group signs and seals. |

---

## 0. Shared rules for all five mockups

### Files and page
- One file per direction: `design/mockups/0N-<slug>/index.html` (slugs in the table above). Inline `<style>` only. The only external request is one Google Fonts `<link>` (with `preconnect` to `fonts.googleapis.com` and `fonts.gstatic.com`, `display=swap`). No JS frameworks, no images, no icon fonts. Icons are inline SVG or CSS shapes. No emoji anywhere.
- No JavaScript is needed. The reveal animation plays on page load; a "Replay reveal" link on the canvas is `<a href="">` (reloads the page).
- Canvas: `background:#DCDCD8`, padding 48 px, system-ui font for canvas labels only, colour `#2B2B28`.
- Top label (canvas, above the phones): direction number and name at 20 px/600, then the one-line concept at 14 px. Example: `01 — Torn Stub` / `The pick is tonight's ticket; a veto tears it.`
- Three phone frames side by side in this order, 40 px gap, each with a 13 px canvas caption above it: `1 · Quick taps`, `2 · Lobby`, `3 · Reveal`. The row is `display:flex; min-width:1250px`; the canvas scrolls horizontally on narrow windows.
- Phone frame: exactly 390 × 844 px, `overflow:hidden`, `border-radius:44px`, `outline:10px solid #1A1A18`. No notch, no status bar, no home indicator. The direction's `bg` fills the frame. Screen padding is 16 px left/right unless the direction says otherwise; top padding 20 px, bottom 24 px.
- Everything must fit in 844 px without scrolling. If something overflows, reduce vertical gaps first, never font sizes below the stated scale.

### Accessibility
- Body text ≥ 16 px, nothing below 12 px. Text contrast ≥ 4.5:1, control boundaries ≥ 3:1 (each direction says which token to use for control borders; the `line` token is decorative only where noted).
- Every tappable thing is a real `<button>` (or `<a>`), at least 44 × 44 px, with at least 8 px between targets.
- Selected state never relies on colour alone: every direction adds a tick, a fill inversion or a weight change.
- Focus: `:focus-visible { outline: 2px solid <text token>; outline-offset: 2px }`.
- Wrap all animation in `@media (prefers-reduced-motion: no-preference)`. The reduced-motion state is the finished layout, shown at once.
- Headings are real `h1`/`h2`; member lists are `<ul>`; the QR placeholder has `role="img" aria-label="QR code placeholder"`.

### Shared mock data (identical in all five, so directions can be compared fairly)
- **Viewer:** Sam, who is the host.
- **Room code:** `7KQ2M X4TNP` (10 characters shown as 5 + 5).
- **Region line (lobby):** `Streaming region: United Kingdom` with a `Change` text button.
- **Mood** (single choice, 6): Cosy · Funny · Tense · Moving · Mind-bending · Feel-good. Selected: **Funny**.
- **Energy** (single choice, 3): Half asleep · Awake · Wired. Selected: **Awake**.
- **Time** (single choice, 4): 90 min · 2 hours · 2½ hours · No limit. Selected: **2 hours**.
- **Services** (multi choice, 6, text labels only, never logos): Netflix · Prime Video · Disney+ · Apple TV+ · Max · Hulu. Selected: **Netflix** and **Disney+**.
- **Quick-taps button:** `Next: pick 3 films`. Step indicator: step 1 of 2.
- **Lobby members:** Sam (host, you) — ready. Leila — ready. Omar — not ready, status `Picking films…`. Count: 2 of 3 ready, so "Settle it" is enabled.
- **Lobby secondary action:** `Copy invite link` (do not print a URL; no domain is chosen yet).
- **Film:** *Paper Lanterns* · 2019 · 1h 52m · On Netflix.
- **Reasons** (nickname is added by the UI and styled as a lead-in):
  - Sam — "You picked The Quiet Orbit. This has the same slow-burn wonder."
  - Leila — "You wanted something moving. It earns its ending without wrecking you."
  - Omar — "It runs 1h 52m, so you still make your early start."
- **Veto:** each of the three still has their veto. Show three small veto tokens labelled Sam, Leila, Omar, all unused.
- **Attribution** (reveal screen, last line, 12 px, `muted`): `Film data from TMDB · Streaming data by JustWatch`. (The real app also needs the TMDB logo; the mockups use text only.)
- All film titles are invented. Use no real film titles, studio names, service logos or poster art.

### Shared poster placeholder
The same off-palette poster in every direction, so each one is tested against art it did not choose. Pure CSS, 2:3 ratio, size set by the direction:

```css
.poster{aspect-ratio:2/3;position:relative;overflow:hidden;
  background:
    radial-gradient(circle at 30% 34%,#F7B955 0 9%,rgba(247,185,85,.35) 10% 17%,transparent 18%),
    radial-gradient(circle at 66% 22%,#F2994A 0 6%,rgba(242,153,74,.3) 7% 12%,transparent 13%),
    radial-gradient(circle at 58% 52%,#F7C873 0 4%,rgba(247,200,115,.3) 5% 9%,transparent 10%),
    linear-gradient(180deg,#27506A 0%,#173247 55%,#0C1A28 100%)}
.poster::after{content:"";position:absolute;inset:auto 0 0 0;height:22%;
  background:linear-gradient(175deg,transparent 30%,#08121C 31%)} /* hill silhouette */
```

No title text inside the poster.

---

## 01 — Torn Stub

**Concept:** every screen is a cinema ticket; the pick is "your ticket for tonight" and a veto tears the stub off.
**Why it suits Truce:** the product gives one answer, and a ticket is one answer you can hold. The veto has a physical meaning (tear, next ticket) that needs no explaining.
**Risk:** ticket metaphors can slide into retro kitsch. Keep it to the perforation, the notches and the serial number; no stars, no "ADMIT ONE" clip-art, no faux-aged paper.

### Palette (light only; a dark variant would swap `bg` to `#16222E` and keep the tickets light)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#DCE6DD` | Screen, pale ticket-roll mint |
| `--surface` | `#FBF8EE` | Ticket stock |
| `--text` | `#16222E` | Ink navy; also all control borders |
| `--muted` | `#4D5B66` | Secondary text |
| `--accent` | `#B3261E` | Primary button, stub edge, selected tick |
| `--accent-2` | `#1D5C4D` | "READY" stamp, service tag |
| `--line` | `#7E9488` | Perforations and hairlines only (decorative, 2.5:1) |
| `--danger` | `#8A1C12` | Error text |

Contrast: text on bg 12.6:1 · text on surface 15.2:1 · muted on bg 5.5:1 · muted on surface 6.6:1 · button text `#FFFFFF` on accent 6.5:1 · accent as text on surface 6.2:1, on bg 5.1:1 · accent-2 on surface 7.4:1 · danger on surface 8.8:1.

### Typography
Google Fonts: **Alfa Slab One** 400 (display) · **Work Sans** 400, 500, 600 (body) · **DM Mono** 400, 500 (mono).

| Role | Font | Size / line |
|---|---|---|
| Display | Alfa Slab One | 40 / 42 |
| Title | Alfa Slab One | 28 / 32 |
| Heading | Work Sans 600 | 18 / 24 |
| Body | Work Sans 400 | 16 / 24 |
| Small | Work Sans 500 | 14 / 20 |
| Label | DM Mono 500, uppercase, tracking 0.12em | 12 / 16 |

### Shape language
- Tickets: `--surface`, radius 14 px, shadow `0 1px 0 rgba(22,34,46,.12), 0 14px 24px -14px rgba(22,34,46,.28)`.
- Perforation: a `2px dashed var(--line)` rule across the ticket, with a 10 px-radius semicircular notch cut from each side edge at that height (two `radial-gradient(circle at 0 50% / 100% 50%, var(--bg) 10px, transparent 10.5px)` backgrounds on the divider row).
- Controls: radius 6 px, `1.5px solid var(--text)`. Selected: `--text` fill, `--surface` text, plus a 12 px tick SVG on the left.
- Serial number `No. 000417` in Label style, rotated 90° along the right edge of the reveal ticket.
- No texture, no gradients apart from the poster.

### Wordmark
`TRUCE` in Alfa Slab One, uppercase, 18 px, tracking 0.06em, colour `--surface`, inside a 30 px-high `--text` lozenge (padding 0 16 px, radius 4 px) with a 5 px-radius notch bitten out of the left and right edge (same radial-gradient trick, colour `--bg`). It reads as a tiny ticket.

### Reveal motion
A 6 px-high `--text` "printer slot" bar sits above the ticket. The ticket is clipped by a wrapper (`overflow:hidden`) and slides from `translateY(-100%)` to `0` in 900 ms using `steps(16,end)`, so it feeds out in jerks like a printer. Then the three reasons fade in (200 ms each, 120 ms stagger). Veto state (not animated in the mockup, describe in a comment): the stub rotates 6° and slides off right in 300 ms.
Reduced motion: ticket and reasons are simply present.

### Screen 1 — Quick taps
Top row: wordmark left; right, Label `STEP 1 / 2`.
`h1` (Title): **What are you in for?**
Sub (Body, muted): **Four taps. Nobody else sees your answers.**
One ticket fills the rest, split into four fields by perforations. Each field: Label on the left edge, controls below.
- `MOOD` — 6 chips, 3 × 2 grid, 44 px high.
- `ENERGY` — 3 equal segments in one bordered row.
- `TIME` — 4 equal segments in one bordered row.
- `SERVICES` — 6 chips, 3 × 2 grid; selected ones show the tick.
Below the ticket: full-width button, 56 px, `--accent`, white Work Sans 600 16 px: **Next: pick 3 films**.

### Screen 2 — Lobby
Top row: wordmark left; right, Label `HOST`.
`h1` (Title): **Box office is open.**
Ticket 1 (room): left column Label `ROOM NO.` then the code in DM Mono 500, 24 px, tracking 0.08em, on two lines (`7KQ2M` / `X4TNP`); below it an outlined button **Copy invite link** (44 px). Vertical perforation, then the right stub holds the QR placeholder (128 px square: `--text` modules on `--surface`, three 32 px finder squares in the corners, the rest a CSS checker pattern at 40% density; not scannable). Under the ticket, Small muted: **Scan or share. Nickname only, no account.** Then the region line.
Ticket 2 (members): Label `IN THE QUEUE · 2 OF 3 READY`. Three rows, 52 px each, separated by `--line` hairlines:
- `Sam` + Small muted `host · you` — right: `READY` stamp (Label, `--accent-2`, `1.5px solid`, radius 3 px, rotated −4°).
- `Leila` — right: `READY` stamp, rotated 3°.
- `Omar` — right: Small muted `Picking films…`.
Bottom: full-width `--accent` button 56 px **Settle it**. Under it, Small muted, centred: **Two are ready. Settle now or wait for Omar.**

### Screen 3 — Reveal
Top row: wordmark left; right, Label `ADMIT 3 · TONIGHT`.
Printer slot bar, then one tall ticket:
1. Header strip: poster 96 × 144 px on the left (radius 6 px); to the right, Label `TONIGHT'S TICKET`, then `h1` **Paper Lanterns** (Title), then Label `2019 · 1H 52M`, then a tag `ON NETFLIX` (Label, `--accent-2` text, 1.5 px `--accent-2` border, radius 3 px).
2. Perforation.
3. Label `WHY THIS ONE`, then three reasons. Each: nickname in Work Sans 600 followed by the sentence in Body. Example: **Sam,** you picked The Quiet Orbit. This has the same slow-burn wonder.
4. Perforation with a 3 px `--accent` left edge below it (the stub).
5. Stub: outlined button, 48 px, `--accent` text and border: **Tear it up — use my veto**. Small muted: **One veto each. Tearing shows the runner-up.** Then the three veto tokens as small notched mini-tickets labelled `SAM`, `LEILA`, `OMAR`.
Below the ticket: attribution line.

### What makes it not generic
The layout rule is the metaphor: content is divided by perforations, not by cards with shadows. Slab display type and a mint/oxblood palette are a long way from the dark streaming look, and the reveal behaves like an object being printed, not a modal fading in.

---

## 02 — Programme Notes

**Concept:** a printed film-festival programme: huge condensed type, numbered sections, thick rules, no decoration.
**Why it suits Truce:** the UI stays black and white, so any poster colour works beside it, and the type itself carries the confidence of "settled".
**Risk:** all-caps condensed type gets tiring and can feel cold for a friends' app. Keep caps to display, labels and names; body copy is sentence case at 16 px.

### Palette (light only; the dark variant is a straight inversion of `bg` and `text`)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F4F4F0` | Page |
| `--surface` | `#FFFFFF` | QR tile, unselected cells |
| `--text` | `#0B0B0B` | Type, rules, borders, selected fill |
| `--muted` | `#55554F` | Secondary text |
| `--accent` | `#FF4A1C` | Vermilion blocks: the one primary action per screen |
| `--accent-ink` | `#B8300A` | Accent used as text on light |
| `--accent-2` | `#FFE45C` | Marker-yellow highlight behind short labels |
| `--line` | `#0B0B0B` | Rules (2 px) |
| `--danger` | `#B00020` | Error text |

Contrast: text on bg 17.9:1 · muted on bg 6.8:1 · button text `#0B0B0B` on accent 5.9:1 · accent-ink on bg 5.5:1, on surface 6.1:1 · text on accent-2 15.5:1 · selected cell `#F4F4F0` on `#0B0B0B` 17.9:1 · danger on bg 6.6:1. Never set white or light text on `--accent`.

### Typography
Google Fonts: **Anton** 400 (display) · **Archivo** 400, 500, 700 (body) · **IBM Plex Mono** 400, 500 (mono).

| Role | Font | Size / line |
|---|---|---|
| Display | Anton, uppercase, tracking 0.01em | 64 / 58 |
| Title | Anton, uppercase | 44 / 42 |
| Name | Anton, uppercase | 22 / 24 |
| Heading | Archivo 700 | 18 / 24 |
| Body | Archivo 400 | 16 / 24 |
| Small | Archivo 500 | 14 / 20 |
| Label | IBM Plex Mono 500, uppercase, tracking 0.08em | 12 / 16 |

### Shape language
- Radius 0 everywhere. No shadows. No gradients apart from the poster.
- Structure comes from 2 px black rules across the full content width and from big section numerals (`01`–`04`, Name style) in a fixed 40 px left column.
- Choice groups are tables: cells share borders (`gap:0`, 2 px borders collapsed with negative margins), 48 px high. Selected cell: black fill, `--bg` text, Archivo 700, and a 10 px solid square in the top-right corner.
- Poster gets a 2 px black border, nothing else.

### Wordmark
A masthead row, 44 px high, with a 2 px rule beneath it. Left: `TRUCE` in Anton, 30 px, uppercase, tracking 0.02em, followed directly by a 9 px vermilion square sitting on the baseline (a square full stop, a `<span>` with `--accent` background). Right: Label text that changes per screen.

### Reveal motion
Credit roll. Each line of the reveal (label, each title line, meta, each note) sits in an `overflow:hidden` wrapper and rises from `translateY(110%)` to `0`, 500 ms `cubic-bezier(.2,.7,.2,1)`, staggered 80 ms top to bottom. The poster wipes in with `clip-path: inset(0 100% 0 0)` to `inset(0)` over 600 ms.
Reduced motion: everything visible at once, no movement.

### Screen 1 — Quick taps
Masthead right label: `1 / 2`.
`h1` (Display): **YOUR CALL.**
Body, muted: **Four questions, four taps. Your answers stay private.**
Four sections, each opened by a 2 px rule, numeral in the left column, Label beside it, cells below spanning the full width:
- `01` `MOOD` — 3 × 2 cells.
- `02` `ENERGY` — 3 cells.
- `03` `TIME` — 4 cells.
- `04` `SERVICES` — 3 × 2 cells.
Bottom: full-width vermilion block, 64 px, black Anton 22 px, left-aligned with a right-aligned arrow (inline SVG): **NEXT: PICK 3 FILMS**.

### Screen 2 — Lobby
Masthead right label: `HOST`.
`h1` (Display): **DOORS OPEN.**
Rule. Label `ROOM CODE`, then the code in Anton 52 / 52, one line: **7KQ2M X4TNP**.
Row: QR placeholder left (124 px square, white tile, 2 px black border, black modules, three finder squares); right column: Body **Scan to join. Nickname only, no account.**, then an outlined 2 px button, 44 px, Label style: **COPY INVITE LINK**. Region line below in Small muted.
Rule. Label `IN THE ROOM` left, Label `2 / 3 READY` right.
Cast list, three rows of 48 px, each with dotted leaders between name and status (a flex spacer with `border-bottom:2px dotted var(--text)`):
- **SAM** (Name) + Label `HOST · YOU` ……… `READY` (Label on `--accent-2` highlight, padding 2 px 6 px)
- **LEILA** ……… `READY` (same highlight)
- **OMAR** ……… `PICKING FILMS` (Label, muted, no highlight)
Bottom: vermilion block, 64 px: **SETTLE IT**. Under it, Small muted: **Two are ready. Settle now or wait for Omar.**

### Screen 3 — Reveal
Masthead right label: `SETTLED`.
Label `TONIGHT'S FEATURE`.
`h1` (Display, two lines): **PAPER / LANTERNS**
Row: poster 124 × 186 px left; right column, stacked Label lines with 1 px rules between them: `YEAR — 2019`, `RUNS — 1H 52M`, `WHERE —` followed by `ON NETFLIX` on the yellow highlight.
Rule. Label `PROGRAMME NOTES`.
Three notes, each separated by a 1 px rule: nickname in Name style on its own line (**SAM**, **LEILA**, **OMAR**), then the sentence in Body.
Rule. Outlined 2 px button, 48 px, Label style: **VETO — SHOW THE RUNNER-UP**. Beside or below it, Label muted: `ONE EACH` followed by three 10 px solid black squares labelled `SAM` `LEILA` `OMAR` (a used veto would be an empty square).
Attribution line.

### What makes it not generic
There are no cards, no rounded corners and no shadows at all; hierarchy is done only with type size, rules and numerals. The film title is set bigger than the poster, which reverses the usual movie-app layout.

---

## 03 — House Lights

**Concept:** a dim auditorium. People take seats in the lobby, the lights go down at "Settle it", and the reasons arrive as subtitles.
**Why it suits Truce:** the per-person reasons are the product's best idea, and subtitles are the one cinema convention built for short sentences addressed to someone. Speaker tags (`[Sam]`) do the addressing.
**Risk:** dark movie UIs are the most common look in the category. This one must hold to its rules (warm black, one amber, caption plates, no glass, no poster carousels) or it becomes a streaming clone.

### Palette (dark only; no light variant, the concept is a dark room)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0F0D0B` | Warm black, never blue-black |
| `--surface` | `#1B1815` | Raised rows, input fills |
| `--text` | `#F2EBDD` | Warm white |
| `--muted` | `#A39B8C` | Secondary text |
| `--accent` | `#F5C04A` | Caption amber: speaker tags, lit seats, primary button |
| `--accent-2` | `#E86A4A` | Exit-sign orange: veto only |
| `--line` | `#6B6357` | Control borders (3.3:1) |
| `--danger` | `#FF7A66` | Error text |

Contrast: text on bg 16.4:1 · text on surface 14.9:1 · muted on bg 7.0:1, on surface 6.4:1 · accent as text on bg 11.6:1 · button text `#0F0D0B` on accent 11.6:1 · accent-2 on bg 6.1:1 · danger on bg 7.6:1 · caption text `#F2EBDD` on the `#000000` plate at 72% over the poster stays above 7:1 on the darkest and lightest poster areas because the plate is nearly opaque.

### Typography
Google Fonts: **Instrument Serif** 400 and 400 italic (display) · **Atkinson Hyperlegible** 400, 700 (body and captions) · **Martian Mono** 400, 500 (mono).

| Role | Font | Size / line |
|---|---|---|
| Display | Instrument Serif 400 | 44 / 46 |
| Title | Instrument Serif 400 | 32 / 36 |
| Caption | Atkinson Hyperlegible 700 | 17 / 24 |
| Heading | Atkinson Hyperlegible 700 | 18 / 24 |
| Body | Atkinson Hyperlegible 400 | 16 / 24 |
| Small | Atkinson Hyperlegible 400 | 14 / 20 |
| Label | Martian Mono 500, uppercase, tracking 0.1em | 12 / 16 |

### Shape language
- Radius 4 px on controls and plates (cinema hardware, not pills). Seats are the only soft shape.
- 1 px `--line` borders. No drop shadows and no blur. Depth comes from light: one "projector spill" at the top of every screen, `radial-gradient(120% 55% at 50% -10%, rgba(245,192,74,.14), transparent 60%)`.
- Seat: 28 × 24 px, `border-radius: 9px 9px 3px 3px`. Empty: `1px dashed var(--line)`. Taken, not ready: `1.5px solid var(--accent)`, no fill. Ready: solid `--accent` fill.
- Caption plate: `background: rgba(0,0,0,.72)`, padding 8 px 12 px, radius 4 px, left-aligned.

### Wordmark
`[ truce ]` — the word in Instrument Serif italic, lowercase, 26 px, `--text`; the square brackets in Martian Mono 400, 18 px, `--accent`, with a thin space inside. It looks like a caption cue.

### Reveal motion
Lights down, then captions. On load the projector spill is at full strength and the poster is at `filter: brightness(.25)`. Over 1200 ms the spill drops to 40% opacity and the poster rises to `brightness(1)`. The title fades in at 900 ms (300 ms). Then the three caption plates appear one at a time, 250 ms fade each, starting at 1400 ms, 2000 ms and 2600 ms, and stay on screen. The veto button fades in last.
Reduced motion: final lit state, all three captions visible, no transitions.

### Screen 1 — Quick taps
Top row: wordmark left; right, Label muted `1 of 2`.
`h1` (Title): **Before the lights go down.**
Body, muted: **Four taps. Only you see these.**
Four groups, each with a Label heading in `--accent` and 20 px between groups:
- `MOOD` — 6 chips in a 3 × 2 grid, 44 px high, 1 px `--line` border. Selected: `--accent` fill, `#0F0D0B` text in 700, small tick.
- `ENERGY` — a dimmer: one horizontal 2 px track with three stops (16 px circles) and the labels beneath each stop; each stop plus its label is one 44 px-high button. Selected stop: solid `--accent`, label in `--text` 700; the track is amber up to that stop.
- `TIME` — 4 segments in one bordered row.
- `SERVICES` — 6 chips, 3 × 2; selected as for mood.
Bottom: full-width button, 56 px, `--accent`, `#0F0D0B` Atkinson 700: **Next: pick 3 films**.

### Screen 2 — Lobby
Top row: wordmark left; right, Label muted `HOST`.
`h1` (Title): **Saving seats.**
Room block: Label `ROOM CODE`, then the code in Martian Mono 500, 22 px, tracking 0.08em, inside a 1 px bordered box 52 px high; to its right a 44 px outlined button **Copy invite link** (stack it under the code if it does not fit on one line).
QR placeholder centred: a 148 px tile in `#F2EBDD` with 12 px padding and `#0F0D0B` modules (QR must stay dark on light). Under it, Small muted, centred: **Scan to join. Nickname only, no account.** Then the region line.
Seat row: Label `ROW A · 2 OF 3 READY`, then eight seats in a row with 10 px gaps: two filled (Sam, Leila), one outlined (Omar), five dashed and empty.
Member list, three rows of 48 px:
- filled seat icon · **Sam** + Small muted `host · you` · right: Small `--accent` **Ready**
- filled seat icon · **Leila** · right: Small `--accent` **Ready**
- outlined seat icon · **Omar** · right: Small muted **Picking films…**
Bottom: `--accent` button 56 px **Settle it**. Under it, Small muted, centred: **Two are ready. The lights go down when you tap.**

### Screen 3 — Reveal
The poster is full-bleed at the top: 390 × 400 px (the 2:3 placeholder cropped from the top, no padding, no radius), with a bottom fade `linear-gradient(transparent 45%, var(--bg) 100%)`. The wordmark sits over its top-left corner on a caption plate.
Overlapping the fade: `h1` (Display) **Paper Lanterns**, then Label muted `2019 · 1H 52M ·` followed by `ON NETFLIX` in `--accent`.
Three caption plates, 8 px apart, each: Label `[SAM]`, `[LEILA]` or `[OMAR]` in `--accent` on the first line, then the sentence in Caption style.
Veto: an "exit sign" button, 44 px high, `1.5px solid var(--accent-2)`, Label style in `--accent-2`: **EXIT · USE MY VETO**. Beside it, Small muted: **One each. Shows the runner-up.** Then three small seat icons labelled Sam, Leila, Omar, outlined in `--accent-2` (a used veto would be struck through).
Attribution line.

### What makes it not generic
Nothing here is borrowed from streaming apps: no carousels, no blurred glass, no rating badges. The two ideas that carry it (seats that fill, reasons as speaker-tagged subtitles) come from being in a cinema, not from browsing a catalogue, and the caption typeface is one designed for legibility.

---

## 04 — Kitchen Note

**Concept:** a friend's handwritten-feeling recommendation, taped to the fridge: warm paper, serif headlines, a card that flips over.
**Why it suits Truce:** the app replaces an argument with something friendly. This is the calmest direction, reads well in daylight, and its neutral cream lets any poster be the only strong colour.
**Risk:** cream paper with a serif is a popular look. The tape, the tilt and the plain-spoken questions have to do real work, and the detailing must stay sparse, or it reads as a wellness app.

### Palette (light only; a dark variant would use `#231C16` bg and keep the cards cream)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F3EADB` | Cream page |
| `--surface` | `#FCF8F0` | Cards and controls |
| `--text` | `#2A2019` | Brown-black |
| `--muted` | `#6B5D50` | Secondary text; also unselected control borders |
| `--accent` | `#A8401F` | Terracotta: primary button, underline, selected state |
| `--accent-2` | `#56663A` | Olive: ready ticks, service tag |
| `--tape` | `#F2D98A` | Tape strips and the sticky note (decorative fill; text on it is `--text`) |
| `--line` | `#DCCFBB` | Hairlines inside cards (decorative) |
| `--danger` | `#9B1C1C` | Error text |

Contrast: text on bg 13.3:1 · text on surface 15.0:1 · muted on bg 5.3:1, on surface 6.0:1 · button text `#FFFFFF` on accent 6.1:1 · accent as text on bg 5.2:1, on surface 5.8:1 · accent-2 on bg 5.2:1, on surface 5.9:1 · text on tape 11.4:1 · danger on bg 6.8:1.

### Typography
Google Fonts: **Newsreader** 500, 600 and 500 italic (display) · **Figtree** 400, 500, 600 (body) · **Courier Prime** 400, 700 (mono).

| Role | Font | Size / line |
|---|---|---|
| Display | Newsreader 500 | 36 / 40 |
| Title | Newsreader 600 | 28 / 32 |
| Question | Newsreader 500 italic | 19 / 24 |
| Body | Figtree 400 | 16 / 25 |
| Small | Figtree 500 | 14 / 20 |
| Label | Figtree 600, sentence case, no tracking | 13 / 16 |
| Mono | Courier Prime 700 | 24 / 28 (room code only) |

No uppercase labels anywhere in this direction.

### Shape language
- Cards: radius 20 px, `--surface`, shadow `0 1px 2px rgba(74,52,30,.08), 0 10px 24px -10px rgba(74,52,30,.20)`.
- Controls: radius 12 px, `1px solid var(--muted)`, `--surface` fill. Selected: `2px solid var(--accent)`, text in 600, and a 14 px terracotta tick.
- Tape: a 64 × 20 px `--tape` strip at 85% opacity, rotated −3° (or +4°), overlapping the top edge of a card.
- Tilt: the reveal card sits at `rotate(-1deg)`, the sticky note at `rotate(1.5deg)`. Nothing else is rotated.
- Avatars are a 36 px circle with the member's initial in Newsreader 600, `1px solid var(--muted)`. No illustrated or 3D avatars.

### Wordmark
`Truce` in Newsreader 600 italic, title case, 28 px, tracking −0.01em, `--text`, with a hand-drawn underline: an inline SVG path under the word (`viewBox="0 0 80 8"`, path `M2 5 C 18 1, 30 7, 44 4 S 70 2, 78 5`, stroke `--accent`, width 2.5, round caps, no fill).

### Reveal motion
Card flip. The reveal card starts face-down: the back is `--surface` with the wordmark centred and, under it, Question style **Tonight's film is…**. It turns from `rotateY(180deg)` to `0` in 700 ms `cubic-bezier(.3,.7,.2,1)` inside a `perspective:1000px` wrapper, both faces with `backface-visibility:hidden`. The reasons then rise 12 px and fade in, 250 ms each, 100 ms stagger.
Reduced motion: a 200 ms cross-fade from back to front, reasons already in place.

### Screen 1 — Quick taps
Top row: wordmark left; right, Label muted `Step 1 of 2`.
`h1` (Display): **Hi Sam. How's tonight looking?**
Body, muted: **Four quick taps. Only you can see them.**
Four groups, each headed by a Question:
- **What mood are you in?** — 6 chips, 3 × 2, 44 px high.
- **How much energy have you got?** — 3 equal chips in a row.
- **How long have you got?** — 4 equal chips in a row.
- **What can you watch on?** — 6 chips, 3 × 2; selected ones ticked.
Bottom: full-width button, 56 px, radius 16 px, `--accent`, white Figtree 600: **Next: pick 3 films**.

### Screen 2 — Lobby
Top row: wordmark left; right, Label muted `You're hosting`.
`h1` (Display): **Get everyone in.**
Body, muted: **Share the code or let them scan. Nickname only, no sign-up.**
Row of two: left, a sticky note (`--tape` fill, 150 px wide, radius 4 px, rotated 1.5°, small shadow) with Label **Room code** and the code in Mono on two lines; right, the QR placeholder (132 px, `--surface` tile, radius 12 px, `--text` modules with rounded finder squares). Under the row: an outlined button, 44 px, **Copy invite link**, then the region line in Small muted.
Members card (taped at the top): Label **Who's here** left, Label `--accent-2` **2 of 3 ready** right. Three rows of 52 px with `--line` hairlines:
- avatar `S` · **Sam** + Small muted `host · you` · right: olive tick + Small `--accent-2` **Ready**
- avatar `L` · **Leila** · right: olive tick + **Ready**
- avatar `O` · **Omar** · right: Small muted **Picking films…**
Bottom: `--accent` button 56 px **Settle it**. Under it, Small muted, centred: **Two are ready. Settle now or wait for Omar.**

### Screen 3 — Reveal
Top row: wordmark left.
Question, centred: **Tonight you're watching**
One card, rotated −1°, tape strip at the top centre, padding 20 px:
- Poster 128 × 192 px, centred, radius 10 px.
- `h1` (Title), centred: **Paper Lanterns**
- Small muted, centred: **2019 · 1h 52m ·** followed by a tag **On Netflix** (Label, `--accent-2` text, `1px solid var(--accent-2)`, radius 8 px, padding 2 px 8 px).
- Hairline, then three reasons separated by hairlines. Each starts with the nickname in Question style and `--accent` (**Sam,** **Leila,** **Omar,**) and continues in Body on the same paragraph.
Below the card: outlined button, 48 px, radius 14 px, `--text` text: **Not for me — use my veto**. Small muted, centred: **Everyone gets one. You'll see the runner-up.** Then three 24 px initial circles (S, L, O) with the Label **Vetoes left** before them.
Attribution line.

### What makes it not generic
It speaks in full, human questions instead of field labels, and its only ornaments are things a person would actually do with paper: tape it up, tilt it, underline a word. No uppercase, no icons beyond a tick, no gradient anywhere.

---

## 05 — Signed Truce

**Concept:** the name taken literally. Movie night is a dispute, the room is a negotiating table, and the result is a peace treaty the group signs and seals.
**Why it suits Truce:** it is the only direction that grows from the brand name instead of from cinema, so nobody in the category has it. The dry, mock-formal voice makes the per-person reasons ("Article I — Sam") funny and memorable.
**Risk:** the joke can wear thin, and formal styling could confuse first-time users. Controls must stay plain and obvious; the humour lives in headings and the seal only.

### Palette (dark green field with light parchment documents; no separate light or dark variant)
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0F3B2D` | Baize green table |
| `--surface` | `#F2EAD3` | Parchment documents |
| `--text` | `#F4EEDD` | Text on green |
| `--ink` | `#1A1A14` | Text on parchment and on brass |
| `--muted` | `#B5C4B4` | Secondary text on green |
| `--muted-ink` | `#5A5744` | Secondary text on parchment |
| `--accent` | `#D9B45F` | Brass: primary button, rules, ticks |
| `--accent-2` | `#A62B1A` | Wax red: the seal and the veto, on parchment only |
| `--line` | `#6F9080` | Control borders on green (3.6:1) |
| `--line-doc` | `#8C8468` | Rules on parchment (3.1:1) |
| `--danger` | `#FF9C8A` | Error text on green (use `--accent-2` on parchment) |

Contrast: text on bg 10.8:1 · muted on bg 6.8:1 · accent as text on bg 6.3:1 · button text `--ink` on accent 8.9:1 · ink on surface 14.6:1 · muted-ink on surface 6.1:1 · accent-2 on surface 5.9:1 · seal text `#F2EAD3` on accent-2 5.9:1 · danger on bg 6.2:1. Never put `--accent-2` on the green.

### Typography
Google Fonts: **Bodoni Moda** 500, 700 and 500 italic (display) · **Libre Franklin** 400, 500, 600 (body) · **Spline Sans Mono** 400, 500 (mono) · **Caveat** 600 (signatures only).

| Role | Font | Size / line |
|---|---|---|
| Display | Bodoni Moda 700, uppercase, tracking 0.06em | 30 / 36 |
| Title | Bodoni Moda 500 | 34 / 38 |
| Heading | Bodoni Moda 500 italic | 20 / 26 |
| Body | Libre Franklin 400 | 16 / 24 |
| Small | Libre Franklin 500 | 14 / 20 |
| Label | Spline Sans Mono 500, uppercase, tracking 0.14em | 12 / 16 |
| Signature | Caveat 600 | 30 / 30 |

### Shape language
- Documents: `--surface`, radius 2 px, a double rule frame (`border:1px solid var(--line-doc)` plus `outline:1px solid var(--line-doc); outline-offset:-6px`), hard shadow `0 3px 0 rgba(0,0,0,.28)` with no blur. Inner padding 20 px.
- Controls on green: radius 2 px, `1px solid var(--line)`, transparent fill, `--text` label. Selected: `--surface` fill, `--ink` text in 600, and a brass-on-ink tick box at the left (12 px).
- Rules: 1 px brass with a 6 px rotated square (diamond) at the centre, used once per screen under the main heading.
- Seal: 76 px circle, `--accent-2`, with a scalloped edge (an inline SVG circle with `stroke-dasharray` dots around it, or a 16-point `clip-path` polygon), inner 1 px `#F2EAD3` ring, and `SETTLED` in Label style, `#F2EAD3`, centred, rotated −8°.
- No gradients apart from the poster. No texture.

### Wordmark
`TRUCE` in Bodoni Moda 700, uppercase, 20 px, tracking 0.24em, `--text`, centred, with a 28 px brass rule on each side and, beneath the word, a 5 px brass diamond (a rotated square). All CSS.

### Reveal motion
Read, then seal. The document's lines fade in top to bottom (300 ms each, 150 ms stagger: preamble, title, meta, Article I, II, III). At 1500 ms the seal stamps: `scale(2.2) rotate(-20deg)` and opacity 0 to `scale(1) rotate(-8deg)` and opacity 1 in 320 ms `cubic-bezier(.2,1.3,.4,1)`. As it lands the document drops 2 px and returns (120 ms).
Reduced motion: document and seal are present from the start.

### Screen 1 — Quick taps
Top: wordmark centred. Under it, Label muted, centred: `PART 1 OF 2`.
`h1` (Display), centred: **TERMS OF ENGAGEMENT**
Diamond rule. Body, muted, centred: **State your position. Four taps, kept confidential.**
Four groups directly on the green, each headed by a Heading in `--accent`:
- **Article I — Mood** — 6 controls, 3 × 2, 44 px high.
- **Article II — Energy** — 3 controls in a row.
- **Article III — Time** — 4 controls in a row.
- **Article IV — Services** — 6 controls, 3 × 2.
Bottom: full-width button, 56 px, radius 2 px, `--accent` fill, `--ink` Libre Franklin 600: **Next: pick 3 films**.

### Screen 2 — Lobby
Top: wordmark centred. Label muted, centred: `HOST COPY`.
`h1` (Display), centred: **THE PARTIES**
Diamond rule.
Document 1 (room): left, Label `ROOM` then the code in Spline Sans Mono 500, 22 px, `--ink`, on two lines, then a 44 px outlined button (`1px solid var(--ink)`, `--ink` text) **Copy invite link**; right, the QR placeholder (120 px, `--ink` modules straight on the parchment, square finders). Under both, Small `--muted-ink`: **Scan to join. Nickname only, no account.**
Region line on the green, Small muted.
Document 2 (signatories): Label `SIGNATORIES` left, Label `2 OF 3 SIGNED` right. Three signature lines, 64 px each. Each is a 1 px `--ink` line with the printed name under it in Label style and the status at the right:
- Signature **Sam** (Caveat, `--ink`, sitting on the line, rotated −3°) · under the line `SAM · HOST · YOU` · right: Label `--muted-ink` `READY`
- Signature **Leila** (rotated 2°) · under the line `LEILA` · right: `READY`
- Empty line · under it `OMAR` · right: Small italic `--muted-ink` **Picking films…**
Bottom: `--accent` button 56 px **Settle it**. Under it, Small muted, centred: **Two signatures are enough. Settle now or wait for Omar.**

### Screen 3 — Reveal
Top: wordmark centred.
One document:
- Label `--muted-ink`, centred: `IT IS HEREBY SETTLED THAT TONIGHT'S FILM IS`
- `h1` (Title), centred: **Paper Lanterns**
- Label, centred: `2019 · 1H 52M · ON NETFLIX`
- 1 px `--line-doc` rule.
- Row: poster 96 × 144 px at the left with a 1 px `--ink` border and 4 px parchment mat; the seal overlaps the poster's bottom-right corner by a third. To the right and continuing below the poster, three articles, each a Label head in `--accent-2` followed by Body in `--ink`:
  - `ART. I — SAM` You picked The Quiet Orbit. This has the same slow-burn wonder.
  - `ART. II — LEILA` You wanted something moving. It earns its ending without wrecking you.
  - `ART. III — OMAR` It runs 1h 52m, so you still make your early start.
Below the document, on the green: outlined button, 48 px, `1px solid var(--line)`, `--text`: **I object — use my veto**. Small muted, centred: **One objection each. The runner-up takes its place.** Then three 20 px brass outline circles labelled `SAM` `LEILA` `OMAR` in Label style (a used objection would be filled wax red on a parchment chip).
Attribution line, muted, centred.

### What makes it not generic
It has nothing from the movie-app vocabulary at all. The ready state is a signature, the reasons are numbered articles, the reveal is a stamp, and the palette is baize green with brass and wax: a colour world no streaming or group-chat app uses.

---

## Art director's recommendation

Build all five so the owner can compare, but if one must lead, it is **01 Torn Stub**.
- For: the metaphor explains the product by itself (one ticket, tear it for the next), the palette is calm next to any poster, and it extends naturally to share images and a brand book.
- Against: it needs restraint to avoid retro kitsch.
- Runner-up: **05 Signed Truce**, the most ownable idea because it comes from the name, with the higher risk that the joke wears thin.

Open points to check before any direction is made public: that each font family loads from Google Fonts with the stated weights, and that the invented titles ("Paper Lanterns", "The Quiet Orbit") do not match real films closely enough to matter.

---

## 06 Night Ticket (hybrid)

**Concept:** 01's ticket, lit, in 03's dark auditorium. The house lights go down, the pick prints out of a slot, and a veto tears the stub. Folder `06-night-ticket`. Built after the owner's review of 01–05; it follows the shared rules in section 0.

### Tokens
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0F0D0B` | Warm-black room (03) |
| `--text` | `#F2EBDD` | Text on the room |
| `--muted` | `#A39B8C` | Secondary text on the room |
| `--amber` | `#F5C04A` | The one light: primary button, text button, selected tick, house-light and projector gradients |
| `--line` | `#6B6357` | Reserved for control borders on the room (none used in these three screens) |
| `--danger` | `#FF7A66` | Error text on the room (not used in the mockup) |
| `--stock` | `#F4ECD8` | Ticket card stock |
| `--stock-lit` | `#FFF8E4` | Highlight where the light lands on the reveal ticket |
| `--stock-dim` | `#E4D9BE` | Veto mini-tickets |
| `--ink` | `#1C1611` | Text, control borders and selected fill on stock; text on amber |
| `--ink-muted` | `#5A5046` | Secondary text on stock |
| `--bronze` | `#7A5200` | Amber as ink: READY stamp, ON NETFLIX tag |
| `--red` | `#B3261E` | Oxblood, veto only, on stock only |
| `--perf` | `#A89B80` | Perforations and hairlines (decorative, 2.3:1) |

Accent system: amber means light, selection and go; oxblood means veto and danger. Selection never relies on colour: selected = ink fill + amber tick + 600 weight.

Contrast (WCAG 2.x, computed for these exact pairs): text on bg 16.4:1 · muted on bg 7.0:1 · muted on the brightest house light (amber at 18% over bg, `#382D16`) 4.9:1, text there 11.4:1 · amber on bg 11.6:1, on the 14% spill 8.9:1 · ink on amber (button) 10.7:1 · ink on stock 15.2:1, on stock-lit 16.9:1 · stock on ink (selected) 15.2:1 · amber tick on ink 10.7:1 · ink-muted on stock 6.7:1, on stock-dim 5.6:1 · ink on stock-dim 12.8:1 · bronze on stock 5.9:1, on stock-lit 6.5:1 · red on stock 5.6:1, on stock-lit 6.2:1 · danger on bg 7.6:1 · ticket edge (stock on bg) 16.5:1 · slot border `#8A8172` on bg 5.1:1. Never put `--red` or `--bronze` on the dark room.

### Typography
01's system, unchanged: **Alfa Slab One** 400 (Title 28/32) · **Work Sans** 400, 500, 600 (Body 16/24, Small 14/20) · **DM Mono** 500 (Label 12/16, uppercase, tracking 0.12em; room code 24/30). All three families were checked against the Google Fonts CSS endpoint and load in the browser. The slab holds up in warm white on black, so nothing was swapped for 03's serif.

### Shape and light
- Tickets, perforations, notches, serial number, wordmark lozenge and veto mini-tickets are 01's. The notches are now real cut-outs (CSS mask), so the dark room shows through them.
- Light is two gradients on the room, never a halo on the card: a house-light spill from above the screen and a projector pool behind the ticket. The reveal ticket's header also brightens to `--stock-lit` where the light lands. Shadows are neutral black.
- Lobby members sit in seat rows inside the ticket: a seat shape with the seat number printed on it (`A1`–`A3`), ink-filled when ready and dashed while deciding, plus 01's READY stamp.
- Reasons stay ticket-style rows with a bold name lead-in. 03's caption plates were designed to sit over a poster; on light stock they would put black boxes on the one lit object and break it.

### Motion
House lights dim (spill opacity 1 to 0.4, 1200 ms ease-out), the projector pool fades up (900 ms from 500 ms), the ticket feeds from the slot (900 ms, `steps(16,end)`, from 900 ms), then the three reasons fade in (200 ms each, 120 ms stagger from 1900 ms). Veto (described, not animated): the stub tears off as in 01 and the house lights come up for that beat. Reduced motion: the dimmed room and the finished ticket are shown at once.

### From 01 / from 03
- **From 01:** ticket as the only container, perforations and notches, serial, wordmark lozenge, printer-slot reveal, tear-off veto stub with its oxblood edge, type system, layout of all three screens.
- **From 03:** warm-black room, amber as the single light, top spill, lights-down moment, seats in the lobby, the line "The lights go down when you tap."
- **Dropped:** 01's mint and green (bronze replaces green so there is one accent family), 01's label above the film title, 03's serif, caption plates and exit-sign orange.
