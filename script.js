(function() {
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const storage = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
    del(key) { try { localStorage.removeItem(key); } catch {} }
  };

  // THEME
  const themeToggle = $('#themeToggle');
  const preferred = storage.get('writer.theme', 'dark');
  if (preferred === 'light') document.body.classList.add('light');
  themeToggle?.addEventListener('click', () => {
    document.body.classList.toggle('light');
    storage.set('writer.theme', document.body.classList.contains('light') ? 'light' : 'dark');
  });

  // GLOBAL SEARCH (filter advice text + headings)
  const globalSearch = $('#globalSearch');
  globalSearch?.addEventListener('input', () => {
    const q = globalSearch.value.trim().toLowerCase();
    $$('section, details').forEach(el => { el.style.outline = ''; });
    if (!q) return;
    $$('summary, h2, h3, h4, p, li').forEach(el => {
      const hit = el.textContent.toLowerCase().includes(q);
      el.style.outline = hit ? '1px dashed rgba(122,162,247,.5)' : '';
    });
  });

  // EDITOR
  const writerArea = $('#writerArea');
  const editorStats = $('#editorStats');
  const liveAnalyze = $('#liveAnalyze');
  const fileInput = $('#fileInput');

  const saved = storage.get('writer.editor', '');
  if (writerArea) writerArea.value = saved || '';

  function getWords(text) {
    return (text.toLowerCase().match(/[а-яёa-z0-9\-']+/gi) || []).filter(Boolean);
  }

  function splitSentences(text) {
    // simple heuristic sentence splitter for Russian/English
    return (text
      .replace(/\n+/g, ' ')
      .split(/(?<=[\.!?…])\s+(?=[А-ЯЁA-Z])/g)
      .filter(s => s.trim().length > 0));
  }

  const ruStop = new Set(['и','в','во','не','на','я','он','она','они','мы','вы','что','как','к','ко','с','со','а','но','или','да','же','же','у','из','для','по','ли','же','бы','то','это','все','всё','этот','эта','эти','кто','где','когда','нужен','нужно','нужна','его','ее','её','их','тот','там','тут','так','такой','также','чтобы','при','от','до','за','со','об','обо','над','под','о','об','уж','вот']);

  function computeStats(text) {
    const words = getWords(text);
    const wordCount = words.length;
    const characters = text.length;
    const sentences = splitSentences(text);
    const sentenceCount = sentences.length || (wordCount ? 1 : 0);
    const avgSentence = sentenceCount ? Math.round((wordCount / sentenceCount) * 10) / 10 : 0;
    const paragraphCount = (text.trim().match(/\n{2,}|\n(?=\s*\n)/g) || []).length + (text.trim() ? 1 : 0);
    return { wordCount, characters, sentenceCount, avgSentence, paragraphCount, sentences, words };
  }

  function updateStats() {
    const t = writerArea?.value || '';
    const s = computeStats(t);
    if (editorStats) editorStats.textContent = `Слов: ${s.wordCount} · Символов: ${s.characters} · Предложений: ${s.sentenceCount} · Ср. длина предложения: ${s.avgSentence} · Абзацев: ${s.paragraphCount}`;
    storage.set('writer.editor', t);
  }
  writerArea?.addEventListener('input', () => { updateStats(); if (liveAnalyze?.checked) analyzeText(); });
  updateStats();

  $('#clearEditor')?.addEventListener('click', () => { if (writerArea) { writerArea.value=''; updateStats(); } });
  $('#exportTxt')?.addEventListener('click', () => downloadText(writerArea?.value || '', 'text/plain', 'text.txt'));
  $('#exportMd')?.addEventListener('click', () => downloadText(writerArea?.value || '', 'text/markdown', 'text.md'));
  $('#importText')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (writerArea) { writerArea.value = reader.result || ''; updateStats(); } };
    reader.readAsText(file);
    fileInput.value = '';
  });

  function downloadText(text, type, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type}));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ANALYZER
  const analyzeResults = $('#analyzeResults');
  const highlightPreview = $('#highlightPreview');
  const sentenceChart = $('#sentenceChart');
  const runAnalyze = $('#runAnalyze');

  const cliches = [
    'как гром среди ясного неба','северный ветер свистел','серые глаза','холодный взгляд','камень с души','на душе кошки скребут','сердце ёкнуло','как будто во сне','как две капли воды','пелена спала с глаз','в одночасье','утопал в роскоши','не верил своим глазам','руки опустились','как вкопанный','каждый второй','знал как свои пять пальцев'
  ];

  const clerical = {
    'осуществлять': 'делать',
    'осуществление': 'выполнение',
    'в целях': 'чтобы',
    'в рамках': 'в/во',
    'путём': 'с помощью/через',
    'является': 'есть/это',
    'имеет место': 'происходит',
    'обеспечивает': 'даёт/позволяет',
    'направлен на': 'помогает/делает'
  };

  const weakAdverbs = ['очень','крайне','весьма','ужасно','безумно','сильно','невероятно'];

  function analyzeText() {
    const text = writerArea?.value || '';
    const { wordCount, sentenceCount, avgSentence, sentences, words } = computeStats(text);

    // Repeated non-stop words
    const freq = new Map();
    for (const w of words) {
      if (ruStop.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    const repeats = Array.from(freq.entries()).filter(([,n]) => n > 2).sort((a,b) => b[1]-a[1]).slice(0, 20);

    // Cliches found
    const foundCliches = cliches.filter(c => text.toLowerCase().includes(c));

    // Clericalism found
    const foundCler = Object.keys(clerical).filter(k => text.toLowerCase().includes(k));

    // Weak adverbs
    const foundAdv = weakAdverbs.filter(a => text.toLowerCase().includes(a));

    // Passive voice heuristic (бы(л|ла|ло|ли|ть|дет) + \w+(ан|ян|ен|ён|т))
    const passiveRegex = /\bбыл(?:а|о|и)?\s+\w+(?:ан|ян|ен|ён|т)\b|\bбыли\s+\w+(?:ан|ян|ен|ён|т)\b|\bбудет\s+\w+(?:ан|ян|ен|ён|т)\b|\bявляется\s+\w+\b/gi;
    const passiveMatches = text.match(passiveRegex) || [];

    if (analyzeResults) {
      analyzeResults.innerHTML = '';
      const blocks = [];
      blocks.push(`<div>Сводка: слов ${wordCount}, предложений ${sentenceCount}, средняя длина ${avgSentence}.</div>`);
      if (repeats.length) {
        blocks.push(`<div><strong>Повторы (топ):</strong> ${repeats.map(([w,n])=>`${w}×${n}`).join(', ')}</div>`);
      }
      if (foundCliches.length) {
        blocks.push(`<div><strong>Клише:</strong> ${foundCliches.join(' · ')}</div>`);
      }
      if (foundCler.length) {
        const repl = foundCler.map(k => `${k} → ${clerical[k]}`).join('; ');
        blocks.push(`<div><strong>Канцелярит:</strong> ${repl}</div>`);
      }
      if (foundAdv.length) {
        blocks.push(`<div><strong>Пустые усилители:</strong> ${foundAdv.join(', ')}</div>`);
      }
      if (passiveMatches.length) {
        blocks.push(`<div><strong>Пассивные конструкции (эвристика):</strong> ${passiveMatches.slice(0,10).join(' | ')}</div>`);
      }
      analyzeResults.innerHTML = blocks.join('');
    }

    // Highlight preview
    if (highlightPreview) {
      let html = escapeHtml(text);
      // Mark cliches
      for (const c of foundCliches) {
        const re = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        html = html.replace(re, m => `<mark title="Клише">${m}</mark>`);
      }
      // Mark clerical
      for (const k of Object.keys(clerical)) {
        const re = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        html = html.replace(re, m => `<mark title="Канцелярит: ${clerical[k]}">${m}</mark>`);
      }
      // Mark weak adverbs
      for (const a of weakAdverbs) {
        const re = new RegExp(`\\b${a}\\b`, 'gi');
        html = html.replace(re, m => `<mark title="Пустой усилитель">${m}</mark>`);
      }
      // Mark passive
      html = html.replace(passiveRegex, m => `<mark title="Пассивная конструкция">${m}</mark>`);

      highlightPreview.innerHTML = html.split('\n').map(p => `<p>${p || '&nbsp;'}</p>`).join('');
    }

    // Sentence length chart
    if (sentenceChart && sentenceChart.getContext) {
      const ctx = sentenceChart.getContext('2d');
      const lens = sentences.map(s => getWords(s).length);
      const maxLen = Math.max(1, ...lens);
      ctx.clearRect(0,0,sentenceChart.width, sentenceChart.height);
      const w = sentenceChart.width; const h = sentenceChart.height; const pad = 24;
      const barW = Math.max(2, (w - pad*2) / Math.max(1, lens.length));
      ctx.fillStyle = '#2a2f3a'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--primary');
      lens.forEach((len, i) => {
        const bh = (h - pad*2) * (len / maxLen);
        ctx.fillRect(pad + i*barW, h - pad - bh, barW - 1, bh);
      });
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted');
      ctx.fillText('Длина предложений (в словах)', pad, 16);
    }
  }

  function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

  runAnalyze?.addEventListener('click', analyzeText);

  // GENERATORS
  const nameData = {
    ru: {
      m: ['Алексей','Иван','Дмитрий','Егор','Николай','Олег','Павел','Фёдор','Юрий','Глеб','Данила','Сергей','Максим','Степан','Арсений'],
      f: ['Анна','Мария','Екатерина','Дарья','Ольга','Наталья','Полина','Софья','Алина','Татьяна','Вера','Мира','Лидия','Елена','Валерия'],
      last: ['Иванов','Петров','Сидоров','Смирнов','Кузнецов','Васильев','Новиков','Фёдоров','Волков','Алексеев','Егоров','Громов']
    },
    en: {
      m: ['John','Michael','David','James','Robert','Daniel','Thomas','George','Andrew','Peter','William','Henry'],
      f: ['Anna','Emily','Sophia','Olivia','Charlotte','Amelia','Grace','Victoria','Emma','Ava','Isabella'],
      last: ['Smith','Johnson','Brown','Taylor','Anderson','Clark','Wright','Baker','Miller','Davis','Wilson','Moore']
    },
    fantasy: {
      m: ['Каэл','Дорн','Эридан','Тарэн','Морвен','Риан','Сайлас','Каден'],
      f: ['Лиара','Мираэль','Селин','Арвен','Наэла','Виэнна','Сэтара'],
      last: ['из Серых Холмов','Ночной Охотник','Северная Вьюга','Звёздный Скиталец','Каменный Хранитель']
    },
    intl: {
      m: ['Mateo','Noah','Leo','Lucas','Hiro','Arjun','Ali','Liam','Ethan'],
      f: ['Mia','Ava','Layla','Noa','Sakura','Aisha','Sofia','Ines'],
      last: ['Garcia','Kim','Singh','Khan','Fernandez','Novak','Silva','Ibrahim','Haddad']
    }
  };

  function rand(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

  $('#genNames')?.addEventListener('click', () => {
    const culture = $('#nameCulture').value;
    const gender = $('#nameGender').value;
    const ul = $('#nameList'); ul.innerHTML='';
    for (let i=0;i<10;i++) {
      let first = '';
      if (gender === 'any') first = rand([...nameData[culture].m, ...nameData[culture].f]);
      else first = rand(nameData[culture][gender]);
      const last = rand(nameData[culture].last);
      const li = document.createElement('li'); li.textContent = `${first} ${last}`; ul.appendChild(li);
    }
  });

  const hookParts = {
    genre: ['фэнтези','научная фантастика','мистика','триллер','исторический роман','роман воспитания','драма','приключение','детектив'],
    hero: ['юный архивариус','разочарованный следователь','языковед‑интроверт','смелая учёная','ветеринар без лицензии','бывший вор','певица‑фольклорист'],
    goal: ['найти пропавший манускрипт','доказать невиновность друга','остановить катастрофу','вернуть голос','закрыть гештальт прошлого','спасти город от наводнения','открыть школу для одарённых'],
    obstacle: ['время утекает','никто не верит','всё забывается','враги на шаг впереди','память предаёт','законы против них','магия нестабильна'],
    stakes: ['иначе погибнут близкие','иначе заговор победит','иначе правда исчезнет','иначе он утратит себя','иначе город рухнет']
  };

  $('#genHooks')?.addEventListener('click', () => {
    const ol = $('#hookList'); ol.innerHTML='';
    for (let i=0;i<10;i++) {
      const g = rand(hookParts.genre);
      const h = rand(hookParts.hero);
      const go = rand(hookParts.goal);
      const o = rand(hookParts.obstacle);
      const s = rand(hookParts.stakes);
      const li = document.createElement('li');
      li.textContent = `[${g}] ${h} должен ${go}, но ${o} — ${s}.`;
      ol.appendChild(li);
    }
  });

  // OUTLINE PLANNER
  const outlineBoard = $('#outlineBoard');
  const outlineTemplate = $('#outlineTemplate');

  function loadTemplate(name) {
    if (name === 'threeAct') return [
      {title:'Акт I — Завязка', prompt:'Герой, мир, событие‑разрыв. Чем платит герой за старт?'} ,
      {title:'Порог', prompt:'Решение идти вперёд. Что закрывается навсегда?'},
      {title:'Акт II — Противостояние', prompt:'Попытки, провалы, нарастающие ставки.'},
      {title:'Середина', prompt:'Поворот — меняет понимание цели/угрозы.'},
      {title:'Акт III — Развязка', prompt:'Финальный выбор, последствия, новая нормальность.'}
    ];
    if (name === 'freytag') return [
      {title:'Экспозиция', prompt:'Герой, контекст, конфликтные линии.'},
      {title:'Завязка', prompt:'Событие, запускающее действие.'},
      {title:'Развитие действия', prompt:'Эскалация конфликтов.'},
      {title:'Кульминация', prompt:'Высшая точка напряжения.'},
      {title:'Развязка', prompt:'Последствия и новая расстановка сил.'}
    ];
    if (name === 'hero') return [
      {title:'Мир обыденный', prompt:'Что герой хочет и чего боится?'},
      {title:'Зов к приключению', prompt:'Чем манит неизвестность?'},
      {title:'Пересечение порога', prompt:'Отказ/наставник/первое испытание.'},
      {title:'Испытания, союзники, враги', prompt:'С чем приходится столкнуться?'},
      {title:'Ордалия', prompt:'Потеря/смерть, за которую нужно заплатить.'},
      {title:'Награда и путь назад', prompt:'Цена награды, погоня.'},
      {title:'Возрождение', prompt:'Новый выбор и трансформация.'}
    ];
    return [];
  }

  function renderOutline(items) {
    outlineBoard.innerHTML = '';
    items.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'beat';
      div.innerHTML = `<input type="text" value="${escapeHtml(item.title)}" data-idx="${idx}" class="beat-title">\n<textarea data-idx="${idx}" class="beat-text" placeholder="${escapeHtml(item.prompt)}"></textarea>`;
      outlineBoard.appendChild(div);
    });
  }

  function getOutline() {
    const beats = [];
    $$('.beat').forEach(b => {
      const title = b.querySelector('.beat-title').value.trim();
      const text = b.querySelector('.beat-text').value.trim();
      beats.push({ title, text });
    });
    return beats;
  }

  function exportOutlineMd() {
    const beats = getOutline();
    const md = beats.map(b => `## ${b.title}\n\n${b.text}\n`).join('\n');
    downloadText(md, 'text/markdown', 'outline.md');
  }

  function initOutline() {
    const saved = storage.get('writer.outline', null);
    if (saved && Array.isArray(saved) && saved.length) renderOutline(saved);
    else renderOutline(loadTemplate(outlineTemplate.value));
  }

  $('#addBeat')?.addEventListener('click', () => {
    const n = $$('.beat').length + 1;
    const div = document.createElement('div');
    div.className = 'beat';
    div.innerHTML = `<input type="text" value="Узел ${n}" class="beat-title">\n<textarea class="beat-text" placeholder="Что меняется необратимо?"></textarea>`;
    outlineBoard.appendChild(div);
  });
  $('#saveOutline')?.addEventListener('click', () => storage.set('writer.outline', getOutline()));
  $('#exportOutlineMd')?.addEventListener('click', exportOutlineMd);
  $('#clearOutline')?.addEventListener('click', () => { outlineBoard.innerHTML=''; storage.del('writer.outline'); });
  outlineTemplate?.addEventListener('change', () => renderOutline(loadTemplate(outlineTemplate.value)));
  initOutline();

  // CHARACTERS
  const characterForm = $('#characterForm');
  const characterList = $('#characterList');

  function loadCharacters() { return storage.get('writer.characters', []); }
  function saveCharacters(list) { storage.set('writer.characters', list); }

  function renderCharacters(list) {
    characterList.innerHTML = '';
    for (const ch of list) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <strong>${escapeHtml(ch.name)}</strong> — ${escapeHtml(ch.role || 'роль не указана')}<br>
        <em>Цель:</em> ${escapeHtml(ch.goal || '—')}<br>
        <em>Конфликт:</em> ${escapeHtml(ch.inner || '—')}<br>
        <em>Слабость:</em> ${escapeHtml(ch.wound || '—')}<br>
        <em>Арка:</em> ${escapeHtml(ch.arc || '—')}<br>
        <em>Голос:</em> ${escapeHtml(ch.voice || '—')}<br>
        <em>Символ:</em> ${escapeHtml(ch.symbol || '—')}<br>
        <div style="display:flex; gap:.5rem; margin-top:.5rem;">
          <button class="btn btn-del">Удалить</button>
        </div>
      `;
      card.querySelector('.btn-del').addEventListener('click', () => {
        const arr = loadCharacters().filter(c => !(c.id === ch.id));
        saveCharacters(arr);
        renderCharacters(arr);
      });
      characterList.appendChild(card);
    }
  }

  characterForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const ch = {
      id: crypto.randomUUID(),
      name: $('#chName').value.trim(),
      role: $('#chRole').value.trim(),
      goal: $('#chGoal').value.trim(),
      inner: $('#chInner').value.trim(),
      wound: $('#chWound').value.trim(),
      arc: $('#chArc').value.trim(),
      voice: $('#chVoice').value.trim(),
      symbol: $('#chSymbol').value.trim(),
    };
    if (!ch.name) return;
    const arr = loadCharacters(); arr.push(ch); saveCharacters(arr); renderCharacters(arr); characterForm.reset();
  });

  $('#exportCharacters')?.addEventListener('click', () => {
    downloadText(JSON.stringify(loadCharacters(), null, 2), 'application/json', 'characters.json');
  });
  $('#clearCharacters')?.addEventListener('click', () => { saveCharacters([]); renderCharacters([]); });
  $('#chSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const arr = loadCharacters().filter(c => `${c.name} ${c.role}`.toLowerCase().includes(q));
    renderCharacters(arr);
  });
  renderCharacters(loadCharacters());

  // POMODORO & GOAL
  const workI = $('#pomodoroWork');
  const breakI = $('#pomodoroBreak');
  const display = $('#pomodoroDisplay');
  let timer = null; let remaining = 0; let mode = 'work';

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.value = 0.05; o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, 400);
    } catch {}
  }

  function setTimer(mins) { remaining = Math.max(0, Math.floor(mins*60)); updateDisplay(); }
  function updateDisplay() {
    const m = String(Math.floor(remaining/60)).padStart(2,'0');
    const s = String(remaining%60).padStart(2,'0');
    display.textContent = `${m}:${s}`;
  }
  function tick() {
    if (remaining > 0) { remaining--; updateDisplay(); }
    else { clearInterval(timer); timer = null; beep();
      if (mode === 'work') { mode = 'break'; setTimer(parseInt(breakI.value,10)||5); start(); }
      else { mode = 'work'; setTimer(parseInt(workI.value,10)||25); }
    }
  }
  function start() { if (timer) return; timer = setInterval(tick, 1000); }
  function pause() { if (timer) { clearInterval(timer); timer = null; } }
  function reset() { pause(); mode='work'; setTimer(parseInt(workI.value,10)||25); }

  $('#startPomodoro')?.addEventListener('click', start);
  $('#pausePomodoro')?.addEventListener('click', pause);
  $('#resetPomodoro')?.addEventListener('click', reset);
  reset();

  // Word goal
  const goalBar = $('#goalProgressBar');
  const goalText = $('#goalProgressText');
  function loadGoal() { return storage.get('writer.goal', { target: 2000, done: 0 }); }
  function saveGoal(x) { storage.set('writer.goal', x); }
  function renderGoal() {
    const g = loadGoal();
    const pct = Math.min(100, Math.round((g.done / Math.max(1,g.target))*100));
    goalBar.style.setProperty('--w', pct + '%');
    goalText.textContent = `${g.done} / ${g.target}`;
    $('#wordGoal').value = g.target;
  }
  $('#saveGoal')?.addEventListener('click', () => { const target = parseInt($('#wordGoal').value,10)||0; const g = loadGoal(); g.target = target; saveGoal(g); renderGoal(); });
  $('#addFromEditor')?.addEventListener('click', () => { const g = loadGoal(); const c = computeStats($('#writerArea').value).wordCount; g.done = Math.min(g.target, g.done + c); saveGoal(g); renderGoal(); });
  $('#resetProgress')?.addEventListener('click', () => { const g = loadGoal(); g.done = 0; saveGoal(g); renderGoal(); });
  renderGoal();

  // ANALYZE on start if needed
  function safeAnalyzeSoon() { try { analyzeText(); } catch {} }
  setTimeout(safeAnalyzeSoon, 50);
})();