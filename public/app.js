const carousel = document.querySelector('.artists');
let cards = [...document.querySelectorAll('.artist')];
const carouselStatus = document.querySelector('#carousel-status');
let active = 0;
function selectArtist(index) {
  active = (index + cards.length) % cards.length;
  cards.forEach((card, i) => {
    const selected = i === active;
    const right = i === (active + 1) % cards.length && !selected;
    const left = cards.length > 2 && i === (active - 1 + cards.length) % cards.length;
    card.hidden = !selected && !left && !right;
    card.classList.toggle('artist--left', left);
    card.classList.toggle('artist--right', right);
    card.classList.toggle('artist--active', selected);
    card.classList.toggle('artist--back', !selected);
    if (selected) card.setAttribute('aria-current', 'true');
    else card.removeAttribute('aria-current');
  });
  carouselStatus.textContent = `Карточка ${active + 1} из ${cards.length}`;
}
selectArtist(0);
let suppressClick = false;
carousel.addEventListener('click', event => {
  if (suppressClick && event.target.closest('.artist')) event.preventDefault();
});
document.addEventListener('artists-updated', () => {
  const selectedId = cards[active]?.dataset.managedArtist;
  cards = [...carousel.querySelectorAll('.artist')];
  const selectedIndex = selectedId ? cards.findIndex(card => card.dataset.managedArtist === selectedId) : active;
  selectArtist(selectedIndex >= 0 && selectedIndex < cards.length ? selectedIndex : 0);
});

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
const chapters = [...document.querySelectorAll('.page > section:not(.hero)')];
let chapterObserver;
function configureMotion() {
  chapterObserver?.disconnect();
  document.documentElement.classList.remove('motion-ready');
  if (motionPreference.matches || !('IntersectionObserver' in window)) return;
  const viewportBottom = innerHeight * .92;
  const initiallyVisible = chapters.map(chapter => {
    const bounds = chapter.getBoundingClientRect();
    return bounds.top < viewportBottom && bounds.bottom > 0;
  });
  chapters.forEach((chapter, index) => {
    chapter.classList.add('motion-section');
    chapter.querySelectorAll('.service').forEach((item, order) => {
      item.style.setProperty('--reveal-order', order);
    });
    chapter.classList.toggle('is-visible', initiallyVisible[index]);
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
