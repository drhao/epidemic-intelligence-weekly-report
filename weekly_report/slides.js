/* ════════════════════════════════════════════════════════════
 * 每週疫情報告 投影片 - 核心 JS
 * 載入處理後 JSON -> 渲染 6 頁投影片
 * ════════════════════════════════════════════════════════════ */

const PALETTE = {
  p50:'#F6F9F6', p100:'#E8EEE7', p200:'#D1DECF', p300:'#B4C9B1',
  p400:'#91B08C', p500:'#739A6D', p600:'#5D7F58', p700:'#496345',
  p800:'#374C34', p900:'#253423',
  n200:'#E4E7E4', n300:'#CACFC9', n400:'#A2ABA0', n500:'#7A8778',
  n600:'#5D675B', n700:'#444C43', n800:'#2C312B',
  cat:['#739A6D','#587A9D','#C8A041','#49888D','#916E46','#955F71'],
  line_primary:'#5D7F58', line_emphasis:'#374C34',
  success:'#54734F', warning:'#D2962D', danger:'#BE373C',
  terracotta:'#B5584A', clay:'#B87B61', info:'#477A9E',
};

const ALERT_META = {
  high:   { label:'高度警示', color:PALETTE.danger,  textColor:'#BE373C' },
  medium: { label:'中度警示', color:PALETTE.warning, textColor:'#8C6418' },
  low:    { label:'輕度警示', color:PALETTE.clay,    textColor:'#7A4A33' },
  normal: { label:'正常',     color:PALETTE.success, textColor:'#54734F' },
};

const SEVERITY_RANK = { high:0, medium:1, low:2, normal:3 };

Chart.defaults.font.family = "'Noto Sans TC', 'IBM Plex Sans', sans-serif";
Chart.defaults.font.size = 10;
Chart.defaults.color = PALETTE.n700;
Chart.defaults.borderColor = PALETTE.n200;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.tooltip.enabled = false;
Chart.defaults.animation = false;
Chart.defaults.layout.padding = { top: 4, right: 4, bottom: 0, left: 4 };

const fmt = new Intl.NumberFormat('zh-TW');
const fmtPct = n => (n === null || n === undefined) ? 'N/A' :
                    `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

const state = {
  overview: null,
  summaries: {},
  focusDisease: null,
};

function parseISOWeek(period) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(period);
  if (!m) return null;
  return { year: +m[1], week: +m[2] };
}

function isoWeekToDate(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - dow + 1);
  const target = new Date(week1Mon);
  target.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  return target;
}

function weekRangeLabel(period) {
  const yw = parseISOWeek(period);
  if (!yw) return period;
  const mon = isoWeekToDate(yw.year, yw.week);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const f = (d) => `${d.getUTCMonth()+1}/${d.getUTCDate()}`;
  return `${yw.year} 年第 ${yw.week} 週 (${f(mon)}-${f(sun)})`;
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

async function init() {
  try {
    state.overview = await fetchJSON('../data/processed/overview.json');
  } catch (e) {
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="background:${PALETTE.danger};color:white;padding:16px;text-align:center;font-size:14px">
        <strong>資料載入失敗：</strong>${e.message}<br>
        <small>請先執行 <code>python pipeline/run_pipeline.py</code> 產生資料</small>
       </div>`);
    return;
  }

  for (const card of state.overview.cards) {
    try {
      state.summaries[card.disease_id] =
        await fetchJSON(`../data/processed/${card.disease_id}_summary.json`);
    } catch (e) {
      console.warn(`Failed to load ${card.disease_id}:`, e);
    }
  }

  const candidates = state.overview.cards.filter(c =>
    c.alert_level !== 'normal' &&
    state.summaries[c.disease_id]
  );
  candidates.sort((a, b) => {
    const sa = SEVERITY_RANK[a.alert_level] ?? 9;
    const sb = SEVERITY_RANK[b.alert_level] ?? 9;
    if (sa !== sb) return sa - sb;
    return (b.latest_cases || 0) - (a.latest_cases || 0);
  });
  const focusCard = candidates[0] || state.overview.cards[0];
  state.focusDisease = state.summaries[focusCard.disease_id];

  renderSlide1Cover();
  renderSlide2Overview();
  renderSlide3RegionAge();
  renderSlide4Advisory();
  renderSlide5History();
  renderSlide6EnteroLongTrend();
  renderSlide7EnteroRegionTrend();
  renderSlide8EnteroAgeBar();
  renderSlide9EnteroSevereTrend();
  renderSlide10Closing();
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

function formatDateTime(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderSlide1Cover() {
  const ov = state.overview;
  const card0 = ov.cards.find(c => c.latest_period && c.latest_period.startsWith('20'));
  let weekText = '—';
  let rangeText = '統計週期：—';
  if (card0 && card0.latest_period) {
    const yw = parseISOWeek(card0.latest_period);
    if (yw) {
      weekText = `第 ${yw.week} 週`;
      rangeText = `${weekRangeLabel(card0.latest_period)}　|　民國 ${yw.year - 1911} 年`;
    }
  }
  document.getElementById('coverWeekStamp').textContent = weekText;
  document.getElementById('coverDateRange').textContent = rangeText;
  document.getElementById('reportWeekLabel').textContent = weekText;
  document.getElementById('coverGeneratedAt').textContent = formatDateTime(ov.generated_at);

  const levels = ['high', 'medium', 'low', 'normal'];
  const summary = ov.alert_summary || {};
  document.getElementById('coverAlertSummary').innerHTML = levels.map(lvl => `
    <div class="alert-bigcell" data-level="${lvl}">
      <div class="alert-bigcell-label">${ALERT_META[lvl].label}</div>
      <div class="alert-bigcell-num">${summary[lvl] || 0}<span class="alert-bigcell-unit">種</span></div>
    </div>
  `).join('');
}

function renderSlide2Overview() {
  const grid = document.getElementById('overviewGrid');
  const cards = state.overview.cards;

  grid.innerHTML = cards.map((c) => {
    const alert = c.alert_level || 'normal';
    const dir = c.change_pct > 1 ? 'up' : c.change_pct < -1 ? 'down' : 'flat';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '◆';
    return `
      <article class="overview-card" data-alert="${alert}">
        <header class="overview-card-head">
          <div>
            <div class="overview-card-name">${c.name_zh}</div>
            <div class="overview-card-category">${c.category}</div>
          </div>
          <span class="overview-card-tag" data-alert="${alert}">${ALERT_META[alert].label}</span>
        </header>
        <div class="overview-card-numrow">
          <span class="overview-card-num">${fmt.format(c.latest_cases || 0)}</span>
          <span class="overview-card-unit">例 / 週</span>
        </div>
        <div>
          <span class="overview-card-change" data-dir="${dir}">${arrow} ${fmtPct(c.change_pct)}</span>
          <span style="color:${PALETTE.n500};font-size:9pt;margin-left:4px">較前週</span>
        </div>
        <div class="overview-card-spark">
          <canvas id="spark_${c.disease_id}"></canvas>
        </div>
        <footer class="overview-card-period">
          <span>最新統計週</span><span>${c.latest_period || '—'}</span>
        </footer>
      </article>
    `;
  }).join('');

  cards.forEach(c => {
    const sum = state.summaries[c.disease_id];
    if (!sum) return;
    const series = (sum.weekly_series || []).slice(-26);
    if (series.length === 0) return;
    drawSparkline(`spark_${c.disease_id}`, series, c.alert_level);
  });
}

function drawSparkline(canvasId, series, alertLevel) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const data = series.map(r => r.cases);
  const labels = series.map(r => r.period);

  const color = alertLevel === 'high'   ? PALETTE.danger :
                alertLevel === 'medium' ? PALETTE.warning :
                alertLevel === 'low'    ? PALETTE.clay :
                                          PALETTE.line_primary;

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: hexToRgba(color, 0.12),
        borderWidth: 1.6,
        fill: true, tension: 0.32, pointRadius: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false, beginAtZero: true },
      },
    },
  });
}

function renderSlide3RegionAge() {
  const f = state.focusDisease;
  if (!f) return;

  document.getElementById('focusDiseaseName3').textContent = f.name_zh;
  const tag = document.getElementById('focusDiseaseTag3');
  tag.textContent = ALERT_META[f.alert_level]?.label || '—';
  tag.style.background = ALERT_META[f.alert_level]?.color || PALETTE.n400;
  document.getElementById('focusDiseaseSub3').textContent =
    `${f.category}　|　縣市熱區與年齡層風險辨識`;

  const regions = (f.by_region || []).slice(0, 12);
  if (regions.length > 0) {
    drawRegionBar('s3RegionChart', regions);
  } else {
    document.getElementById('s3RegionChart').parentElement.innerHTML =
      `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:${PALETTE.n500};font-size:11pt">此疾病無縣市分布資料</div>`;
  }

  const ages = f.by_age || [];
  if (ages.length > 0) {
    drawAgeBar('s3AgeChart', ages);
  } else {
    document.getElementById('s3AgeChart').parentElement.innerHTML =
      `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:${PALETTE.n500};font-size:11pt">此疾病無年齡分布資料</div>`;
  }

  const total4w = regions.reduce((s, r) => s + r.cases, 0);
  const topRegion = regions[0];
  const topAge = [...ages].sort((a, b) => b.cases - a.cases)[0];
  const callouts = [
    { label: '近 4 週累計病例', num: fmt.format(total4w), sub: '全國（各縣市加總）' },
    { label: '熱區縣市',
      num: topRegion ? topRegion.region : '—',
      sub: topRegion ? `近 4 週累計 ${fmt.format(topRegion.cases)} 例` : '' },
    { label: '主要影響年齡層',
      num: topAge ? topAge.age_group : '—',
      sub: topAge ? `累計 ${fmt.format(topAge.cases)} 例` : '' },
  ];
  document.getElementById('s3Callouts').innerHTML = callouts.map(c => `
    <div class="callout">
      <div class="callout-label">${c.label}</div>
      <div class="callout-num">${c.num}</div>
      ${c.sub ? `<div class="callout-sub">${c.sub}</div>` : ''}
    </div>
  `).join('');
}

function drawRegionBar(canvasId, rows) {
  const labels = rows.map(r => r.region);
  const data = rows.map(r => r.cases);
  const colors = rows.map((_, i) => i < 3 ? PALETTE.p500 : PALETTE.n400);
  const max = Math.max(...data);

  new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data, backgroundColor: colors,
        borderWidth: 0,
        barPercentage: 0.72, categoryPercentage: 0.85,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true, suggestedMax: max * 1.05,
          grid: { color: PALETTE.n200 }, border: { display: false },
          ticks: { color: PALETTE.n500, font: { size: 9 } },
        },
        y: {
          grid: { display: false }, border: { color: PALETTE.n300 },
          ticks: { color: PALETTE.n700, font: { size: 9 } },
        },
      },
    },
  });
}

function drawAgeBar(canvasId, rows) {
  const ageOrder = ['0-4','5-9','10-14','15-24','25-49','50-64','65+'];
  rows.sort((a, b) => {
    const ai = ageOrder.indexOf(a.age_group);
    const bi = ageOrder.indexOf(b.age_group);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const scale = [PALETTE.p200, PALETTE.p300, PALETTE.p400, PALETTE.p500,
                 PALETTE.p600, PALETTE.p700, PALETTE.p800];

  new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.age_group),
      datasets: [{
        data: rows.map(r => r.cases),
        backgroundColor: rows.map((_, i) => scale[Math.min(i, scale.length-1)]),
        borderWidth: 0,
        barPercentage: 0.6, categoryPercentage: 0.85,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false }, border: { color: PALETTE.n300 },
          ticks: { color: PALETTE.n700, font: { size: 9 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: PALETTE.n200 }, border: { display: false },
          ticks: { color: PALETTE.n500, font: { size: 9 } },
        },
      },
    },
  });
}

function renderSlide4Advisory() {
  const cards = state.overview.cards.filter(c =>
    ['high', 'medium', 'low'].includes(c.alert_level)
  );
  const levels = ['high', 'medium', 'low'];
  const list = document.getElementById('s4AdvisoryList');

  if (cards.length === 0) {
    list.innerHTML = `<div class="advisory-empty">
      本週各監測疾病皆處於正常範圍，請持續維持基本防疫措施。
    </div>`;
    return;
  }

  const html = [];
  for (const lvl of levels) {
    const lvlCards = cards.filter(c => c.alert_level === lvl);
    for (const c of lvlCards) {
      const sum = state.summaries[c.disease_id];
      const change = c.change_pct;
      const dir = change > 1 ? 'up' : change < -1 ? 'down' : 'flat';
      const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '◆';
      const changeColor = dir === 'up' ? PALETTE.terracotta :
                          dir === 'down' ? PALETTE.success : PALETTE.n500;

      const advice = sum?.advice || c.advice || '請依疾管署最新公告為準。';

      html.push(`
        <div class="advisory-block" data-level="${lvl}">
          <div class="advisory-cell-level">
            <div class="advisory-level-tag">${ALERT_META[lvl].label}</div>
            <div class="advisory-level-name">${c.category}</div>
          </div>
          <div class="advisory-cell-detail">
            <div class="advisory-disease-row">
              <span class="advisory-disease-name">${c.name_zh}</span>
              <span class="advisory-disease-num">${fmt.format(c.latest_cases || 0)}</span>
              <span class="advisory-disease-unit">例 / 週</span>
              <span class="advisory-disease-change" style="color:${changeColor}">
                ${arrow} ${fmtPct(change)}
              </span>
            </div>
            <div style="font-size:9pt;color:${PALETTE.n500}">
              最新統計週 ${c.latest_period || '—'}　|　
              ${sum?.total_cases !== undefined
                ? `資料庫累計 ${fmt.format(sum.total_cases)} 例`
                : ''}
            </div>
          </div>
          <div class="advisory-cell-action">
            <div class="advisory-action-label">防疫建議</div>
            <div class="advisory-action-body">${advice}</div>
          </div>
        </div>
      `);
    }
  }
  list.innerHTML = html.join('');
}

function renderSlide5History() {
  const f = state.focusDisease;
  if (!f) return;

  document.getElementById('focusDiseaseName5').textContent = f.name_zh;
  const tag = document.getElementById('focusDiseaseTag5');
  tag.textContent = ALERT_META[f.alert_level]?.label || '—';
  tag.style.background = ALERT_META[f.alert_level]?.color || PALETTE.n400;

  drawHistoryChart('s5HistoryChart', f);
  renderComparisonCallouts(f);
}

function drawHistoryChart(canvasId, summary) {
  const series = summary.weekly_series || [];
  if (series.length === 0) return;

  const byYear = {};
  for (const row of series) {
    const yw = parseISOWeek(row.period);
    if (!yw) continue;
    if (!byYear[yw.year]) byYear[yw.year] = {};
    byYear[yw.year][yw.week] = row.cases;
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  if (years.length === 0) return;

  const yearsToShow = years.slice(0, 3);
  const currentYear = yearsToShow[0];
  const currentMaxWeek = Math.max(...Object.keys(byYear[currentYear]).map(Number));
  const weekLabels = Array.from({length: 53}, (_, i) => i + 1);

  // 線條樣式：今年 = 鼠尾草深綠粗+填色；去年 = 中灰中粗；前年 = 淺灰細虛線
  const stylePresets = [
    { border: PALETTE.line_emphasis, bg: hexToRgba(PALETTE.p500, 0.08),
      width: 3, dash: [], fill: true },
    { border: PALETTE.n500, bg: 'transparent',
      width: 1.8, dash: [], fill: false },
    { border: PALETTE.n400, bg: 'transparent',
      width: 1.4, dash: [4, 4], fill: false },
  ];

  const datasets = yearsToShow.map((y, idx) => {
    const preset = stylePresets[idx] || stylePresets[2];
    const data = weekLabels.map(w => {
      if (y === currentYear && w > currentMaxWeek) return null;
      return byYear[y][w] !== undefined ? byYear[y][w] : null;
    });
    return {
      label: `${y} 年`,
      data,
      borderColor: preset.border,
      backgroundColor: preset.bg,
      borderWidth: preset.width,
      borderDash: preset.dash,
      tension: 0.32,
      pointRadius: 0, pointHoverRadius: 0,
      fill: preset.fill,
      spanGaps: false,
    };
  });

  new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: { labels: weekLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { boxWidth: 14, boxHeight: 2, padding: 12, font: { size: 10 } },
        },
      },
      scales: {
        x: {
          grid: { display: false }, border: { color: PALETTE.n300 },
          ticks: {
            color: PALETTE.n500, font: { size: 9 },
            maxTicksLimit: 14,
            callback: function(val) {
              const w = this.getLabelForValue(val);
              return (+w) % 4 === 1 ? `W${w}` : '';
            },
          },
          title: { display: true, text: '週次（ISO-8601）',
                   color: PALETTE.n500, font: { size: 9 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: PALETTE.n200 }, border: { display: false },
          ticks: { color: PALETTE.n500, font: { size: 9 } },
          title: { display: true, text: '病例數',
                   color: PALETTE.n500, font: { size: 9 } },
        },
      },
    },
  });
}

function renderComparisonCallouts(summary) {
  const series = summary.weekly_series || [];
  const byYear = {};
  for (const row of series) {
    const yw = parseISOWeek(row.period);
    if (!yw) continue;
    if (!byYear[yw.year]) byYear[yw.year] = {};
    byYear[yw.year][yw.week] = row.cases;
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
  if (years.length === 0) {
    document.getElementById('s5Callouts').innerHTML = '';
    return;
  }
  const currentYear = years[0];
  const currentMaxWeek = Math.max(...Object.keys(byYear[currentYear]).map(Number));

  function ytd(year, upToWeek) {
    if (!byYear[year]) return null;
    let sum = 0, count = 0;
    for (let w = 1; w <= upToWeek; w++) {
      if (byYear[year][w] !== undefined) {
        sum += byYear[year][w];
        count++;
      }
    }
    return count > 0 ? sum : null;
  }

  const currentYTD = ytd(currentYear, currentMaxWeek);
  const prevYearYTD = years[1] ? ytd(years[1], currentMaxWeek) : null;

  let avgYTD = null;
  if (years.length >= 2) {
    const vals = years.slice(1, 4)
      .map(y => ytd(y, currentMaxWeek))
      .filter(v => v !== null);
    if (vals.length > 0) avgYTD = vals.reduce((s, v) => s + v, 0) / vals.length;
  }

  let yoyDiff = null;
  if (currentYTD !== null && prevYearYTD !== null && prevYearYTD > 0) {
    yoyDiff = (currentYTD - prevYearYTD) / prevYearYTD * 100;
  }
  let avgDiff = null;
  if (currentYTD !== null && avgYTD !== null && avgYTD > 0) {
    avgDiff = (currentYTD - avgYTD) / avgYTD * 100;
  }

  document.getElementById('s5Callouts').innerHTML = `
    <div class="comparison-cell" data-emphasis="primary">
      <div class="comparison-label">${currentYear} 年累計（截至第 ${currentMaxWeek} 週）</div>
      <div class="comparison-num">${fmt.format(currentYTD || 0)}</div>
      <div class="comparison-sub">本年度截至本週累計病例</div>
    </div>
    <div class="comparison-cell">
      <div class="comparison-label">${years[1] || '去'} 年同期累計</div>
      <div class="comparison-num">${fmt.format(prevYearYTD || 0)}</div>
      <div class="comparison-sub">${yoyDiff !== null
        ? `今年較去年同期${yoyDiff >= 0 ? '增' : '減'} ${Math.abs(yoyDiff).toFixed(1)}%`
        : '無對照資料'}</div>
    </div>
    <div class="comparison-cell">
      <div class="comparison-label">近 3 年同期平均</div>
      <div class="comparison-num">${avgYTD !== null ? fmt.format(Math.round(avgYTD)) : '—'}</div>
      <div class="comparison-sub">${avgDiff !== null
        ? `今年較歷年同期均${avgDiff >= 0 ? '高' : '低'} ${Math.abs(avgDiff).toFixed(1)}%`
        : '歷史資料不足'}</div>
    </div>
  `;
}

function renderSlide10Closing() {
  const cards = state.overview.cards;
  document.getElementById('closingDataList').innerHTML = cards.map(c => `
    <li><strong>${c.name_zh}</strong>（${c.category}）— 累計 ${fmt.format(c.total_cases || 0)} 例</li>
  `).join('');
}

/* ════════════════════════════════════════════════════════════
 * 腸病毒專屬深度報告（Slide 6–9）
 * ════════════════════════════════════════════════════════════ */

const ENTERO_AGE_ORDER = ['0~2','3~6','7~12','13~15','16~18','19~24','25~64','65+'];

// 4 週後尾追平均（trailing moving average）
function trailingMA(values, window = 4) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) { out.push(null); continue; }
    let s = 0;
    for (let j = i - window + 1; j <= i; j++) s += values[j];
    out.push(s / window);
  }
  return out;
}

// 把 series 依 period 字串範圍篩選（含起訖）
function filterByPeriod(series, fromPeriod, toPeriod) {
  return series.filter(r => {
    if (fromPeriod && r.period < fromPeriod) return false;
    if (toPeriod && r.period > toPeriod) return false;
    return true;
  });
}

function makeCallouts(containerId, items) {
  document.getElementById(containerId).innerHTML = items.map(c => `
    <div class="callout">
      <div class="callout-label">${c.label}</div>
      <div class="callout-num">${c.num}</div>
      ${c.sub ? `<div class="callout-sub">${c.sub}</div>` : ''}
    </div>
  `).join('');
}

// ───── Slide 6: 2017-2026 健保門急診長期趨勢 ─────
function renderSlide6EnteroLongTrend() {
  const e = state.summaries.enterovirus;
  if (!e) return;
  const series = filterByPeriod(e.weekly_series || [], '2017-W01', null);
  if (series.length === 0) return;

  drawEnteroLongTrend('s6EnteroLongTrend', series);

  // Callouts：十年累計 / 歷史單週最高 / 本週相較十年同週中位數
  const total = series.reduce((s, r) => s + r.cases, 0);
  const peak = series.reduce((p, r) => r.cases > p.cases ? r : p, series[0]);

  // 本週 vs 同 ISO 週的歷年中位數
  const latest = series[series.length - 1];
  const latestYw = parseISOWeek(latest.period);
  const sameWeekValues = series
    .filter(r => {
      const yw = parseISOWeek(r.period);
      return yw && yw.week === latestYw.week && yw.year !== latestYw.year;
    })
    .map(r => r.cases)
    .sort((a, b) => a - b);
  let median = null;
  if (sameWeekValues.length > 0) {
    const m = sameWeekValues.length;
    median = m % 2 === 0
      ? (sameWeekValues[m/2 - 1] + sameWeekValues[m/2]) / 2
      : sameWeekValues[(m-1)/2];
  }
  const medianDiff = (median !== null && median > 0)
    ? (latest.cases - median) / median * 100
    : null;

  makeCallouts('s6Callouts', [
    { label: '十年累計就診人次', num: fmt.format(total),
      sub: `2017-W01 至 ${latest.period}` },
    { label: '歷史單週最高', num: `${fmt.format(peak.cases)} 人次`,
      sub: `發生於 ${peak.period}` },
    { label: '本週相較十年同週中位數',
      num: medianDiff !== null ? fmtPct(medianDiff) : '—',
      sub: medianDiff !== null
        ? `本週 ${fmt.format(latest.cases)} 對比中位數 ${fmt.format(Math.round(median))}`
        : '歷史資料不足' },
  ]);
}

function drawEnteroLongTrend(canvasId, series) {
  const labels = series.map(r => r.period);
  const data = series.map(r => r.cases);
  const ma = trailingMA(data, 4);

  new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '每週就診人次',
          data,
          borderColor: PALETTE.line_emphasis,
          backgroundColor: hexToRgba(PALETTE.p500, 0.08),
          borderWidth: 1.4,
          fill: true, tension: 0.28, pointRadius: 0,
        },
        {
          label: '4 週後尾追平均',
          data: ma,
          borderColor: PALETTE.p500,
          borderWidth: 2.2,
          borderDash: [6, 4],
          fill: false, tension: 0.25, pointRadius: 0, spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { boxWidth: 14, boxHeight: 2, padding: 12, font: { size: 10 } },
        },
      },
      scales: {
        x: {
          grid: { display: false }, border: { color: PALETTE.n300 },
          ticks: {
            color: PALETTE.n500, font: { size: 9 },
            maxTicksLimit: 12,
            callback: function(val) {
              const p = this.getLabelForValue(val);
              // 只顯示每年第 1 週的 label，如 2018-W01
              return /-W01$/.test(p) ? p.slice(0, 4) : '';
            },
          },
          title: { display: true, text: '週次（ISO-8601）',
                   color: PALETTE.n500, font: { size: 9 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: PALETTE.n200 }, border: { display: false },
          ticks: { color: PALETTE.n500, font: { size: 9 },
                   callback: v => fmt.format(v) },
          title: { display: true, text: '就診人次',
                   color: PALETTE.n500, font: { size: 9 } },
        },
      },
    },
  });
}

// ───── Slide 7: 2025-2026 六區管中心趨勢 ─────
const REGION_ZONE_ORDER = ['台北區','北區','中區','南區','高屏區','東區'];

function renderSlide7EnteroRegionTrend() {
  const e = state.summaries.enterovirus;
  if (!e || !e.weekly_by_region_center) return;

  // 篩出 2025-W01 起的所有 period
  const allPeriods = new Set();
  for (const zone of REGION_ZONE_ORDER) {
    for (const r of (e.weekly_by_region_center[zone] || [])) {
      if (r.period >= '2025-W01') allPeriods.add(r.period);
    }
  }
  const periods = Array.from(allPeriods).sort();
  if (periods.length === 0) return;

  // 每區的 period→cases
  const byZone = {};
  for (const zone of REGION_ZONE_ORDER) {
    const map = {};
    for (const r of (e.weekly_by_region_center[zone] || [])) {
      map[r.period] = r.cases;
    }
    byZone[zone] = periods.map(p => map[p] ?? 0);
  }

  drawEnteroRegionTrend('s7EnteroRegionTrend', periods, byZone, REGION_ZONE_ORDER);

  // Callouts：本週最高區 / 六區合計（含週變動）/ 2025 年累計最多區
  const latestPeriod = periods[periods.length - 1];
  let topZone = REGION_ZONE_ORDER[0], topVal = -1;
  let weekTotal = 0;
  for (const zone of REGION_ZONE_ORDER) {
    const v = byZone[zone][byZone[zone].length - 1] || 0;
    weekTotal += v;
    if (v > topVal) { topVal = v; topZone = zone; }
  }
  let prevTotal = 0;
  if (periods.length >= 2) {
    for (const zone of REGION_ZONE_ORDER) {
      prevTotal += byZone[zone][byZone[zone].length - 2] || 0;
    }
  }
  const wowPct = prevTotal > 0
    ? (weekTotal - prevTotal) / prevTotal * 100
    : null;

  // 2025 全年累計最多區
  const yearSum = {};
  for (const zone of REGION_ZONE_ORDER) {
    yearSum[zone] = (e.weekly_by_region_center[zone] || [])
      .filter(r => r.period >= '2025-W01' && r.period <= '2025-W53')
      .reduce((s, r) => s + r.cases, 0);
  }
  const cumTopZone = Object.entries(yearSum)
    .sort((a, b) => b[1] - a[1])[0];

  makeCallouts('s7Callouts', [
    { label: `本週（${latestPeriod}）就診最高區`,
      num: topZone,
      sub: `本週 ${fmt.format(topVal)} 人次` },
    { label: '本週六區合計',
      num: fmt.format(weekTotal),
      sub: wowPct !== null
        ? `對比上週 ${fmtPct(wowPct)}`
        : '無對照資料' },
    { label: '2025 年累計就診最多區',
      num: cumTopZone ? cumTopZone[0] : '—',
      sub: cumTopZone ? `年累計 ${fmt.format(cumTopZone[1])} 人次` : '' },
  ]);
}

function drawEnteroRegionTrend(canvasId, periods, byZone, zoneOrder) {
  const datasets = zoneOrder.map((zone, i) => ({
    label: zone,
    data: byZone[zone],
    borderColor: PALETTE.cat[i],
    backgroundColor: PALETTE.cat[i],
    borderWidth: 1.8,
    tension: 0.32,
    pointRadius: 0, pointHoverRadius: 0,
    fill: false,
  }));

  new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: { labels: periods, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { boxWidth: 14, boxHeight: 2, padding: 10, font: { size: 10 } },
        },
      },
      scales: {
        x: {
          grid: { display: false }, border: { color: PALETTE.n300 },
          ticks: {
            color: PALETTE.n500, font: { size: 9 },
            maxTicksLimit: 12,
            callback: function(val) {
              const p = this.getLabelForValue(val);
              const m = /^(\d{4})-W(\d{2})$/.exec(p);
              if (!m) return '';
              const w = +m[2];
              return (w === 1 || w === 13 || w === 26 || w === 40) ? `${m[1]}-W${m[2]}` : '';
            },
          },
          title: { display: true, text: '週次（ISO-8601）',
                   color: PALETTE.n500, font: { size: 9 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: PALETTE.n200 }, border: { display: false },
          ticks: { color: PALETTE.n500, font: { size: 9 },
                   callback: v => fmt.format(v) },
          title: { display: true, text: '就診人次',
                   color: PALETTE.n500, font: { size: 9 } },
        },
      },
    },
  });
}

// ───── Slide 8: 2025-2026 年齡別分布（CDC 原始 8 組） ─────
function renderSlide8EnteroAgeBar() {
  const e = state.summaries.enterovirus;
  if (!e) return;

  // 優先使用近 2 年（2025-2026）彙整，缺則退回全期 by_age
  const source = (e.by_age_recent_2y && e.by_age_recent_2y.length > 0)
    ? e.by_age_recent_2y
    : (e.by_age || []);
  if (source.length === 0) return;

  // 過濾「不詳」 + 對齊 ENTERO_AGE_ORDER
  const map = {};
  for (const r of source) {
    if (r.age_group === '不詳') continue;
    map[r.age_group] = r.cases;
  }
  const rows = ENTERO_AGE_ORDER
    .filter(g => map[g] !== undefined)
    .map(g => ({ age_group: g, cases: map[g] }));

  if (rows.length === 0) return;
  drawEnteroAgeBar('s8EnteroAgeBar', rows);

  // Callouts：主要年齡層 / 學齡前(0~6) / 學齡(7~18)
  const total = rows.reduce((s, r) => s + r.cases, 0);
  const top = [...rows].sort((a, b) => b.cases - a.cases)[0];
  const preSchool = (map['0~2'] || 0) + (map['3~6'] || 0);
  const schoolAge = (map['7~12'] || 0) + (map['13~15'] || 0) + (map['16~18'] || 0);

  makeCallouts('s8Callouts', [
    { label: '主要影響年齡層',
      num: top ? top.age_group + ' 歲' : '—',
      sub: top ? `累計就診 ${fmt.format(top.cases)} 人次` : '' },
    { label: '學齡前 (0~6 歲) 合計',
      num: fmt.format(preSchool),
      sub: total > 0 ? `占整體 ${(preSchool / total * 100).toFixed(1)}%` : '' },
    { label: '學齡 (7~18 歲) 合計',
      num: fmt.format(schoolAge),
      sub: total > 0 ? `占整體 ${(schoolAge / total * 100).toFixed(1)}%` : '' },
  ]);
}

function drawEnteroAgeBar(canvasId, rows) {
  const scale = [PALETTE.p100, PALETTE.p200, PALETTE.p300, PALETTE.p400,
                 PALETTE.p500, PALETTE.p600, PALETTE.p700, PALETTE.p800];

  new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels: rows.map(r => r.age_group + ' 歲'),
      datasets: [{
        data: rows.map(r => r.cases),
        backgroundColor: rows.map((_, i) => scale[Math.min(i, scale.length - 1)]),
        borderWidth: 0,
        barPercentage: 0.66, categoryPercentage: 0.88,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false }, border: { color: PALETTE.n300 },
          ticks: { color: PALETTE.n700, font: { size: 10 } },
          title: { display: true, text: '年齡別',
                   color: PALETTE.n500, font: { size: 9 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: PALETTE.n200 }, border: { display: false },
          ticks: { color: PALETTE.n500, font: { size: 9 },
                   callback: v => fmt.format(v) },
          title: { display: true, text: '累計就診人次',
                   color: PALETTE.n500, font: { size: 9 } },
        },
      },
    },
  });
}

// ───── Slide 9: 2022-2026 重症趨勢 ─────
function renderSlide9EnteroSevereTrend() {
  const e = state.summaries.enterovirus;
  if (!e || !e.severe_weekly_series || e.severe_weekly_series.length === 0) {
    const el = document.getElementById('s9EnteroSevereTrend');
    if (el) el.parentElement.innerHTML =
      `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:${PALETTE.n500};font-size:11pt">尚無重症資料</div>`;
    return;
  }

  const series = filterByPeriod(e.severe_weekly_series, '2022-W01', null);
  if (series.length === 0) return;

  drawEnteroSevereTrend('s9EnteroSevereTrend', series);

  // Callouts：累計重症 / 本週新增 / 2025-2026 同期比較
  const total = series.reduce((s, r) => s + r.cases, 0);
  const latest = series[series.length - 1];
  const latestYw = parseISOWeek(latest.period);

  // YTD comparison: 2026 vs 2025 同 ISO 週累計
  let ytd2026 = 0, ytd2025 = 0;
  for (const r of series) {
    const yw = parseISOWeek(r.period);
    if (!yw) continue;
    if (yw.year === latestYw.year && yw.week <= latestYw.week) ytd2026 += r.cases;
    if (yw.year === latestYw.year - 1 && yw.week <= latestYw.week) ytd2025 += r.cases;
  }
  const yoyPct = ytd2025 > 0 ? (ytd2026 - ytd2025) / ytd2025 * 100 : null;

  makeCallouts('s9Callouts', [
    { label: '近 4 年累計重症',
      num: fmt.format(total),
      sub: `2022-W01 至 ${latest.period}` },
    { label: '本週新增重症',
      num: `${fmt.format(latest.cases)} 例`,
      sub: `最新統計週 ${latest.period}` },
    { label: '2025–2026 同期累計比較',
      num: yoyPct !== null ? fmtPct(yoyPct) : '—',
      sub: yoyPct !== null
        ? `本年 ${fmt.format(ytd2026)} vs 去年同期 ${fmt.format(ytd2025)}`
        : '對照資料不足' },
  ]);
}

function drawEnteroSevereTrend(canvasId, series) {
  const labels = series.map(r => r.period);
  const data = series.map(r => r.cases);
  const ma = trailingMA(data, 4);

  new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '每週確定病例數',
          data,
          borderColor: PALETTE.terracotta,
          backgroundColor: hexToRgba(PALETTE.terracotta, 0.10),
          borderWidth: 1.6,
          fill: true, tension: 0.28, pointRadius: 0,
        },
        {
          label: '4 週後尾追平均',
          data: ma,
          borderColor: PALETTE.clay,
          borderWidth: 2.2,
          borderDash: [6, 4],
          fill: false, tension: 0.25, pointRadius: 0, spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { boxWidth: 14, boxHeight: 2, padding: 12, font: { size: 10 } },
        },
      },
      scales: {
        x: {
          grid: { display: false }, border: { color: PALETTE.n300 },
          ticks: {
            color: PALETTE.n500, font: { size: 9 },
            maxTicksLimit: 12,
            callback: function(val) {
              const p = this.getLabelForValue(val);
              return /-W01$/.test(p) ? p.slice(0, 4) : '';
            },
          },
          title: { display: true, text: '週次（ISO-8601）',
                   color: PALETTE.n500, font: { size: 9 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: PALETTE.n200 }, border: { display: false },
          ticks: { color: PALETTE.n500, font: { size: 9 } },
          title: { display: true, text: '確定病例數',
                   color: PALETTE.n500, font: { size: 9 } },
        },
      },
    },
  });
}

function toggleNav() {
  const nav = document.getElementById('pageNav');
  nav.hidden = !nav.hidden;
}

window.toggleNav = toggleNav;
window.addEventListener('DOMContentLoaded', init);
