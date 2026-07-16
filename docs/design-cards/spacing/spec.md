# Spacing — the rhythm system

How the six spacing steps get *used*. The **tokens** card owns the raw inventory
(`--space-1` … `--space-6` = 2 / 4 / 8 / 12 / 16 / 24); this card owns the
**system** on top of it: which step expresses which relationship, how they compose
into the rhythm of a control, a field, a section, a page — and the rules that keep
it from drifting.

Part of mase.fi's `base.css` design system (served to every project via
`https://mase.fi/base.css`). It builds on the foundation and agrees with what the
component cards already shipped: **buttons** and **inputs** codified a 22px control
with `--space-2` composition seams and `--space-3` inner padding — those are the
anchors this ladder is measured against, not a fresh proposal.

In one line: **one step per rung of the containment tree — the deeper two things
nest together, the tighter the step between them.**

## The ramp is not a doubling

`2 / 4 / 8 / 12 / 16 / 24` is a **doubling base that flattens at the top**. The
detail end doubles (2 → 4 → 8) so compact seams stay crisp; the layout end steps
by ~1.5× (8 → 12 → 16 → 24) so big gaps grow without runaway whitespace in a dense
monospace UI. Don't "regularise" it to a clean 1.2× or a pure doubling — the kink
at 8px is deliberate (it's the same hand-tuned-not-geometric logic the **type-scale**
card uses for its size steps).

## The relationship ladder

Each rung is a relationship, not a pixel value. Read it as containment: the top of
the ladder binds *parts of one thing*, the bottom separates *whole regions of a
page*. Pick the step by asking **"how deeply do these two things belong together?"**

| Step | Token | Relationship — what it separates | Shipped anchor |
|---|---|---|---|
| **2px** | `--space-1` | **Intra-row seam** — two lines of one object (card title → its metadata). The tightest legible gap. | `.section-header` vertical pad |
| **4px** | `--space-2` | **Intra-control / field seam** — parts of one control or field: icon → label, dot → text, inline meta siblings (`hash · time`), label → input, input → helper. | `.btn`/`.status` gap, `.form-label` mb, `.helper` mt |
| **8px** | `--space-3` | **Control padding & dense rows** — horizontal padding inside a control; the gap between homogeneous rows in a compact list. | `.btn`/`.input` padding |
| **12px** | `--space-4` | **Between fields · section padding** — the gap between distinct labeled fields in a form; padding inside a panel/card section. | (form composition) |
| **16px** | `--space-5` | **Pane padding · between sections** — a pane's own padding; the gap between grouped sections on one surface. | `.modal` padding |
| **24px** | `--space-6` | **Between landmarks · page gutter** — the gap between top-level regions; the outermost page gutter. | (page composition) |

### Two seams that look interchangeable but aren't

- **4px binds; 12px separates.** Inside a field the seams are 4px (label→input,
  input→helper), so fields must separate at a *clearly* larger step. 12px is a 3×
  jump — unambiguous grouping (Gestalt proximity). 8px would only be 2× and reads
  as "is this helper part of the field above or below?". The density instinct says
  8; the grouping instinct says 12, and **grouping wins** — a labeled field is a
  heterogeneous unit that needs air, unlike a homogeneous list row.
- **8px for rows, 12px for fields.** A compact list of *like* rows (feed lines,
  table rows) sits at 8px — they don't need internal separation, only a seam. A
  *form* of labeled fields sits at 12px. Same-looking stacks, different step,
  because one is homogeneous and the other isn't.

## Composition — the rhythm read top to bottom

A launch form, spelled out rung by rung, is the whole system in one specimen:

```
┌─ pane ──────────────────────────  16px padding (--space-5)
│  SECTION HEADER
│  ↕ 12px  (--space-4, section header → first field)
│  ┌ field ─────────────
│  │ LABEL              ↕ 4px  (--space-2, label → input)
│  │ [ input          ] ↕ 4px  (--space-2, input → helper)
│  │ helper text
│  └────────────────────
│  ↕ 12px  (--space-4, between fields)
│  ┌ field ─────────────
│  │ LABEL
│  │ [ input          ]
│  └────────────────────
│  ↕ 16px  (--space-5, fields → action row)
│  [ Cancel ] [ Launch ]   ← row gap 8px (--space-3), buttons 22px
└──────────────────────────────────
```

The action row's button↔button gap is `--space-3` (8px) — buttons are controls,
spaced like dense siblings, not fields.

## Prefer gap over margin — and the ramp now covers it

The system's stacking rule: **express vertical and horizontal rhythm with `gap` on
the flex/grid parent, not `margin` on children.** Gaps are composable (one source
of truth on the parent), don't collapse, and don't leave a trailing margin on the
last child.

`base.css` ships gap utilities for every rung — and this card completed them:
`.gap-1` … `.gap-4` existed (2 → 12), but the section and landmark rungs had no
utility, so the "prefer gap" rule couldn't express them without app CSS or a raw
value. Now the ramp is whole:

| Utility | Step | Typical use |
|---|---|---|
| `.gap-1` | 2px | intra-row seams |
| `.gap-2` | 4px | intra-control / field seams, inline meta |
| `.gap-3` | 8px | button rows, dense list rows |
| `.gap-4` | 12px | between fields |
| `.gap-5` | 16px | **new** — between sections |
| `.gap-6` | 24px | **new** — between landmarks / page gutter |

The `margin` exceptions that stay are the intra-field seams already shipped by the
**inputs** card — `.form-label { margin-bottom: --space-2 }`, `.helper { margin-top:
--space-2 }` — because a label and its helper are authored as standalone elements a
field wraps, not flex children of a gap container. Everything a parent *can* own
with `gap`, it should.

## What shipped in `base.css` (this card)

The spacing system is mostly a **contract** — rules over new CSS. Its implementation
leg is small and surgical, exactly two changes, both making the ramp real rather
than inventing structure:

1. **Completed the gap ramp** — added `.gap-5` (16px) and `.gap-6` (24px) so the
   full 6-step ramp is expressible as a utility. Purely additive; no existing rule
   changed.
2. **Snapped the last raw-px gap** — `.loading { gap: 6px }` → `var(--space-2)`
   (4px). 6px was off the ramp and violated this card's own "no raw px for gap"
   rule; 4px is the correct spinner→label intra-control seam (same as `.btn`).

No `.field` / `.row` / `.section` / `.stack` layout primitives were added: the
spec doesn't define them, generic class names in a globally-served sheet are
collision-prone, and the fleet already composes fields/rows in app CSS. Shipping a
layout framework would be the "invent structure the spec doesn't call for"
anti-pattern. The card gives the *rules and the vocabulary* (`--space-*` +
`.gap-*`); apps compose with them.

## Rules

- **One step per rung.** Pick the step by containment depth, not by eye. If 4px
  feels too tight and 8px too loose, the problem is layout *structure* (too many
  elements at one level), not the scale — restructure, don't invent 6px.
- **No raw px for gap / padding / margin.** Always a `--space-*` token (or a
  `.gap-*` utility). A raw value is drift the moment a token would do — the ramp
  now covers all six rungs, so there's no gap it can't express.
- **Prefer `gap` over `margin`.** Rhythm lives on the parent. Margins pile up,
  collapse unpredictably, and strand a trailing edge on the last child. The only
  sanctioned margins are the intra-field label/helper seams the inputs card ships.
- **4px binds, 12px separates.** Keep intra-field seams (4px) and between-field
  gaps (12px) a clear 3× apart so grouping is unambiguous.
- **Don't skip-and-halve.** Two adjacent steps make one jump; don't reach across
  the ramp (2 → 12 in one nesting level) or split the difference between two.
- **Padding and its sibling-gap can share a step.** A section padded at 12px and
  separated from its neighbor by 12px reads as balanced — same rung, two axes.

## Anti-patterns

- **Raw px "because the token was 1px off."** The kink in the ramp is intentional;
  the answer to "8 is too loose, 4 too tight" is fewer elements, not `6px`.
- **`margin-bottom` on stack children** where a `.gap-*` on the parent would do —
  the classic trailing-margin bug.
- **Fields spaced like list rows (8px).** Labeled fields aren't homogeneous rows;
  cramming them to 8px destroys the label→field grouping.
- **A new mid-ramp value** (10px, 20px) to "fine-tune." The system has no rung
  there by design; if a layout wants one, it wants fewer or differently-nested
  elements.

## Out of scope

- **The raw `--space-*` inventory / values** → **tokens** card. This card never
  re-declares the pixels; it only assigns them to relationships.
- **Control geometry** (the 22px height, the `--space-3` inner padding) → **buttons**
  / **inputs** cards. This card cites them as anchors; it doesn't own them.
- **App-level layout primitives** (`.field`, `.row`, `.section`, page shells) —
  apps compose these from the `--space-*` / `.gap-*` vocabulary; the shared sheet
  ships the vocabulary, not the frames.
