# Inputs & labels

Minimal text input. Height matches buttons (22px) so forms align.

## Classes

```css
.label {
  display: block;
  font-size: var(--text-xs); font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--fg-3);
  margin-bottom: 4px;
}

.input {
  display: block; width: 100%;
  height: 22px; padding: 0 8px;
  border: 1px solid var(--border);
  background: var(--bg-raised);
  color: var(--fg-1);
  font-family: var(--font); font-size: var(--text-base);
  line-height: 1;
  outline: none;
  transition: border-color var(--transition);
}
.input:focus { border-color: var(--accent); }
.input::placeholder { color: var(--fg-3); }
.input[disabled] { opacity: 0.5; cursor: not-allowed; }
.input[aria-invalid="true"] { border-color: var(--red); }

.textarea {
  /* inherits .input, override height */
  height: auto; min-height: 60px; padding: 6px 8px;
  line-height: 1.4;
  resize: vertical;
}

.helper {
  font-size: var(--text-sm); color: var(--fg-3);
  margin-top: 4px;
}
.helper-error { color: var(--red); }
```

## Markup

```html
<div>
  <label class="label" for="branch">Branch</label>
  <input class="input" id="branch" value="helm/new-feature" />
</div>

<div>
  <label class="label" for="prompt">Prompt</label>
  <textarea class="input textarea" id="prompt">…</textarea>
</div>

<div>
  <label class="label" for="bad">Project</label>
  <input class="input" id="bad" value="not-a-real-project" aria-invalid="true" />
  <div class="helper helper-error">Project does not exist.</div>
</div>
```

## Rules

- **Label is always micro-caps.** Same role as section headers — uppercase, 10px, 600, `--fg-3`, 0.04em tracking.
- **Focus = amber border.** No glow, no outline. The border color shift is enough.
- **Invalid = red border + `.helper-error` below.** Don't shake, don't emoji, don't change bg color.
- **Height matches buttons (22px).** Inputs and buttons in the same row are baseline-aligned and equal-height.
- **Placeholder is `--fg-3`.** Same color as labels/meta — it's a hint, not content.

## Open questions

- **Select / combobox** use the `<base-select>` web component; see `base-components.md`.
- **Checkbox / radio** not documented. When first needed, add here.
