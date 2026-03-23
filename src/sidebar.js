/** Sidebar: channel list rendering, active state, mobile dropdown. */

import { getChannels } from './data.js';
import { relativeDate } from './terminal.js';

let _bootAnimating = false;

export function isBootAnimating() {
  return _bootAnimating;
}

export function setBootAnimating(value) {
  _bootAnimating = value;
}

/** Remove all children from an element. */
function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Render the sidebar: channel groups with links and activity indicators.
 * Also renders mobile dropdown content.
 * @param {{ entries: Array, projects: Array }} data
 */
export function initSidebar(data) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const channels = getChannels(data.entries, data.projects);
  clearEl(sidebar);

  for (const group of channels) {
    const groupEl = document.createElement('div');
    groupEl.className = 'sidebar__group';

    const header = document.createElement('div');
    header.className = 'sidebar__group-header';
    header.textContent = `\u2500\u2500 ${group.group} \u2500\u2500`;
    if (_bootAnimating) header.style.opacity = '0';
    groupEl.appendChild(header);

    for (const ch of group.channels) {
      const link = document.createElement('a');
      link.className = 'sidebar__channel';
      link.href = `#/${ch.id}`;
      if (ch.isNew) link.classList.add('sidebar__channel--new');
      link.dataset.channelId = ch.id;
      if (_bootAnimating) link.style.opacity = '0';

      const name = document.createElement('span');
      name.className = 'sidebar__name';
      const prefix = ch.isNew ? '\u2605' : '';
      name.textContent = `${prefix}${ch.label}`;
      link.appendChild(name);

      if (ch.lastActivity) {
        const indicator = document.createElement('span');
        indicator.className = 'sidebar__indicator';
        indicator.textContent = relativeDate(ch.lastActivity);
        link.appendChild(indicator);
      }

      groupEl.appendChild(link);
    }

    sidebar.appendChild(groupEl);
  }

  _initMobileDropdown(data);
  _initDropdownToggle();
}

/**
 * Highlight the active channel in the sidebar (and update mobile top bar).
 * @param {string} channelId
 */
export function setActiveChannel(channelId) {
  // Update sidebar active state
  const allChannels = document.querySelectorAll('.sidebar__channel');
  for (const el of allChannels) {
    el.classList.remove('sidebar__channel--active');
  }

  const active = document.querySelector(`.sidebar__channel[data-channel-id="${channelId}"]`);
  if (active) {
    active.classList.add('sidebar__channel--active');
  }

  // Update mobile top bar
  const mobileChannelName = document.getElementById('mobile-channel-name');
  if (mobileChannelName) {
    mobileChannelName.textContent = `#${channelId}`;
  }

  // Update mobile dropdown active state
  const allDropdownItems = document.querySelectorAll('.mobile-dropdown__channel');
  for (const el of allDropdownItems) {
    el.classList.remove('mobile-dropdown__channel--active');
  }
  const activeDropdown = document.querySelector(
    `.mobile-dropdown__channel[data-channel-id="${channelId}"]`,
  );
  if (activeDropdown) {
    activeDropdown.classList.add('mobile-dropdown__channel--active');
  }

  // Close dropdown after channel selection on mobile
  _closeMobileDropdown();
}

/** Render channel list into the mobile dropdown. */
function _initMobileDropdown(data) {
  const dropdown = document.getElementById('mobile-dropdown');
  if (!dropdown) return;

  const channels = getChannels(data.entries, data.projects);
  clearEl(dropdown);

  for (const group of channels) {
    const groupEl = document.createElement('div');
    groupEl.className = 'mobile-dropdown__group';

    const header = document.createElement('div');
    header.className = 'mobile-dropdown__group-header';
    header.textContent = `\u2500\u2500 ${group.group} \u2500\u2500`;
    groupEl.appendChild(header);

    for (const ch of group.channels) {
      const link = document.createElement('a');
      link.className = 'mobile-dropdown__channel';
      link.href = `#/${ch.id}`;
      link.dataset.channelId = ch.id;
      if (ch.isNew) link.classList.add('mobile-dropdown__channel--new');

      const name = document.createElement('span');
      name.className = 'mobile-dropdown__name';
      const prefix = ch.isNew ? '\u2605' : '';
      name.textContent = `${prefix}${ch.label}`;
      link.appendChild(name);

      if (ch.lastActivity) {
        const indicator = document.createElement('span');
        indicator.className = 'mobile-dropdown__indicator';
        indicator.textContent = relativeDate(ch.lastActivity);
        link.appendChild(indicator);
      }

      groupEl.appendChild(link);
    }

    dropdown.appendChild(groupEl);
  }
}

/** Wire up dropdown toggle button and outside-tap dismiss. */
function _initDropdownToggle() {
  const toggle = document.getElementById('mobile-dropdown-toggle');
  const dropdown = document.getElementById('mobile-dropdown');
  if (!toggle || !dropdown) return;

  // Remove any previous listener by replacing the element clone
  const freshToggle = toggle.cloneNode(true);
  toggle.parentNode.replaceChild(freshToggle, toggle);

  freshToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('mobile-dropdown--open');
    if (isOpen) {
      _closeMobileDropdown();
    } else {
      _openMobileDropdown();
    }
  });

  // Dismiss on outside tap — use a one-time listener approach via a named handler
  // stored on the document so re-init can remove and re-add it cleanly.
  if (document._sidebarOutsideHandler) {
    document.removeEventListener('click', document._sidebarOutsideHandler);
  }
  document._sidebarOutsideHandler = (e) => {
    if (dropdown.classList.contains('mobile-dropdown--open')) {
      if (!dropdown.contains(e.target) && e.target !== freshToggle) {
        _closeMobileDropdown();
      }
    }
  };
  document.addEventListener('click', document._sidebarOutsideHandler);
}

function _openMobileDropdown() {
  const dropdown = document.getElementById('mobile-dropdown');
  const toggle = document.getElementById('mobile-dropdown-toggle');
  if (dropdown) dropdown.classList.add('mobile-dropdown--open');
  if (toggle) toggle.classList.add('mobile-topbar__toggle--open');
}

function _closeMobileDropdown() {
  const dropdown = document.getElementById('mobile-dropdown');
  const toggle = document.getElementById('mobile-dropdown-toggle');
  if (dropdown) dropdown.classList.remove('mobile-dropdown--open');
  if (toggle) toggle.classList.remove('mobile-topbar__toggle--open');
}
