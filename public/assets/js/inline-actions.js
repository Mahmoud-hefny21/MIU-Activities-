// Replaces inline onload=/onclick= attributes so the Content-Security-Policy can forbid inline script.
//   <link rel="preload" as="style" data-async-style ...>  -> applied as a stylesheet once loaded
//   <button data-action="history-back">                    -> back, or home when there is no history
//   <button data-action="reload">                          -> reload the page
//   <button data-close-dialog>  / data-close-dialog="id"   -> close the enclosing dialog / the dialog with that id
(() => {
  // A stylesheet switched on from script does not block rendering; the preloaded file is reused.
  const applyAll = () => document.querySelectorAll('link[data-async-style]').forEach(link => {
    link.rel = 'stylesheet';
    link.removeAttribute('data-async-style');
  });
  applyAll();
  document.addEventListener('DOMContentLoaded', applyAll, { once: true });
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-action="history-back"], [data-action="reload"], [data-close-dialog]') : null;
    if (!target) return;
    if (target.dataset.action === 'history-back') { if (history.length > 1) history.back(); else location.assign('/'); }
    else if (target.dataset.action === 'reload') location.reload();
    else {
      const dialog = target.dataset.closeDialog ? document.getElementById(target.dataset.closeDialog) : target.closest('dialog');
      dialog?.close();
    }
  });
})();
