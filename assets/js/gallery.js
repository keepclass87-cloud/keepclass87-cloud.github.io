/* ============================================================================
   gallery.js — рендер контента из JSON.

   createGallery  — работы и фильтры из content/works.json
   renderSections — услуги, этапы, инструменты и контакты из content/site.json

   Ни один из блоков не требует правки кода при добавлении контента.
   ========================================================================= */

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));

const PLAY_ICON = `
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" fill="currentColor"/>
  </svg>`;

/** Есть ли у работы что-то, что имеет смысл открывать в лайтбоксе. */
const hasMedia = (work) => Array.isArray(work.media) && work.media.length > 0;

/** Есть ли среди медиа движущаяся картинка — тогда рисуем значок play. */
const hasMotion = (work) =>
  hasMedia(work) && work.media.some((m) => m.type === 'video' || m.type === 'embed');

/* ==========================================================================
   Работы
   ========================================================================== */

/**
 * @param {object} data      разобранный content/works.json
 * @param {object} i18n      результат createI18n
 * @param {object} handlers  { onOpen, onHover, onLeave }
 */
export function createGallery(data, i18n, handlers = {}) {
  const grid = document.querySelector('[data-works]');
  const filterBar = document.querySelector('[data-filters]');
  const emptyNote = document.querySelector('[data-works-empty]');

  if (!grid) return { render() {}, destroy() {} };

  const works = Array.isArray(data.works) ? data.works : [];
  const categories = Array.isArray(data.categories) ? data.categories : [];

  let active = 'all';

  /** Работа в виде, удобном для остальных модулей: тексты уже на нужном языке. */
  function resolve(work) {
    return {
      id: work.id,
      category: work.category,
      title: i18n.pick(work.title),
      desc: i18n.pick(work.desc),
      year: work.year,
      tools: Array.isArray(work.tools) ? work.tools : [],
      cover: work.cover || '',
      media: Array.isArray(work.media) ? work.media : [],
    };
  }

  function categoryLabel(id) {
    const found = categories.find((c) => c.id === id);
    return found ? i18n.pick(found.label) : id;
  }

  /* ------------------------------------------------------------ фильтры -- */

  function renderFilters() {
    if (!filterBar) return;

    const counts = new Map([['all', works.length]]);
    for (const work of works) {
      counts.set(work.category, (counts.get(work.category) || 0) + 1);
    }

    const buttons = [{ id: 'all', label: i18n.t('works.all') }].concat(
      categories.map((c) => ({ id: c.id, label: i18n.pick(c.label) }))
    );

    filterBar.innerHTML = buttons
      .map(
        ({ id, label }) => `
        <button class="filter" type="button" data-filter="${escapeHtml(id)}"
                aria-pressed="${id === active}">
          ${escapeHtml(label)}<span class="filter__count">${counts.get(id) || 0}</span>
        </button>`
      )
      .join('');
  }

  /* ------------------------------------------------------------ карточки -- */

  function cardMarkup(work) {
    const item = resolve(work);
    const interactive = hasMedia(work);

    const cover = item.cover
      ? `<img class="work__cover" src="${escapeHtml(item.cover)}"
               alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">`
      : `<div class="work__cover" data-placeholder></div>`;

    const play = hasMotion(work)
      ? `<span class="work__play" aria-hidden="true">${PLAY_ICON}</span>`
      : '';

    const meta = [item.year, ...item.tools].filter(Boolean).join(' · ');

    /* Кликабельно только то, что реально есть что показать */
    const title = interactive
      ? `<button class="work__link" type="button">${escapeHtml(item.title)}</button>`
      : escapeHtml(item.title);

    return `
      <article class="work" data-work-id="${escapeHtml(item.id)}"
               data-category="${escapeHtml(item.category)}">
        <div class="work__frame">
          ${cover}
          <span class="work__type">${escapeHtml(categoryLabel(item.category))}</span>
          ${play}
        </div>
        <div class="work__body">
          <h3 class="work__title">${title}</h3>
          ${item.desc ? `<p class="work__desc">${escapeHtml(item.desc)}</p>` : ''}
          ${meta ? `<p class="work__meta label">${escapeHtml(meta)}</p>` : ''}
        </div>
      </article>`;
  }

  function renderCards() {
    grid.innerHTML = works.map(cardMarkup).join('');

    /* Битая ссылка на обложку не должна оставлять дыру в сетке */
    for (const img of grid.querySelectorAll('.work__cover')) {
      img.addEventListener('error', () => {
        const stub = document.createElement('div');
        stub.className = 'work__cover';
        stub.dataset.placeholder = '';
        img.replaceWith(stub);
      });
    }
  }

  /* ---------------------------------------------------------- фильтрация -- */

  function applyFilter() {
    let shown = 0;

    for (const card of grid.querySelectorAll('.work')) {
      const match = active === 'all' || card.dataset.category === active;
      card.classList.toggle('is-hidden', !match);
      if (match) shown += 1;
    }

    if (emptyNote) emptyNote.hidden = shown > 0;

    for (const btn of filterBar?.querySelectorAll('[data-filter]') || []) {
      btn.setAttribute('aria-pressed', String(btn.dataset.filter === active));
    }
  }

  /* -------------------------------------------------------------- события -- */

  function findWork(id) {
    const raw = works.find((w) => w.id === id);
    return raw ? resolve(raw) : null;
  }

  function onGridClick(event) {
    const trigger = event.target.closest('.work__link');
    if (!trigger) return;

    const card = trigger.closest('.work');
    const work = findWork(card?.dataset.workId);
    if (work) handlers.onOpen?.(work);
  }

  /* pointerover/out всплывают, в отличие от mouseenter/leave — можно повесить
     один обработчик на всю сетку вместо одного на каждую карточку. */
  function onGridOver(event) {
    const card = event.target.closest('.work');
    if (!card || card.contains(event.relatedTarget)) return;
    const work = findWork(card.dataset.workId);
    if (work) handlers.onHover?.(work);
  }

  function onGridOut(event) {
    const card = event.target.closest('.work');
    if (!card || card.contains(event.relatedTarget)) return;
    handlers.onLeave?.();
  }

  function onFilterClick(event) {
    const btn = event.target.closest('[data-filter]');
    if (!btn) return;
    active = btn.dataset.filter;
    applyFilter();
  }

  grid.addEventListener('click', onGridClick);
  grid.addEventListener('pointerover', onGridOver);
  grid.addEventListener('pointerout', onGridOut);
  /* Тот же превью-эффект при обходе с клавиатуры */
  grid.addEventListener('focusin', onGridOver);
  grid.addEventListener('focusout', onGridOut);
  filterBar?.addEventListener('click', onFilterClick);

  function render() {
    renderFilters();
    renderCards();
    applyFilter();
  }

  return {
    render,
    /** Список работ текущей категории — им листает лайтбокс. */
    visibleWorks() {
      return works
        .filter((w) => (active === 'all' || w.category === active) && hasMedia(w))
        .map(resolve);
    },
    destroy() {
      grid.removeEventListener('click', onGridClick);
      grid.removeEventListener('pointerover', onGridOver);
      grid.removeEventListener('pointerout', onGridOut);
      grid.removeEventListener('focusin', onGridOver);
      grid.removeEventListener('focusout', onGridOut);
      filterBar?.removeEventListener('click', onFilterClick);
    },
  };
}

/* ==========================================================================
   Услуги, этапы, инструменты, контакты
   ========================================================================== */

export function renderSections(site, i18n) {
  /* --- Услуги ------------------------------------------------------------- */
  const cards = document.querySelector('[data-services]');
  if (cards) {
    const items = i18n.t('services.items') || [];
    cards.innerHTML = items
      .map(
        (item, index) => `
        <article class="card reveal" style="--reveal-delay:${index * 90}ms">
          <p class="card__num">0${index + 1}</p>
          <h3 class="card__title">${escapeHtml(item.title)}</h3>
          <p class="card__text">${escapeHtml(item.text)}</p>
          <ul class="card__list">
            ${(item.list || [])
              .map((line) => `<li class="card__item"><span>${escapeHtml(line)}</span></li>`)
              .join('')}
          </ul>
        </article>`
      )
      .join('');
  }

  /* --- Этапы работы ------------------------------------------------------- */
  const process = document.querySelector('[data-process]');
  if (process) {
    const steps = i18n.t('process.steps') || [];
    process.innerHTML = steps
      .map(
        (step) => `
        <li class="process__step">
          <p class="process__name">${escapeHtml(step.name)}</p>
          <p class="process__text">${escapeHtml(step.text)}</p>
        </li>`
      )
      .join('');
  }

  /* --- Инструменты -------------------------------------------------------- */
  const tools = document.querySelector('[data-tools]');
  if (tools) {
    const list = site.shared?.tools || [];
    tools.innerHTML = list.map((name) => `<li>${escapeHtml(name)}</li>`).join('');
  }

  /* --- Контакты ----------------------------------------------------------- */
  const contacts = document.querySelector('[data-contacts]');
  if (contacts) {
    const list = site.shared?.contacts || [];
    contacts.innerHTML = list
      .map((entry) => {
        const external = !entry.href.startsWith('mailto:');
        const rel = external ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `
          <li>
            <a class="contact__link" href="${escapeHtml(entry.href)}"${rel}>
              <span class="contact__name">${escapeHtml(i18n.pick(entry.label))}</span>
              <span class="contact__value">${escapeHtml(entry.value)}</span>
            </a>
          </li>`;
      })
      .join('');
  }
}
