// Applies the saved theme before the offline page paints.
try {
  const theme = localStorage.getItem('miu-site-theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#0b1220' : '#f8fafc';
} catch (_) {}
