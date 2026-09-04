/* ============================================================================
   motion.js — бегущая строка и крупное заявление.

   Оба эффекта завязаны на скролл, поэтому делят одну rAF-петлю: строка ловит
   скорость прокрутки и подкашивается, заявление зажигает слова по мере того,
   как блок проходит через кадр. Петля спит, пока ни то, ни другое не в кадре.
   ========================================================================= */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Максимальный наклон строки на быстром скролле, градусы. */
const SKEW_MAX = 5;
/** Скорость прокрутки (px/кадр), при которой наклон достигает предела. */
const SKEW_AT = 60;
/** За сколько слов до текущего успевает разгореться слово. */
const WORD_RAMP = 4;

export function createMotion() {
  const marquee = document.querySelector('[data-marquee]');
  const track = document.querySelector('[data-marquee-track]');
  const skewBox = document.querySelector('[data-marquee-skew]');
  const statement = document.querySelector('[data-statement]');

  let words = [];
  let lastScroll = window.scrollY;
  let skew = 0;
  let rafId = null;

  /* Какие из блоков сейчас в кадре — считать остальное незачем */
  const inView = new Set();

  /* -------------------------------------------------------- содержимое -- */

  /** Заполняет ленту. Список дублируется: вторая копия въезжает, пока уезжает первая. */
  function setMarquee(items) {
    if (!track || !Array.isArray(items) || !items.length) return;

    const row = items
      .map((text) => {
        const span = document.createElement('span');
        span.className = 'marquee__item';
        span.textContent = text;
        return span.outerHTML;
      })
      .join('');

    track.innerHTML = row + row;
  }

  /** Разбивает заявление на слова: каждое зажигается отдельно. */
  function setStatement(text) {
    if (!statement || typeof text !== 'string') return;

    statement.textContent = '';
    words = [];

    for (const chunk of text.trim().split(/\s+/)) {
      const word = document.createElement('span');
      word.className = 'statement__word';
      word.textContent = chunk;
      /* Без JS слова остаются видимыми: в CSS запасное значение --w равно 1 */
      word.style.setProperty('--w', '0');
      word.dataset.lit = '0';

      statement.append(word, document.createTextNode(' '));
      words.push(word);
    }

    update();
  }

  /* ------------------------------------------------------------- петля -- */

  function updateMarquee(velocity) {
    if (!skewBox || reduceMotion) return;

    const target = clamp(velocity / SKEW_AT, -1, 1) * SKEW_MAX;
    skew += (target - skew) * 0.12;

    if (Math.abs(skew) < 0.01) skew = 0;
    skewBox.style.transform = `skewX(${skew.toFixed(2)}deg)`;
  }

  function updateStatement() {
    if (!words.length || !statement) return;

    const rect = statement.getBoundingClientRect();
    const vh = window.innerHeight;

    /* 0 — блок только показался снизу, 1 — прошёл достаточно, чтобы догореть */
    const progress = clamp(
      (vh * 0.78 - rect.top) / (rect.height * 0.75 + 1),
      0,
      1
    );

    const total = words.length;
    const head = progress * (total + WORD_RAMP);

    for (let i = 0; i < total; i += 1) {
      const lit = reduceMotion ? 1 : clamp((head - i) / WORD_RAMP, 0, 1);

      /* Писать в стиль каждый кадр всем словам незачем — только при изменении */
      if (Math.abs(lit - Number(words[i].dataset.lit)) < 0.01) continue;

      words[i].dataset.lit = String(lit);
      words[i].style.setProperty('--w', lit.toFixed(3));
    }
  }

  function update() {
    const velocity = window.scrollY - lastScroll;
    lastScroll = window.scrollY;

    if (inView.has(marquee)) updateMarquee(velocity);
    if (inView.has(statement)) updateStatement();
  }

  function tick() {
    update();

    /* Пока хоть один блок в кадре, продолжаем: скорость скролла и прогресс
       меняются непрерывно, «устаканиться» тут нечему. */
    rafId = inView.size ? requestAnimationFrame(tick) : null;
  }

  function wake() {
    if (rafId === null && inView.size) rafId = requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------- видимость -- */

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inView.add(entry.target);
        else inView.delete(entry.target);
      }

      if (inView.size) wake();
      else if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
        /* Лента остаётся ровной, пока её не видно */
        if (skewBox) skewBox.style.transform = '';
        skew = 0;
      }
    },
    { rootMargin: '10% 0px' }
  );

  if (marquee) observer.observe(marquee);
  if (statement) observer.observe(statement);

  window.addEventListener('resize', update, { passive: true });

  return { setMarquee, setStatement };
}
