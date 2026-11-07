/* ===========================================================================
   TEPSUEV STUDIO — собственный код страницы.

   Движок scrollcraft.js не трогается. Здесь четыре вещи, которых он не даёт:
   монтажная линейка, боковые ряды от --sc-p, ленивый запуск шестнадцати
   роликов и подсветка раздела в шапке.
   ======================================================================== */

(function () {
  'use strict';

  var api = window.ScrollCraft.mount(document.body);
  var reduce = window.ScrollCraft.reduce;
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* --------------------------------------------------- боковые ряды ----
     Закреплённый акт при коротком пролёте не годится: при span 1.1 у него
     остаётся 0,1 высоты экрана хода, и весь ряд проехал бы за 90 пикселей.
     Поэтому ряд живёт в обычном flow-акте, а сдвиг считается от --sc-p,
     который движок пишет и туда. --over — это то, что не влезло в экран. */
  var strips = $$('[data-strip], [data-strip-wide]');
  function measureStrips() {
    strips.forEach(function (strip) {
      var over = Math.max(strip.scrollWidth - strip.parentElement.clientWidth, 0);
      strip.style.setProperty('--over', over + 'px');
    });
  }

  /* ------------------------------------------------- ролики в сетке ----
     Ни одна вещь на странице не должна зависеть от того, что автозапуск
     сработал: в режиме энергосбережения iOS play() отклоняется, и постер
     остаётся единственным, что видно. Это нормальный исход, а не поломка.
     Одновременно играющих держим не больше четырёх — у телефона столько
     декодеров и нет. */
  var MAX_PLAYING = 4;
  var playing = [];
  /* Решает ширина, а не наличие пальца: (pointer: coarse) истинен и на
     ноутбуке с сенсорным экраном, и в headless-браузере, где указателя нет
     вовсе — такой посетитель получал бы мобильный ролик на экране 1440. */
  var narrow = window.matchMedia('(max-width: 860px)');
  var mobile = narrow.matches;
  if (narrow.addEventListener) narrow.addEventListener('change', function (e) { mobile = e.matches; });

  function source(v) {
    return (mobile && v.getAttribute('data-src-mobile')) || v.getAttribute('data-src');
  }
  function arm(v) {
    if (v.getAttribute('src')) return;
    var src = source(v);
    if (src) { v.setAttribute('src', src); v.load(); }
  }
  function disarm(v) {
    /* Декодеры отбираем только на телефоне: их там считанные единицы.
       На настольной машине это лишняя отмена запросов на полпути. */
    if (!mobile) return;
    if (!v.getAttribute('src')) return;
    v.pause();
    v.removeAttribute('src');
    v.load();                       // без load() элемент продолжает держать декодер
  }
  function start(v) {
    if (reduce) return;
    arm(v);
    var p = v.play();
    if (p && p.catch) p.catch(function () { /* постер остаётся, и это правильный исход */ });
    if (playing.indexOf(v) === -1) playing.push(v);
    while (playing.length > MAX_PLAYING) { var old = playing.shift(); if (old !== v) old.pause(); }
  }
  function stop(v) {
    v.pause();
    var i = playing.indexOf(v);
    if (i !== -1) playing.splice(i, 1);
  }

  var tiles = $$('video[data-src]');
  if ('IntersectionObserver' in window) {
    // далеко — подкачать файл, очень далеко — отдать декодер обратно
    var armObserver = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) arm(e.target); else disarm(e.target); });
    }, { rootMargin: '150% 0px' });

    // близко — играть
    var playObserver = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) start(e.target); else stop(e.target); });
    }, { threshold: 0.4 });

    tiles.forEach(function (v) { armObserver.observe(v); playObserver.observe(v); });
  } else {
    tiles.forEach(function (v) { arm(v); start(v); });
  }

  /* ------------------------------------------------ монтажная линейка ----
     Движок не публикует прогресс всей страницы: --sc-p пишется поактно,
     а [data-sc-progress] получает inline-трансформацию, а не переменную.
     Поэтому свой кадровый цикл. Заполненная часть не откатывается назад —
     это след там, где посетитель уже был. */
  var rail = document.querySelector('[data-rail]');
  var works = $$('[data-work]');
  var marks = [];
  var seen = 0;

  function measureMarks() {
    var max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    marks = works.map(function (el) {
      return (el.getBoundingClientRect().top + window.scrollY) / max;
    });
  }

  function remeasure() { measureStrips(); measureMarks(); }
  remeasure();
  window.addEventListener('resize', remeasure, { passive: true });
  window.addEventListener('load', remeasure);

  var lastState = '';
  function update() {
    var max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    var p = clamp01(window.scrollY / max);
    if (p > seen) seen = p;

    var i = -1;
    for (var n = 0; n < marks.length; n++) { if (marks[n] <= p + 0.004) i = n; }

    rail.style.setProperty('--rail-p', p.toFixed(4));
    rail.style.setProperty('--rail-seen', (reduce ? 1 : seen).toFixed(4));

    /* Проверочной оснастке отдаём нарисованные значения в пикселях, а не
       сырой прогресс: иначе проверка «мёртвой прокрутки» зеленеет сама
       по себе и перестаёт что-либо значить. */
    var state = 'x:' + Math.round(p * rail.offsetWidth) + '|i:' + i;
    if (state !== lastState) { rail.setAttribute('data-sc-verify-state', state); lastState = state; }

    for (var c = 0; c < cells.length; c++) {
      cells[c].setAttribute('aria-current', c === i ? 'true' : 'false');
    }

    /* ---- пик: разворот линейки --------------------------------------
       Движок не публикует прогресс всей страницы, но --sc-p он пишет на
       элемент акта как inline-стиль. Читаем его у акта тишины: шапка не
       принадлежит ни одному акту и поэтому может пережить тот, в котором
       началась. */
    if (panel && hush) {
      /* Панель привязана к акту в обоих режимах: закреплённый блок,
         раскрытый всегда, перекрыл бы страницу целиком. При сниженной
         анимации гаснет только проезд плейхеда — дорожки горят сразу,
         то есть содержание остаётся, пропадает движение. */
      var o = parseFloat(hush.style.getPropertyValue('--sc-p')) || 0;
      var unfurl = clamp01(o / 0.30);
      var sweep  = reduce ? 1 : clamp01((o - 0.30) / 0.45);
      var shut   = clamp01((o - 0.82) / 0.18);
      var open   = Math.max(unfurl - shut, 0);
      rail.style.setProperty('--panel-open', open.toFixed(4));
      rail.style.setProperty('--panel-sweep', sweep.toFixed(4));
      panel.style.setProperty('--panel-open', open.toFixed(4));
      panel.style.setProperty('--panel-sweep', sweep.toFixed(4));
      if (open > 0.98) panel.setAttribute('data-open', ''); else panel.removeAttribute('data-open');
      var vis = open > 0.5 ? 'false' : 'true';
      if (panel.getAttribute('aria-hidden') !== vis) panel.setAttribute('aria-hidden', vis);

      var head = Math.floor(sweep * tracks.length);
      if (head !== lastHead) {
        for (var t = 0; t < tracks.length; t++) {
          if (t < head) tracks[t].setAttribute('data-lit', '');
          else tracks[t].removeAttribute('data-lit');
          if (t === head && sweep > 0 && sweep < 1) tracks[t].setAttribute('data-head', '');
          else tracks[t].removeAttribute('data-head');
        }
        lastHead = head;
      }
    }
  }
  var cells = $$('.rail__cell', rail);
  var panel = document.querySelector('[data-panel]');
  var tracks = $$('.panel__track');
  var lastHead = -1;
  var hush = document.querySelector('[data-hush]');

  /* Обновляемся от прокрутки, а не только от кадров анимации. Бывают среды,
     где requestAnimationFrame не идёт вовсе — скрытая панель предпросмотра,
     фоновая вкладка, съёмка в headless. Линейка — навигация, она не имеет
     права замереть вместе с кадрами, поэтому у неё есть запасной путь. */
  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    var ran = false;
    requestAnimationFrame(function () { ran = true; pending = false; update(); });
    setTimeout(function () { if (!ran) { pending = false; update(); } }, 32);
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  schedule();

  /* ------------------------------------------------ переходы по якорю ----
     scrollcraft.css включает плавную прокрутку, и клик по дальней ячейке
     линейки ехал бы через двенадцать экранов. Монтажный лист режет. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    var target = id && document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    var top = target.getBoundingClientRect().top + window.scrollY -
              (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 84) - 12;
    window.scrollTo({ top: top, behavior: 'instant' });
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });

  /* -------------------------------------------- подсветка раздела ------ */
  var links = $$('.bar__nav a');
  var sections = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  if ('IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var k = sections.indexOf(e.target);
        links.forEach(function (l, n) { l.setAttribute('aria-current', n === k ? 'true' : 'false'); });
      });
    }, { rootMargin: '-30% 0px -55% 0px' });
    sections.forEach(function (s) { if (s) spy.observe(s); });
  }
}());
