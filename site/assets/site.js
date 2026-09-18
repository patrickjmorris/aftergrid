const status = document.querySelector('[data-copy-status]');
for (const button of document.querySelectorAll('[data-copy]')) {
  const originalLabel = button.textContent;
  let resetTimer;
  button.addEventListener('click', async () => {
    const text = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
      clearTimeout(resetTimer);
      button.textContent = 'Copied';
      if (status) status.textContent = 'Copied to clipboard.';
      resetTimer = setTimeout(() => { button.textContent = originalLabel; }, 1800);
    } catch {
      if (status) status.textContent = 'Copy is unavailable here. Select and copy the visible text.';
    }
  });
}
const filterButtons = [...document.querySelectorAll('[data-filter]')];
const skills = [...document.querySelectorAll('[data-skill]')];
const search = document.querySelector('[data-search]');
let selected = 'All';
function filterSkills() {
  const query = (search?.value || '').toLowerCase().trim();
  let visible = 0;
  for (const skill of skills) {
    skill.hidden = !(selected === 'All' || skill.dataset.phase === selected) || !skill.textContent.toLowerCase().includes(query);
    if (!skill.hidden) visible++;
  }
  for (const button of filterButtons) button.setAttribute('aria-pressed', String(button.dataset.filter === selected));
  const count = document.querySelector('[data-result-count]');
  if (count) count.textContent = `${visible} skill${visible === 1 ? '' : 's'}`;
  const empty = document.querySelector('[data-empty]');
  if (empty) empty.hidden = visible > 0;
}
filterButtons.forEach(button => button.addEventListener('click', () => { selected = button.dataset.filter; filterSkills(); }));
search?.addEventListener('input', filterSkills);
for (const tab of document.querySelectorAll('[data-scenario-tab]')) {
  tab.addEventListener('click', () => {
    for (const item of document.querySelectorAll('[data-scenario-tab]')) {
      const active = item === tab;
      item.setAttribute('aria-pressed', String(active));
    }
    for (const panel of document.querySelectorAll('[data-scenario-panel]')) panel.hidden = panel.id !== tab.getAttribute('aria-controls');
  });
}
