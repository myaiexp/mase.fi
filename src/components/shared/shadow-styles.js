// CSP-safe shadow-root styling via constructable stylesheets

// An inline <style> — including one inside a shadow root — is governed by the
// page's CSP style-src, so on any consumer sending `style-src 'self'` (news,
// diet, several mase.fi locations) a component that injected <style> rendered
// unstyled. A constructable CSSStyleSheet adopted via adoptedStyleSheets is not
// governed by style-src, so components work under a strict CSP with no
// 'unsafe-inline'.
//
// One sheet is built per component module per document and shared by every
// instance there. The per-document cache exists because a constructed sheet can
// only be adopted into the document whose window constructed it — adopting it
// across documents (an element moved into an iframe) throws NotAllowedError.
//
// The <style> fallback is for engines without adoptedStyleSheets (jsdom, very
// old browsers); there the CSP limitation still applies, which is no worse than
// before.

export function shadowStyles(cssText) {
  const sheets = new WeakMap();

  function sheetFor(doc) {
    let sheet = sheets.get(doc);
    if (!sheet) {
      const Sheet = doc.defaultView?.CSSStyleSheet ?? CSSStyleSheet;
      sheet = new Sheet();
      sheet.replaceSync(cssText);
      sheets.set(doc, sheet);
    }
    return sheet;
  }

  return {
    cssText,
    adopt(root) {
      if ('adoptedStyleSheets' in root) {
        try {
          const sheet = sheetFor(root.ownerDocument);
          root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
          return;
        } catch (err) {
          // Styling still works through the <style> below unless the page has a
          // strict CSP — say so, because then the component renders unstyled.
          console.warn('base-components: adoptedStyleSheets failed, falling back to <style>', err);
        }
      }
      const style = root.ownerDocument.createElement('style');
      style.textContent = cssText;
      root.prepend(style);
    },
  };
}
