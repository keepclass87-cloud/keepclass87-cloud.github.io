/* ============================================================================
   tv.js — экран телевизора как живой элемент.

   Два состояния: заставка (idle) и превью работы (preview). Наведение на
   карточку в галерее переключает «канал» — с коротким сбоем развёртки,
   как при переключении на настоящем кинескопе.
   ========================================================================= */

const BOOT_SCREEN_ON = 420;   // когда развёртка раскрылась и можно показывать контент
const BOOT_TOTAL = 1000;      // когда вспышка догорела
const GLITCH_MS = 260;        // длительность сбоя при смене канала
const IDLE_RETURN_MS = 420;   // пауза перед возвратом к заставке

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));

/**
 * @param {HTMLElement} root элемент `[data-tv]`
 * @param {{ t: (key: string) => any }} i18n
 */
export function createTV(root, i18n) {
  if (!root) return { boot() {}, showIdle() {}, preview() {}, release() {} };

  const crt = root.querySelector('.crt');
  const stack = root.querySelector('[data-crt-content]');

  let channel = 'idle';
  let glitchTimer = null;
  let idleTimer = null;

  /* ------------------------------------------------------------ шаблоны -- */

  function idleMarkup() {
    return `
      <div class="crt__idle">
        <p class="crt__line">${escapeHtml(i18n.t('tv.signal'))}</p>
        <p class="crt__hello">${escapeHtml(i18n.t('tv.hello'))}<span class="crt__caret"></span></p>
        <p class="crt__line">${escapeHtml(i18n.t('tv.subtitle'))}</p>
      </div>
    `;
  }

  function previewMarkup(work) {
    const caption = `${i18n.t('tv.nowPlaying')} — ${work.title}`;

    /* Обложки может не быть — тогда «в эфире» идёт название работы */
    const visual = work.cover
      ? `<img class="crt__media" src="${escapeHtml(work.cover)}" alt="" loading="lazy">`
      : `<div class="crt__idle" style="align-self:center">
           <p class="crt__hello">${escapeHtml(work.title)}</p>
         </div>`;

    return `
      <div class="crt__preview">
        ${visual}
        <p class="crt__caption">${escapeHtml(caption)}</p>
      </div>
    `;
  }

  /* -------------------------------------------------------------- показ -- */

  function paint(html) {
    stack.innerHTML = html;

    if (reduceMotion || !crt) return;

    /* Перезапускаем анимацию сбоя: снимаем класс, форсируем reflow, ставим снова */
    crt.classList.remove('is-switching');
    void crt.offsetWidth;
    crt.classList.add('is-switching');

    clearTimeout(glitchTimer);
    glitchTimer = setTimeout(() => crt.classList.remove('is-switching'), GLITCH_MS);
  }

  function showIdle() {
    clearTimeout(idleTimer);
    if (channel === 'idle') {
      /* Уже заставка — просто обновляем текст, без сбоя (случай смены языка) */
      stack.innerHTML = idleMarkup();
      return;
    }
    channel = 'idle';
    paint(idleMarkup());
  }

  /** Показать работу на экране. */
  function preview(work) {
    if (!work) return;
    clearTimeout(idleTimer);
    if (channel === work.id) return;
    channel = work.id;
    paint(previewMarkup(work));
  }

  /** Курсор ушёл с карточки — вернуться к заставке, но не мгновенно. */
  function release() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(showIdle, IDLE_RETURN_MS);
  }

  /* ---------------------------------------------------------- включение -- */

  function boot() {
    stack.innerHTML = idleMarkup();
    channel = 'idle';

    if (reduceMotion) {
      root.classList.add('is-on');
      return;
    }

    root.classList.add('is-booting');
    setTimeout(() => root.classList.add('is-on'), BOOT_SCREEN_ON);
    setTimeout(() => root.classList.remove('is-booting'), BOOT_TOTAL);
  }

  /** Перерисовать текущий канал после смены языка. */
  function refresh() {
    if (channel === 'idle') stack.innerHTML = idleMarkup();
  }

  return { boot, showIdle, preview, release, refresh };
}
