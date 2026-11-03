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
    card.setAttribute('aria-pressed', String(selected));
    card.setAttribute('aria-label', selected ? 'Артисты на переднем плане. Переключить карточку' : 'Артисты на заднем плане. Показать впереди');
  });
  document.querySelector('#carousel-status').textContent = `Карточка ${active + 1} из ${cards.length}`;
}
let suppressClick = false;
cards.forEach((card, i) => card.addEventListener('click', () => { if (!suppressClick) selectArtist(i === active ? active + 1 : i); }));
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
