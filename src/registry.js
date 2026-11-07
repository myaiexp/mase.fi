// Channel registry: the ordered channel list + derived heat/accent reads.
//
// Leaf module — it imports nothing from the app, so any renderer can read the
// registry (getChannels/channelById/chHeat/chAccent) without importing the
// routing orchestrator and creating a back-edge into it. channels.js builds the
// registry here and re-exports these reads as its public routing-layer API.

// Registry state is module-private: consumers read it through getChannels() /
// channelById() rather than holding a live export binding. buildRegistry
// rebuilds it by plain reassignment, so no external module can splice it.
let channels = [];
// A Map, not a {} literal: ids arrive straight from the URL hash, and a plain
// object would resolve inherited keys (#/constructor, #/__proto__) as channels.
let byId = new Map();

/** The ordered channel list [home, ...projects, activity]. Frozen — read-only to callers.
 *  Each entry: { id, group, label (= id, the address), name (visible heading), topic, project? }. */
export function getChannels() {
  return channels;
}

/** Look up a channel by id, or undefined when it isn't in the registry. */
export function channelById(id) {
  return byId.get(id);
}

export function chHeat(id) {
  const c = byId.get(id);
  if (c?.project) return c.project.heat;
  if (id === 'home') return 1.0;
  if (id === 'activity') return 0.85;
  return 0.5;
}

export function chAccent(id) {
  const heat = chHeat(id);
  // hot → #ffbe2a / cold → #b07a1c. base #e8a308 at heat 0.5
  const L = 0.62 + (heat - 0.5) * 0.16;
  const C = 0.14 + (heat - 0.5) * 0.05;
  const H = 78 - (heat - 0.5) * 14;
  return 'oklch(' + L.toFixed(3) + ' ' + C.toFixed(3) + ' ' + H.toFixed(1) + ')';
}

/** (Re)build the channel registry from data as [home, ...projects, activity]. */
export function buildRegistry(data) {
  // Reassign wholesale — consumers read through getChannels()/channelById(), so
  // there are no live references to keep alive and no in-place surgery needed.
  channels = Object.freeze([
    { id: 'home', group: 'system', label: 'home', name: 'home', topic: 'daily logbook \xb7 appended nightly \xb7 autoscroll on' },
    ...data.projects.map(p => ({
      // id and label are the address (hash, data-ch, the "/" token); name is
      // the visible heading. Only an empty or missing name falls back, no trim,
      // the same rule as the topic below.
      id: p.channel, group: 'projects', label: p.channel, name: p.name || p.channel,
      // A blank showcase tagline would leave the topic bar empty after the
      // separator. The name, then the channel, is still a heading.
      topic: p.description || p.name || p.channel, project: p,
    })),
    { id: 'activity', group: 'system', label: 'activity', name: 'activity', topic: 'raw commit stream across all projects' },
  ]);
  byId = new Map(channels.map(c => [c.id, c]));
}
