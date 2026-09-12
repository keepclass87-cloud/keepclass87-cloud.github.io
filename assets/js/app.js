/* ============================================================================
   KUROFRAME — интерактив сайта.

   Заменяет React-версию из ui-кита: выбор стража, карта частот, окно записи
   и подсветка активного раздела. Состояние одно — id выбранного стража;
   всё остальное перерисовывается от него.
   ========================================================================= */

(function () {
  'use strict';

  var entities = window.KF_ENTITIES || [];
  if (!entities.length) return;

  /* Десять слотов сидят на настоящей окружности, записи занимают каждый второй. */
  var SLOTS = 10;
  var RADIUS_PCT = 36.1;

  var selected = 'thread';   // стартовый страж — как в исходном ui-ките

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var selectorEl = $('[data-selector]');
  var slotsEl = $('[data-slots]');
  var recordEl = $('[data-record]');

  function current() {
    for (var i = 0; i < entities.length; i++) {
      if (entities[i].id === selected) return entities[i];
    }
    return entities[0];
  }

  function setText(sel, value) {
    var el = $(sel);
    if (el) el.textContent = value;
  }

  /* ------------------------------------------------------- выбор стража -- */

  function buildSelector() {
    selectorEl.innerHTML = '';

    entities.forEach(function (e) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kf-selector__cell';
      btn.setAttribute('aria-pressed', String(e.id === selected));
      btn.dataset.id = e.id;

      var index = document.createElement('span');
      index.className = 'kf-selector__index';
      index.textContent = e.index;

      var name = document.createElement('span');
      name.className = 'kf-selector__name';
      name.textContent = e.name;

      var type = document.createElement('span');
      type.className = 'kf-selector__type';
      type.textContent = e.archetype;

      btn.appendChild(index);
      btn.appendChild(name);
      btn.appendChild(type);
      btn.addEventListener('click', function () { select(e.id); });

      selectorEl.appendChild(btn);
    });
  }

  /* ------------------------------------------------------- карта частот -- */

  /* Выбранный страж встаёт в верхний слот, остальные разбегаются по кругу
     в исходном порядке — так карта «проворачивается» при переключении. */
  function orderedEntities() {
    var cur = current();
    var rest = entities.filter(function (e) { return e.id !== cur.id; });
    return [cur].concat(rest);
  }

  function buildMap() {
    slotsEl.innerHTML = '';
    var order = orderedEntities();
    var cur = current();

    for (var s = 0; s < SLOTS; s++) {
      var rad = (-90 + s * (360 / SLOTS)) * Math.PI / 180;
      var entity = (s % 2 === 0) ? order[s / 2] : null;

      var slot = document.createElement('div');
      slot.className = 'kf-map__slot' + (entity ? ' kf-map__slot--filled' : ' kf-map__slot--empty');
      if (entity && entity.id === cur.id) slot.className += ' kf-map__slot--active';
      slot.style.setProperty('--x', (50 + RADIUS_PCT * Math.cos(rad)) + '%');
      slot.style.setProperty('--y', (50 + RADIUS_PCT * Math.sin(rad)) + '%');

      if (entity) {
        slot.appendChild(buildTile(entity, entity.id === cur.id));
      } else {
        var blank = document.createElement('div');
        blank.className = 'kf-map__blank';
        blank.setAttribute('aria-hidden', 'true');
        slot.appendChild(blank);
      }

      slotsEl.appendChild(slot);
    }
  }

  function buildTile(entity, active) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kf-tile';
    btn.setAttribute('aria-pressed', String(active));
    btn.setAttribute('aria-label', entity.name);

    var img = document.createElement('img');
    img.src = entity.src;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';

    var index = document.createElement('span');
    index.className = 'kf-tile__index';
    index.textContent = entity.index;

    btn.appendChild(img);
    btn.appendChild(index);
    btn.addEventListener('click', function () { select(entity.id); });

    return btn;
  }

  /* ------------------------------------------------------- перерисовка -- */

  function render() {
    var cur = current();

    $$('.kf-selector__cell').forEach(function (cell) {
      cell.setAttribute('aria-pressed', String(cell.dataset.id === selected));
    });

    setText('[data-meta-name]', cur.name);
    setText('[data-meta-archetype]', cur.archetype);
    setText('[data-meta-frequency]', cur.frequency);

    setText('[data-core-index]', cur.index);
    setText('[data-core-name]', cur.name);
    setText('[data-core-archetype]', cur.archetype);
    setText('[data-core-frequency]', cur.frequency);

    buildMap();
    if (!recordEl.hidden) fillRecord();
  }

  function select(id) {
    if (id === selected) return;
    selected = id;
    render();
  }

  function step(dir) {
    var i = 0;
    for (var n = 0; n < entities.length; n++) {
      if (entities[n].id === selected) { i = n; break; }
    }
    select(entities[(i + dir + entities.length) % entities.length].id);
  }

  /* ------------------------------------------------------- окно записи -- */

  var lastFocused = null;

  function fillRecord() {
    var cur = current();
    var img = $('[data-record-img]');
    if (img) { img.src = cur.src; img.alt = cur.name; }

    setText('[data-record-index]', cur.index);
    setText('[data-record-name]', cur.name);
    setText('[data-record-note]', cur.note);
    setText('[data-record-frequency]', cur.frequency);
    setText('[data-record-archetype]', cur.archetype);
  }

  function openRecord() {
    lastFocused = document.activeElement;
    fillRecord();
    recordEl.hidden = false;

    /* Полоса прокрутки исчезает — компенсируем, иначе страница дёрнется */
    var gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.body.style.paddingRight = gap + 'px';
    document.body.style.overflow = 'hidden';

    var close = $('[data-close-record]', recordEl);
    if (close) close.focus();
  }

  function closeRecord() {
    if (recordEl.hidden) return;
    recordEl.hidden = true;
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    lastFocused = null;
  }

  /* ------------------------------------------------- активный раздел ---- */

  function initScrollSpy() {
    var sections = $$('main section[id]');
    var links = $$('.kf-nav__link[data-nav]');
    if (!sections.length || !links.length) return;

    var observer = new IntersectionObserver(function (entries) {
      var best = null;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        if (!best || entry.intersectionRatio > best.intersectionRatio) best = entry;
      });
      if (!best) return;

      links.forEach(function (link) {
        link.setAttribute('aria-current', String(link.dataset.nav === best.target.id));
      });
    }, { threshold: [0.2, 0.5, 0.8], rootMargin: '-20% 0px -40% 0px' });

    sections.forEach(function (s) { observer.observe(s); });
  }

  /* ------------------------------------------------------------ старт -- */

  buildSelector();
  render();
  initScrollSpy();

  $$('[data-open-record]').forEach(function (el) {
    el.addEventListener('click', function (event) {
      event.preventDefault();
      openRecord();
    });
  });

  $$('[data-close-record]').forEach(function (el) {
    el.addEventListener('click', closeRecord);
  });

  /* Клик по подложке закрывает окно, клик по самой карточке — нет */
  recordEl.addEventListener('click', function (event) {
    if (event.target === recordEl) closeRecord();
  });

  $$('[data-step]').forEach(function (btn) {
    btn.addEventListener('click', function () { step(Number(btn.dataset.step)); });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { closeRecord(); return; }
    if (recordEl.hidden) return;
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });
}());
