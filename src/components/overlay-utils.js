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
// `removeOverlayListeners` can detach exactly what was attached.
export function addOverlayListeners(component, onClickOutside, extraListeners = []) {
  const onDocClick = (e) => {
    if (onClickOutside(e)) component.close();
  };
  const onDocKeydown = (e) => {
    if (e.key === 'Escape') component.close();
  };

  const registered = [
    { target: document, type: 'click', handler: onDocClick },
    { target: document, type: 'keydown', handler: onDocKeydown },
    ...extraListeners,
  ];

  for (const { target, type, handler, options } of registered) {
    target.addEventListener(type, handler, options);
  }

  component._overlayListeners = registered;
}

export function removeOverlayListeners(component) {
  const registered = component._overlayListeners;
  if (!registered) return;
  for (const { target, type, handler, options } of registered) {
    target.removeEventListener(type, handler, options);
  }
  component._overlayListeners = null;
}
