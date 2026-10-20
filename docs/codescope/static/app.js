'use strict';
const $ = (selector) => document.querySelector(selector);
const extensions = {python: '.py', cpp: '.cpp', csharp: '.cs', java: '.java'};
const samples = {
  python: {name: 'main.py', content: 'import os\n\ndef next_age(age: int) -> int:\n    return age + 1\n\nuser_age = input("Возраст: ")\nprint(next_age(user_age))\nprint(missing_name)\n'},
  cpp: {name: 'main.cpp', content: '#include <iostream>\n\nint main() {\n    int count = "five";\n    std::cout << count << "\\n";\n    return 0;\n}\n'},
  csharp: {name: 'Example.cs', content: 'public class Example\n{\n    public int Count()\n    {\n        int count = "five";\n        return count;\n    }\n}\n'},
  java: {name: 'Main.java', content: 'public class Main {\n    public static void main(String[] args) {\n        int count = "five";\n        System.out.println(count);\n    }\n}\n'}
};
const isDemo = document.body.dataset.demo === 'true' || !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) || location.protocol === 'file:';
let sourceFiles = [{...samples.python}];
let activeFile = 0;
let report = null;
let filter = 'all';
let revision = 0;
let analyzing = false;
let fixtures = {};
const encoder = new TextEncoder();

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function showError(message) {
  $('#error-banner').textContent = message;
  $('#error-banner').hidden = !message;
}
function clearReport() {
  revision += 1;
  report = null;
  $('#error-count').textContent = '—';
  $('#warning-count').textContent = '—';
  $('#tool-count').textContent = '—';
  $('#report-state').textContent = 'ОЖИДАНИЕ';
  $('#coverage-label').textContent = 'ещё не проверено';
  $('#tool-list').replaceChildren();
  $('#export-json').disabled = true;
  $('#export-html').disabled = true;
  const empty = node('div', 'empty-state');
  empty.append(node('span', 'empty-mark', '[ / ]'), node('h3', '', 'Готово к проверке.'), node('p', '', 'После изменения кода нужен новый анализ. Нажми «Проверить код».'));
  $('#findings').replaceChildren(empty);
  updateGutter();
}
function saveEditor() {
  sourceFiles[activeFile] = {name: $('#filename').value, content: $('#code').value};
}
function renderTabs() {
  const tabs = sourceFiles.map((file, index) => {
    const tab = node('div', 'file-tab');
    const button = node('button', '', file.name || 'Без имени');
    button.setAttribute('aria-pressed', String(index === activeFile));
    button.onclick = () => { saveEditor(); activeFile = index; renderEditor(); };
    tab.append(button);
    if (sourceFiles.length > 1) {
      const remove = node('button', 'remove', '×');
      remove.setAttribute('aria-label', `Удалить ${file.name}`);
      remove.onclick = () => { saveEditor(); sourceFiles.splice(index, 1); activeFile = Math.min(activeFile, sourceFiles.length - 1); clearReport(); renderEditor(); };
      tab.append(remove);
    }
    return tab;
  });
  $('#file-tabs').replaceChildren(...tabs);
}
function renderEditor() {
  $('#filename').value = sourceFiles[activeFile].name;
  $('#code').value = sourceFiles[activeFile].content;
  $('#code').scrollTop = 0;
  renderTabs(); updateGutter();
}
function updateGutter() {
  const code = $('#code').value;
  $('#file-size').textContent = `${(encoder.encode(code).length / 1000).toFixed(1)} КБ`;
  const lineCount = Math.min(6000, code.split('\n').length);
  const issues = new Map();
  for (const finding of report?.findings ?? []) {
    if (finding.file === $('#filename').value && (finding.severity === 'error' || !issues.has(finding.line))) issues.set(finding.line, finding.severity);
  }
  $('#line-numbers').replaceChildren(...Array.from({length: lineCount}, (_, i) => node('span', issues.has(i + 1) ? `has-${issues.get(i + 1)}` : '', String(i + 1))));
  const highlights = [...issues].filter(([, severity]) => severity !== 'info').map(([line, severity]) => {
    const top = 16 + (line - 1) * 24;
    return `linear-gradient(to bottom,transparent ${top}px,var(--${severity}-soft) ${top}px,var(--${severity}-soft) ${top + 24}px,transparent ${top + 24}px)`;
  });
  $('#code').style.backgroundImage = highlights.slice(0, 100).join(',');
  $('#code').style.backgroundAttachment = 'local';
  $('#line-numbers').scrollTop = $('#code').scrollTop;
}
function jumpToFinding(finding) {
  const index = sourceFiles.findIndex(file => file.name === finding.file);
  if (index < 0) return;
  saveEditor(); activeFile = index; renderEditor();
  const editor = $('#code');
  const lines = editor.value.split('\n');
  const offset = lines.slice(0, finding.line - 1).reduce((total, line) => total + line.length + 1, 0);
  editor.focus(); editor.setSelectionRange(offset, offset + (lines[finding.line - 1]?.length ?? 0));
  editor.scrollTop = Math.max(0, (finding.line - 3) * 24);
  $('#line-numbers').scrollTop = editor.scrollTop;
}
function renderFindings() {
  if (!report) return;
  const list = report.findings.filter(f => filter === 'all' || f.severity === filter);
  const elements = list.map(finding => {
    const article = node('article', `finding ${finding.severity}`);
    const heading = node('div', 'finding-head');
    const label = {error: 'Ошибка', warning: 'Замечание', info: 'Информация'}[finding.severity];
    const location = node('button', 'finding-location', `${finding.file}:${finding.line}:${finding.column}`);
    location.setAttribute('aria-label', `Перейти к ${finding.file}, строка ${finding.line}`);
    location.onclick = () => jumpToFinding(finding);
    heading.append(node('span', 'severity', label), location);
    article.append(heading, node('h3', '', finding.message), node('small', '', `${finding.tool} / ${finding.rule}`), node('p', '', finding.help));
    return article;
  });
  if (!elements.length) {
    const empty = node('div', 'empty-state');
    empty.append(node('span', 'empty-mark', '[ ✓ ]'), node('h3', '', report.coverage === 'partial' ? 'Проверка неполная.' : 'В этом списке нет проблем.'), node('p', '', report.coverage === 'partial' ? 'Открой «Покрытие проверки»: часть инструментов не отработала. Отсутствие ошибок не подтверждает корректность.' : 'Анализаторы не нашли проблем выбранной категории. Это не заменяет тесты.'));
    elements.push(empty);
  }
  $('#findings').replaceChildren(...elements);
}
function renderReport() {
  $('#error-count').textContent = report.summary.error;
  $('#warning-count').textContent = report.summary.warning;
  $('#tool-count').textContent = `${report.tools.filter(t => t.status === 'completed').length}/${report.tools.length}`;
  $('#report-state').textContent = isDemo ? 'ПРИМЕР ОТЧЁТА' : `${(report.duration_ms / 1000).toFixed(1)} СЕК`;
  $('#coverage-label').textContent = report.coverage === 'partial' ? 'частичная' : 'инструменты отработали';
  const statusText = {completed: 'выполнен', unavailable: 'не установлен', failed: 'сбой', timeout: 'лимит времени'};
  $('#tool-list').replaceChildren(...report.tools.map(tool => node('li', '', `${tool.name}: ${statusText[tool.status]}. ${tool.detail}`)));
  if (report.truncated) $('#tool-list').append(node('li', '', 'Показаны первые 400 проблем. Отчёт усечён.'));
  $('#coverage').open = report.coverage === 'partial';
  $('#export-json').disabled = false; $('#export-html').disabled = false;
  renderFindings(); updateGutter();
}
async function analyze() {
  if (analyzing) return;
  saveEditor(); showError('');
  if (sourceFiles.some(file => !file.name || !file.content.trim())) { showError('Укажи имя и добавь непустой код для каждого файла.'); return; }
  if (sourceFiles.some(file => encoder.encode(file.content).length > 256000 || file.content.split('\n').length > 6000)) { showError('Один файл: не больше 256 КБ и 6000 строк.'); return; }
  if (sourceFiles.reduce((sum, file) => sum + encoder.encode(file.content).length, 0) > 1000000) { showError('Общий размер файлов не должен превышать 1 МБ.'); return; }
  const thisRevision = revision;
  analyzing = true; $('#analyze').disabled = true;
  $('#analyze').firstChild.textContent = 'Проверяем… ';
  $('#progress').textContent = 'До 85 секунд · код не запускается';
  let controller;
  let timer;
  try {
    let incoming;
    if (isDemo) {
      const sample = samples[$('#language').value];
      if (sourceFiles.length !== 1 || sourceFiles[0].name !== sample.name || sourceFiles[0].content !== sample.content) throw new Error('Это демонстрация: нажми «Пример» или установи локальную версию для своего кода.');
      incoming = fixtures[$('#language').value];
      if (!incoming) throw new Error('Примеры отчётов не загрузились. Обнови страницу или установи локальную версию.');
    } else {
      controller = new AbortController(); timer = setTimeout(() => controller.abort(), 95000);
      const response = await fetch('api/analyze', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({language: $('#language').value, files: sourceFiles}), signal: controller.signal});
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : `Ошибка проверки (${response.status}). Проверь имена, расширения и размер файлов.`);
      incoming = payload;
    }
    if (thisRevision !== revision) { showError('Код изменился во время проверки. Запусти анализ ещё раз.'); return; }
    report = incoming; renderReport();
    $('#progress').textContent = isDemo ? 'Готовый пример · не живой анализ' : 'Проверка завершена';
  } catch (error) {
    showError(error.name === 'AbortError' ? 'Ответ не получен за 95 секунд. Уменьши файлы и повтори.' : error.message || 'Не удалось связаться с локальным сервером. Проверь, запущен ли codescope serve.');
    $('#progress').textContent = 'Проверка не завершена';
  } finally {
    clearTimeout(timer); analyzing = false; $('#analyze').disabled = false; $('#analyze').firstChild.textContent = 'Проверить код ';
  }
}
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const anchor = node('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}
function exportHtml() {
  const rows = report.findings.map(f => `<tr><td>${escapeHtml({error:"Ошибка", warning:"Замечание", info:"Сведения"}[f.severity] || f.severity)}</td><td>${escapeHtml(f.file)}:${f.line}:${f.column}</td><td>${escapeHtml(f.tool)} / ${escapeHtml(f.rule)}</td><td><strong>${escapeHtml(f.message)}</strong><p>${escapeHtml(f.help)}</p></td></tr>`).join('');
  const tools = report.tools.map(t => `<li>${escapeHtml(t.name)}: ${escapeHtml({completed:"выполнен",unavailable:"не установлен",failed:"сбой",timeout:"лимит времени"}[t.status] || t.status)} — ${escapeHtml(t.detail)}</li>`).join('');
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"><title>CodeScope — отчёт</title><style>body{font:16px/1.6 Arial,sans-serif;max-width:1100px;margin:40px auto;padding:0 24px;color:#18232e}h1{font-size:40px}table{border-collapse:collapse;width:100%;min-width:820px}th{white-space:nowrap}th:first-child{min-width:100px}th:nth-child(2){min-width:140px}th:nth-child(3){min-width:170px}th,td{padding:14px;border:1px solid #ced6df;text-align:left;vertical-align:top;overflow-wrap:anywhere}td p{color:#566572}main{overflow-x:auto}small{color:#566572}</style><h1>CodeScope / ${escapeHtml(report.language)}</h1><p>${escapeHtml(report.created_at)} · v${escapeHtml(report.version)} · ${isDemo ? 'Демонстрационный отчёт' : 'Локальная проверка'}</p><p>Ошибки: ${report.summary.error} · Замечания: ${report.summary.warning} · Покрытие: ${report.coverage === "completed" ? "завершено" : "частичное"}</p><p>${escapeHtml(report.notice)}</p>${report.truncated ? '<p>Отчёт усечён: показаны первые 400 проблем.</p>' : ''}<main><table><thead><tr><th>Уровень</th><th>Позиция</th><th>Источник</th><th>Проблема и пояснение</th></tr></thead><tbody>${rows}</tbody></table></main><h2>Инструменты</h2><ul>${tools}</ul><small>Нет найденных ошибок ≠ код точно правильный. Исходные файлы в отчёт не включены.</small></html>`;
  download('codescope-report.html', html, 'text/html;charset=utf-8');
}
$('#analyze').onclick = analyze;
$('#code').oninput = () => { saveEditor(); clearReport(); };
$('#code').onscroll = () => { $('#line-numbers').scrollTop = $('#code').scrollTop; };
$('#filename').oninput = () => { saveEditor(); clearReport(); renderTabs(); };
$('#language').onchange = () => {
  if (sourceFiles.some(file => file.content !== samples[Object.keys(samples).find(key => samples[key].name === file.name)]?.content) && !confirm('Смена языка заменит текущие файлы примером. Продолжить?')) {
    $('#language').value = Object.keys(extensions).find(key => sourceFiles[0].name.endsWith(extensions[key])) || 'python'; return;
  }
  sourceFiles = [{...samples[$('#language').value]}]; activeFile = 0; clearReport(); renderEditor();
};
$('#sample').onclick = () => {
  if (!confirm('Заменить текущие файлы примером для выбранного языка?')) return;
  sourceFiles = [{...samples[$('#language').value]}]; activeFile = 0; clearReport(); renderEditor(); showError('');
};
$('#upload').onclick = () => $('#files').click();
$('#files').onchange = async (event) => {
  const files = [...event.target.files];
  try {
    if (files.length + sourceFiles.length > 12) throw new Error('Не больше 12 файлов за проверку. Удали лишние вкладки.');
    const allowed = {python: ['py'], cpp: ['cpp','cc','cxx','h','hpp'], csharp: ['cs'], java: ['java']}[$('#language').value];
    const incoming = [];
    for (const file of files) {
      if (file.size > 256000) throw new Error(`${file.name}: размер больше 256 КБ`);
      if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(file.name)) throw new Error('Имена файлов должны быть латиницей, без путей и пробелов.');
      if (!allowed.includes(file.name.split('.').pop())) throw new Error('Расширение файла не соответствует выбранному языку.');
      if ([...sourceFiles, ...incoming].some(source => source.name.toLowerCase() === file.name.toLowerCase())) throw new Error(`Файл ${file.name} уже открыт. Переименуй его или удали существующую вкладку.`);
      const content = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer());
      incoming.push({name: file.name, content});
    }
    saveEditor(); sourceFiles.push(...incoming); activeFile = sourceFiles.length - 1; clearReport(); renderEditor(); showError('');
  } catch (error) { showError(error.message); }
  event.target.value = '';
};
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  renderFindings();
});
$('#export-json').onclick = () => report && download('codescope-report.json', JSON.stringify({...report, demo: isDemo}, null, 2), 'application/json');
$('#export-html').onclick = () => report && exportHtml();
document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); analyze(); } });
try { const theme = localStorage.getItem('codescope-theme'); if (['light','dark'].includes(theme)) document.documentElement.dataset.theme = theme; } catch { /* Хранилище может быть недоступно в приватном режиме. */ }
$('#theme').onclick = () => {
  const current = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next;
  try { localStorage.setItem('codescope-theme', next); } catch { /* Тема работает и без сохранения настройки. */ }
};
if (isDemo) {
  $('#demo-notice').hidden = false; $('#mode-label').textContent = 'ДЕМОНСТРАЦИЯ / ГОТОВЫЕ ПРИМЕРЫ';
  fetch('static/demo-reports.json').then(response => { if (!response.ok) throw new Error('Demo unavailable'); return response.json(); }).then(payload => { fixtures = payload; }).catch(() => showError('Не удалось загрузить демонстрационные отчёты. Локальная версия работает отдельно.'));
}
renderEditor();
