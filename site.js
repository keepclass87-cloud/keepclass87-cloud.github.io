/* ===========================================================================
   TEPSUEV STUDIO — собственный код страницы.

   Движок scrollcraft.js не трогается. Здесь три вещи, которых он не даёт:
   самодвижущиеся боковые ряды, ленивый запуск шестнадцати роликов и
   подсветка раздела в шапке.
   ======================================================================== */

(function () {
  'use strict';

  var api = window.ScrollCraft.mount(document.body);
  var reduce = window.ScrollCraft.reduce;
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* --------------------------------------------------- боковые ряды ----
     Ряды едут сами, а не от прокрутки: дорожка идёт ровно, пока посетитель
     читает, и не замирает, если он остановился. Чтобы шов не был виден,
     набор плиток удваивается, а лента сдвигается ровно на ширину первого
     набора — в этот момент копия стоит там же, где стоял оригинал, и
     возврат к нулю не читается.

     Копии помечаются aria-hidden и лишаются id и data-work: они не работы,
     а продолжение ленты. Иначе линейка насчитала бы двадцать четыре работы
     вместо шестнадцати и перестала бы совпадать с разметкой. */
  var SPEED = 70;                               // пикселей в секунду
  var strips = $$('[data-strip]');

  function cloneRun(strip) {
    if (strip.getAttribute('data-looped')) return;
    var items = $$(':scope > *', strip);
    if (!items.length) return;
    strip.setAttribute('data-run', items.length);
    var frag = document.createDocumentFragment();
    items.forEach(function (el) {
      var c = el.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.removeAttribute('id');
      c.removeAttribute('data-work');
      $$('[id]', c).forEach(function (n) { n.removeAttribute('id'); });
      frag.appendChild(c);
    });
    strip.appendChild(frag);
    strip.setAttribute('data-looped', '1');
  }
  strips.forEach(cloneRun);

  function measureStrips() {
    strips.forEach(function (strip) {
      var items = $$(':scope > *', strip);
      var run = parseInt(strip.getAttribute('data-run'), 10) || items.length / 2;
      var gap = parseFloat(getComputedStyle(strip).columnGap) || 0;
      var dist = 0;
      for (var i = 0; i < run && i < items.length; i++) {
        dist += items[i].getBoundingClientRect().width + gap;
      }
      if (dist <= 0) return;
      strip.style.setProperty('--loop', dist.toFixed(1) + 'px');
      strip.style.setProperty('--dur', (dist / SPEED).toFixed(1) + 's');
    });
  }
  /* Вызовы держим РЯДОМ с измерением, а не в соседнем блоке. Прежде они
     жили в remeasure() внутри кода монтажной линейки; линейку убрали — и
     дорожка молча встала: --loop не задан, keyframes сдвигает ленту на
     значение по умолчанию, то есть на 0px. Анимация при этом идёт, и в
     инспекторе всё выглядит рабочим. */
  measureStrips();
  window.addEventListener('resize', measureStrips, { passive: true });
  /* Ширина плитки зависит от шрифта и постеров: до load она ещё плывёт. */
  window.addEventListener('load', measureStrips);

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
