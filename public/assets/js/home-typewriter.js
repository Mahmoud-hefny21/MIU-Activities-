// Types the homepage "Upcoming ..." heading once the startup screen is gone.
(() => {
  const heading = document.querySelector('#homeView .events-heading-typewriter');
  if (!heading) return;
  const characters = Array.from(heading.dataset.text || 'Upcoming ...');
  heading.setAttribute('aria-label', characters.join(''));
  let typingTimer;
  const typeHeading = () => {
    window.clearTimeout(typingTimer);
    let index = 0;
    heading.textContent = '';
    heading.classList.add('is-typing');
    const typeNext = () => {
      if (index >= characters.length) {
        heading.classList.remove('is-typing');
        return;
      }
      heading.textContent += characters[index++];
      typingTimer = window.setTimeout(typeNext, 200);
    };
    typeNext();
  };
  const root = document.documentElement;
  const startWhenReady = () => {
    if (root.classList.contains('site-startup-pending')) return false;
    typeHeading();
    return true;
  };
  if (!startWhenReady()) {
    const startupObserver = new MutationObserver(() => {
      if (startWhenReady()) startupObserver.disconnect();
    });
    startupObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) startWhenReady();
  });
})();
