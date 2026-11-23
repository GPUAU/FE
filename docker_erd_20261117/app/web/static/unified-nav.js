(() => {
  const menu = document.getElementById('marketMenu');
  const nav = document.querySelector('.gmenu');
  const marketViews = new Set(['catalog','dashboard','compare','discounts','trend','favorites']);
  function sync() {
    const view = location.hash.slice(1).split('/')[0] || 'home';
    menu.dataset.active = String(marketViews.has(view));
    nav.querySelectorAll('a[href^="#"]').forEach(link => {
      if (link.hash === '#' + view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    menu.open = false;
  }
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  document.addEventListener('click', event => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false; menu.querySelector('summary').focus();
    }
  });
  window.addEventListener('hashchange', sync);
  sync();
})();
