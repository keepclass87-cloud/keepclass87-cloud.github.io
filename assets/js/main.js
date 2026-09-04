/* ============================================================================
   main.js — точка входа. Загружает контент, поднимает модули и связывает их.
   ========================================================================= */

import { createParallax } from './parallax.js';
import { createI18n } from './i18n.js';
import { createTV } from './tv.js';
import { createGallery, renderSections } from './gallery.js';
import { createLightbox } from './lightbox.js';
import { createMotion } from './motion.js';

/* ------------------------------------------------------------ загрузка --- */

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path} — HTTP ${response.status}`);
  return response.json();
}

/** Если контент не загрузился, страница не должна остаться пустой и немой. */
function reportLoadFailure(error) {
  console.error('[tepsuevvv] Контент не загружен:', error);

  const grid = document.querySelector('[data-works]');
  if (!grid) return;

  const local = window.location.protocol === 'file:';
  grid.innerHTML = `
    <p class="works__empty">
      ${local
        ? 'Откройте сайт через локальный сервер: <code>python -m http.server 8000</code>, затем http://localhost:8000. По протоколу file:// браузер запрещает читать JSON.'
        : 'Не удалось загрузить содержимое сайта. Подробности — в консоли браузера.'}
    </p>`;
}

/* ------------------------------------------------------- прочие эффекты --- */

/** Появление блоков при попадании в кадр. */
function createRevealer() {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
  );

  return {
    scan(root = document) {
      for (const el of root.querySelectorAll('.reveal:not(.is-visible)')) {
        observer.observe(el);
      }
    },
  };
}

/** Подсветка активного пункта навигации по текущей секции. */
function initScrollSpy() {
  const sections = Array.from(document.querySelectorAll('main section[id]'));
  const links = Array.from(
    document.querySelectorAll('.sidenav__link[href^="#"], .mobilenav__link[href^="#"]')
  );
  if (!sections.length || !links.length) return;

  function mark(id) {
    for (const link of links) {
      link.setAttribute('aria-current', String(link.getAttribute('href') === `#${id}`));
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      /* Активной считаем самую заметную секцию в кадре */
      const best = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (best) mark(best.target.id);
    },
    { threshold: [0.15, 0.4, 0.7], rootMargin: '-20% 0px -35% 0px' }
  );

  for (const section of sections) observer.observe(section);
  mark(sections[0].id);
}

/** Шапка получает фон, как только hero уехал наверх. */
function initTopbar() {
  const topbar = document.querySelector('[data-topbar]');
  if (!topbar) return;

  let ticking = false;
  const update = () => {
    topbar.classList.toggle('is-stuck', window.scrollY > 40);
    ticking = false;
  };

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );

  update();
}

/* ------------------------------------------------------------- запуск ---- */

async function init() {
  initTopbar();
  initScrollSpy();

  const year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  /* Сцена не зависит от контента — поднимаем её сразу, не дожидаясь JSON */
  createParallax(document.querySelector('[data-parallax-scene]'));

  const revealer = createRevealer();
  revealer.scan();

  let site;
  let worksData;
  try {
    [site, worksData] = await Promise.all([
      loadJson('content/site.json'),
      loadJson('content/works.json'),
    ]);
  } catch (error) {
    reportLoadFailure(error);
    return;
  }

  const i18n = createI18n(site);
  const tv = createTV(document.querySelector('[data-tv]'), i18n);
  const lightbox = createLightbox(i18n);
  const motion = createMotion();

  const gallery = createGallery(worksData, i18n, {
    onOpen: (work) => lightbox.open(work, gallery.visibleWorks()),
    onHover: (work) => tv.preview(work),
    onLeave: () => tv.release(),
  });

  /** Полная перерисовка всего, что зависит от языка. */
  function renderAll() {
    renderSections(site, i18n);
    gallery.render();
    tv.refresh();
    motion.setMarquee(i18n.t('marquee'));
    motion.setStatement(i18n.t('statement'));
    i18n.apply();
    revealer.scan();
  }

  document.addEventListener('langchange', () => {
    /* Смена языка на открытом лайтбоксе оставила бы старые подписи */
    lightbox.close();
    renderAll();
  });

  renderAll();
  tv.boot();
}

/* Если что-то упало, скрытые до появления блоки нужно показать принудительно —
   иначе половина страницы просто останется невидимой. */
function unhideEverything() {
  for (const el of document.querySelectorAll('.reveal')) {
    el.classList.add('is-visible');
  }
}

init().catch((error) => {
  console.error('[tepsuevvv] Ошибка инициализации:', error);
  unhideEverything();
});
