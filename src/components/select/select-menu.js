// Menu surface for <base-select> — builds option/group DOM from <base-option>
// light children, marks the selected row, and applies/clears the search filter.
// Each function takes the host <base-select> and operates on its `_menu`.

// Build the menu DOM from the select's light-DOM options and option-groups.
export function buildMenu(select) {
  const menu = select._menu;
  menu.textContent = '';
  const children = select.querySelectorAll(':scope > base-option, :scope > base-option-group');
  for (const child of children) {
    if (child.tagName === 'BASE-OPTION-GROUP') {
      const header = document.createElement('div');
      header.className = 'group-header';
      header.textContent = child.label;
      header.dataset.groupFor = child.label;
      menu.appendChild(header);
      for (const opt of child.querySelectorAll('base-option')) {
        menu.appendChild(createOptionDiv(select, opt, child.label));
      }
    } else {
      menu.appendChild(createOptionDiv(select, child, null));
    }
  }
  const noMatch = document.createElement('div');
  noMatch.className = 'no-matches';
  noMatch.textContent = 'No matches';
  noMatch.style.display = 'none';
  menu.appendChild(noMatch);

  markSelected(select);
}

function createOptionDiv(select, opt, groupLabel) {
  const div = document.createElement('div');
  div.className = 'option';
  div.dataset.value = opt.value;
  // Store the clean label here: action options nest a <span> label beside an
  // action-btn whose textContent is '...', so div.textContent is unreliable.
  div.dataset.label = opt.label;
  div.setAttribute('tabindex', '-1');
  if (opt.disabled) div.classList.add('disabled');
  if (groupLabel) div.dataset.group = groupLabel;

  if (opt.action) {
    div.classList.add('has-action');
    const label = document.createElement('span');
    label.textContent = opt.label;
    div.appendChild(label);
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.type = 'button';
    btn.textContent = '...';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      select.dispatchEvent(new CustomEvent('option-action', {
        bubbles: true,
        detail: { value: opt.value, label: opt.label, anchor: btn }
      }));
    });
    div.appendChild(btn);
  } else {
    div.textContent = opt.label;
  }

  div.addEventListener('click', () => select._selectOption(div));
  return div;
}

// Toggle the .selected class onto the option div matching the current value.
export function markSelected(select) {
  const v = select.value;
  for (const div of select._menu.querySelectorAll('.option')) {
    div.classList.toggle('selected', div.dataset.value === v);
  }
}

// Hide options that don't match `query` (lowercased), hide group headers whose
// options are all hidden, and toggle the no-matches row. The caller resets the
// keyboard highlight afterward.
export function filterMenu(select, query) {
  const menu = select._menu;
  const opts = [...menu.querySelectorAll('.option')];
  const headers = [...menu.querySelectorAll('.group-header')];
  const noMatch = menu.querySelector('.no-matches');
  let anyVisible = false;

  for (const opt of opts) {
    const match = !query || opt.textContent.toLowerCase().includes(query);
    opt.style.display = match ? '' : 'none';
    if (match) anyVisible = true;
  }

  for (const header of headers) {
    const groupLabel = header.dataset.groupFor;
    const groupOpts = opts.filter(o => o.dataset.group === groupLabel);
    const hasVisible = groupOpts.some(o => o.style.display !== 'none');
    header.style.display = hasVisible ? '' : 'none';
  }

  if (noMatch) noMatch.style.display = anyVisible ? 'none' : '';
}

// Inverse of filterMenu — show every option/header and hide the no-matches row.
// Used when a search is abandoned (close) rather than applied.
export function resetFilter(select) {
  const menu = select._menu;
  for (const opt of menu.querySelectorAll('.option')) opt.style.display = '';
  for (const header of menu.querySelectorAll('.group-header')) header.style.display = '';
  const noMatch = menu.querySelector('.no-matches');
  if (noMatch) noMatch.style.display = 'none';
}
