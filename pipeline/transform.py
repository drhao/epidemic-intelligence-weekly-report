"""
資料轉換模組
============
讀取 data/raw/ 的 CSV，輸出 data/processed/ 的 JSON。

每個疾病會產生：
- {disease_id}_summary.json   主要彙整：每週/每日總計、警示等級、趨勢
- {disease_id}_by_region.json 縣市分佈
- {disease_id}_by_age.json    年齡層分佈
- {disease_id}_meta.json      最新更新時間、資料筆數、欄位健檢

同時產生一個跨疾病的：
- overview.json               儀表板首頁用的全疾病摘要
"""
from __future__ import annotations

import json
import logging
import re
from collections import defaultdict, Counter
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from disease_registry import DISEASES, get_disease, get_alert_level

# ───── 路徑設定 ─────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
PROCESSED_DIR = BASE_DIR / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("transform")


# ═══════════════════════════════════════════════════════
# 工具函式
# ═══════════════════════════════════════════════════════
def _read_csv(path: Path) -> pd.DataFrame:
    """讀 CSV，自動處理常見的編碼/欄位空白問題。"""
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    df.columns = [c.strip() for c in df.columns]
    return df


def _parse_yearweek(value: str) -> tuple[int, int] | None:
    """
    解析 CDC 常見的「年週」欄位格式：
      '2025-W21' / '202521' / '2025/21' / '2025 21' / '2025年第21週'
    回傳 (year, week) 或 None
    """
    if not value:
        return None
    s = str(value).strip()

    patterns = [
        r"(\d{4})\D*W?(\d{1,2})",   # 2025-W21, 202521, 2025/21, 2025年21週
    ]
    for pat in patterns:
        m = re.search(pat, s)
        if m:
            y, w = int(m.group(1)), int(m.group(2))
            if 1 <= w <= 53 and 2000 <= y <= 2100:
                return y, w
    return None


def _parse_date(value: str) -> date | None:
    """解析常見日期格式。"""
    if not value:
        return None
    s = str(value).strip()
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y%m%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _safe_int(value, default=0) -> int:
    """把字串轉成 int，失敗回 default。"""
    if value is None:
        return default
    try:
        v = str(value).strip().replace(",", "")
        if v == "" or v.lower() == "nan":
            return default
        return int(float(v))
    except (ValueError, TypeError):
        return default


def _date_of_iso_week(year: int, week: int) -> date:
    """回傳該 ISO 週的週一日期，方便排序與比較。"""
    try:
        return date.fromisocalendar(year, week, 1)
    except ValueError:
        return date(year, 1, 1)


# ═══════════════════════════════════════════════════════
# 主轉換函式
# ═══════════════════════════════════════════════════════
def transform_disease(disease_id: str) -> dict[str, Any] | None:
    """
    處理單一疾病的 CSV，產出多個 JSON。

    回傳 summary 資料以便 overview 彙整使用。
    """
    cfg = get_disease(disease_id)
    csv_path = RAW_DIR / f"{disease_id}_latest.csv"

    if not csv_path.exists():
        log.warning(f"⚠  {disease_id}: 找不到 {csv_path}，跳過")
        return None

    log.info(f"⚙  處理 {cfg['name_zh']} ({disease_id})")

    try:
        df = _read_csv(csv_path)
    except Exception as e:
        log.error(f"✗ 讀 CSV 失敗：{e}")
        return None

    if df.empty:
        log.warning(f"⚠ {disease_id}: 空資料")
        return None

    log.info(f"   讀入 {len(df):,} 列，欄位：{list(df.columns)[:8]}...")

    # 依 aggregation 類型分流
    agg = cfg.get("aggregation", "weekly")
    if agg == "daily_to_weekly":
        summary = _process_daily_to_weekly(df, cfg)
    elif agg == "weekly":
        summary = _process_weekly(df, cfg)
    elif agg == "yearly":
        summary = _process_yearly(df, cfg)
    else:
        log.error(f"未知 aggregation: {agg}")
        return None

    if summary is None:
        return None

    # 加上設定檔資訊
    summary["disease_id"] = disease_id
    summary["name_zh"] = cfg["name_zh"]
    summary["name_en"] = cfg["name_en"]
    summary["category"] = cfg["category"]
    summary["icon"] = cfg["icon"]
    summary["color"] = cfg["color"]
    summary["advice"] = cfg.get("advice")
    summary["last_updated"] = datetime.now().isoformat(timespec="seconds")

    # 警示等級 + 閾值（給前端畫水平標註線用）
    latest_count = summary.get("latest_period", {}).get("cases", 0)
    summary["alert_level"] = get_alert_level(disease_id, latest_count)
    summary["alert_thresholds"] = cfg.get("alert_thresholds")

    # 儲存主檔
    out_path = PROCESSED_DIR / f"{disease_id}_summary.json"
    out_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    log.info(f"✓ 已輸出 {out_path.name}")

    return summary


# ═══════════════════════════════════════════════════════
# 三種彙整模式
# ═══════════════════════════════════════════════════════
def _process_daily_to_weekly(df: pd.DataFrame, cfg: dict) -> dict | None:
    """
    每列一個病例的格式（如登革熱），彙整成週統計。
    """
    date_col = cfg["date_col"]
    region_col = cfg.get("region_col")
    age_col = cfg.get("age_col")
    type_col = cfg.get("type_col")

    if date_col not in df.columns:
        log.error(f"找不到日期欄位 {date_col}，現有欄位：{list(df.columns)}")
        return None

    # 解析日期 → ISO 年週
    df["_date"] = df[date_col].apply(_parse_date)
    df = df[df["_date"].notna()].copy()
    if df.empty:
        log.warning("日期解析後沒剩任何資料")
        return None
    df["_year"] = df["_date"].apply(lambda d: d.isocalendar()[0])
    df["_week"] = df["_date"].apply(lambda d: d.isocalendar()[1])
    df["_yw"] = df["_year"].astype(str) + "-W" + df["_week"].astype(str).str.zfill(2)

    # 週序列
    weekly = (
        df.groupby("_yw")
          .size()
          .reset_index(name="cases")
          .sort_values("_yw")
    )
    weekly_list = weekly.to_dict("records")

    # 縣市分布（最近 4 週）
    by_region = []
    if region_col and region_col in df.columns:
        latest_weeks = weekly["_yw"].tail(4).tolist()
        recent = df[df["_yw"].isin(latest_weeks)]
        by_region = (
            recent.groupby(region_col)
                  .size()
                  .reset_index(name="cases")
                  .sort_values("cases", ascending=False)
                  .rename(columns={region_col: "region"})
                  .to_dict("records")
        )

    # 年齡分布
    by_age = []
    if age_col and age_col in df.columns:
        by_age = (
            df.groupby(age_col)
              .size()
              .reset_index(name="cases")
              .rename(columns={age_col: "age_group"})
              .to_dict("records")
        )

    # 本土 vs 境外（若有）
    by_type = {}
    if type_col and type_col in df.columns:
        for t, n in df[type_col].value_counts().items():
            label = "本土" if (t == "台灣" or t == "臺灣" or t == "本土") else "境外"
            by_type[label] = by_type.get(label, 0) + int(n)

    latest_row = weekly_list[-1] if weekly_list else {"_yw": "N/A", "cases": 0}

    return {
        "total_cases": int(df.shape[0]),
        "weekly_series": [
            {"period": r["_yw"], "cases": int(r["cases"])} for r in weekly_list
        ],
        "by_region": by_region,
        "by_age": by_age,
        "by_type": by_type,
        "latest_period": {"period": latest_row["_yw"], "cases": int(latest_row["cases"])},
    }


def _process_weekly(df: pd.DataFrame, cfg: dict) -> dict | None:
    """
    已是週統計的格式（如類流感、COVID-19、腸病毒）。
    """
    date_col = cfg["date_col"]
    case_col = cfg.get("case_col")
    region_col = cfg.get("region_col")
    age_col = cfg.get("age_col")

    if date_col not in df.columns:
        log.error(f"找不到日期欄位 {date_col}")
        return None
    if case_col and case_col not in df.columns:
        # 嘗試模糊比對
        candidates = [c for c in df.columns if any(k in c for k in ["病例", "人次", "陽性", "確診", "件數"])]
        log.warning(f"找不到病例欄位 {case_col}，候選：{candidates}")
        if candidates:
            case_col = candidates[0]
            log.info(f"   自動改用 {case_col}")
        else:
            return None

    df["_yw_parsed"] = df[date_col].apply(_parse_yearweek)
    df = df[df["_yw_parsed"].notna()].copy()
    if df.empty:
        return None
    df["_year"] = df["_yw_parsed"].apply(lambda x: x[0])
    df["_week"] = df["_yw_parsed"].apply(lambda x: x[1])
    df["_yw"] = df["_year"].astype(str) + "-W" + df["_week"].astype(str).str.zfill(2)
    df["_cases"] = df[case_col].apply(_safe_int) if case_col else 1

    weekly = (
        df.groupby("_yw")["_cases"]
          .sum()
          .reset_index(name="cases")
          .sort_values("_yw")
    )
    weekly_list = weekly.to_dict("records")

    by_region = []
    if region_col and region_col in df.columns:
        # 取最近 4 週
        latest_weeks = weekly["_yw"].tail(4).tolist()
        recent = df[df["_yw"].isin(latest_weeks)]
        by_region = (
            recent.groupby(region_col)["_cases"]
                  .sum()
                  .reset_index(name="cases")
                  .sort_values("cases", ascending=False)
                  .rename(columns={region_col: "region"})
                  .to_dict("records")
        )

    by_age = []
    if age_col and age_col in df.columns:
        by_age = (
            df.groupby(age_col)["_cases"]
              .sum()
              .reset_index(name="cases")
              .rename(columns={age_col: "age_group"})
              .to_dict("records")
        )

    latest = weekly_list[-1] if weekly_list else {"_yw": "N/A", "cases": 0}

    return {
        "total_cases": int(df["_cases"].sum()),
        "weekly_series": [
            {"period": r["_yw"], "cases": int(r["cases"])} for r in weekly_list
        ],
        "by_region": by_region,
        "by_age": by_age,
        "by_type": {},
        "latest_period": {"period": latest["_yw"], "cases": int(latest["cases"])},
    }


def _process_yearly(df: pd.DataFrame, cfg: dict) -> dict | None:
    """
    年度統計（如 5 年法定傳染病彙整）。
    """
    date_col = cfg["date_col"]
    case_col = cfg.get("case_col")
    type_col = cfg.get("type_col")  # 病名
    if date_col not in df.columns:
        return None
    df["_year"] = df[date_col].apply(_safe_int)
    df["_cases"] = df[case_col].apply(_safe_int) if case_col else 1

    yearly = df.groupby("_year")["_cases"].sum().reset_index(name="cases").sort_values("_year")
    series = [
        {"period": str(int(r["_year"])), "cases": int(r["cases"])}
        for _, r in yearly.iterrows()
        if r["_year"] >= 2000
    ]

    by_disease = []
    if type_col and type_col in df.columns:
        by_disease = (
            df.groupby(type_col)["_cases"].sum()
              .reset_index(name="cases")
              .sort_values("cases", ascending=False)
              .head(20)
              .rename(columns={type_col: "disease"})
              .to_dict("records")
        )

    latest = series[-1] if series else {"period": "N/A", "cases": 0}
    return {
        "total_cases": int(df["_cases"].sum()),
        "weekly_series": series,   # 名稱沿用以便前端統一處理
        "by_region": [],
        "by_age": [],
        "by_type": {},
        "by_disease": by_disease,
        "latest_period": latest,
    }


# ═══════════════════════════════════════════════════════
# Overview 彙整
# ═══════════════════════════════════════════════════════
def build_overview(summaries: dict[str, dict]) -> dict:
    """根據所有疾病的 summary 產生首頁總覽。"""
    cards = []
    alert_count = {"high": 0, "medium": 0, "low": 0, "normal": 0}

    for did, s in summaries.items():
        if s is None:
            continue
        latest = s.get("latest_period", {})
        # 計算與前一週的變化
        series = s.get("weekly_series", [])
        change_pct = None
        if len(series) >= 2:
            prev = series[-2]["cases"]
            curr = series[-1]["cases"]
            if prev > 0:
                change_pct = round((curr - prev) / prev * 100, 1)
            elif curr > 0:
                change_pct = 100.0
            else:
                change_pct = 0.0

        alert = s.get("alert_level") or "normal"
        alert_count[alert] = alert_count.get(alert, 0) + 1

        cards.append({
            "disease_id": did,
            "name_zh": s["name_zh"],
            "category": s["category"],
            "icon": s["icon"],
            "color": s["color"],
            "latest_period": latest.get("period"),
            "latest_cases": latest.get("cases"),
            "change_pct": change_pct,
            "alert_level": alert,
            "advice": s.get("advice"),
            "total_cases": s.get("total_cases"),
        })

    # 風險最高的排前面
    severity_order = {"high": 0, "medium": 1, "low": 2, "normal": 3, None: 4}
    cards.sort(key=lambda c: severity_order.get(c["alert_level"], 4))

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "total_diseases": len(cards),
        "alert_summary": alert_count,
        "cards": cards,
    }


# ═══════════════════════════════════════════════════════
# CLI 入口
# ═══════════════════════════════════════════════════════
def run_all():
    summaries = {}
    for did in DISEASES.keys():
        try:
            summaries[did] = transform_disease(did)
        except Exception as e:
            log.exception(f"✗ {did} 處理時發生例外：{e}")
            summaries[did] = None

    overview = build_overview(summaries)
    overview_path = PROCESSED_DIR / "overview.json"
    overview_path.write_text(
        json.dumps(overview, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    log.info(f"✓ Overview 已輸出 {overview_path.name}")
    log.info(f"   警示分佈：{overview['alert_summary']}")
    return overview


if __name__ == "__main__":
    run_all()
