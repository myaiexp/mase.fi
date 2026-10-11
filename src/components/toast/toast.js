// BaseToast — singleton toast notification service. Look is base.css's .toast* classes.
const TOAST_TYPES = new Set(['success', 'error', 'warning', 'info']);

let container = null;

function getContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  container.setAttribute('data-toast-container', '');
  document.body.appendChild(container);
  return container;
}

export class BaseToast {
  static show(message, type = 'info', duration = 5000) {
    const toast = document.createElement('div');
    const variant = TOAST_TYPES.has(type) ? type : 'info';
    toast.className = `toast toast-${variant}`;
    // Entrance animation is .toast's toast-in. This fade is only the timed dismiss;
    // position, padding, border and type color stay in base.css.
    toast.style.opacity = '1';
    toast.style.transition = 'opacity 0.3s';
    toast.textContent = message;

    const c = getContainer();
    c.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

if (typeof window !== 'undefined') {
  window.BaseToast = BaseToast;
}
