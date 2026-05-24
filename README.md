# 台灣 CDC 疫情資料儀表板系統

## 兩種交付產出

本專案以同一套資料 pipeline，生出兩種給不同對象用的視覺化：

| 用途 | 場景 | 路徑 |
|---|---|---|
| **互動式儀表板** | 公衛人員日常查詢 | `dashboard/` |
| **週報投影片** | 給長官的每週簡報 | `weekly_report/` |

兩者都嚴守 [Epidemic Data Visualization Style Guide](https://github.com/drhao/epi-dataviz-styleguide)，並共用同一份 `data/processed/` 的 JSON 輸出。

## 系統架構

```
cdc_dashboard/
├── pipeline/                    資料抓取與處理層（Python）
│   ├── fetch.py                 從 CDC 開放資料下載 CSV
│   ├── transform.py             清洗、彙整、計算指標
│   ├── disease_registry.py      疾病設定檔
│   └── run_pipeline.py          一鍵跑完整流程
├── data/
│   ├── raw/                     原始 CSV
│   └── processed/               彙整後 JSON（給前端用）
├── dashboard/                   互動式儀表板（HTML+JS）
│   ├── index.html
│   ├── style.css                嚴守風格指南
│   ├── app.js                   Chart.js 圖表邏輯
│   └── vendor/                  本地化 Chart.js
├── weekly_report/               週報投影片（A4 橫向，給瀏覽器列印成 PDF）
│   ├── index.html               6 頁投影片骨架
│   ├── slides.css               @page A4 landscape + 列印樣式
│   ├── slides.js                Chart.js 圖表邏輯（共用 data/processed/）
│   └── vendor/                  本地化 Chart.js
├── tests/
│   └── generate_mock_data.py    模擬資料產生器
├── screenshots/                 範例截圖（dashboard_* 與 slide_*）
└── README.md
```

## 安裝與執行

```bash
pip install -r requirements.txt

# 用真實 CDC 資料（需可連 od.cdc.gov.tw）
python pipeline/run_pipeline.py

# 或用模擬資料先試流程
python tests/generate_mock_data.py
python pipeline/run_pipeline.py --skip-fetch

# 啟動本地瀏覽
python -m http.server 8000
# 互動儀表板：http://localhost:8000/dashboard/
# 週報投影片：http://localhost:8000/weekly_report/
```

## 互動式儀表板

NIDSS-style 即時查詢介面：

- 首頁卡片網格，6 種疾病按警示嚴重度排序
- 點卡開詳細頁，5 格 KPI strip
- 趨勢圖：bar + 4 週 MA + 去年同期虛線 + 紅黃閾值線
- 縣市分布（Pattern A 前 3 名強調）
- 年齡層分布（Pattern E 單色階）
- 本土/境外 100% 堆疊橫條
- 範圍切換：近 1 年 / 近 3 年

## 週報投影片

A4 橫向 6 頁，純為列印 PDF 設計：

| 頁次 | 內容 |
|---|---|
| 1 | 封面（週次戳印 + 警示總覽 4 格） |
| 2 | 六大疾病總覽（3×2 卡 + sparkline + 變化率） |
| 3 | 最高警示疾病：縣市熱區 + 年齡層 + 3 重點 callouts |
| 4 | 警示與防疫建議（高/中/低分區） |
| 5 | 歷年同期比較（近 3 年同 ISO 週疊圖 + YTD 對比） |
| 6 | 資料來源、統計說明、設計規範 |

### 列印操作

1. 啟動本地 server: `python -m http.server 8000`
2. 開 `http://localhost:8000/weekly_report/`
3. 等圖表渲染完，按頂端「列印 / 匯出 PDF」或 Ctrl+P
4. **重要設定**：紙張選 **A4**、方向選 **橫向**、**勾選「背景圖形」**（否則底色不會印出來）
5. 邊界選「無」或「最小」

`@page { size: A4 landscape; margin: 0; }` 已寫好，瀏覽器列印對話框應該會自動帶到 A4 橫向。

## 設計遵循的風格指南

| 風格指南條目 | 實作位置 |
|---|---|
| 主色鼠尾草綠 #739A6D / 線條 #5D7F58 | CSS 變數 `--p-500` / `--p-600` |
| Pattern A（主色 + 中性灰） | 縣市分布前 3 名強調，其餘 `--n-400` |
| Pattern E 單色階（ordinal） | 年齡分布由 `--p-200` 漸到 `--p-800` |
| 4 週 trailing MA + 深色 p-800 | trend chart 第二個 dataset |
| 不全紅柱、用獨立閾值線 | annotation plugin 紅黃虛線 |
| `tabular-nums` | `.num` class + `font-feature-settings: "tnum"` |
| Y 軸從 0 開始 | `beginAtZero: true` |
| 右上邊框移除 | `border: { display: false }` |
| 字體分工：Serif TC / Sans TC / Plex Sans | CSS `--font-serif/-sans/-num` |

## 資料來源

CDC 公開資料平台，每日更新：

| 疾病 | URL |
|---|---|
| 法定傳染病每週統計 | https://od.cdc.gov.tw/eic/NotifiableDiseases_5y.csv |
| 登革熱每日確診 | https://od.cdc.gov.tw/eic/Dengue_Daily.csv |
| 流感類流感監測 | https://od.cdc.gov.tw/eic/FluLikeAndCovidILI.csv |
| 腸病毒門急診 | https://od.cdc.gov.tw/eic/Enterovirus.csv |
| COVID-19 法定傳染病 | https://od.cdc.gov.tw/eic/Weekly_Age_County_Gender_19CoV.csv |
| RSV 監測 | https://od.cdc.gov.tw/eic/RSV.csv |

> 資料授權：政府資料開放授權條款
> 引用：「資料來源：衛生福利部疾病管制署」

## 新增疾病

只要在 `pipeline/disease_registry.py` 加一筆設定，pipeline 與兩種前端會自動處理。每筆需要：

- `name_zh` / `name_en` / `icon` / `color` / `category`
- `data_url` — CDC CSV 直連
- `date_col` / `case_col` / `region_col` / `age_col` — CSV 欄位名
- `aggregation` — `daily_to_weekly` / `weekly` / `yearly`
- `alert_thresholds` — `{low, medium, high}`（用於警示判斷 + 投影片閾值橫條 + dashboard 閾值線）
- `advice` — 防疫建議文字
