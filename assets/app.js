/* ViralEngine Daily — category filtering (zero deps) */
(() => {
  'use strict';
  const chips = document.querySelectorAll('.chip');
  const cards = document.querySelectorAll('#grid .card');
  if (!chips.length) return;

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const f = chip.dataset.filter;
      cards.forEach((card) => {
        const show = f === 'all' || card.dataset.category === f;
        card.style.display = show ? '' : 'none';
      });
    });
  });
})();
