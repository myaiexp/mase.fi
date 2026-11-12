// Shared close-on-outside-click + Escape + cleanup lifecycle for overlay components

// Attaches the document-level listeners that an open overlay needs:
//   - a `click` listener that calls `component.close()` when `onClickOutside(e)` is truthy
//   - a `keydown` listener that calls `component.close()` on Escape
//   - any `extraListeners` the caller passes (e.g. scroll/blur on window)
//
// `onClickOutside(event) => boolean` is a predicate the caller supplies: return
// true when the click should close the overlay. It is supplied (not baked in)
// because the three overlay components decide "outside" differently — light-DOM
// `contains`, light-DOM + shadow `contains`, or `composedPath` vs the menu node.
//
// `extraListeners` is an array of { target, type, handler, options } descriptors.
//
// The registered descriptors are stored on `component._overlayListeners` so
// `removeOverlayListeners` can detach exactly what was attached. A batch still
// live from an earlier open()/show() is detached first: the storage slot holds
// one batch, so overwriting it would orphan the old listeners on document/window.
/**
 * @typedef {{ target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions | boolean, deferred?: boolean }} OverlayListener
 */

/**
 * The component's own `_overlayListeners` storage slot.
 * @param {object} component
 * @returns {{ _overlayListeners?: OverlayListener[] | null }}
 */
function slot(component) {
  return component;
}

/**
 * @param {{ close: () => void }} component
 * @param {(e: Event) => boolean} onClickOutside
 * @param {OverlayListener[]} [extraListeners]
 */
export function addOverlayListeners(component, onClickOutside, extraListeners = []) {
  removeOverlayListeners(component);
  /** @type {EventListener} */
  const onDocClick = (e) => {
    if (onClickOutside(e)) component.close();
  };
  /** @type {EventListener} */
  const onDocKeydown = (e) => {
    if ((/** @type {KeyboardEvent} */ (e)).key === 'Escape') component.close();
  };

  // The document 'click' listener is attached on the NEXT microtask, not now.
  // When open()/show() is called from inside another element's click handler,
  // that opening click is still bubbling toward document; a synchronously
  // attached outside-click listener would catch it and close the overlay the
  // same tick it opened (the bug that made a programmatically-opened overlay
  // refuse to stay open). Deferring lets the opening click finish first. The
  // keydown/extra listeners attach synchronously — only an opening *click* can
  // self-close, so only it needs the delay.
  /** @type {OverlayListener[]} */
  const registered = [
    { target: document, type: 'click', handler: onDocClick, deferred: true },
    { target: document, type: 'keydown', handler: onDocKeydown },
    ...extraListeners,
  ];

  // Store the batch immediately so removeOverlayListeners can detach it (and so
  // the deferred attach below can tell whether this batch is still the live one).
  slot(component)._overlayListeners = registered;

  for (const descriptor of registered) {
    if (descriptor.deferred) {
      queueMicrotask(() => {
        // If the overlay was closed (or re-opened) before this microtask ran,
        // _overlayListeners no longer points at THIS batch — skip the attach so
        // a closed overlay never holds a live listener and a re-open never
        // double-binds.
        if (slot(component)._overlayListeners !== registered) return;
        descriptor.target.addEventListener(descriptor.type, descriptor.handler, descriptor.options);
      });
    } else {
      descriptor.target.addEventListener(descriptor.type, descriptor.handler, descriptor.options);
    }
  }
}

/**
 * @param {object} component
 */
export function removeOverlayListeners(component) {
  const registered = slot(component)._overlayListeners;
  if (!registered) return;
  for (const { target, type, handler, options } of registered) {
    target.removeEventListener(type, handler, options);
  }
  slot(component)._overlayListeners = null;
}
