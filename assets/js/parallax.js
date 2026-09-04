/* ============================================================================
   parallax.js — движок глубины hero-сцены.

   Принцип: обработчики событий только записывают целевые значения, ничего не
   рисуя. Один-единственный requestAnimationFrame-цикл сглаживает их линейной
   интерполяцией и пишет transform слоям. Так браузер компонует всю сцену
   одним кадром, без layout и paint.
   ========================================================================= */

/** Ниже этого порога считаем, что сцена приехала, и цикл можно усыпить. */
const SETTLE_EPSILON = 0.0006;

/** Коэффициент сглаживания: чем меньше, тем «тяжелее» и инертнее сцена. */
const EASE_POINTER = 0.075;
const EASE_SCROLL = 0.12;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * @param {HTMLElement} scene контейнер с планами `[data-depth]`
 */
export function createParallax(scene) {
  if (!scene) return { destroy() {} };

  const layers = Array.from(scene.querySelectorAll('[data-depth]')).map((el) => ({
    el,
    depth: Number.parseFloat(el.dataset.depth) || 0,
    tilt: el.hasAttribute('data-tilt'),
  }));

  const glow = scene.querySelector('[data-glow]');

  /* Амплитуда живёт в CSS, чтобы prefers-reduced-motion обнулял её
     тем же механизмом, что и остальную анимацию. */
  const rootStyles = getComputedStyle(document.documentElement);
  const readVar = (name, fallback) => {
    const raw = Number.parseFloat(rootStyles.getPropertyValue(name));
    return Number.isFinite(raw) ? raw : fallback;
  };

  const amplitude = readVar('--parallax-amplitude', 46);
  const tiltMax = readVar('--parallax-tilt-max', 4.5);

  /* Нормализованное положение указателя в диапазоне [-1, 1] */
  const target = { x: 0, y: 0, scroll: 0 };
  const current = { x: 0, y: 0, scroll: 0 };

  let rafId = null;
  let visible = true;
  let destroyed = false;

  /* ---------------------------------------------------------------- ввод -- */

  function setPointer(clientX, clientY) {
    target.x = clamp((clientX / window.innerWidth - 0.5) * 2, -1, 1);
    target.y = clamp((clientY / window.innerHeight - 0.5) * 2, -1, 1);
    wake();
  }

  function onPointerMove(event) {
    /* Пальцем по экрану сцену не тащим — это мешает скроллу */
    if (event.pointerType === 'touch') return;
    setPointer(event.clientX, event.clientY);
  }

  function onPointerLeave() {
    target.x = 0;
    target.y = 0;
    wake();
  }

  function onScroll() {
    /* Прогресс ухода hero: 0 — сцена целиком в кадре, 1 — полностью уехала */
    const height = scene.offsetHeight || window.innerHeight;
    target.scroll = clamp(window.scrollY / height, 0, 1);
    wake();
  }

  /* Гироскоп: тот же нормализованный вектор, что и от мыши.
     beta — наклон вперёд/назад, gamma — влево/вправо. */
  function onOrientation(event) {
    const { beta, gamma } = event;
    if (beta === null || gamma === null) return;
    target.x = clamp(gamma / 32, -1, 1);
    target.y = clamp((beta - 45) / 32, -1, 1);
    wake();
  }

  /* ---------------------------------------------------------------- цикл -- */

  function tick() {
    current.x += (target.x - current.x) * EASE_POINTER;
    current.y += (target.y - current.y) * EASE_POINTER;
    current.scroll += (target.scroll - current.scroll) * EASE_SCROLL;

    for (const layer of layers) {
      const { el, depth, tilt } = layer;

      const x = current.x * amplitude * depth;
      /* Дальние планы почти не реагируют на скролл, ближние уезжают быстрее —
         именно это расслоение и читается как глубина. */
      const y = current.y * amplitude * depth - current.scroll * 140 * depth;

      let transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;

      if (tilt && tiltMax > 0) {
        const ry = (current.x * tiltMax).toFixed(3);
        const rx = (-current.y * tiltMax).toFixed(3);
        transform += ` rotateX(${rx}deg) rotateY(${ry}deg)`;
      }

      el.style.transform = transform;
    }

    /* Пятно света ходит за курсором заметно сильнее самих слоёв */
    if (glow) {
      glow.style.setProperty('--glow-x', `${(current.x * amplitude * 2.4).toFixed(1)}px`);
      glow.style.setProperty('--glow-y', `${(current.y * amplitude * 1.6).toFixed(1)}px`);
    }

    const settled =
      Math.abs(target.x - current.x) < SETTLE_EPSILON &&
      Math.abs(target.y - current.y) < SETTLE_EPSILON &&
      Math.abs(target.scroll - current.scroll) < SETTLE_EPSILON;

    if (settled || !visible || destroyed) {
      rafId = null;
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  /** Будим цикл только если он спит — двойных rAF быть не должно. */
  function wake() {
    if (rafId === null && visible && !destroyed) {
      rafId = requestAnimationFrame(tick);
    }
  }

  /* ------------------------------------------------------- жизненный цикл - */

  /* Когда hero уехал с экрана, считать нечего */
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
    },
    { threshold: 0 }
  );
  observer.observe(scene);

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', onPointerLeave, { passive: true });
  window.addEventListener('blur', onPointerLeave);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  onScroll();
  wake();

  /* --- Гироскоп ------------------------------------------------------------
     На iOS доступ к датчику требует жеста пользователя, поэтому просим
     разрешение при первом касании и больше не возвращаемся к этому.        */
  let gyroReady = false;

  function attachGyro() {
    if (gyroReady) return;
    gyroReady = true;
    window.addEventListener('deviceorientation', onOrientation, { passive: true });
  }

  const NeedsPermission =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function';

  if (NeedsPermission) {
    const ask = () => {
      DeviceOrientationEvent.requestPermission()
        .then((state) => { if (state === 'granted') attachGyro(); })
        .catch(() => { /* отказали — сцена просто останется статичной */ });
    };
    scene.addEventListener('touchend', ask, { once: true, passive: true });
  } else if (window.matchMedia('(hover: none)').matches) {
    attachGyro();
  }

  return {
    destroy() {
      destroyed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('deviceorientation', onOrientation);
    },
  };
}
