// Shadow-root setup every shadow-DOM component runs in its constructor

// Creating the <template> stays with each component: its innerHTML is a static
// literal there, which a shared wrapper taking the markup as a parameter would
// turn into a single non-literal innerHTML write.
/**
 * @param {HTMLElement} host
 * @param {{ adopt: (root: ShadowRoot) => void }} styles
 * @param {HTMLTemplateElement} template
 * @param {ShadowRootInit} [init]
 */
export function mountShadow(host, styles, template, init = { mode: 'open' }) {
  const root = host.attachShadow(init);
  styles.adopt(root);
  root.appendChild(template.content.cloneNode(true));
}
