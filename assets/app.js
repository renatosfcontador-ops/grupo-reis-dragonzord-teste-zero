'use strict';

const LS_REPORTS = 'dragonzord_reports_v1';
const LS_OVERRIDES = 'dragonzord_overrides_v1';
const LS_ESTALEIRO = 'dragonzord_estaleiro_v1';
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
  estaleiroSelected: new Set(),
  estaleiroQuery: '',
  estaleiroBuilds: [],
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

function complianceLabel(value) {
  return {
    green: 'Verde',
    yellow: 'Amarelo',
    red: 'Vermelho',
  }[value] || String(value || 'pendente');
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
  const complianceBadge = project.compliance
    ? `<span class="compliance-badge ${escapeHtml(project.compliance)}" title="${escapeHtml(project.complianceNote || '')}"><span class="compliance-dot ${escapeHtml(project.compliance)}"></span>${escapeHtml(complianceLabel(project.compliance))}</span>`
    : '';
  const videoButton = project.videoUrl
    ? `<a class="btn btn-ghost" href="${escapeHtml(project.videoUrl)}" target="_blank" rel="noopener noreferrer" title="Buscar vídeo de referência">Vídeo</a>`
    : '';

  const fe = frontendOf(project);
  let primaryAction;
  if (fe.hasUI && fe.localUrl) {
    primaryAction = `<a class="btn btn-primary" href="${escapeHtml(fe.localUrl)}" target="_blank" rel="noopener noreferrer">Abrir interface</a>`;
  } else if (fe.hasUI) {
    primaryAction = `<button class="btn btn-primary" data-action="test" data-id="${escapeHtml(project.id)}">Como executar</button>`;
  } else {
    primaryAction = `<span class="no-ui-badge" title="${escapeHtml(fe.note)}"><span class="no-ui-dot" aria-hidden="true"></span>Sem interface web nativa</span>`;
  }
  const showDetails = !(fe.hasUI && !fe.localUrl);

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
        ${complianceBadge}
        ${tags}
      </div>
      <div class="card-actions">
        ${primaryAction}
        ${showDetails ? `<button class="btn btn-ghost" data-action="test" data-id="${escapeHtml(project.id)}">Detalhes</button>` : ''}
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

const FRONTEND_LABELS = {
  web: 'Interface web',
  desktop: 'Aplicativo desktop',
  extension: 'Extensão de navegador',
  cli: 'Linha de comando',
  library: 'Biblioteca / API',
};

function frontendOf(project) {
  const raw = project.frontend || {};
  const kind = raw.kind || (raw.hasUI ? 'web' : 'library');
  const hasUI = Boolean(raw.hasUI);
  return {
    hasUI,
    kind,
    label: raw.label || FRONTEND_LABELS[kind] || 'Interface',
    localUrl: raw.localUrl || null,
    runCommand: raw.runCommand || '',
    note: raw.note || (hasUI
      ? 'Interface disponível após executar o projeto localmente.'
      : 'Este repositório não possui front-end nativo.'),
  };
}

function frontendBlockTemplate(project) {
  const fe = frontendOf(project);

  if (!fe.hasUI) {
    return `<div class="fe-block is-backend">
      <div class="fe-head">
        <span class="fe-dot" aria-hidden="true"></span>
        <strong>Repositório Backend — Sem Interface Web Nativa</strong>
      </div>
      <p>${escapeHtml(fe.note)}</p>
      ${fe.runCommand ? `<div class="fe-cmd"><span>Uso</span><code>${escapeHtml(fe.runCommand)}</code></div>` : ''}
    </div>`;
  }

  const action = fe.localUrl
    ? `<a class="btn btn-primary" href="${escapeHtml(fe.localUrl)}" target="_blank" rel="noopener noreferrer">Abrir interface local</a>`
    : `<span class="badge-soft">Requer execução local</span>`;

  return `<div class="fe-block is-ui">
    <div class="fe-head">
      <span class="fe-dot" aria-hidden="true"></span>
      <strong>${escapeHtml(fe.label)}</strong>
      ${fe.localUrl ? `<code class="fe-url">${escapeHtml(fe.localUrl)}</code>` : ''}
    </div>
    ${fe.runCommand ? `<div class="fe-cmd"><span>Comando</span><code>${escapeHtml(fe.runCommand)}</code></div>` : ''}
    ${fe.note ? `<p>${escapeHtml(fe.note)}</p>` : ''}
    <div class="fe-actions">${action}</div>
  </div>`;
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

  const fe = frontendOf(project);
  const frontendBlock = $('#modal-frontend');
  if (frontendBlock) frontendBlock.innerHTML = frontendBlockTemplate(project);

  $('#modal-links').innerHTML = [
    linkRow('Repositório (cordão umbilical)', project.repoUrl, Boolean(project.repoUrl)),
    linkRow('Vídeo de referência (YouTube)', project.videoUrl, Boolean(project.videoUrl)),
    linkRow('Notebook / busca Kaggle', kaggleUrl, true),
  ].join('');

  const main = $('#modal-open-main');
  main.classList.remove('is-disabled');
  if (fe.localUrl) {
    main.href = fe.localUrl;
    main.textContent = 'Abrir interface local';
  } else if (project.repoUrl) {
    main.href = project.repoUrl;
    main.textContent = 'Abrir repositório';
  } else {
    main.href = '#';
    main.textContent = 'Sem interface';
    main.classList.add('is-disabled');
  }
  main.classList.toggle('btn-primary', Boolean(fe.localUrl || project.repoUrl));

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

function complianceConfig() {
  return state.catalog.compliance || {
    green: {
      label: 'Sinal Verde',
      title: '100% liberado',
      meaning: 'Licenças permissivas abertas (MIT, Apache 2.0, BSD).',
      action: 'Comercialização livre, alteração de marca, templates e empacotamento completo.',
    },
    yellow: {
      label: 'Sinal Amarelo',
      title: 'Permitido com ressalvas',
      meaning: 'Licenças que exigem créditos, restrições a fins não comerciais ou copyleft moderado.',
      action: 'Comercialização permitida com atribuição obrigatória e verificação de uso.',
    },
    red: {
      label: 'Sinal Vermelho',
      title: 'Proibido para comercialização direta',
      meaning: 'Repositórios restritos à pesquisa, uso pessoal ou com patentes fechadas.',
      action: 'Uso restrito a homologação interna no Kaggle Sandbox e testes de bancada.',
    },
  };
}

function renderCompliance() {
  const counters = $('#compliance-counters');
  const cards = $('#compliance-cards');
  const body = $('#compliance-body');
  if (!counters || !cards || !body) return;

  const config = complianceConfig();
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const project of state.catalog.projects) {
    if (counts[project.compliance] !== undefined) counts[project.compliance] += 1;
  }

  counters.innerHTML = ['green', 'yellow', 'red'].map((key) => `
    <div class="compliance-counter ${key}">
      <strong>${counts[key]}</strong>
      <span>${escapeHtml(config[key].label)}</span>
    </div>`).join('');

  cards.innerHTML = ['green', 'yellow', 'red'].map((key) => {
    const item = config[key];
    const names = state.catalog.projects
      .filter((project) => project.compliance === key)
      .map((project) => project.name);
    return `<article class="compliance-card ${key}">
      <h3><span class="compliance-dot ${key}"></span>${escapeHtml(item.label)} · ${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.meaning)}</p>
      <p><strong>Ação:</strong> ${escapeHtml(item.action)}</p>
      <ul>${names.map((name) => `<li>${escapeHtml(name)}</li>`).join('')}</ul>
    </article>`;
  }).join('');

  body.innerHTML = state.catalog.projects.map((project) => {
    const compliance = project.compliance || 'yellow';
    return `<tr>
      <td>#${String(project.id).padStart(2, '0')}</td>
      <td>${escapeHtml(project.name)}</td>
      <td>${escapeHtml(categoryById(project.category).short)}</td>
      <td>${escapeHtml(project.license || '-')}</td>
      <td><span class="compliance-badge ${compliance}"><span class="compliance-dot ${compliance}"></span>${escapeHtml(complianceLabel(compliance))}</span></td>
      <td>${escapeHtml(project.complianceNote || '-')}</td>
    </tr>`;
  }).join('');
}

function updateEstaleiroCount() {
  const element = $('#estaleiro-count');
  if (element) element.textContent = `${state.estaleiroSelected.size} selecionado(s)`;
}

function renderEstaleiroModules() {
  const wrap = $('#estaleiro-modules');
  if (!wrap) return;
  const query = state.estaleiroQuery.trim().toLowerCase();
  const list = state.catalog.projects.filter((project) => {
    if (!query) return true;
    return [
      project.name,
      project.description,
      project.license,
      categoryById(project.category).short,
    ].join(' ').toLowerCase().includes(query);
  });

  wrap.innerHTML = list.length ? list.map((project) => {
    const checked = state.estaleiroSelected.has(String(project.id)) ? 'checked' : '';
    return `<label class="estaleiro-module">
      <input type="checkbox" data-module-id="${escapeHtml(project.id)}" ${checked} />
      <span class="estaleiro-module-main">
        <span class="estaleiro-module-name">#${String(project.id).padStart(2, '0')} · ${escapeHtml(project.name)}</span>
        <span class="estaleiro-module-meta">${escapeHtml(categoryById(project.category).short)} · ${escapeHtml(project.license || 'licença não informada')}</span>
      </span>
    </label>`;
  }).join('') : '<p class="empty">Nenhum módulo encontrado.</p>';

  $$('#estaleiro-modules [data-module-id]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.moduleId;
      if (input.checked) state.estaleiroSelected.add(id);
      else state.estaleiroSelected.delete(id);
      renderEstaleiroSelected();
      updateEstaleiroCount();
    });
  });
  updateEstaleiroCount();
}

function renderEstaleiroSelected() {
  const wrap = $('#estaleiro-selected');
  if (!wrap) return;
  const selected = state.catalog.projects.filter((project) => state.estaleiroSelected.has(String(project.id)));
  wrap.innerHTML = selected.length
    ? selected.map((project) => `<span class="estaleiro-chip">#${String(project.id).padStart(2, '0')} ${escapeHtml(project.name)}<button type="button" data-remove-module="${escapeHtml(project.id)}" aria-label="Remover módulo">×</button></span>`).join('')
    : '<span class="hint">Nenhum módulo selecionado.</span>';

  $$('#estaleiro-selected [data-remove-module]').forEach((button) => {
    button.addEventListener('click', () => {
      state.estaleiroSelected.delete(button.dataset.removeModule);
      renderEstaleiroModules();
      renderEstaleiroSelected();
    });
  });
  updateEstaleiroCount();
}

function renderEstaleiroBuilds() {
  const wrap = $('#estaleiro-builds');
  const empty = $('#estaleiro-builds-empty');
  const count = $('#estaleiro-build-count');
  if (!wrap) return;
  if (count) count.textContent = String(state.estaleiroBuilds.length);

  if (!state.estaleiroBuilds.length) {
    wrap.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  wrap.innerHTML = state.estaleiroBuilds.map((build) => {
    const modules = Array.isArray(build.projectIds) ? build.projectIds : [];
    return `<article class="estaleiro-build">
      <div class="estaleiro-build-head">
        <div>
          <h3>${escapeHtml(build.name)}</h3>
          <p>${escapeHtml(build.objective || 'Sem objetivo definido.')}</p>
        </div>
        <span class="badge-soft">${modules.length} módulo(s)</span>
      </div>
      <p>${escapeHtml(build.notes || '')}</p>
      <div class="estaleiro-build-actions">
        <button type="button" class="btn btn-ghost" data-load-build="${escapeHtml(build.id)}">Carregar</button>
        <button type="button" class="btn btn-ghost" data-export-build="${escapeHtml(build.id)}">Exportar</button>
        <button type="button" class="btn btn-ghost" data-delete-build="${escapeHtml(build.id)}">Excluir</button>
      </div>
    </article>`;
  }).join('');

  $$('#estaleiro-builds [data-load-build]').forEach((button) => {
    button.addEventListener('click', () => loadBuild(button.dataset.loadBuild));
  });
  $$('#estaleiro-builds [data-export-build]').forEach((button) => {
    button.addEventListener('click', () => exportBuildById(button.dataset.exportBuild));
  });
  $$('#estaleiro-builds [data-delete-build]').forEach((button) => {
    button.addEventListener('click', () => deleteBuild(button.dataset.deleteBuild));
  });
}

function renderEstaleiro() {
  renderEstaleiroModules();
  renderEstaleiroSelected();
  renderEstaleiroBuilds();
}

function currentBuildDraft() {
  return {
    name: $('#build-name')?.value.trim() || '',
    objective: $('#build-objective')?.value.trim() || '',
    notes: $('#build-notes')?.value.trim() || '',
    projectIds: Array.from(state.estaleiroSelected),
  };
}

function saveBuild() {
  const draft = currentBuildDraft();
  if (!draft.name) { alert('Dê um nome ao produto.'); return; }
  if (!draft.projectIds.length) { alert('Selecione ao menos um módulo.'); return; }
  const build = {
    ...draft,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  state.estaleiroBuilds.unshift(build);
  writeLocal(LS_ESTALEIRO, state.estaleiroBuilds);
  clearBuild();
  renderEstaleiroBuilds();
  alert('Produto salvo no estaleiro.');
}

function exportBuildById(id) {
  const build = state.estaleiroBuilds.find((item) => String(item.id) === String(id));
  if (build) downloadJson(`estaleiro-${build.name}.json`, build);
}

function deleteBuild(id) {
  if (!window.confirm('Excluir este produto do estaleiro?')) return;
  state.estaleiroBuilds = state.estaleiroBuilds.filter((build) => String(build.id) !== String(id));
  writeLocal(LS_ESTALEIRO, state.estaleiroBuilds);
  renderEstaleiroBuilds();
}

function loadBuild(id) {
  const build = state.estaleiroBuilds.find((item) => String(item.id) === String(id));
  if (!build) return;
  state.estaleiroSelected = new Set((build.projectIds || []).map(String));
  if ($('#build-name')) $('#build-name').value = build.name || '';
  if ($('#build-objective')) $('#build-objective').value = build.objective || '';
  if ($('#build-notes')) $('#build-notes').value = build.notes || '';
  renderEstaleiroModules();
  renderEstaleiroSelected();
}

function clearBuild() {
  state.estaleiroSelected.clear();
  if ($('#build-name')) $('#build-name').value = '';
  if ($('#build-objective')) $('#build-objective').value = '';
  if ($('#build-notes')) $('#build-notes').value = '';
  renderEstaleiroModules();
  renderEstaleiroSelected();
}

function exportCurrentBuild() {
  const draft = currentBuildDraft();
  if (!draft.name) { alert('Dê um nome ao produto antes de exportar.'); return; }
  if (!draft.projectIds.length) { alert('Selecione ao menos um módulo.'); return; }
  downloadJson(`estaleiro-${draft.name}.json`, {
    ...draft,
    exportedAt: new Date().toISOString(),
    modules: state.catalog.projects
      .filter((project) => state.estaleiroSelected.has(String(project.id)))
      .map((project) => ({
        id: project.id,
        name: project.name,
        category: project.category,
        repoUrl: project.repoUrl,
        license: project.license || null,
        compliance: project.compliance || null,
      })),
  });
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
  if (view === 'compliance') renderCompliance();
  if (view === 'estaleiro') renderEstaleiro();
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
  $('#logout-button')?.addEventListener('click', logout);
  $('#export-compliance')?.addEventListener('click', () => {
    downloadJson('dragonzord-compliance.json', {
      exportedAt: new Date().toISOString(),
      rules: state.catalog.compliance || {},
      projects: state.catalog.projects.map((project) => ({
        id: project.id,
        name: project.name,
        category: project.category,
        license: project.license || null,
        compliance: project.compliance || null,
        complianceNote: project.complianceNote || '',
      })),
    });
  });
  $('#estaleiro-search')?.addEventListener('input', (event) => {
    state.estaleiroQuery = event.target.value;
    renderEstaleiroModules();
  });
  $('#save-build')?.addEventListener('click', saveBuild);
  $('#export-build')?.addEventListener('click', exportCurrentBuild);
  $('#clear-build')?.addEventListener('click', clearBuild);

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

const AUTH_KEY = 'dragonzord_auth';
const AUTH_EMAIL = 'renato.sf.contador@gmail.com';
const AUTH_PASSWORD_HASH = 'e86f78a8a3caf0b60d8e74e5942aa6d86dc150cd3c03338aef25b7d2d7e3acc7';
let appStarted = false;

function hasSession() {
  try {
    return localStorage.getItem(AUTH_KEY) === 'true';
  } catch {
    return false;
  }
}

function setSession() {
  try {
    localStorage.setItem(AUTH_KEY, 'true');
  } catch {
    /* storage unavailable */
  }
}

function clearSession() {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function showLogin() {
  const overlay = $('#login-overlay');
  const app = $('#app-container');
  if (overlay) overlay.hidden = false;
  if (app) app.hidden = true;
  document.body.classList.add('auth-locked');
  const error = $('#login-error');
  if (error) error.hidden = true;
  const password = $('#login-password');
  if (password) password.value = '';
  setTimeout(() => $('#login-email')?.focus(), 60);
}

function enterApp() {
  const overlay = $('#login-overlay');
  const app = $('#app-container');
  if (overlay) overlay.hidden = true;
  if (app) app.hidden = false;
  document.body.classList.remove('auth-locked');
}

function logout() {
  clearSession();
  if (!$('#modal').hidden) closeModal();
  showLogin();
  window.scrollTo(0, 0);
}

async function bindAuthEvents() {
  const form = $('#login-form');
  if (!form) return;

  $('#toggle-password')?.addEventListener('click', () => {
    const input = $('#login-password');
    const toggle = $('#toggle-password');
    if (!input || !toggle) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('#login-email').value.trim().toLowerCase();
    const password = $('#login-password').value;
    const error = $('#login-error');
    const button = $('#login-submit');

    error.hidden = true;
    if (!email || !password) {
      error.textContent = 'Informe e-mail e senha para continuar.';
      error.hidden = false;
      return;
    }

    button.disabled = true;
    button.textContent = 'Validando...';
    try {
      const hash = await sha256(password);
      if (email === AUTH_EMAIL && hash === AUTH_PASSWORD_HASH) {
        setSession();
        $('#login-password').value = '';
        enterApp();
        startApp();
      } else {
        error.textContent = 'Credenciais inválidas. Verifique o e-mail e a senha.';
        error.hidden = false;
        const card = $('.login-card');
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
      }
    } catch {
      error.textContent = 'Não foi possível validar a sessão neste navegador.';
      error.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar no Sistema';
    }
  });
}

async function startApp() {
  if (appStarted) return;
  appStarted = true;
  await init();
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
  state.estaleiroBuilds = readLocal(LS_ESTALEIRO, []);

  renderStats();
  renderFilters();
  renderGrid();
  renderProjectOptions();
  renderReports();
  renderCompliance();
  renderEstaleiro();
  renderKaggleProjectList();
  $('#footer-env').textContent = state.api
    ? 'servidor local ativo · relatórios persistentes'
    : 'sem servidor · localStorage';
}

async function bootstrap() {
  await bindAuthEvents();
  if (hasSession()) {
    enterApp();
    startApp();
  } else {
    showLogin();
  }
}

bootstrap();