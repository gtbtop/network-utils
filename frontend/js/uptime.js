const API = window.location.origin;
const REFRESH_MS = 30_000;
const MAX_HISTORY = 240;
const CUSTOM_SITES_KEY = 'uptime_custom_sites';
const CUSTOM_HISTORY_KEY = 'uptime_custom_history';

const sitesList = document.getElementById('sites-list');
const lastUpdated = document.getElementById('last-updated');
const customGrid = document.getElementById('custom-sites-grid');
const customInput = document.getElementById('custom-url-input');
const customAddBtn = document.getElementById('custom-add-btn');

const charts = {};

const fmtLatency = ms => ms == null ? '—' : ms + ' ms';
const fmtUptime = pct => pct == null ? '—' : pct + '%';
const fmtTime = ts => new Date(ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function buildSparkBar(history) {
 return history.slice(-60).map(r => {
 const cls = r.up ? 'up-block' : 'down-block';
 const lat = r.latency_ms != null ? r.latency_ms + ' ms' : 'timeout';
 return `<span class="${cls}" title="${fmtTime(r.ts)} — ${lat}"></span>`;
 }).join('');
}

function buildChart(canvasId, history) {
 const ctx = document.getElementById(canvasId)?.getContext('2d');
 if (!ctx) return null;
 return new Chart(ctx, {
 type: 'line',
 data: {
 labels: history.map(r => fmtTime(r.ts)),
 datasets: [{
 data: history.map(r => r.latency_ms),
 borderColor: '#4f8ef7',
 borderWidth: 1.5,
 pointBackgroundColor: history.map(r => r.up ? '#34d399' : '#ef4444'),
 pointRadius: 2,
 fill: true,
 backgroundColor: 'rgba(79,142,247,0.06)',
 tension: 0.3,
 spanGaps: true,
 }],
 },
 options: {
 responsive: true,
 maintainAspectRatio: false,
 animation: false,
 plugins: {
 legend: { display: false },
 tooltip: { callbacks: { label: c => c.raw != null ? c.raw + ' ms' : 'timeout' } },
 },
 scales: {
 x: { display: false },
 y: {
 min: 0,
 ticks: { color: '#64748b', font: { size: 10 }, maxTicksLimit: 4 },
 grid: { color: '#1e2130' },
 },
 },
 },
 });
}

function updateChart(chart, history) {
 chart.data.labels = history.map(r => fmtTime(r.ts));
 chart.data.datasets[0].data = history.map(r => r.latency_ms);
 chart.data.datasets[0].pointBackgroundColor = history.map(r => r.up ? '#34d399' : '#ef4444');
 chart.update('none');
}

function siteCardHTML({ id, name, url, latest, uptime_pct, detailHref, removable }) {
 const dotCls = !latest ? 'dot-unknown' : latest.up ? 'dot-up' : 'dot-down';
 const statusTxt = !latest ? 'Проверка…' : latest.up ? `UP · ${fmtLatency(latest.latency_ms)}` : 'DOWN';
 return `
 <div class="site-card" id="card-${id}">
 <div class="site-header">
 <div class="dot ${dotCls}" id="dot-${id}"></div>
 <div style="flex:1;min-width:0">
 <div class="site-name">${name}</div>
 <div class="site-url" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${url}</div>
 </div>
 ${detailHref ? `<a href="${detailHref}" style="margin-left:8px;font-size:.8rem;color:var(--accent);text-decoration:none;white-space:nowrap">Подробнее →</a>` : ''}
 ${removable ? `<button onclick="removeCustomSite('${id}')" style="margin-left:8px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;line-height:1" title="Удалить">✕</button>` : ''}
 </div>
 <div class="site-meta">
 <div>Статус: <strong id="status-${id}">${statusTxt}</strong></div>
 <div>Аптайм: <strong id="uptime-${id}">${fmtUptime(uptime_pct)}</strong></div>
 <div>Проверок: <strong id="checks-${id}">—</strong></div>
 </div>
 <div class="uptime-bar" id="bar-${id}" style="margin-bottom:12px"></div>
 <div class="chart-wrap"><canvas id="chart-${id}"></canvas></div>
 </div>`;
}

function updateCardDOM(id, latest, uptime_pct, history) {
 const dotEl = document.getElementById(`dot-${id}`);
 const statusEl = document.getElementById(`status-${id}`);
 const uptimeEl = document.getElementById(`uptime-${id}`);
 const checksEl = document.getElementById(`checks-${id}`);
 const barEl = document.getElementById(`bar-${id}`);
 if (!dotEl) return;

 dotEl.className = 'dot ' + (!latest ? 'dot-unknown' : latest.up ? 'dot-up' : 'dot-down');
 statusEl.textContent = !latest ? 'Проверка…' : latest.up ? `UP · ${fmtLatency(latest.latency_ms)}` : 'DOWN';
 uptimeEl.textContent = fmtUptime(uptime_pct);
 if (checksEl) checksEl.textContent = history?.length ?? '—';
 if (barEl && history) barEl.innerHTML = buildSparkBar(history);

 if (history) {
 if (!charts[id]) {
 charts[id] = buildChart(`chart-${id}`, history);
 } else {
 updateChart(charts[id], history);
 }
 }
}

async function refresh() {
 try {
 const sites = await fetch(`${API}/api/uptime/sites`).then(r => r.json());

 if (!sitesList.children.length) {
 sitesList.innerHTML = sites.map(s => siteCardHTML({
 id: s.id, name: s.name, url: s.url,
 latest: s.latest, uptime_pct: s.uptime_pct,
 detailHref: `/status.html?id=${s.id}`,
 })).join('');
 } else {
 sites.forEach(s => updateCardDOM(s.id, s.latest, s.uptime_pct, null));
 }

 const histories = await Promise.all(
 sites.map(s => fetch(`${API}/api/uptime/history/${s.id}`).then(r => r.json()))
 );
 histories.forEach(({ site, history }) => {
 updateCardDOM(site.id, history.at(-1) ?? null,
 history.length ? +(history.filter(r => r.up).length / history.length * 100).toFixed(1) : null,
 history);
 });

 lastUpdated.textContent = 'Обновлено ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
 } catch (e) {
 lastUpdated.textContent = 'Ошибка загрузки данных';
 console.error(e);
 }
}

function loadCustomSites() { try { return JSON.parse(localStorage.getItem(CUSTOM_SITES_KEY) || '[]'); } catch { return []; } }
function loadCustomHistory() { try { return JSON.parse(localStorage.getItem(CUSTOM_HISTORY_KEY) || '{}'); } catch { return {}; } }
function saveCustomSites(list) { localStorage.setItem(CUSTOM_SITES_KEY, JSON.stringify(list)); }
function saveCustomHistory(h) { localStorage.setItem(CUSTOM_HISTORY_KEY, JSON.stringify(h)); }

function customId(url) { return 'c_' + btoa(url).replace(/[^a-zA-Z0-9]/g, ''); }

function renderCustomSites() {
 const sites = loadCustomSites();
 const history = loadCustomHistory();
 if (!sites.length) {
 customGrid.innerHTML = '';
 return;
 }
 sites.forEach(({ id, url }) => {
 const h = history[id] || [];
 const latest = h.at(-1) ?? null;
 const uptime = h.length
 ? +(h.filter(r => r.up).length / h.length * 100).toFixed(1)
 : null;

 if (!document.getElementById(`card-${id}`)) {
 const div = document.createElement('div');
 div.innerHTML = siteCardHTML({ id, name: url, url, latest, uptime_pct: uptime, removable: true });
 customGrid.appendChild(div.firstElementChild);
 } else {
 updateCardDOM(id, latest, uptime, null);
 }
 updateCardDOM(id, latest, uptime, h);
 });
}

async function checkCustomSite({ id, url }) {
 try {
 const result = await fetch(`${API}/api/uptime/check?url=${encodeURIComponent(url)}`).then(r => r.json());
 const history = loadCustomHistory();
 if (!history[id]) history[id] = [];
 history[id].push({ ts: result.ts ?? Date.now() / 1000, up: result.up, latency_ms: result.latency_ms, status: result.status });
 if (history[id].length > MAX_HISTORY) history[id] = history[id].slice(-MAX_HISTORY);
 saveCustomHistory(history);
 renderCustomSites();
 } catch (e) {
 console.error('Custom check failed', url, e);
 }
}

async function refreshCustomSites() {
 const sites = loadCustomSites();
 await Promise.all(sites.map(s => checkCustomSite(s)));
}

window.removeCustomSite = function(id) {
 const sites = loadCustomSites().filter(s => s.id !== id);
 saveCustomSites(sites);
 const history = loadCustomHistory();
 delete history[id];
 saveCustomHistory(history);
 delete charts[id];
 document.getElementById(`card-${id}`)?.remove();
 if (!sites.length) customGrid.innerHTML = '';
};

customAddBtn.addEventListener('click', async () => {
 let url = customInput.value.trim();
 if (!url) return;
 if (!/^https?:\/\//.test(url)) url = 'https://' + url;

 const id = customId(url);
 const sites = loadCustomSites();
 if (sites.find(s => s.id === id)) { customInput.value = ''; return; }

 sites.push({ id, url });
 saveCustomSites(sites);
 customInput.value = '';
 renderCustomSites();
 await checkCustomSite({ id, url });
});

customInput.addEventListener('keydown', e => { if (e.key === 'Enter') customAddBtn.click(); });

refresh();
renderCustomSites();
refreshCustomSites();

setInterval(refresh, REFRESH_MS);
setInterval(refreshCustomSites, REFRESH_MS);
