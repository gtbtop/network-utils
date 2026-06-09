const API = window.location.origin;
const STORAGE_KEY = 'speedtest_history';
const MAX_HISTORY = 5;

const gaugeValue = document.getElementById('gauge-value');
const gaugeFill = document.getElementById('gauge-fill');
const phaseEl = document.getElementById('phase');
const progressFill = document.getElementById('progress-fill');
const progressLbl = document.getElementById('progress-lbl');
const startBtn = document.getElementById('start-btn');
const statDl = document.getElementById('stat-dl');
const statUl = document.getElementById('stat-ul');
const statLat = document.getElementById('stat-lat');
const historyBody = document.getElementById('history-body');


const RADIUS = 80;
const CIRC = 2 * Math.PI * RADIUS;
gaugeFill.setAttribute('stroke-dasharray', CIRC);
gaugeFill.setAttribute('stroke-dashoffset', CIRC);

// Обновление состояния спидометра
function setGauge(mbps) {
  const pct = Math.min(mbps / 1000, 1);
  gaugeFill.setAttribute('stroke-dashoffset', CIRC * (1 - pct));
  gaugeValue.textContent = mbps >= 100
    ? mbps.toFixed(0)
    : mbps >= 10
    ? mbps.toFixed(1)
    : mbps.toFixed(2);
}

function setPhase(msg) { phaseEl.textContent = msg; }

function setProgress(pct, label) {
  progressFill.style.width = pct + '%';
  progressLbl.textContent = label;
}


// Загружает историю из localStorage
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

// Сохранение в историю нового результата
function saveResult(dl, ul, lat) {
  const history = loadHistory();
  history.unshift({
    time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    date: new Date().toLocaleDateString(),
    dl, ul, lat,
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

// Отрисовка таблицы истории
function renderHistory() {
  const history = loadHistory();
  if (!history.length) {
    historyBody.innerHTML = '<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:16px">Нет результатов</td></tr>';
    return;
  }
  historyBody.innerHTML = history.map(r => `
    <tr>
    <td title="${r.date}">${r.time}</td>
    <td><span class="badge badge-dl">${r.dl.toFixed(1)} Mbps</span></td>
    <td><span class="badge badge-ul">${r.ul.toFixed(1)} Mbps</span></td>
    <td><span class="badge badge-lat">${r.lat.toFixed(1)} ms</span></td>
    </tr>
  `).join('');
}

// Задержка
// Отправляет =samples запросов к /api/ping и возвращает среднее время ответа, отсекая 20% выбросов
async function measureLatency(samples = 10) {
  const rtts = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    await fetch(`${API}/api/ping`, { cache: 'no-store' });
    rtts.push(performance.now() - t0);
  }
  rtts.sort((a, b) => a - b);
  const trimmed = rtts.slice(0, Math.ceil(samples * 0.8));
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}


// Загрузка
// Сначала скачивает 1 МБ для разогрева TCP-соединения (без замера),
// Затем скачивает 25 МБ и читает чанками
// После каждого чанка пересчитывает скорость и обновляет спидометр
async function measureDownload() {
  await fetch(`${API}/api/download/1mb`, { cache: 'no-store' });

  const BYTES = 25 * 1024 * 1024;
  const t0 = performance.now();
  const res = await fetch(`${API}/api/download/25mb`, { cache: 'no-store' });
  const reader = res.body.getReader();
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    const elapsed = (performance.now() - t0) / 1000;
    const mbps = (received * 8) / (elapsed * 1e6);
    setGauge(mbps);
    setProgress((received / BYTES) * 100, `${received >> 20} / 25 MB`);
  }

  const elapsed = (performance.now() - t0) / 1000;
  return (received * 8) / (elapsed * 1e6);
}

// Отдача
// Генерирует 10 МБ случайных байт и отправляет их на сервер с помощью XMLHttpRequest
async function measureUpload() {
  const BYTES = 10 * 1024 * 1024;
  const blob = new Uint8Array(BYTES);
  const CHUNK = 65536;
  for (let offset = 0; offset < BYTES; offset += CHUNK) {
    crypto.getRandomValues(blob.subarray(offset, offset + CHUNK));
  }

  const t0 = performance.now();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/api/upload`);

    // Вызывается по мере отправки
    xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const elapsed = (performance.now() - t0) / 1000;
    const mbps = (e.loaded * 8) / (elapsed * 1e6);
    setGauge(mbps);
    setProgress((e.loaded / BYTES) * 100, `${(e.loaded >> 20)} / 10 MB`);
  };

    // Вызывается после ответа сервера
    xhr.onload = () => {
    const elapsed = (performance.now() - t0) / 1000;
    resolve((BYTES * 8) / (elapsed * 1e6));
  };

    xhr.onerror = reject;
    xhr.send(blob);
  });
}


// Задержка -> загрузка -> отдача
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  statDl.textContent = '—';
  statUl.textContent = '—';
  statLat.textContent = '—';
  setGauge(0);
  gaugeFill.style.stroke = 'var(--accent)';

  try {
    setPhase('Измерение задержки…');
    setProgress(0, '');
    const lat = await measureLatency();
    statLat.textContent = lat.toFixed(1) + ' ms';

    setPhase('Тест загрузки…');
    setProgress(0, '');
    const dl = await measureDownload();
    statDl.textContent = dl.toFixed(1) + ' Mbps';
    setGauge(0);

    gaugeFill.style.stroke = 'var(--accent2)';
    setPhase('Тест отдачи…');
    setProgress(0, '');
    const ul = await measureUpload();
    statUl.textContent = ul.toFixed(1) + ' Mbps';

    setPhase('Готово!');
    setProgress(100, '');
    setGauge(ul);

    saveResult(dl, ul, lat);
    renderHistory();
  } catch (err) {
    setPhase('Ошибка: ' + err.message);
    console.error(err);
  } finally {
    startBtn.disabled = false;
  }
});

renderHistory();
