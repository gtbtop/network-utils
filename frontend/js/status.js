const API = window.location.origin;

const urlInput = document.getElementById('url-input');
const checkBtn = document.getElementById('check-btn');
const checkResult = document.getElementById('check-result');

checkBtn.addEventListener('click', async () => {
 const url = urlInput.value.trim();
 if (!url) return;

 checkBtn.disabled = true;
 checkResult.innerHTML = '<span style="color:var(--muted)">Проверка…</span>';

 try {
 const res = await fetch(`${API}/api/uptime/check?url=${encodeURIComponent(url)}`);
 const data = await res.json();

 if (data.error) {
 checkResult.innerHTML = `<span style="color:#ef4444">Ошибка: ${data.error}</span>`;
 return;
 }

 const color = data.up ? 'var(--accent2)' : '#ef4444';
 const status = data.up ? 'UP' : 'DOWN';
 const latency = data.latency_ms != null ? ` · ${data.latency_ms} ms` : '';
 const code = data.status != null ? ` · HTTP ${data.status}` : '';
 const shareUrl = `${window.location.origin}/status.html?url=${encodeURIComponent(url)}`;

 checkResult.innerHTML = `
 <span style="color:${color};font-weight:600">${status}</span>
 <span style="color:var(--muted);font-size:.85rem">${latency}${code}</span>
 <br/>
 <span class="share-link" style="margin-top:6px;display:inline-block">
 Поделиться: <a href="${shareUrl}">${shareUrl}</a>
 </span>`;

 const params = new URLSearchParams(window.location.search);
 params.set('url', url);
 history.replaceState(null, '', '/status.html?' + params.toString());
 } catch (e) {
 checkResult.innerHTML = `<span style="color:#ef4444">Ошибка запроса: ${e.message}</span>`;
 } finally {
 checkBtn.disabled = false;
 }
});

const params = new URLSearchParams(window.location.search);
const siteId = params.get('id');
const checkUrl = params.get('url');

if (checkUrl) {
 urlInput.value = checkUrl;
 checkBtn.click();
}

let detailChart = null;

function fmtTime(ts) {
 return new Date(ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function buildSparkBar(history) {
 return history.slice(-80).map(r => {
 const cls = r.up ? 'up-block' : 'down-block';
 return `<span class="${cls}" title="${fmtTime(r.ts)} — ${r.latency_ms ?? 'timeout'} ms"></span>`;
 }).join('');
}

async function loadSiteDetail(id) {
 document.getElementById('site-detail').style.display = 'block';

 const res = await fetch(`${API}/api/uptime/history/${id}`);
 const data = await res.json();
 const { site, history } = data;

 document.getElementById('detail-name').textContent = site.name;
 document.getElementById('detail-url').textContent = site.url;

 const shareUrl = `${window.location.origin}/status.html?id=${id}`;
 document.getElementById('share-link-el').href = shareUrl;
 document.getElementById('share-link-el').textContent = shareUrl;

 if (!history.length) {
 document.getElementById('detail-status').textContent = 'Данных пока нет';
 return;
 }

 const latest = history[history.length - 1];
 const upCount = history.filter(r => r.up).length;
 const upPct = (upCount / history.length * 100).toFixed(1);
 const latencies = history.filter(r => r.latency_ms != null).map(r => r.latency_ms);
 const avgLat = latencies.length
 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
 : null;

 const dotEl = document.getElementById('detail-dot');
 dotEl.className = 'dot ' + (latest.up ? 'dot-up' : 'dot-down');

 const statusEl = document.getElementById('detail-status');
 statusEl.textContent = latest.up ? `UP · ${latest.latency_ms ?? '—'} ms` : 'DOWN';
 statusEl.className = 'status-big ' + (latest.up ? 'status-up' : 'status-down');

 document.getElementById('detail-uptime').textContent = upPct + '%';
 document.getElementById('detail-avg').textContent = avgLat != null ? avgLat + ' ms' : '—';
 document.getElementById('detail-checks').textContent = history.length;
 document.getElementById('detail-bar').innerHTML = buildSparkBar(history);

 const labels = history.map(r => fmtTime(r.ts));
 const latData = history.map(r => r.latency_ms);
 const ptColors = history.map(r => r.up ? '#34d399' : '#ef4444');

 if (!detailChart) {
 const ctx = document.getElementById('detail-chart').getContext('2d');
 detailChart = new Chart(ctx, {
 type: 'line',
 data: {
 labels,
 datasets: [{
 data: latData,
 borderColor: '#4f8ef7',
 borderWidth: 2,
 pointBackgroundColor: ptColors,
 pointRadius: 3,
 fill: true,
 backgroundColor: 'rgba(79,142,247,0.08)',
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
 tooltip: { callbacks: { label: ctx => ctx.raw != null ? ctx.raw + ' ms' : 'timeout' } },
 },
 scales: {
 x: { display: false },
 y: {
 min: 0,
 ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 5 },
 grid: { color: '#1e2130' },
 },
 },
 },
 });
 } else {
 detailChart.data.labels = labels;
 detailChart.data.datasets[0].data = latData;
 detailChart.data.datasets[0].pointBackgroundColor = ptColors;
 detailChart.update('none');
 }
}

if (siteId) {
 loadSiteDetail(siteId);
 setInterval(() => loadSiteDetail(siteId), 30_000);
}
