// Content Studio: status summary with filters above "Your content".
(() => {
  'use strict';
  const list = document.getElementById('contentList');
  if (!list) return;
  const GROUPS = [
    { key: 'action', label: 'Needs your action', test: (status) => ['draft', 'changes_requested', 'rejected'].includes(status) },
    { key: 'review', label: 'In review', test: (status) => status.startsWith('pending_') },
    { key: 'live', label: 'Published', test: (status) => ['published', 'approved'].includes(status) },
    { key: 'all', label: 'All', test: () => true }
  ];
  const bar = document.createElement('div');
  bar.className = 'content-status-bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Filter your content by status');
  list.before(bar);
  const PAGE = 6;
  let active = 'all', updating = false, limit = PAGE;
  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'secondary-btn content-show-more';
  moreButton.hidden = true;
  moreButton.addEventListener('click', () => { limit += PAGE; apply(); });
  list.after(moreButton);

  const statusOf = (card) => [...(card.querySelector('.status-badge')?.classList || [])].find((name) => name.startsWith('status-') && name !== 'status-badge')?.slice(7) || '';
  function apply() {
    updating = true;
    const cards = [...list.querySelectorAll(':scope > .content-card')];
    const group = GROUPS.find((item) => item.key === active);
    // Show a few items at a time so long lists stay short.
    let shown = 0;
    cards.forEach((card) => {
      const matches = group.test(statusOf(card));
      card.hidden = !matches || shown >= limit;
      if (matches) shown += 1;
    });
    const remaining = shown - Math.min(shown, limit);
    moreButton.hidden = remaining <= 0;
    moreButton.textContent = `Show ${Math.min(remaining, PAGE)} more (${remaining} hidden)`;
    bar.replaceChildren(...GROUPS.map((item) => {
      const count = cards.filter((card) => item.test(statusOf(card))).length;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `content-status-chip is-${item.key}${item.key === active ? ' is-active' : ''}`;
      button.setAttribute('aria-pressed', String(item.key === active));
      button.textContent = `${item.label} · ${count}`;
      button.addEventListener('click', () => { active = item.key; limit = PAGE; apply(); });
      return button;
    }));
    bar.hidden = !cards.length;
    updating = false;
  }
  // The studio re-renders the list after saves; keep the summary in step.
  new MutationObserver(() => { if (!updating) apply(); }).observe(list, { childList: true });
  apply();
})();
