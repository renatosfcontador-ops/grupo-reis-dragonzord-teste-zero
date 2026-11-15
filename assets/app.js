'use strict';

const LS_REPORTS = 'dragonzord_reports_v1';
const LS_OVERRIDES = 'dragonzord_overrides_v1';
const API = {
  health: 'api/health',
  projects: 'api/projects',
  reports: 'api/reports',
  urls: 'api/urls',
};

const state = {
  catalog: { categories: [], projects: [], meta: {} },
  overrides: {},
  reports: [],
  filter: 'all',
  search: '',
  api: false,
  view: 'grid',
  activeProjectId: null,
  embedOpen: false,
  lastFocus: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const VERDICTS = {
  aprovado: 'Aprovado',
  patina: 'Patina',
  reprovado: 'Reprovado',
  pendente: 'Pendente',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function normalizeCatalog(data) {
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const rawProjects = Array.isArray(data.projects) ? data.projects : (Array.isArray(data.agents) ? data.agents : []);
  return {
    ...data,
    categories,
    projects: rawProjects.map((project, index) => ({
      ...project,
      id: project.id ?? index + 1,
      category: project.category || categories[0]?.id || 'other',
      tags: Array.isArray(project.tags) ? project.tags : [],
    })),
  };
}

function categoryById(id) {
  return state.catalog.categories.find((category) => category.id === id) || {
    id,
    label: id,
    short: id,
  };
}

function projectById(id) {
  return state.catalog.projects.find((project) => String(project.id) === String(id)) || null;
}

function kaggleSearchUrl(project) {
  if (project?.kaggleUrl) return project.kaggleUrl;
  const term = project?.name || 'ai agents';
  return `https://www.kaggle.com/search?q=${encodeURIComponent(term)}`;
}

function applyOverrides() {
  const editable = new Set(['repoUrl', 'demoUrl', 'videoUrl', 'kaggleUrl', 'embedUrl', 'embeddable']);
  state.catalog.projects = state.catalog.projects.map((project) => {
    const raw = state.overrides[String(project.id)] || {};
    const override = Object.fromEntries(
      Object.entries(raw).filter(([key]) => editable.has(key))
    );
    return { ...project, ...override };
  });
}

function setConnectionBadge() {
  const badge = $('#conn-badge');
  const label = $('#conn-label');
  if (state.api) {
    badge.classList.add('online');
    label.textContent = 'api online';
  } else {
    badge.classList.remove('online');
    label.textContent = 'modo estático';
  }
  $('#footer-env').textContent = state.api
    ? 'servidor local ativo · relatórios persistentes'
    : 'sem servidor · localStorage';
}

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

async function detectApi() {
  if (!/^https?:$/.test(location.protocol)) return false;
  try {
    const response = await fetch(API.health, { cache: 'no-store' });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

async function loadCatalog() {
  const response = await fetch('projects.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar projects.json');
  return normalizeCatalog(await response.json());
}

async function loadOverrides() {
  if (state.api) {
    try {
      const response = await fetch(API.urls, { cache: 'no-store' });
      if (response.ok) return await response.json();
    } catch {
      /* fallback local */
    }
  }
  return readLocal(LS_OVERRIDES, {});
}

async function saveOverrides(overrides) {
  state.overrides = overrides;
  if (state.api) {
    const response = await fetch(API.urls, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overrides),
    });
    if (!response.ok) throw new Error('Falha ao salvar no servidor');
    return 'server';
  }
  writeLocal(LS_OVERRIDES, overrides);
  return 'local';
}

async function loadReports() {
  if (state.api) {
    try {
      const response = await fetch(API.reports, { cache: 'no-store' });
      if (response.ok) return await response.json();
    } catch {
      /* fallback local */
    }
  }
  return readLocal(LS_REPORTS, []);
}

async function persistReport(report) {
  state.reports.unshift(report);
  if (state.api) {
    try {
      const response = await fetch(API.reports, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (response.ok) {
        const saved = await response.json();
        state.reports = state.reports.map((item) => (item.id === report.id ? saved : item));
        return;
      }
    } catch {
      /* fallback local */
    }
  }
  writeLocal(LS_REPORTS, state.reports);
}

async function deleteReport(id) {
  state.reports = state.reports.filter((report) => String(report.id) !== String(id));
  if (state.api) {
    try {
      await fetch(`${API.reports}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      /* ignore */
    }
  }
  writeLocal(LS_REPORTS, state.reports);
  renderReports();
  renderStats();
  renderGrid();
}

function latestReportFor(projectId) {
  let latest = null;
  for (const report of state.reports) {
    if (String(report.projectId ?? report.agentId ?? '') !== String(projectId)) continue;
    if (!latest || new Date(report.createdAt) > new Date(latest.createdAt)) latest = report;
  }
  return latest;
}

function statusFor(projectId) {
  const report = latestReportFor(projectId);
  if (!report) {
    return { verdict: 'pendente', label: 'Pendente', count: 0 };
  }
  const count = state.reports.filter(
    (item) => String(item.projectId ?? item.agentId ?? '') === String(projectId)
  ).length;
  const verdict = report.verdict || 'pendente';
  return { verdict, label: VERDICTS[verdict] || verdict, count };
}

function renderStats() {
  $('#stat-total').textContent = state.catalog.projects.length;
  $('#stat-cats').textContent = state.catalog.categories.length;
  $('#stat-reports').textContent = state.reports.length;
}

function renderFilters() {
  const wrap = $('#filter-chips');
  const chips = [
    `<button class="chip is-active" data-cat="all">Todos (${state.catalog.projects.length})</button>`,
    ...state.catalog.categories.map((category) => {
      const count = state.catalog.projects.filter((project) => project.category === category.id).length;
      return `<button class="chip" data-cat="${escapeHtml(category.id)}">${escapeHtml(category.short)} (${count})</button>`;
    }),
  ];
  wrap.innerHTML = chips.join('');
  $$('.chip', wrap).forEach((chip) => {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.cat;
      $$('.chip', wrap).forEach((item) => item.classList.toggle('is-active', item === chip));
      renderGrid();
    });
  });
}

function filteredProjects() {
  const query = state.search.trim().toLowerCase();
  return state.catalog.projects.filter((project) => {
    if (state.filter !== 'all' && project.category !== state.filter) return false;
    if (!query) return true;
    const category = categoryById(project.category);
    const haystack = [
      project.name,
      project.description,
      category.label,
      category.short,
      ...(project.tags || []),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

function cardTemplate(project) {
  const category = categoryById(project.category);
  const status = statusFor(project.id);
  const tags = (project.tags || []).slice(0, 3)
    .map((tag) => `<span class="t">${escapeHtml(tag)}</span>`)
    .join('');
  const videoButton = project.videoUrl
    ? `<a class="btn btn-ghost" href="${escapeHtml(project.videoUrl)}" target="_blank" rel="noopener noreferrer" title="Buscar vídeo de referência">Vídeo</a>`
    : '';
  return `
    <article class="card" data-cat="${escapeHtml(project.category)}" data-id="${escapeHtml(project.id)}">
      <div class="card-head">
        <div class="badge-num">#${String(project.id).padStart(2, '0')}</div>
        <div class="card-title">
          <h3>${escapeHtml(project.name)}</h3>
          <span class="cat-label">${escapeHtml(category.label)}</span>
        </div>
        <span class="card-status status ${escapeHtml(status.verdict)}" title="${status.count} relatório(s)">${escapeHtml(status.label)}</span>
      </div>
      <p class="card-desc">${escapeHtml(project.description)}</p>
      <div class="card-tags">
        <span class="tag cat-${escapeHtml(project.category)}">${escapeHtml(category.short)}</span>
        ${tags}
      </div>
      <div class="card-actions">
        <button class="btn btn-primary" data-action="test" data-id="${escapeHtml(project.id)}">Testar interface</button>
        <a class="btn btn-ghost" href="${escapeHtml(project.repoUrl || '#')}" target="_blank" rel="noopener noreferrer">GitHub</a>
        ${videoButton}
      </div>
    </article>`;
}

function renderGrid() {
  const grid = $('#project-grid');
  const list = filteredProjects();
  grid.innerHTML = list.map(cardTemplate).join('');
  $('#grid-empty').hidden = list.length !== 0;

  $$('[data-action="test"]', grid).forEach((button) => {
    button.addEventListener('click', () => openModal(Number(button.dataset.id)));
  });
}

function linkRow(label, url, enabled) {
  if (!enabled || !url) {
    return `<div class="link-row disabled"><span class="lk-name">${escapeHtml(label)}</span><span class="lk-url">não configurado</span></div>`;
  }
  return `<div class="link-row">
      <span class="lk-name">${escapeHtml(label)}</span>
      <span class="lk-url">${escapeHtml(url)}</span>
      <a class="btn btn-ghost" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Abrir</a>
    </div>`;
}

function openModal(projectId) {
  const project = projectById(projectId);
  if (!project) return;

  state.activeProjectId = project.id;
  state.lastFocus = document.activeElement;
  const category = categoryById(project.category);
  const kaggleUrl = kaggleSearchUrl(project);

  $('#modal-num').textContent = `#${String(project.id).padStart(2, '0')}`;
  $('#modal-title').textContent = project.name;
  $('#modal-category').textContent = category.label;
  $('#modal-category').className = `tag cat-${project.category}`;
  $('#modal-desc').textContent = project.description;

  $('#modal-links').innerHTML = [
    linkRow('Repositório (cordão umbilical)', project.repoUrl, Boolean(project.repoUrl)),
    linkRow('Demo / interface web', project.demoUrl, Boolean(project.demoUrl)),
    linkRow('Vídeo de referência (YouTube)', project.videoUrl, Boolean(project.videoUrl)),
    linkRow('Notebook / busca Kaggle', kaggleUrl, true),
  ].join('');

  const main = $('#modal-open-main');
  main.href = project.demoUrl || project.repoUrl || '#';
  main.textContent = project.demoUrl ? 'Abrir interface' : 'Abrir repositório';
  main.classList.toggle('btn-primary', Boolean(project.demoUrl));

  const embedToggle = $('#modal-embed-toggle');
  const embedWrap = $('#modal-embed-wrap');
  const embedFrame = $('#modal-embed');
  state.embedOpen = false;
  embedWrap.hidden = true;
  embedFrame.src = 'about:blank';
  embedToggle.hidden = !project.demoUrl;
  embedToggle.textContent = 'Tentar embed';

  if (project.embeddable && project.embedUrl) {
    state.embedOpen = true;
    embedWrap.hidden = false;
    embedFrame.src = project.embedUrl;
    embedToggle.textContent = 'Ocultar embed';
  }

  $('#modal-log-report').onclick = () => {
    closeModal();
    switchView('reports');
    const select = $('#rep-project');
    if (select) {
      select.value = String(project.id);
      select.focus();
    }
  };

  const modal = $('#modal');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  $('.modal-close').focus();
}

function closeModal() {
  $('#modal').hidden = true;
  $('#modal-embed').src = 'about:blank';
  $('#modal-embed-wrap').hidden = true;
  state.embedOpen = false;
  state.activeProjectId = null;
  document.body.style.overflow = '';
  if (state.lastFocus instanceof HTMLElement) state.lastFocus.focus();
}

function renderProjectOptions() {
  const select = $('#rep-project');
  const current = select.value;
  select.innerHTML = state.catalog.projects
    .map((project) => `<option value="${escapeHtml(project.id)}">#${String(project.id).padStart(2, '0')} — ${escapeHtml(project.name)}</option>`)
    .join('');
  if (current) select.value = current;

  const kaggleSelect = $('#kaggle-project');
  const kaggleCurrent = kaggleSelect.value;
  kaggleSelect.innerHTML = state.catalog.projects
    .map((project) => `<option value="${escapeHtml(project.id)}">#${String(project.id).padStart(2, '0')} — ${escapeHtml(project.name)}</option>`)
    .join('');
  if (kaggleCurrent) kaggleSelect.value = kaggleCurrent;
}

function renderKaggleProjectList() {
  const list = $('#kaggle-project-list');
  list.innerHTML = state.catalog.projects
    .map((project) => {
      const url = kaggleSearchUrl(project);
      return `<div class="kaggle-link-row">
        <span title="${escapeHtml(project.name)}">#${String(project.id).padStart(2, '0')} · ${escapeHtml(project.name)}</span>
        <a class="btn btn-ghost" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Abrir</a>
      </div>`;
    })
    .join('');
}

function renderReports() {
  const body = $('#reports-body');
  const empty = $('#reports-empty');
  if (!state.reports.length) {
    body.innerHTML = '';
    empty.hidden = false;
    $('#stat-reports').textContent = '0';
    return;
  }
  empty.hidden = true;
  const sorted = [...state.reports].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  body.innerHTML = sorted.map((report) => {
    const projectId = report.projectId ?? report.agentId;
    const project = projectById(projectId);
    const name = report.projectName || project?.name || (projectId ? `#${projectId}` : '-');
    const verdict = report.verdict || 'pendente';
    return `<tr>
      <td>${escapeHtml(formatDate(report.createdAt))}</td>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(report.operator || '-')}</td>
      <td><span class="verdict ${escapeHtml(verdict)}">${escapeHtml(VERDICTS[verdict] || verdict)}</span></td>
      <td>${escapeHtml(report.usability ?? 0)}/5</td>
      <td>${escapeHtml(report.notes || '')}</td>
      <td><button class="row-del" data-del="${escapeHtml(report.id)}" title="Excluir" type="button">&times;</button></td>
    </tr>`;
  }).join('');

  $$('#reports-body [data-del]').forEach((button) => {
    button.addEventListener('click', () => {
      if (window.confirm('Excluir este relatório?')) deleteReport(button.dataset.del);
    });
  });
  $('#stat-reports').textContent = String(state.reports.length);
}

function switchView(view) {
  state.view = view;
  $$('.tab').forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  $$('.view').forEach((section) => section.classList.toggle('is-active', section.id === `view-${view}`));
  if (view === 'reports') renderReports();
  if (view === 'kaggle') renderKaggleProjectList();
  if (view === 'settings') $('#overrides-editor').value = JSON.stringify(state.overrides, null, 2);
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(filename, data) {
  downloadFile(filename, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
}

function exportReportsCsv() {
  const header = ['data', 'projeto', 'operador', 'veredito', 'nota', 'observacao'];
  const rows = state.reports.map((report) => {
    const projectId = report.projectId ?? report.agentId;
    const project = projectById(projectId);
    return [
      report.createdAt || '',
      report.projectName || project?.name || projectId || '',
      report.operator || '',
      report.verdict || '',
      report.usability ?? '',
      report.notes || '',
    ];
  });
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  downloadFile('dragonzord-relatorios.csv', `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}

function bindEvents() {
  $('#search-input').addEventListener('input', (event) => {
    state.search = event.target.value;
    renderGrid();
  });

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));

  $$('#modal [data-close]').forEach((element) => element.addEventListener('click', closeModal));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#modal').hidden) closeModal();
    if (event.key === '/' && $('#modal').hidden && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      event.preventDefault();
      $('#search-input').focus();
    }
  });

  $('#modal-embed-toggle').addEventListener('click', () => {
    const project = projectById(state.activeProjectId);
    if (!project) return;
    const wrap = $('#modal-embed-wrap');
    const frame = $('#modal-embed');
    state.embedOpen = !state.embedOpen;
    wrap.hidden = !state.embedOpen;
    frame.src = state.embedOpen ? (project.embedUrl || project.demoUrl) : 'about:blank';
    $('#modal-embed-toggle').textContent = state.embedOpen ? 'Ocultar embed' : 'Tentar embed';
  });

  $('#report-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const projectId = Number(form.projectId.value);
    const project = projectById(projectId);
    const report = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      projectName: project?.name || '',
      operator: form.operator.value.trim(),
      verdict: form.verdict.value,
      usability: Number(form.usability.value) || 0,
      notes: form.notes.value.trim(),
      createdAt: new Date().toISOString(),
    };
    const status = $('#report-form-status');
    status.textContent = 'Salvando...';
    status.classList.remove('err');
    await persistReport(report);
    status.textContent = state.api ? 'Relatório salvo no servidor.' : 'Relatório salvo neste navegador.';
    form.notes.value = '';
    renderReports();
    renderStats();
    renderGrid();
  });

  $('#save-overrides').addEventListener('click', async () => {
    const status = $('#overrides-status');
    try {
      const parsed = JSON.parse($('#overrides-editor').value || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Esperado um objeto JSON');
      await saveOverrides(parsed);
      applyOverrides();
      renderGrid();
      renderFilters();
      renderProjectOptions();
      renderKaggleProjectList();
      status.textContent = state.api ? 'Overrides salvos no servidor.' : 'Overrides salvos neste navegador.';
      status.classList.remove('err');
    } catch (error) {
      status.textContent = `JSON inválido: ${error.message}`;
      status.classList.add('err');
    }
  });

  $('#reload-overrides').addEventListener('click', () => {
    $('#overrides-editor').value = JSON.stringify(state.overrides, null, 2);
  });

  $('#export-reports').addEventListener('click', () => downloadJson('dragonzord-relatorios.json', state.reports));
  $('#export-reports-csv').addEventListener('click', exportReportsCsv);
  $('#export-projects').addEventListener('click', () => downloadJson('projects.json', state.catalog));

  $('#import-projects').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = normalizeCatalog(JSON.parse(reader.result));
        if (!data.projects.length) throw new Error('JSON sem projetos');
        state.catalog = data;
        applyOverrides();
        renderFilters();
        renderGrid();
        renderStats();
        renderProjectOptions();
        renderKaggleProjectList();
        alert('Catálogo importado. Use "Exportar catálogo JSON" para salvar em projects.json.');
      } catch (error) {
        alert(`Falha ao importar: ${error.message}`);
      }
    };
    reader.readAsText(file);
  });

  $('#kaggle-open').addEventListener('click', () => {
    const project = projectById($('#kaggle-project').value);
    if (!project) return;
    window.open(kaggleSearchUrl(project), '_blank', 'noopener,noreferrer');
  });
}

async function init() {
  bindEvents();
  state.api = await detectApi();
  setConnectionBadge();

  try {
    state.catalog = await loadCatalog();
    $('#brand-subtitle').textContent = state.catalog.meta?.subtitle || 'Painel de homologação';
    document.title = `${state.catalog.meta?.project || 'DragonZord'} // Painel de Homologação`;
  } catch (error) {
    $('#project-grid').innerHTML = `<p class="empty">Erro ao carregar projects.json: ${escapeHtml(error.message)}</p>`;
    return;
  }

  state.overrides = await loadOverrides();
  applyOverrides();
  state.reports = await loadReports();
  state.reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  renderStats();
  renderFilters();
  renderGrid();
  renderProjectOptions();
  renderReports();
  renderKaggleProjectList();
  $('#footer-env').textContent = state.api
    ? 'servidor local ativo · relatórios persistentes'
    : 'sem servidor · localStorage';
}

init();