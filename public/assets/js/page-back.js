// Back button for standalone pages that do not load the shared layout script.
(() => {
  'use strict';
  if (document.querySelector('.floating-back-control')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'floating-back-control';
  button.innerHTML = '<span aria-hidden="true">←</span> Back';
  // Sit just under the page header, like on the other pages.
  const header = document.querySelector('header');
  button.style.top = `${(header?.getBoundingClientRect().bottom || 72) + 8}px`;
  button.addEventListener('click', () => {
    const fromSite = document.referrer && new URL(document.referrer).origin === location.origin;
    if (fromSite && history.length > 1) history.back(); else location.assign('/');
  });
  document.body.append(button);
})();
