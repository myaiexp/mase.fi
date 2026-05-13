// ASCII art + box-drawing helpers for mase.fi
export const GLYPHS = "!@#$%&*+=<>/\\|?~^".split("");
const DIGITS = "0123456789ABCDEF".split("");

// big logo for #home
export const LOGO = [
  "  ███▄ ▄███▓ ▄▄▄        ██████ ▓█████      █████▒██▓",
  " ▓██▒▀█▀ ██▒▒████▄    ▒██    ▒ ▓█   ▀    ▓██   ▒▓██▒",
  " ▓██    ▓██░▒██  ▀█▄  ░ ▓██▄   ▒███      ▒████ ░▒██▒",
  " ▒██    ▒██ ░██▄▄▄▄██   ▒   ██▒▒▓█  ▄    ░▓█▒  ░░██░",
  " ▒██▒   ░██▒ ▓█   ▓██▒▒██████▒▒░▒████▒  ·░▒█░   ░██░",
  " ░ ▒░   ░  ░ ▒▒   ▓▒█░▒ ▒▓▒ ▒ ░░░ ▒░ ░  · ▒ ░   ░▓  ",
].join("\n");

// project-specific tiny ascii marks
export const PROJECT_ART = {
  explorer: [
    "  ┌── ~/",
    "  ├── src/",
    "  │   ├── main.rs",
    "  │   └── keymap.rs   ·",
    "  ├── README.md",
    "  └── Cargo.toml",
  ].join("\n"),
  nocturne: [
    "   ▁▂▃▄▅▆▅▄▃▂▁         ",
    "  ▁▂▃▅▆▇█▇▆▅▃▂▁   ~~~  ",
    "   ▁▂▃▄▅▆▅▄▃▂▁    |||  ",
    "                   ·   ",
  ].join("\n"),
  pager: [
    " [ UP ] api.mase.fi          12ms",
    " [ UP ] git.mase.fi          18ms",
    " [WARN] cdn.mase.fi         248ms",
    " [ UP ] mail.mase.fi         33ms",
  ].join("\n"),
  lattice: [
    "   ●───●───●",
    "   │ ╲ │ ╱ │",
    "   ●───●───●",
    "   │ ╱ │ ╲ │",
    "   ●───●───●",
  ].join("\n"),
  atlas: [
    "   ╱╲    ╱╲╱╲",
    "  ╱  ╲  ╱    ╲   ╱╲",
    " ╱    ╲╱      ╲_╱  ╲",
    "~~~~~~~~ * ~~~~~~~~~",
  ].join("\n"),
  pretext: [
    "  ┌─ persona ─┐  draft  queue",
    "  │  ◐  voice │   ░░░░   ▓▓▓▓ ",
    "  │  ◑  tone  │ → ░▓▓░ → ▓▓▓░ → posted",
    "  │  ◒  topic │   ░▓░░   ▓▓░░",
    "  └───────────┘   gen.    sched.",
  ].join("\n"),
};

// activity sparkbar — 28 cells mapping to daily commits
export function sparkbar(values, max) {
  const bars = "▁▂▃▄▅▆▇█";
  return values.map(v => {
    const idx = Math.min(bars.length - 1, Math.round((v / max) * (bars.length - 1)));
    return bars[idx];
  }).join("");
}

// produce the "static band" text used during channel-switch
export function staticBand(width = 80) {
  const rows = [];
  for (let r = 0; r < 5; r++) {
    let line = "";
    for (let c = 0; c < width; c++) {
      const roll = Math.random();
      if (roll < 0.55) line += " ";
      else if (roll < 0.85) line += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      else line += DIGITS[Math.floor(Math.random() * DIGITS.length)];
    }
    rows.push(line);
  }
  return rows.join("\n");
}

// scramble a string — each char has `p` chance of being replaced by noise
export function scramble(str, p = 0.6) {
  let out = "";
  for (const ch of str) {
    if (ch === " " || ch === "\n") { out += ch; continue; }
    if (Math.random() < p) {
      const pool = /[a-zA-Z]/.test(ch) ? GLYPHS : (/[0-9]/.test(ch) ? DIGITS : GLYPHS);
      out += pool[Math.floor(Math.random() * pool.length)];
    } else out += ch;
  }
  return out;
}

// box-drawing header for cards: "┌── LABEL ──┤ right ├──...──┐"
export function boxHeader(label, right, width) {
  const l = `┌── ${label} `;
  const r = right ? ` ${right} ──┐` : "──┐";
  const dashes = Math.max(4, width - l.length - r.length);
  return l + "─".repeat(dashes) + r;
}

// For convenience for code that prefers to destructure:
export const ASCII = { LOGO, PROJECT_ART, sparkbar, staticBand, scramble, boxHeader, GLYPHS };
