/* ============================================================================
   i18n.js — переключение RU/EN.

   Тексты живут в content/site.json. Разметка размечена атрибутами:
     data-i18n="hero.tagline"        → подставляется в textContent
     data-i18n-aria="a11y.close"     → подставляется в aria-label

   Если ключа нет в JSON, элемент остаётся с тем текстом, что записан в HTML.
   Поэтому русский текст в index.html — рабочий запасной вариант, а не мусор.
   ========================================================================= */

const STORAGE_KEY = 'tepsuevvv:lang';
const SUPPORTED = ['ru', 'en'];
const FALLBACK = 'ru';

/** Достаёт значение по строке вида "services.items" из вложенного объекта. */
function lookup(source, path) {
  return path.split('.').reduce(
    (node, key) => (node && typeof node === 'object' ? node[key] : undefined),
    source
  );
}

function detectInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(saved)) return saved;
  } catch {
    /* приватный режим — просто идём дальше */
  }

  const browser = (navigator.language || '').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(browser) ? browser : FALLBACK;
}

/**
 * @param {object} site разобранный content/site.json
 */
export function createI18n(site) {
  let lang = detectInitialLang();

  /** Текст по ключу для текущего языка. */
  function t(path) {
    const value = lookup(site[lang], path);
    if (value !== undefined) return value;
    /* Подстраховка: если в одном языке ключа нет, берём из запасного */
    return lookup(site[FALLBACK], path);
  }

  /** Значение из блока shared, где поле может быть {ru, en} или строкой. */
  function pick(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value[lang] ?? value[FALLBACK] ?? '';
    }
    return value ?? '';
  }

  /** Проходит по разметке и подставляет тексты. */
  function apply(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]')) {
      const value = t(el.dataset.i18n);
      if (typeof value === 'string') el.textContent = value;
    }

    for (const el of root.querySelectorAll('[data-i18n-aria]')) {
      const value = t(el.dataset.i18nAria);
      if (typeof value === 'string') el.setAttribute('aria-label', value);
    }

    if (root === document) {
      document.documentElement.lang = lang;
      document.title = t('meta.title') || document.title;

      const description = document.querySelector('meta[name="description"]');
      if (description) description.content = t('meta.description') || description.content;

      for (const btn of document.querySelectorAll('[data-lang]')) {
        btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
      }
    }
  }

  function set(next) {
    if (!SUPPORTED.includes(next) || next === lang) return;
    lang = next;

    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* не смогли запомнить — не повод ломать переключение */
    }

    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  }

  /* Кнопки переключателя */
  for (const btn of document.querySelectorAll('[data-lang]')) {
    btn.addEventListener('click', () => set(btn.dataset.lang));
  }

  return {
    t,
    pick,
    apply,
    set,
    get lang() {
      return lang;
    },
  };
}
