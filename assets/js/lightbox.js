/* ============================================================================
   lightbox.js — просмотр работы в полном размере.

   Медиа создаётся только в момент открытия и уничтожается при закрытии:
   тяжёлое видео не грузится, пока его не попросили, а закрытое окно
   гарантированно перестаёт играть.
   ========================================================================= */

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));

const FOCUSABLE = 'button:not([hidden]), a[href], video, iframe';

/** Собирает плоский список кадров: работа с тремя картинками даёт три кадра. */
function buildSlides(works) {
  const slides = [];
  for (const work of works) {
    for (const media of work.media) slides.push({ work, media });
  }
  return slides;
}

function embedUrl(media) {
  const id = encodeURIComponent(media.id || '');
  if (media.provider === 'vimeo') {
    return `https://player.vimeo.com/video/${id}`;
  }
  /* nocookie-домен: YouTube не ставит трекинг-куки до нажатия play */
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
}

function mediaMarkup(slide) {
  const { media, work } = slide;

  if (media.type === 'video') {
    const poster = media.poster ? ` poster="${escapeHtml(media.poster)}"` : '';
    return `
      <video controls playsinline preload="metadata"${poster}>
        <source src="${escapeHtml(media.src)}" type="video/mp4">
      </video>`;
  }

  if (media.type === 'embed') {
    return `
      <iframe src="${escapeHtml(embedUrl(media))}"
              title="${escapeHtml(work.title)}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen></iframe>`;
  }

  return `<img src="${escapeHtml(media.src)}" alt="${escapeHtml(work.title)}" decoding="async">`;
}

/**
 * @param {object} i18n результат createI18n
 */
export function createLightbox(i18n) {
  const root = document.querySelector('[data-lightbox]');
  if (!root) return { open() {}, close() {} };

  const stage = root.querySelector('[data-lightbox-stage]');
  const titleEl = root.querySelector('[data-lightbox-title]');
  const descEl = root.querySelector('[data-lightbox-desc]');
  const tagsEl = root.querySelector('[data-lightbox-tags]');
  const prevBtn = root.querySelector('[data-lightbox-prev]');
  const nextBtn = root.querySelector('[data-lightbox-next]');
  const closeBtn = root.querySelector('.lightbox__close');

  let slides = [];
  let index = 0;
  let lastFocused = null;

  /* ------------------------------------------------------------- показ ---- */

  function show(nextIndex) {
    if (!slides.length) return;

    /* По кругу: с последнего кадра вперёд — на первый */
    index = (nextIndex + slides.length) % slides.length;
    const slide = slides[index];

    stage.innerHTML = mediaMarkup(slide);

    titleEl.textContent = slide.work.title;
    descEl.textContent = slide.work.desc || '';

    const tags = [slide.work.year, ...slide.work.tools].filter(Boolean);
    tagsEl.textContent = tags.join(' · ');

    const single = slides.length < 2;
    prevBtn.hidden = single;
    nextBtn.hidden = single;
  }

  /* ------------------------------------------------- открытие и закрытие -- */

  function open(work, list) {
    const pool = Array.isArray(list) && list.length ? list : [work];
    slides = buildSlides(pool);
    if (!slides.length) return;

    const start = slides.findIndex((s) => s.work.id === work.id);

    lastFocused = document.activeElement;

    /* Компенсируем исчезновение полосы прокрутки, иначе страница дёрнется */
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    document.body.style.overflow = 'hidden';

    root.hidden = false;
    show(start < 0 ? 0 : start);
    closeBtn.focus();
  }

  function close() {
    if (root.hidden) return;

    root.hidden = true;
    /* Обнуление разметки останавливает и <video>, и iframe-плеер */
    stage.innerHTML = '';
    slides = [];

    document.body.style.overflow = '';
    document.body.style.paddingRight = '';

    lastFocused?.focus?.();
    lastFocused = null;
  }

  /* ------------------------------------------------------------ события -- */

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-lightbox-close]')) close();
    else if (event.target.closest('[data-lightbox-prev]')) show(index - 1);
    else if (event.target.closest('[data-lightbox-next]')) show(index + 1);
  });

  document.addEventListener('keydown', (event) => {
    if (root.hidden) return;

    if (event.key === 'Escape') {
      close();
      return;
    }

    if (event.key === 'ArrowLeft' && slides.length > 1) {
      show(index - 1);
      return;
    }

    if (event.key === 'ArrowRight' && slides.length > 1) {
      show(index + 1);
      return;
    }

    /* Удержание фокуса внутри окна: по кругу между первым и последним */
    if (event.key === 'Tab') {
      const items = Array.from(root.querySelectorAll(FOCUSABLE))
        .filter((el) => el.offsetParent !== null);
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  return { open, close, get isOpen() { return !root.hidden; } };
}
