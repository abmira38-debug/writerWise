(function() {
  'use strict';

  // Tab navigation
  function setupTabs() {
    const tabButtons = Array.from(document.querySelectorAll('.tab-list .tab'));
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        const targetId = button.getAttribute('data-target');
        document.querySelectorAll('.tab-panel').forEach(panel => {
          panel.classList.toggle('active', '#' + panel.id === targetId);
        });
      });
    });
  }

  // Shared text area utilities
  const mainTextEl = () => document.getElementById('mainText');

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const el = mainTextEl();
      el.value = text;
      recomputeAll(el.value);
    } catch (err) { alert('Не удалось вставить из буфера. Разрешите доступ к буферу обмена.'); }
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); } catch (err) { alert('Не удалось скопировать в буфер обмена.'); }
  }

  function setupSharedTextActions() {
    const el = mainTextEl();
    document.querySelector('[data-action="clear-main"]').addEventListener('click', () => {
      el.value = '';
      recomputeAll('');
    });
    document.querySelector('[data-action="paste-main"]').addEventListener('click', pasteFromClipboard);
    document.querySelector('[data-action="copy-main"]').addEventListener('click', () => copyToClipboard(el.value));

    el.addEventListener('input', () => recomputeAll(el.value));
  }

  // Text metrics and frequency
  function normalizeText(text) {
    return (text || '').replace(/[\u2014\u2013]/g, '-');
  }

  function splitWords(text, options) {
    const normalized = normalizeText(text).toLowerCase();
    const rawTokens = normalized.match(/[a-zа-яё0-9]+(?:-[a-zа-яё0-9]+)*/gi) || [];
    let tokens = rawTokens;
    if (options && options.excludeNumbers) {
      tokens = tokens.filter(t => /[a-zа-яё]/i.test(t));
    }
    if (options && options.excludeShort) {
      tokens = tokens.filter(t => t.length > 2);
    }
    return tokens;
  }

  function splitSentences(text) {
    const cleaned = normalizeText(text);
    const parts = cleaned.split(/[.!?]+[)\]\}"'»]*\s+/g).map(s => s.trim()).filter(Boolean);
    return parts;
  }

  function splitParagraphs(text) {
    return (text || '').split(/(?:\r?\n){2,}|\r?\n/g).map(p => p.trim()).filter(Boolean);
  }

  const RU_STOPWORDS = new Set([
    'и','в','во','не','что','он','на','я','с','со','как','а','то','все','она','так','его','но','да','ты','к','у','же','вы','за','бы','по','только','ее','мне','было','вот','от','меня','еще','нет','о','из','ему','теперь','когда','даже','ну','вдруг','ли','если','уже','или','ни','быть','был','него','до','вас','нибудь','опять','уж','вам','ведь','там','потом','себя','ничего','ей','может','они','тут','где','есть','надо','ней','для','мы','тебя','их','чем','была','сам','чтоб','без','будто','чего','раз','тоже','себе','под','будет','ж','тогда','кто','этот','того','потому','этого','какой','совсем','ним','здесь','этом','один','почти','мой','тем','чтобы','нее','кажется','сейчас','были','куда','зачем','всех','никогда','можно','при','наконец','два','об','другой','хоть','после','над','больше','тот','через','эти','нас','про','всего','них','какая','много','разве','три','эту','моя','впрочем','хорошо','свою','этой','перед','иногда','лучше','чуть','том','нельзя','такой','им','более','всегда','конечно','всю','между'
  ]);

  function calculateMetrics(text) {
    const excludeNumbers = document.getElementById('opt-exclude-numbers').checked;
    const excludeShort = document.getElementById('opt-exclude-short').checked;

    const words = splitWords(text, { excludeNumbers, excludeShort });
    const sentences = splitSentences(text);
    const paragraphs = splitParagraphs(text);

    const charactersWithSpaces = (text || '').length;
    const charactersNoSpaces = (text || '').replace(/\s/g, '').length;

    const uniqueWords = new Set(words).size;

    const readingMinutes = words.length / 200; // ориентировочно 200 слов/мин

    return {
      words: words.length,
      uniqueWords,
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      charactersWithSpaces,
      charactersNoSpaces,
      readingMinutes
    };
  }

  function renderMetrics(metrics) {
    document.getElementById('m-words').textContent = metrics.words.toString();
    document.getElementById('m-unique').textContent = metrics.uniqueWords.toString();
    document.getElementById('m-sentences').textContent = metrics.sentences.toString();
    document.getElementById('m-paragraphs').textContent = metrics.paragraphs.toString();
    document.getElementById('m-chars').textContent = metrics.charactersWithSpaces.toString();
    document.getElementById('m-chars-ns').textContent = metrics.charactersNoSpaces.toString();

    const minutes = Math.floor(metrics.readingMinutes);
    const seconds = Math.round((metrics.readingMinutes - minutes) * 60);
    const human = minutes > 0 ? `${minutes} мин ${seconds} с` : `${seconds} с`;
    document.getElementById('m-reading').textContent = human;
  }

  function buildFrequency(text) {
    const excludeNumbers = document.getElementById('opt-exclude-numbers').checked;
    const excludeShort = document.getElementById('opt-exclude-short').checked;
    const tokens = splitWords(text, { excludeNumbers, excludeShort });
    const map = new Map();
    for (const w of tokens) {
      if (RU_STOPWORDS.has(w)) continue;
      map.set(w, (map.get(w) || 0) + 1);
    }
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
    return entries;
  }

  function renderFrequency(entries) {
    const tbody = document.querySelector('#freqTable tbody');
    tbody.innerHTML = '';
    for (const [word, count] of entries) {
      const tr = document.createElement('tr');
      const tdWord = document.createElement('td');
      const tdCount = document.createElement('td');
      tdWord.textContent = word;
      tdCount.textContent = count.toString();
      tr.appendChild(tdWord);
      tr.appendChild(tdCount);
      tbody.appendChild(tr);
    }
  }

  function computeReadability(text) {
    const words = splitWords(text, {});
    const sentences = splitSentences(text);
    const charactersAlphaNum = (text || '').match(/[\p{L}\p{N}]/giu) || [];

    const avgWordLength = words.length ? (charactersAlphaNum.length / words.length) : 0;
    const avgSentenceLength = sentences.length ? (words.length / sentences.length) : 0;

    const avgParagraphLength = (() => {
      const paragraphs = splitParagraphs(text);
      if (!paragraphs.length) return 0;
      const paragraphWordCounts = paragraphs.map(p => splitWords(p, {}).length);
      const sum = paragraphWordCounts.reduce((a, b) => a + b, 0);
      return sum / paragraphs.length;
    })();

    const ari = (() => {
      const c = charactersAlphaNum.length;
      const w = Math.max(words.length, 1);
      const s = Math.max(sentences.length, 1);
      return 4.71 * (c / w) + 0.5 * (w / s) - 21.43;
    })();

    return { ari, avgWordLength, avgSentenceLength, avgParagraphLength };
  }

  function interpretReadability(r) {
    if (!isFinite(r.ari)) return 'Недостаточно данных для оценки.';
    const ari = Math.max(-5, Math.min(14, r.ari));
    let level;
    if (ari < 2) level = 'очень просто';
    else if (ari < 4) level = 'просто';
    else if (ari < 6) level = 'умеренно';
    else if (ari < 8) level = 'сложновато';
    else level = 'сложно';
    return `Условный уровень: ${level}. Рекомендации: короткие предложения (${Math.max(8, Math.round(r.avgSentenceLength * 0.8))}–${Math.max(12, Math.round(r.avgSentenceLength))} слов), конкретные глаголы, больше активного залога. Средняя длина слова — ${r.avgWordLength.toFixed(1)}, предложения — ${r.avgSentenceLength.toFixed(1)}.`;
  }

  function renderReadability(r) {
    document.getElementById('r-ari').textContent = isFinite(r.ari) ? r.ari.toFixed(2) : '—';
    document.getElementById('r-avg-word').textContent = isFinite(r.avgWordLength) ? r.avgWordLength.toFixed(1) : '—';
    document.getElementById('r-avg-sent').textContent = isFinite(r.avgSentenceLength) ? r.avgSentenceLength.toFixed(1) : '—';
    document.getElementById('r-avg-para').textContent = isFinite(r.avgParagraphLength) ? r.avgParagraphLength.toFixed(1) : '—';
    document.getElementById('r-interpretation').textContent = interpretReadability(r);
  }

  function recomputeAll(text) {
    const metrics = calculateMetrics(text);
    renderMetrics(metrics);
    const freq = buildFrequency(text);
    renderFrequency(freq);
    const readability = computeReadability(text);
    renderReadability(readability);
  }

  // Prompts generator
  function setupPrompts() {
    const out = document.getElementById('p-output');
    function makePrompt() {
      const genre = document.getElementById('p-genre').value;
      const tone = document.getElementById('p-tone').value;
      const keywordsRaw = document.getElementById('p-keywords').value || '';
      const keywords = keywordsRaw.split(',').map(s => s.trim()).filter(Boolean);
      const settings = ['на дрейфующей станции', 'в умирающем городе', 'в деревне над бездонным карстом', 'на арктическом полустанке', 'в мегаполисе будущего', 'на пароме посреди ночи'];
      const conflicts = ['время ведёт себя неправильно', 'все забывают события прошедшего дня', 'власть скрывает критическую правду', 'герой получает письма из прошлого', 'старая карта меняется каждый рассвет', 'голоса в эфире спорят между собой'];
      const twists = ['антагонист оказывается союзником', 'герой — часть эксперимента', 'настоящее и прошлое слились', 'выбор спасает одного, но обрекает другого', 'вина героя глубже, чем он думал'];
      function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
      const k = keywords.length ? `, используя мотивы: ${keywords.join(', ')}` : '';
      return `${genre}, ${tone.toLowerCase()} история ${pick(settings)}, где ${pick(conflicts)}; ${pick(twists)}${k}.`;
    }

    document.getElementById('p-generate').addEventListener('click', () => {
      out.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const li = document.createElement('li');
        li.textContent = makePrompt();
        out.appendChild(li);
      }
    });
    document.getElementById('p-generate-one').addEventListener('click', () => {
      const li = document.createElement('li');
      li.textContent = makePrompt();
      out.appendChild(li);
    });
    document.getElementById('p-copy').addEventListener('click', () => {
      const text = Array.from(out.querySelectorAll('li')).map(li => `- ${li.textContent}`).join('\n');
      copyToClipboard(text || '');
    });
  }

  // Logline builder
  function setupLogline() {
    function generate() {
      const hero = (document.getElementById('l-hero').value || 'герой').trim();
      const goal = (document.getElementById('l-goal').value || 'достичь важной цели').trim();
      const ant = (document.getElementById('l-antagonist').value || 'суровые препятствия').trim();
      const stakes = (document.getElementById('l-stakes').value || 'иначе последствия будут необратимыми').trim();
      const setting = (document.getElementById('l-setting').value || 'в необычном мире').trim();
      const hook = (document.getElementById('l-hook').value || '').trim();
      const hookPart = hook ? `, а изюминка — ${hook}` : '';
      return `Когда ${setting} нарушается привычный порядок, ${hero} должен ${goal}, сталкиваясь с тем, что ${ant}, иначе ${stakes}${hookPart}.`;
    }
    document.getElementById('l-generate').addEventListener('click', () => {
      document.getElementById('l-output').textContent = generate();
    });
    document.getElementById('l-copy').addEventListener('click', () => {
      copyToClipboard(document.getElementById('l-output').textContent || '');
    });
  }

  // Outline planner
  function setupOutline() {
    function generateThreeAct(totalWords, genre) {
      const beats = [
        ['Завязка / крючок', 0.05],
        ['Экспозиция и обещание жанра', 0.10],
        ['Событие-возмущение', 0.05],
        ['Дискуссия / сомнение', 0.10],
        ['Вход в акт 2', 0.05],
        ['Игры и обещание жанра', 0.20],
        ['Середина / разворот', 0.05],
        ['Сгущение конфликта', 0.15],
        ['«Всё потеряно»', 0.05],
        ['Тёмная ночь души', 0.05],
        ['Вход в акт 3', 0.05],
        ['Финал и новая равновесие', 0.10]
      ];
      return beats.map(([name, share]) => ({ name, words: Math.round(totalWords * share) }));
    }

    function generateHeroJourney(totalWords) {
      const beats = [
        ['Обычный мир', 0.08], ['Призыв к приключению', 0.06], ['Отказ от призыва', 0.04], ['Встреча с наставником', 0.06],
        ['Порог / вход в особый мир', 0.08], ['Испытания, союзники, враги', 0.16], ['Приближение к пещере', 0.08], ['Серьёзное испытание', 0.10],
        ['Награда', 0.06], ['Путь назад', 0.08], ['Возрождение', 0.10], ['Возвращение с эликсиром', 0.10]
      ];
      return beats.map(([name, share]) => ({ name, words: Math.round(totalWords * share) }));
    }

    function render(beats) {
      const container = document.getElementById('o-output');
      const table = document.createElement('table');
      table.className = 'freq-table';
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Этап</th><th>Рекомендуемый объём (слов)</th></tr>';
      const tbody = document.createElement('tbody');
      beats.forEach(b => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        const td2 = document.createElement('td');
        td1.textContent = b.name;
        td2.textContent = b.words.toString();
        tr.appendChild(td1); tr.appendChild(td2);
        tbody.appendChild(tr);
      });
      table.appendChild(thead); table.appendChild(tbody);
      container.innerHTML = '';
      container.appendChild(table);
    }

    document.getElementById('o-generate').addEventListener('click', () => {
      const total = Math.max(1000, parseInt(document.getElementById('o-words').value || '0', 10));
      const structure = document.getElementById('o-structure').value;
      const genre = document.getElementById('o-genre').value;
      const beats = structure === 'hero' ? generateHeroJourney(total) : generateThreeAct(total, genre);
      render(beats);
    });

    document.getElementById('o-copy').addEventListener('click', () => {
      const rows = Array.from(document.querySelectorAll('#o-output tbody tr'));
      const text = rows.map(tr => `- ${tr.children[0].textContent}: ~${tr.children[1].textContent} слов`).join('\n');
      copyToClipboard(text || '');
    });
  }

  // Character builder
  function setupCharacter() {
    const archetypes = ['Герой', 'Аутсайдер', 'Трикстер', 'Наставник', 'Бунтарь', 'Опекун'];
    const flaws = ['гордыня', 'страх близости', 'импульсивность', 'перфекционизм', 'цинизм', 'зависимость от одобрения'];
    const desires = ['признание', 'свобода', 'справедливость', 'безопасность', 'любовь', 'знание'];
    const secrets = ['скрывает прошлую ошибку', 'лжёт о происхождении', 'боится повторить провал', 'предал друга', 'берёт вину на себя', 'работает на врага'];

    function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function fillRandom() {
      document.getElementById('c-archetype').value = randomFrom(archetypes);
      document.getElementById('c-flaw').value = randomFrom(flaws);
      document.getElementById('c-desire').value = randomFrom(desires);
      document.getElementById('c-secret').value = randomFrom(secrets);
      document.getElementById('c-wound').value = randomFrom(['предательство', 'утрата', 'стыд', 'вина', 'отвержение', 'бедность']);
      if (!document.getElementById('c-name').value) document.getElementById('c-name').value = randomFrom(['Арина','Марк','Ева','Илья','Ника','Савва']);
      if (!document.getElementById('c-role').value) document.getElementById('c-role').value = randomFrom(['архивариус','курьер-дронер','морской биолог','юрист-волонтёр','фотокорреспондент']);
      if (!document.getElementById('c-age').value) document.getElementById('c-age').value = String(18 + Math.floor(Math.random() * 40));
      renderCard();
    }

    function renderCard() {
      const name = document.getElementById('c-name').value || '—';
      const role = document.getElementById('c-role').value || '—';
      const age = document.getElementById('c-age').value || '—';
      const archetype = document.getElementById('c-archetype').value || '—';
      const flaw = document.getElementById('c-flaw').value || '—';
      const desire = document.getElementById('c-desire').value || '—';
      const secret = document.getElementById('c-secret').value || '—';
      const wound = document.getElementById('c-wound').value || '—';
      const text = `Персонаж: ${name}, ${age} — ${role}. Архетип: ${archetype}. Желание: ${desire}. Слабость: ${flaw}. Секрет: ${secret}. Триггеры/травма: ${wound}.`;
      document.getElementById('c-output').textContent = text;
    }

    document.getElementById('c-random').addEventListener('click', fillRandom);
    document.getElementById('c-copy').addEventListener('click', () => copyToClipboard(document.getElementById('c-output').textContent || ''));

    ['c-name','c-role','c-age','c-archetype','c-flaw','c-desire','c-secret','c-wound'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('input', renderCard);
    });
  }

  // Title generator
  function setupTitles() {
    function generate() {
      const theme = (document.getElementById('t-theme').value || '').trim();
      const type = document.getElementById('t-type').value;
      const modsRaw = (document.getElementById('t-mods').value || '').toLowerCase();
      const mods = modsRaw.split(',').map(s => s.trim()).filter(Boolean);
      function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
      const bases = theme ? [theme] : ['туман', 'камень', 'река', 'эхо', 'пепел', 'ключ', 'свеча'];
      const patterns = {
        'Лиричное': [
          'Где {base} касается ветра',
          '{mod} {base}',
          'Семь писем о {base}',
          'Сад, где спит {base}',
          'Тише {base}'
        ],
        'Жанровое': [
          'Тайна {base}',
          'Операция «{base}»',
          '{mod} код {base}',
          'Последний {base}',
          'Дело о {base}'
        ],
        'Минималистичное': [
          '{base}',
          '{mod} {base}',
          'После {base}',
          'До {base}',
          'Без {base}'
        ],
        'Провокативное': [
          'Убей свой {base}',
          'Плевать на {base}',
          'Почему {base} врёт',
          'Сожги {base}',
          'Никакого {base}'
        ]
      };
      const list = [];
      for (let i = 0; i < 15; i++) {
        const base = pick(bases);
        const mod = mods.length ? pick(mods) : pick(['ночной','холодный','забытый','молчаливый','чужой','ломкий','дальний']);
        let pattern = pick(patterns[type] || patterns['Лиричное']);
        const title = pattern.replace('{base}', base).replace('{mod}', mod);
        list.push(title.charAt(0).toUpperCase() + title.slice(1));
      }
      return list;
    }

    const out = document.getElementById('t-output');
    document.getElementById('t-generate').addEventListener('click', () => {
      out.innerHTML = '';
      generate().forEach(t => { const li = document.createElement('li'); li.textContent = t; out.appendChild(li); });
    });
    document.getElementById('t-copy').addEventListener('click', () => {
      const text = Array.from(out.querySelectorAll('li')).map(li => `- ${li.textContent}`).join('\n');
      copyToClipboard(text || '');
    });
  }

  // Export Markdown
  function setupExport() {
    function metricsMarkdown() {
      const words = document.getElementById('m-words').textContent;
      const unique = document.getElementById('m-unique').textContent;
      const sentences = document.getElementById('m-sentences').textContent;
      const paragraphs = document.getElementById('m-paragraphs').textContent;
      const chars = document.getElementById('m-chars').textContent;
      const charsNs = document.getElementById('m-chars-ns').textContent;
      const reading = document.getElementById('m-reading').textContent;
      const freq = Array.from(document.querySelectorAll('#freqTable tbody tr')).map(tr => `| ${tr.children[0].textContent} | ${tr.children[1].textContent} |`).join('\n');
      return `## Метрики\n\n- Слов: ${words}\n- Уникальных слов: ${unique}\n- Предложений: ${sentences}\n- Абзацев: ${paragraphs}\n- Символов (с пробелами): ${chars}\n- Символов (без пробелов): ${charsNs}\n- Примерное время чтения: ${reading}\n\n### Частотный словарь (top 20)\n\n| Слово | Частота |\n|---|---|\n${freq}`;
    }

    function readabilityMarkdown() {
      const ari = document.getElementById('r-ari').textContent;
      const avgWord = document.getElementById('r-avg-word').textContent;
      const avgSent = document.getElementById('r-avg-sent').textContent;
      const avgPara = document.getElementById('r-avg-para').textContent;
      const note = document.getElementById('r-interpretation').textContent;
      return `## Удобочитаемость (приблизительно)\n\n- ARI: ${ari}\n- Средняя длина слова: ${avgWord}\n- Средняя длина предложения: ${avgSent}\n- Средняя длина абзаца: ${avgPara}\n\n${note}`;
    }

    function collectMarkdown() {
      const chunks = ['# Заметки из WriterWise'];
      if (document.getElementById('x-include-text').checked) {
        chunks.push('## Текст', (document.getElementById('mainText').value || '').trim() || '_пусто_');
      }
      if (document.getElementById('x-include-metrics').checked) {
        chunks.push(metricsMarkdown());
      }
      if (document.getElementById('x-include-readability').checked) {
        chunks.push(readabilityMarkdown());
      }
      if (document.getElementById('x-include-prompts').checked) {
        const prompts = Array.from(document.querySelectorAll('#p-output li')).map(li => `- ${li.textContent}`).join('\n') || '_нет_' ;
        chunks.push('## Идеи', prompts);
      }
      if (document.getElementById('x-include-logline').checked) {
        chunks.push('## Логлайн', document.getElementById('l-output').textContent || '_нет_');
      }
      if (document.getElementById('x-include-outline').checked) {
        const outline = Array.from(document.querySelectorAll('#o-output tbody tr')).map(tr => `- ${tr.children[0].textContent}: ~${tr.children[1].textContent} слов`).join('\n') || '_нет_';
        chunks.push('## План', outline);
      }
      if (document.getElementById('x-include-character').checked) {
        chunks.push('## Персонаж', document.getElementById('c-output').textContent || '_нет_');
      }
      if (document.getElementById('x-include-titles').checked) {
        const titles = Array.from(document.querySelectorAll('#t-output li')).map(li => `- ${li.textContent}`).join('\n') || '_нет_';
        chunks.push('## Названия', titles);
      }
      return chunks.join('\n\n');
    }

    function enableExportButtons(enable) {
      document.getElementById('x-download').disabled = !enable;
      document.getElementById('x-copy').disabled = !enable;
    }

    document.getElementById('x-generate').addEventListener('click', () => {
      const md = collectMarkdown();
      document.getElementById('x-output').textContent = md;
      enableExportButtons(true);
    });

    document.getElementById('x-copy').addEventListener('click', () => {
      const md = document.getElementById('x-output').textContent || '';
      copyToClipboard(md);
    });

    document.getElementById('x-download').addEventListener('click', () => {
      const md = document.getElementById('x-output').textContent || '';
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'writerwise_notes.md';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    });
  }

  // Initial boot
  function boot() {
    setupTabs();
    setupSharedTextActions();
    setupPrompts();
    setupLogline();
    setupOutline();
    setupCharacter();
    setupTitles();
    setupExport();

    // Initial compute
    recomputeAll(mainTextEl().value || '');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();