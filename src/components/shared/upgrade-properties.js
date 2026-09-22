// Replay properties set before custom-element upgrade through setters

// A consumer bundle can run before base-components.js has defined the tags
// (Vite hoists the app script into <head>, ahead of the base-components.js
// <script>). Setting `el.value = 'x'` on the still-undefined element creates an
// own data property, which after upgrade shadows the class accessor: the setter
// never runs and the getter never sees the attribute. Fix: for every accessor
// with a setter on the component's prototype chain (up to HTMLElement), move a
// pre-existing own property off the instance and replay it through the setter.
// Deriving the list from the prototype means a new public setter is covered
// without anyone remembering to register it.

export function upgradeProperties(el) {
  for (const name of setterNames(el)) {
    if (!Object.prototype.hasOwnProperty.call(el, name)) continue;
    const value = el[name];
    delete el[name];
    el[name] = value;
  }
}

function setterNames(el) {
  const names = new Set();
  for (
    let proto = Object.getPrototypeOf(el);
    proto && proto !== HTMLElement.prototype;
    proto = Object.getPrototypeOf(proto)
  ) {
    for (const [name, desc] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
      if (desc.set) names.add(name);
    }
  }
  return names;
}
