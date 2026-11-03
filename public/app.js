const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('.navigation');
function setMenu(open, returnFocus = false) {
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  menu.hidden = !open;
  if (returnFocus) menuButton.focus();
}
menuButton.addEventListener('click', () => setMenu(menu.hidden));
menu.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
document.addEventListener('click', event => { if (!event.target.closest('.navigation, .menu-toggle')) setMenu(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) setMenu(false, true); });
const carousel = document.querySelector('.artists');
const cards = [...document.querySelectorAll('.artist')];
let active = 0;
function selectArtist(index) {
  active = (index + cards.length) % cards.length;
  cards.forEach((card, i) => {
    const selected = i === active;
    card.classList.toggle('artist--active', selected);
    card.classList.toggle('artist--back', !selected);
    if (selected) card.setAttribute('aria-current', 'true');
    else card.removeAttribute('aria-current');
  });
  document.querySelector('#carousel-status').textContent = `Карточка ${active + 1} из ${cards.length}`;
}
let suppressClick = false;
cards.forEach(card => card.addEventListener('click', event => {
  if (suppressClick) event.preventDefault();
}));

// One change per wheel gesture; momentum must not cycle through every card.
let wheelTimer;
let wheelChanged = false;
let wheelDistance = 0;
carousel.addEventListener('wheel', event => {
  if (event.ctrlKey || !event.target.closest('.artist')) return;
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
  const delta = event.deltaX;
  event.preventDefault();
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { wheelChanged = false; wheelDistance = 0; }, 220);
  wheelDistance += delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? carousel.clientWidth : 1);
  if (!wheelChanged && Math.abs(wheelDistance) >= 35) {
    selectArtist(active + Math.sign(wheelDistance));
    wheelChanged = true;
  }
}, { passive: false });

carousel.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault(); selectArtist(active + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
let touchStart;
carousel.addEventListener('touchstart', event => { const touch = event.changedTouches[0]; touchStart = { x: touch.clientX, y: touch.clientY }; }, { passive: true });
carousel.addEventListener('touchend', event => {
  if (!touchStart) return;
  const touch = event.changedTouches[0], dx = touch.clientX - touchStart.x, dy = touch.clientY - touchStart.y;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
    selectArtist(active + (dx < 0 ? 1 : -1));
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 350);
  }
  touchStart = null;
}, { passive: true });
carousel.addEventListener('touchcancel', () => { touchStart = null; });
const dialog = document.querySelector('.contact-dialog');
document.querySelector('[data-contact]').addEventListener('click', () => dialog.showModal());
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) {
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
} });

// Progressive enhancement: content remains visible without JS or with reduced motion.
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const chapters = [...document.querySelectorAll('.page > section:not(.hero), .page > footer')];
let chapterObserver;
function configureMotion() {
  chapterObserver?.disconnect();
  document.documentElement.classList.remove('motion-ready');
  if (motionPreference.matches || !('IntersectionObserver' in window)) return;
  chapters.forEach(chapter => {
    chapter.classList.add('motion-section');
    chapter.querySelectorAll('.service, .steps li, .teacher').forEach((item, index) => {
      item.style.setProperty('--reveal-order', index);
    });
    const bounds = chapter.getBoundingClientRect();
    chapter.classList.toggle('is-visible', bounds.top < innerHeight * .92 && bounds.bottom > 0);
  });
  chapterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle('is-visible', entry.isIntersecting));
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
  chapters.forEach(chapter => chapterObserver.observe(chapter));
  document.documentElement.classList.add('motion-ready');
}
configureMotion();
motionPreference.addEventListener('change', configureMotion);
const scrollProgress = document.createElement('div');
scrollProgress.className = 'scroll-progress';
scrollProgress.setAttribute('aria-hidden', 'true');
document.body.append(scrollProgress);
let progressFrame = 0;
function updateScrollProgress() {
  progressFrame = 0;
  const maxScroll = document.documentElement.scrollHeight - innerHeight;
  const progress = maxScroll > 0 ? Math.max(0, Math.min(1, scrollY / maxScroll)) : 0;
  scrollProgress.style.setProperty('--scroll-progress', progress);
}
function scheduleScrollProgress() {
  if (!progressFrame) progressFrame = requestAnimationFrame(updateScrollProgress);
}
window.addEventListener('scroll', scheduleScrollProgress, { passive: true });
window.addEventListener('resize', scheduleScrollProgress, { passive: true });
window.addEventListener('load', scheduleScrollProgress, { once: true });
updateScrollProgress();
