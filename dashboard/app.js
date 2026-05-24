/* ============================================================
 * 疫情監測儀表板 – Core JS
 * 嚴守 Epidemic Data Visualization Style Guide
 * 主色：Sage Green #739A6D
 * ============================================================ */

/* ── Design Tokens (mirror style.css) ─────────────────────── */
const PALETTE = {
  // Primary scale
  p50:  '#F6F9F6', p100: '#E8EEE7', p200: '#D1DECF', p300: '#B4C9B1',
  p400: '#91B08C', p500: '#739A6D', p600: '#5D7F58', p700: '#496345',
  p800: '#374C34', p900: '#253423',

  // Neutrals
  n100: '#F2F3F1', n200: '#E4E7E4', n300: '#CACFC9',
  n400: '#A2ABA0', n500: '#7A8778', n600: '#5D675B',
  n700: '#444C43', n800: '#2C312B',

  // Categorical (used in order)
  cat: ['#739A6D', '#587A9D', '#C8A041', '#49888D', '#916E46', '#955F71'],

  // Line-safe variants (must be darker than fill — guide §4.2)
  line_primary:  '#5D7F58',   // p-600
  line_mustard:  '#A8821F',
  line_emphasis: '#374C34',   // p-800, MA line

  // Semantic
  success: '#54734F',
  warning: '#D2962D',
  danger:  '#BE373C',
  info:    '#477A9E',
  terracotta: '#B5584A',
  clay:    '#B87B61',
};

/* ── Chart.js global defaults (style guide §7.2) ──────────── */
Chart.defaults.font.family = "'Noto Sans TC', 'IBM Plex Sans', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = PALETTE.n700;
Chart.defaults.borderColor = PALETTE.n200;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(24,27,24,0.92)';
Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 2;
Chart.defaults.plugins.tooltip.boxPadding = 6;
Chart.defaults.layout.padding = { top: 8, right: 4, bottom: 0, left: 4 };

/* ── State ────────────────────────────────────────────────── */
const state = {
  overview: null,
  summaries: {},   // diseaseId -> summary json
  currentDisease: null,
  charts: {},      // keep refs so we can destroy on re-draw
  trendRange: 52,
};

/* ── Util ─────────────────────────────────────────────────── */
const fmt = new Intl.NumberFormat('zh-TW');
const fmtPct = n => (n === null || n === undefined) ? 'N/A' :
                    `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

const ALERT_LABEL = {
  high:   { label: '高度警示', tone: '高' },
  medium: { label: '中度警示', tone: '中' },
  low:    { label: '輕度警示', tone: '低' },
  normal: { label: '正常',     tone: '常' },
};

/* compute trailing 4-week moving average (style guide §4.3) */
function trailingMA(arr, window = 4) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1);
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    out.push(Math.round(mean * 10) / 10);
  }
  return out;
}

/* given an array of "YYYY-Www" strings, return ISO Monday Date objects.
   For year-strings ("2025"), return Jan 1 of that year. */
function periodToDate(period) {
  const yw = /^(\d{4})-W(\d{1,2})$/.exec(period);
  if (yw) {
    const [, y, w] = yw;
    // ISO week 1 Monday calculation
    const jan4 = new Date(Date.UTC(+y, 0, 4));
    const dow = jan4.getUTCDay() || 7;            // 1..7
    const week1Mon = new Date(jan4);
    week1Mon.setUTCDate(jan4.getUTCDate() - dow + 1);
    const target = new Date(week1Mon);
    target.setUTCDate(week1Mon.getUTCDate() + (+w - 1) * 7);
    return target;
  }
  const y = /^(\d{4})$/.exec(period);
  if (y) return new Date(Date.UTC(+y[1], 0, 1));
  return new Date(period);
}

/* ── Bootstrap ────────────────────────────────────────────── */
async function init() {
  try {
    state.overview = await fetchJSON('../data/processed/overview.json');
  } catch (e) {
    showLoadError(e);
    return;
  }

  document.getElementById('generatedAt').textContent =
    `更新時間：${formatDateTime(state.overview.generated_at)}`;

  renderAlertBanner(state.overview.alert_summary);
  renderCards(state.overview.cards);
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

function showLoadError(err) {
  document.getElementById('cardsGrid').innerHTML =
    `<div style="grid-column:1/-1;padding:40px;text-align:center;color:${PALETTE.danger}">
       <strong>資料載入失敗：</strong>${err.message}<br>
       <small style="color:${PALETTE.n500}">請先執行 <code>python pipeline/run_pipeline.py</code> 產生資料</small>
     </div>`;
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* ── Alert Banner ─────────────────────────────────────────── */
function renderAlertBanner(alertSummary) {
  const banner = document.getElementById('alertBanner');
  const high = alertSummary.high || 0;
  const medium = alertSummary.medium || 0;
  if (high === 0 && medium === 0) {
    banner.hidden = true;
    return;
  }
  const parts = [];
  if (high)   parts.push(`<strong>${high}</strong> 種疾病處於高度警示`);
  if (medium) parts.push(`<strong>${medium}</strong> 種疾病處於中度警示`);
  banner.hidden = false;
  banner.querySelector('.wrap').innerHTML = `
    <span class="alert-banner-icon" aria-hidden="true">!</span>
    <span class="alert-banner-text">本週警示：${parts.join('、')}，請密切關注相關防疫措施</span>
  `;
}

/* ── Cards Grid ───────────────────────────────────────────── */
function renderCards(cards) {
  const grid = document.getElementById('cardsGrid');
  grid.innerHTML = cards.map(c => {
    const alert = c.alert_level || 'normal';
    const change = c.change_pct;
    const dir = change > 1 ? 'up' : change < -1 ? 'down' : 'flat';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '◆';

    return `
    <article class="disease-card"
             role="button" tabindex="0"
             data-alert="${alert}"
             data-disease-id="${c.disease_id}"
             onclick="openDetail('${c.disease_id}')"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDetail('${c.disease_id}')}">
      <header class="card-head">
        <div class="card-icon" aria-hidden="true">${c.icon}</div>
        <span class="card-alert-tag" data-alert="${alert}">${ALERT_LABEL[alert]?.label || '—'}</span>
      </header>
      <div>
        <div class="card-name">${c.name_zh}</div>
        <div class="card-name-en">${c.category}</div>
      </div>
      <div class="card-num-row">
        <span class="card-num">${fmt.format(c.latest_cases || 0)}</span>
        <span class="card-num-unit">例 / 週</span>
      </div>
      <div>
        <span class="card-change" data-dir="${dir}">${arrow} ${fmtPct(change)}</span>
        <span style="color:${PALETTE.n500};font-size:11px;margin-left:6px">較前週</span>
      </div>
      <footer class="card-period">
        <span>最新統計週</span>
        <span>${c.latest_period || '—'}</span>
      </footer>
    </article>`;
  }).join('');
}

/* ── Open Detail ──────────────────────────────────────────── */
async function openDetail(diseaseId) {
  if (!state.summaries[diseaseId]) {
    try {
      state.summaries[diseaseId] = await fetchJSON(`../data/processed/${diseaseId}_summary.json`);
    } catch (e) {
      alert(`資料載入失敗：${e.message}`);
      return;
    }
  }
  const s = state.summaries[diseaseId];
  state.currentDisease = diseaseId;

  // Fill header
  document.getElementById('detailCategory').textContent = s.category;
  document.getElementById('detailIcon').textContent = s.icon;
  document.getElementById('detailNameZh').textContent = s.name_zh;
  document.getElementById('detailNameEn').textContent = s.name_en;

  renderKpis(s);

  // Show + scroll
  const detail = document.getElementById('detailSection');
  detail.hidden = false;
  setTimeout(() => detail.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

  // Draw charts
  drawTrendChart(s);
  drawRegionChart(s);
  drawAgeChart(s);
  drawTypeChart(s);

  // Advisory
  const adviceEl = document.getElementById('adviceBody');
  adviceEl.textContent = s.advice || '請依疾管署最新公告為準。';

  // Trend range controls
  document.querySelectorAll('input[name="trendRange"]').forEach(el => {
    el.checked = (+el.value === state.trendRange);
    el.onchange = () => {
      state.trendRange = +el.value;
      drawTrendChart(state.summaries[state.currentDisease]);
    };
  });
}

function closeDetail() {
  document.getElementById('detailSection').hidden = true;
  state.currentDisease = null;
  document.querySelector('.cards-grid').scrollIntoView({ behavior: 'smooth' });
}

/* ── KPI Strip ────────────────────────────────────────────── */
function renderKpis(s) {
  const series = s.weekly_series || [];
  const latest = s.latest_period || {};
  const totalCases = s.total_cases || 0;

  // Calculate change %
  let changePct = null;
  if (series.length >= 2) {
    const cur = series[series.length-1].cases;
    const prev = series[series.length-2].cases;
    if (prev > 0) changePct = (cur - prev) / prev * 100;
  }

  // 4-week trend slope
  let trendArrow = '◆', trendLabel = '持平';
  if (series.length >= 4) {
    const last4 = series.slice(-4).map(r => r.cases);
    const first2 = (last4[0] + last4[1]) / 2;
    const last2  = (last4[2] + last4[3]) / 2;
    if (last2 > first2 * 1.15) { trendArrow = '↗'; trendLabel = '上升'; }
    else if (last2 < first2 * 0.85) { trendArrow = '↘'; trendLabel = '下降'; }
  }

  // Year-over-year same week (52 weeks ago)
  let yoyText = '—';
  if (series.length >= 53) {
    const lastWeek = series[series.length-1].cases;
    const yearAgo = series[series.length-53].cases;
    if (yearAgo > 0) {
      const diff = (lastWeek - yearAgo) / yearAgo * 100;
      yoyText = `${diff > 0 ? '+' : ''}${diff.toFixed(0)}%`;
    } else {
      yoyText = '無對照';
    }
  }

  const alertCfg = ALERT_LABEL[s.alert_level] || { label: '—' };
  const alertColor = {
    high: PALETTE.danger, medium: PALETTE.warning,
    low: PALETTE.clay, normal: PALETTE.success,
  }[s.alert_level] || PALETTE.n500;

  const dirChange = changePct === null ? 'flat' :
                    changePct > 1 ? 'up' : changePct < -1 ? 'down' : 'flat';

  document.getElementById('kpiStrip').innerHTML = `
    <div class="kpi-cell">
      <div class="kpi-label">本週病例</div>
      <div class="kpi-value">${fmt.format(latest.cases || 0)}</div>
      <div class="kpi-sub" data-dir="${dirChange}">
        較前週 ${fmtPct(changePct)}
      </div>
    </div>
    <div class="kpi-cell">
      <div class="kpi-label">與去年同期</div>
      <div class="kpi-value">${yoyText}</div>
      <div class="kpi-sub">同週相較</div>
    </div>
    <div class="kpi-cell">
      <div class="kpi-label">近 4 週走勢</div>
      <div class="kpi-value">${trendArrow} ${trendLabel}</div>
      <div class="kpi-sub">趨勢方向</div>
    </div>
    <div class="kpi-cell">
      <div class="kpi-label">警示等級</div>
      <div class="kpi-value" style="color:${alertColor}">${alertCfg.label}</div>
      <div class="kpi-sub">系統判讀</div>
    </div>
    <div class="kpi-cell">
      <div class="kpi-label">資料庫累計</div>
      <div class="kpi-value">${fmt.format(totalCases)}</div>
      <div class="kpi-sub">總病例數</div>
    </div>
  `;
}

/* ── Chart helpers ────────────────────────────────────────── */
function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

/* axis styling shared by all charts (style guide §4.4) */
const yAxisDefault = {
  beginAtZero: true,
  grid: { color: PALETTE.n200, drawBorder: false },
  ticks: { color: PALETTE.n500, font: { size: 11 } },
  border: { display: false },
};
const xAxisDefault = {
  grid: { display: false },
  ticks: { color: PALETTE.n500, font: { size: 11 }, maxRotation: 0 },
  border: { color: PALETTE.n300 },
};

/* ── Trend Chart: bar (cases) + line (4-week MA) + historical band ── */
function drawTrendChart(s) {
  destroyChart('trend');
  const ctx = document.getElementById('trendChart');

  let series = s.weekly_series || [];

  // year axis: trim to requested range
  if (series.length > state.trendRange) {
    series = series.slice(-state.trendRange);
  }
  if (series.length === 0) return;

  const labels = series.map(r => periodToDate(r.period));
  const cases = series.map(r => r.cases);

  // 4-week trailing MA (weekly data)
  const ma = trailingMA(cases, 4);

  // Year-over-year same-period reference (only if we have ≥ 52 prior weeks)
  const fullSeries = s.weekly_series || [];
  let yoyData = null;
  if (fullSeries.length >= state.trendRange + 52) {
    const startIdx = fullSeries.length - state.trendRange - 52;
    yoyData = fullSeries.slice(startIdx, startIdx + state.trendRange).map(r => r.cases);
  }

  // Alert threshold lines (if defined for this disease via summary metadata)
  // We derive from the JSON's "alert_level"? Actually the registry has thresholds.
  // For now we annotate only via the visible threshold passed in summary.
  // The registry isn't in JSON; we infer reasonable visible threshold by reading
  // s.weekly_series max — but to be faithful, expose via summary if present.
  // (Pipeline doesn't include it now — so we skip the threshold line if absent.)

  const datasets = [
    {
      type: 'bar',
      label: '當週新增病例',
      data: cases,
      backgroundColor: PALETTE.p500,
      borderColor: PALETTE.p600,
      borderWidth: 0,
      barPercentage: 0.75,
      categoryPercentage: 0.9,
      order: 2,
    },
    {
      type: 'line',
      label: '4 週移動平均',
      data: ma,
      borderColor: PALETTE.line_emphasis,
      borderWidth: 2.5,
      tension: 0.35,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: false,
      order: 1,
    },
  ];

  if (yoyData) {
    datasets.push({
      type: 'line',
      label: '去年同期',
      data: yoyData,
      borderColor: PALETTE.n400,
      borderWidth: 1.5,
      borderDash: [4, 4],
      tension: 0.35,
      pointRadius: 0,
      fill: false,
      order: 0,
    });
  }

  // 風格指南 §1.3：不全紅柱，而是用獨立閾值線
  const annotations = {};
  const th = s.alert_thresholds;
  if (th) {
    if (th.medium) {
      annotations.medThresh = {
        type: 'line',
        yMin: th.medium, yMax: th.medium,
        borderColor: PALETTE.warning,
        borderWidth: 1.2,
        borderDash: [6, 4],
        label: {
          content: `中度警示 ${fmt.format(th.medium)}`,
          display: true,
          position: 'end',
          backgroundColor: 'rgba(210,150,45,0.92)',
          color: 'white',
          font: { size: 10, weight: '600' },
          padding: { x: 6, y: 2 },
        },
      };
    }
    if (th.high) {
      annotations.highThresh = {
        type: 'line',
        yMin: th.high, yMax: th.high,
        borderColor: PALETTE.danger,
        borderWidth: 1.2,
        borderDash: [6, 4],
        label: {
          content: `高度警示 ${fmt.format(th.high)}`,
          display: true,
          position: 'end',
          backgroundColor: 'rgba(190,55,60,0.92)',
          color: 'white',
          font: { size: 10, weight: '600' },
          padding: { x: 6, y: 2 },
        },
      };
    }
  }

  state.charts.trend = new Chart(ctx, {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { boxWidth: 10, boxHeight: 10, padding: 14 },
        },
        annotation: { annotations },
        tooltip: {
          callbacks: {
            title: (items) => {
              const d = items[0].parsed.x;
              return periodLabel(s.weekly_series, items[0].dataIndex,
                                 state.trendRange);
            },
            label: (ctx) => `${ctx.dataset.label}：${fmt.format(ctx.parsed.y)} 例`,
          },
        },
      },
      scales: {
        x: {
          ...xAxisDefault,
          type: 'time',
          time: {
            unit: state.trendRange > 60 ? 'month' : 'week',
            displayFormats: { week: 'MM/dd', month: 'yyyy/MM' },
          },
          ticks: {
            ...xAxisDefault.ticks,
            maxTicksLimit: state.trendRange > 60 ? 8 : 10,
          },
        },
        y: { ...yAxisDefault, title: { display: true, text: '病例數',
                                       color: PALETTE.n500, font: { size: 11 } } },
      },
    },
  });
}

function periodLabel(fullSeries, idx, range) {
  // For tooltips, show "2026-W21" plus mapped Monday date
  const startIdx = Math.max(0, fullSeries.length - range);
  const r = fullSeries[startIdx + idx];
  if (!r) return '';
  return r.period;
}

/* ── Region Chart: horizontal bar (style guide §3) ────────── */
function drawRegionChart(s) {
  destroyChart('region');
  const ctx = document.getElementById('regionChart');
  const rows = (s.by_region || []).slice(0, 15);

  if (rows.length === 0) {
    ctx.parentElement.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:${PALETTE.n500};font-size:13px">此資料集無縣市分布資料</div>`;
    return;
  }

  const labels = rows.map(r => r.region);
  const data = rows.map(r => r.cases);
  const max = Math.max(...data);

  // Pattern A: top 3 sage; rest neutral — quick visual hierarchy
  const colors = rows.map((_, i) => i < 3 ? PALETTE.p500 : PALETTE.n400);

  state.charts.region = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '近 4 週累計',
        data,
        backgroundColor: colors,
        borderWidth: 0,
        barPercentage: 0.7,
        categoryPercentage: 0.85,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (c) => `${fmt.format(c.parsed.x)} 例` },
        },
      },
      scales: {
        x: { ...yAxisDefault, suggestedMax: max * 1.1 },
        y: {
          ...xAxisDefault,
          grid: { display: false },
          ticks: { ...xAxisDefault.ticks, font: { size: 12 } },
        },
      },
    },
  });
}

/* ── Age Chart: bar, monochrome scale (ordinal) ──────────── */
function drawAgeChart(s) {
  destroyChart('age');
  const ctx = document.getElementById('ageChart');
  const rows = s.by_age || [];

  if (rows.length === 0) {
    ctx.parentElement.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:${PALETTE.n500};font-size:13px">此資料集無年齡分布資料</div>`;
    return;
  }

  // Sort by age order if recognizable
  const ageOrder = ['0-4','5-9','10-14','15-24','25-49','50-64','65+'];
  rows.sort((a, b) => {
    const ai = ageOrder.indexOf(a.age_group);
    const bi = ageOrder.indexOf(b.age_group);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // Monochrome scale (Pattern E — ordinal data)
  const scale = [PALETTE.p200, PALETTE.p300, PALETTE.p400, PALETTE.p500,
                 PALETTE.p600, PALETTE.p700, PALETTE.p800];

  state.charts.age = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.age_group),
      datasets: [{
        label: '病例數',
        data: rows.map(r => r.cases),
        backgroundColor: rows.map((_, i) => scale[Math.min(i, scale.length-1)]),
        borderWidth: 0,
        barPercentage: 0.6,
        categoryPercentage: 0.85,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (c) => `${fmt.format(c.parsed.y)} 例` },
        },
      },
      scales: { x: xAxisDefault, y: yAxisDefault },
    },
  });
}

/* ── Type Chart: horizontal stacked bar (本土/境外) ───────── */
function drawTypeChart(s) {
  destroyChart('type');
  const ctx = document.getElementById('typeChart');
  const types = s.by_type || {};
  const keys = Object.keys(types);

  if (keys.length === 0) {
    // Hide the entire card if data has no type breakdown
    document.getElementById('typeCardWrap').style.display = 'none';
    return;
  }
  document.getElementById('typeCardWrap').style.display = '';

  const total = Object.values(types).reduce((s, v) => s + v, 0) || 1;
  const local = types['本土'] || 0;
  const imported = types['境外'] || 0;
  const localPct = (local / total * 100).toFixed(1);
  const importedPct = (imported / total * 100).toFixed(1);

  state.charts.type = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['感染來源'],
      datasets: [
        {
          label: `本土 (${localPct}%)`,
          data: [local],
          backgroundColor: PALETTE.p500,
          barPercentage: 0.5,
          categoryPercentage: 0.9,
        },
        {
          label: `境外移入 (${importedPct}%)`,
          data: [imported],
          backgroundColor: PALETTE.cat[1],
          barPercentage: 0.5,
          categoryPercentage: 0.9,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label.split(' ')[0]}：${fmt.format(c.parsed.x)} 例`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: PALETTE.n200, drawBorder: false },
          ticks: { color: PALETTE.n500 },
          border: { display: false },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { display: false },
          border: { display: false },
        },
      },
    },
  });
}

/* ── Boot ─────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', init);
