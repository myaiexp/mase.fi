// BaseToast — singleton toast notification service
const TYPE_COLORS = {
  success: 'var(--green)',
  error: 'var(--red)',
  info: 'var(--blue)',
};

let container = null;

function getContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.setAttribute('data-toast-container', '');
  Object.assign(container.style, {
    position: 'fixed',
    top: '1rem',
    right: '1rem',
    zIndex: '10000',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    pointerEvents: 'none',
  });
  document.body.appendChild(container);
  return container;
}

export class BaseToast {
  static show(message, type = 'info', duration = 5000) {
    const toast = document.createElement('div');
    const borderColor = TYPE_COLORS[type] || TYPE_COLORS.info;
    Object.assign(toast.style, {
      padding: '8px 12px',
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: '13px',
      color: 'var(--text, #fafafa)',
      background: 'var(--bg-raised, #27272a)',
      borderLeft: '3px solid',
      borderColor,
      pointerEvents: 'auto',
      opacity: '1',
      transition: 'opacity 0.3s',
      // The container is fixed to the top-right corner with no bound of its own,
      // so an unconstrained message grows leftward straight off a phone viewport.
      maxWidth: 'min(420px, calc(100vw - 2rem))',
      overflowWrap: 'anywhere',
    });
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
