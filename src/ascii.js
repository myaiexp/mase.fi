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
  wander: [
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

// scramble a string — each char has `p` chance of being replaced by noise
export function scramble(str, p = 0.6) {
  let out = "";
  for (const ch of str) {
    if (ch === " " || ch === "\n") { out += ch; continue; }
    if (Math.random() < p) {
      const pool = /[0-9]/.test(ch) ? DIGITS : GLYPHS;
      out += pool[Math.floor(Math.random() * pool.length)];
    } else out += ch;
  }
  return out;
}
