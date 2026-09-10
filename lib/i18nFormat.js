// Formats qui dépendent de la langue : montants, dates courtes, heures, jours.
//
// Volontairement sans Intl : Hermes n'expose pas les mêmes locales sur Android
// et sur iOS, et le thaï passerait au calendrier bouddhiste (année 2569).
// La langue courante est posée par LanguageProvider (setFormatLanguage) ; les
// fonctions restent pures et appelables hors composant (adaptateurs de données).

const MONTHS = {
  fr: ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  zh: null, // format numérique « 9月3日 »
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
  nl: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
  it: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  ja: null, // format numérique « 9月3日 »
  th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  sv: ['jan.', 'feb.', 'mars', 'apr.', 'maj', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'],
  ru: ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
};

// Du lundi au dimanche (ordre du daily_breakdown backend).
const DAY_INITIALS = {
  fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  zh: ['一', '二', '三', '四', '五', '六', '日'],
  ar: ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'],
  de: ['M', 'D', 'M', 'D', 'F', 'S', 'S'],
  nl: ['M', 'D', 'W', 'D', 'V', 'Z', 'Z'],
  it: ['L', 'M', 'M', 'G', 'V', 'S', 'D'],
  pt: ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'],
  ja: ['月', '火', '水', '木', '金', '土', '日'],
  th: ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'],
  sv: ['M', 'T', 'O', 'T', 'F', 'L', 'S'],
  ru: ['П', 'В', 'С', 'Ч', 'П', 'С', 'В'],
};

const DAY_SHORT = {
  fr: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  zh: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  ar: ['إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت', 'أحد'],
  de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  nl: ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'],
  it: ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'],
  pt: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
  ja: ['月', '火', '水', '木', '金', '土', '日'],
  th: ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'],
  sv: ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};

// Virgule décimale / séparateur de milliers par langue.
const COMMA_DECIMAL = new Set(['fr', 'es', 'de', 'nl', 'it', 'pt', 'sv', 'ru']);
const SPACE_GROUPING = new Set(['fr', 'sv', 'ru']);

let current = 'fr';

export function setFormatLanguage(code) {
  current = Object.prototype.hasOwnProperty.call(MONTHS, code) ? code : 'fr';
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "1 234,56" (fr) · "1,234.56" (en). Ne lève jamais : une entrée invalide vaut 0. */
export function formatAmount(value, decimals = 2) {
  const n = Number(value);
  const [int, dec] = (Number.isFinite(n) ? n : 0).toFixed(decimals).split('.');
  const comma = COMMA_DECIMAL.has(current);
  const group = SPACE_GROUPING.has(current) ? ' ' : comma ? '.' : ',';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return dec ? `${grouped}${comma ? ',' : '.'}${dec}` : grouped;
}

/** "3 sept" · "Sep 3" · "9月3日" ; avec l'année si `year` vaut true. */
export function formatDayMonth(value, { year = false } = {}) {
  const d = toDate(value);
  if (!d) return '';
  const day = d.getDate();
  const month = d.getMonth();
  const y = d.getFullYear();
  if (current === 'zh' || current === 'ja') return `${year ? `${y}年` : ''}${month + 1}月${day}日`;
  const name = MONTHS[current][month];
  if (current === 'en') return year ? `${name} ${day}, ${y}` : `${name} ${day}`;
  if (current === 'de') return year ? `${day}. ${name} ${y}` : `${day}. ${name}`;
  return year ? `${day} ${name} ${y}` : `${day} ${name}`;
}

/** "14h05" en français, "14:05" ailleurs. */
export function formatTime(value) {
  const d = toDate(value);
  if (!d) return '';
  const mm = String(d.getMinutes()).padStart(2, '0');
  return current === 'fr' ? `${d.getHours()}h${mm}` : `${d.getHours()}:${mm}`;
}

export function formatRange(start, end) {
  const a = formatDayMonth(start);
  const b = formatDayMonth(end);
  return a && b ? `${a} - ${b}` : a || b;
}

export function isSameDay(value, reference) {
  const a = toDate(value);
  const b = toDate(reference);
  return !!a && !!b
    && a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

export function weekdayInitials() {
  return DAY_INITIALS[current];
}

export function weekdayShortNames() {
  return DAY_SHORT[current];
}
