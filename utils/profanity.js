export const PROFANITY_ERROR = 'Используются недопустимые выражения. Пожалуйста, измените текст.'

const CHAR_MAP = {
  ё: 'е',
  0: 'о',
  1: 'и',
  3: 'е',
  4: 'а',
  5: 'с',
  6: 'б',
  7: 'т',
  '@': 'а',
  '$': 'с'
}

const WORD_CHARS = '0-9a-zа-я'
const WORD_TAIL = `[${WORD_CHARS}]*`

const PROFANITY_RE = new RegExp([
  `(?:^|[^${WORD_CHARS}])(?:бля|блять|бляд${WORD_TAIL}|сук${WORD_TAIL}|суч${WORD_TAIL}|мраз${WORD_TAIL}|гандон${WORD_TAIL}|говн${WORD_TAIL}|дерьм${WORD_TAIL}|мудак${WORD_TAIL}|долбо${WORD_TAIL})(?=$|[^${WORD_CHARS}])`,
  `(?:^|[^${WORD_CHARS}])(?:хуй|хуе${WORD_TAIL}|хуя${WORD_TAIL}|хер${WORD_TAIL}|пизд${WORD_TAIL}|пидор${WORD_TAIL}|пидар${WORD_TAIL})(?=$|[^${WORD_CHARS}])`,
  `(?:^|[^${WORD_CHARS}])(?:еба${WORD_TAIL}|еби${WORD_TAIL}|ебу${WORD_TAIL}|ебл${WORD_TAIL}|ебн${WORD_TAIL}|ебт${WORD_TAIL}|выеб${WORD_TAIL}|заеб${WORD_TAIL}|наеб${WORD_TAIL}|отъеб${WORD_TAIL}|поеб${WORD_TAIL}|проеб${WORD_TAIL}|разъеб${WORD_TAIL}|съеб${WORD_TAIL})(?=$|[^${WORD_CHARS}])`,
  `(?:^|[^${WORD_CHARS}])(?:дебил${WORD_TAIL}|идиот${WORD_TAIL}|урод${WORD_TAIL}|твар${WORD_TAIL}|козел${WORD_TAIL}|лох${WORD_TAIL}|чмо|падл${WORD_TAIL})(?=$|[^${WORD_CHARS}])`,
  `(?:^|[^${WORD_CHARS}])(?:fuck${WORD_TAIL}|shit${WORD_TAIL}|bitch${WORD_TAIL}|asshole${WORD_TAIL}|bastard${WORD_TAIL}|dick${WORD_TAIL}|cunt${WORD_TAIL}|whore${WORD_TAIL}|slut${WORD_TAIL}|motherfuck${WORD_TAIL}|idiot${WORD_TAIL}|moron${WORD_TAIL}|dumbass${WORD_TAIL})(?=$|[^${WORD_CHARS}])`
].join('|'), 'iu')

const normalizeText = (value) => {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ё0134567@$]/g, (char) => CHAR_MAP[char] || char)
    .replace(/([a-zа-я])\1{2,}/giu, '$1$1')
    .replace(/[^0-9a-zа-я]+/giu, ' ')
}

export const containsProfanity = (...values) => {
  return values.some((value) => PROFANITY_RE.test(normalizeText(value)))
}
