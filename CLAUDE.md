# CLAUDE.md

This file is for AI agents (Claude Code) picking up this project. It's not a user README — it's a handoff note explaining what's done, what's not, and what landmines exist.

## 一句話總結

台灣 CDC 疫情監測系統，模仿 NIDSS。三個交付物：(1) 資料 pipeline、(2) 互動式儀表板、(3) 週報投影片（瀏覽器列印成 PDF）。三者共用 `data/processed/` 的 JSON。

**目前狀態**：三個都完成、可運作。使用者要求 Traditional Chinese、Python first。

## 專案結構

```
cdc_dashboard/
├── pipeline/                 資料層（Python）
│   ├── disease_registry.py   ← 加新疾病改這裡，自動串到下游
│   ├── fetch.py              從 od.cdc.gov.tw 下載 CSV
│   ├── transform.py          清洗 + 計算 weekly_series, by_region, by_age
│   └── run_pipeline.py       一鍵跑 fetch + transform
├── data/
│   ├── raw/                  原始 CSV（gitignored 也可）
│   └── processed/            overview.json + {disease_id}_summary.json × 6
├── dashboard/                互動式儀表板（HTML/JS，NIDSS-style）
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── vendor/               vendored Chart.js（沙箱不能連 CDN）
├── weekly_report/            週報投影片（A4 橫向，列印成 PDF）
│   ├── index.html            6 頁骨架
│   ├── slides.css            @page A4 landscape + design tokens
│   ├── slides.js             載 JSON + 渲染 6 頁 + Chart.js
│   └── vendor/               同 dashboard
├── tests/
│   └── generate_mock_data.py 真實感的 3 年 mock 資料
├── screenshots/              dashboard_*.png + slide_*.png + sample PDF
├── README.md                 給使用者看的
├── CLAUDE.md                 ← 你正在讀的這份
└── requirements.txt
```

## 資料管線

**6 種疾病**（在 `pipeline/disease_registry.py` 註冊）：

| disease_id | name_zh | category | aggregation |
|---|---|---|---|
| dengue | 登革熱 | 蟲媒傳染病 | daily_to_weekly |
| influenza | 類流感 | 呼吸道傳染病 | weekly |
| enterovirus | 腸病毒 | 腸道傳染病 | weekly |
| covid19 | COVID-19 | 新興呼吸道傳染病 | weekly |
| rsv | 呼吸道融合病毒 | 呼吸道傳染病 | weekly |
| notifiable_5y | 法定傳染病五年統計 | 綜合監測 | yearly |

每筆 registry 需要：`name_zh`, `name_en`, `category`, `icon`, `color`, `data_url`（真實 CDC URL）、`date_col`, `case_col`, `region_col`, `age_col`、`aggregation`、`alert_thresholds {low, medium, high}`、`advice`。

### JSON Schema（前端依賴的）

**`overview.json`**:
```json
{
  "cards": [{
    "disease_id": "enterovirus",
    "name_zh": "腸病毒", "category": "腸道傳染病",
    "icon": "...", "color": "#...",
    "latest_period": "2026-W21",
    "latest_cases": 15429,
    "change_pct": -22.8,
    "alert_level": "high",     // high / medium / low / normal
    "advice": "...",
    "total_cases": 1970041
  }, ...],
  "alert_summary": {"high": 1, "medium": 1, "low": 2, "normal": 2},
  "generated_at": "2026-05-24T07:31:..."
}
```

**`{disease_id}_summary.json`**:
```json
{
  "disease_id": "...", "name_zh": "...", "category": "...",
  "icon": "...", "color": "...", "advice": "...",
  "alert_level": "...", "alert_thresholds": {"low":..., "medium":..., "high":...},
  "latest_period": "2026-W21", "total_cases": 1970041,
  "weekly_series": [{"period": "2023-W22", "cases": 20815}, ...],
  "by_region": [{"region": "新北市", "cases": 7187}, ...],
  "by_age": [{"age_group": "0-4", "cases": 1177663}, ...],
  "by_type": [...],   // 本土/境外 之類
  "last_updated": "..."
}
```

**任何改 schema 的修改都會打到三個下游**：dashboard/app.js、weekly_report/slides.js、上面的合約都要同步。

## 沙箱環境的限制（重要）

跑這個專案的開發沙箱有以下限制 — 如果你也在沙箱裡，先看這段：

- **無法連 CDC**：`data.cdc.gov.tw`、`od.cdc.gov.tw`、`nidss.cdc.gov.tw` 都被擋
- **無法連 CDN**：`cdn.jsdelivr.net`、Google Fonts、unpkg 都擋
- **解法**：所有第三方都已 vendored 到 `weekly_report/vendor/` 跟 `dashboard/vendor/`；字體用 system fallback
- **跑真實資料**：使用者要在自己的機器跑 `python pipeline/run_pipeline.py`
- **在沙箱開發**：先 `python tests/generate_mock_data.py` 產 mock CSV → 再 `python pipeline/run_pipeline.py --skip-fetch`（這個 flag 你要在 run_pipeline.py 確認有沒有實作；mock data 直接放到 `data/raw/`）

允許連的 domain（可裝套件用）：github.com, registry.npmjs.org, pypi.org, files.pythonhosted.org, crates.io。

## 已知設計決策（不要回頭改）

1. **週報用瀏覽器列印 PDF，不出 .pptx**。使用者明確說的。`@page { size: A4 landscape; margin: 0; }` + `print_background: true` 是核心。
2. **「歷年同期比較」頁不做預測**。使用者明確說的。`slides.js drawHistoryChart()` 只畫近 3 年同 ISO 週疊圖，沒有外推。
3. **配色嚴守 Epidemic Data Visualization Style Guide**：主色鼠尾草綠 `#739A6D`、Pattern A（前 3 名強調 + 其餘灰）、Pattern E（單色階）、4 週 trailing MA。CSS tokens 在 `:root` 裡。
4. **字體三分**：`Noto Serif TC`（標題）、`Noto Sans TC`（內文）、`IBM Plex Sans`（數字 with `tabular-nums`）。
5. **週次定義**：ISO-8601，週一為一週之始。`weekly_series` 的 `period` 格式固定 `YYYY-Www`。
6. **警示等級色彩**：high = `var(--danger) #BE373C`、medium = `var(--warning) #D2962D`、low = `var(--clay) #B87B61`、normal = `var(--success) #54734F` 或 neutral grey。

## 週報投影片的版面 gotcha

`weekly_report/slides.css` 裡有幾個吃過虧才調對的東西，動之前先讀：

1. **`.slide-foot` 用 `margin-top: auto`**（不是 absolute）— 這樣 callouts 不會跟 foot 重疊。**例外**：封面 `.cover-foot` 用 absolute，因為 cover 內部沒有 flex 兄弟。
2. **`.grid-2-col` 固定 `min-height: 110mm` + `flex-shrink: 0`**，不要 `flex: 1`。否則圖表會撐滿頁面把 callouts 擠掉。
3. **`.chart-block-wide` 固定 `min-height: 115mm`**（slide 5 用）。
4. **`.chart-block-body-tall` 用 `height: 105mm` 明確指定**（不只 min-height）。Chart.js 配合 `maintainAspectRatio: false` 才會正確填滿。
5. **A4 橫向實際尺寸**：1122.5 × 793.7 px @ 96dpi（297mm × 210mm）。截圖驗證時用這個。
6. **`-webkit-print-color-adjust: exact !important`** 一定要，否則背景色不會印出來。
7. **Chart.js 全域**：`animation: false`、`tooltip.enabled: false`（列印不互動）。

## 驗證流程

每次改週報後跑這個驗證：

```bash
# 在 /home/claude 起 server（不要在 cdc_dashboard/ 裡，否則 fetch JSON 的相對路徑會錯）
cd /home/claude/cdc_dashboard
python -m http.server 8766 &
# 用 Playwright 截圖 + 出 PDF
python /tmp/shoot_print.py
# 看結果
ls /tmp/slides_print/
# weekly_report.pdf + print_slide_{1..6}.png
```

`/tmp/shoot_print.py` 已存在（沙箱裡）— 啟動 server、開 `http://localhost:8766/weekly_report/`、等 2.5s 給 Chart.js 渲染、`emulate_media("print")`、`page.pdf(format=A4, landscape=True, print_background=True, margin all 0)`、`locator(#slide-N).screenshot()` × 6。

如果沙箱重啟、`/tmp/shoot_print.py` 不見了，去 `screenshots/sample_weekly_report.pdf` 看上次的成品，或重新寫（範本在這份 CLAUDE.md 的 git 歷史裡，或下面這段）：

```python
# /tmp/shoot_print.py 重建版
import subprocess, time, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

PORT = 8766
ROOT = Path("/home/claude/cdc_dashboard")  # 改成你的路徑
OUT = Path("/tmp/slides_print"); OUT.mkdir(exist_ok=True)

server = subprocess.Popen(
    [sys.executable, "-m", "http.server", str(PORT)],
    cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(1.5)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width":1400,"height":900}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(f"http://localhost:{PORT}/weekly_report/", wait_until="networkidle")
        page.wait_for_timeout(2500)
        page.emulate_media(media="print")
        page.wait_for_timeout(500)
        page.pdf(path=str(OUT/"weekly_report.pdf"), format="A4", landscape=True,
                 print_background=True,
                 margin={"top":"0","bottom":"0","left":"0","right":"0"})
        for i in range(1, 7):
            page.locator(f"#slide-{i}").screenshot(path=str(OUT/f"print_slide_{i}.png"))
        browser.close()
finally:
    server.terminate(); server.wait()
```

## 接下來可以做的（使用者沒明確要求，但合理的延伸）

不要主動做，但使用者開口時可以快速接：

- **CI**：GitHub Actions 跑 pipeline 然後 commit `data/processed/` 到 repo
- **多週快照**：`data/processed/2026-W21/` 之類，存歷史
- **更多疾病**：水痘、麻疹、肺結核 — 在 `disease_registry.py` 加一筆就好
- **email 報告**：用 weasyprint 把 weekly_report HTML 轉 PDF + 寄信
- **手機版 dashboard**：目前 dashboard 沒做 RWD
- **單元測試**：`transform.py` 的彙整邏輯目前沒測試
- **真實 OG image / favicon**：目前是占位
- **a11y audit**：色彩對比已注意過但沒實測

## 不要做的

- **不要用 .pptx**。使用者明確說不要。
- **不要做預測**。使用者明確說「歷年同期比較」頁純歷史就好。
- **不要改色票**。Epidemic Data Visualization Style Guide 是 hard requirement，破壞它就毀了整套設計一致性。
- **不要把週報投影片改成 16:9 螢幕簡報**。它是 A4 列印取向（之前曾經是 16:9，後來改 A4，不要走回頭路）。
- **不要對 `latest_period` 做時區轉換**。它是字串 `YYYY-Www`，不是 datetime。

## 編碼 / 風格

- Python: stdlib + pandas + requests，不引額外 ML 套件
- JS: 純 ES2020+，不引 React/Vue。Chart.js 4.x（已 vendored）
- CSS: 純 CSS variables，不引 Tailwind / 任何 CSS framework
- 語言：所有 user-facing 文字 Traditional Chinese；變數名、註解英文
- Commit message：可以中文，但建議 Conventional Commits 格式

## 如果使用者請你「繼續做」

先讀這份檔案，然後 `ls` 一遍專案、`cat README.md`、`cat pipeline/disease_registry.py`，再問使用者想做什麼。不要直接動手。
