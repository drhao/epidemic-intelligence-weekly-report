"""
資料抓取模組
============
從台灣 CDC 開放資料平台下載 CSV 並存到 data/raw/

設計重點：
- 容錯：網路逾時/失敗會 retry，最多重試三次
- 編碼：CDC CSV 多為 UTF-8 或 Big5，自動偵測
- 快取：當天已下載過的就不重抓（除非強制更新）
- 紀錄：每次下載都寫入 fetch_log.json 方便追蹤
"""
from __future__ import annotations

import csv
import io
import json
import logging
import time
from datetime import datetime, date
from pathlib import Path
from typing import Optional

import requests

from disease_registry import DISEASES, get_disease

# ───── 路徑設定 ─────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)
LOG_PATH = RAW_DIR / "fetch_log.json"

# ───── HTTP 設定 ────────────────────────────────────────
TIMEOUT = 60                # CDC 大檔有時要 30 秒以上
RETRY = 3
RETRY_DELAY = 5             # 秒
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("fetch")


# ───── 編碼偵測 ─────────────────────────────────────────
def _decode_csv_bytes(raw: bytes) -> str:
    """CDC 有些檔是 UTF-8，有些是 Big5；按優先順序嘗試。"""
    for enc in ("utf-8-sig", "utf-8", "big5", "cp950"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    # 最後保底：用 replace，至少不會炸掉
    return raw.decode("utf-8", errors="replace")


# ───── 主抓取函式 ───────────────────────────────────────
def fetch_one(disease_id: str, force: bool = False) -> Optional[Path]:
    """
    下載單一疾病的 CSV 並存檔。

    Parameters
    ----------
    disease_id : str
        在 disease_registry.DISEASES 裡的 key
    force : bool
        True 強制重新下載；False 則當天下載過就跳過

    Returns
    -------
    Path | None
        存檔路徑，失敗則回傳 None
    """
    cfg = get_disease(disease_id)
    url = cfg["data_url"]
    today = date.today().isoformat()
    target = RAW_DIR / f"{disease_id}_{today}.csv"
    latest = RAW_DIR / f"{disease_id}_latest.csv"

    if target.exists() and not force:
        log.info(f"⏭  {disease_id}: 今日已下載過，跳過")
        return target

    last_err = None
    for attempt in range(1, RETRY + 1):
        try:
            log.info(f"⬇  {disease_id}: 嘗試第 {attempt} 次下載 {url}")
            resp = requests.get(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "text/csv,*/*"},
                timeout=TIMEOUT,
                stream=True,
            )
            resp.raise_for_status()

            # 全部讀進來再解碼（CDC 的 CSV 通常 < 50MB）
            raw = resp.content
            if len(raw) < 100:
                raise ValueError(f"檔案太小，疑似錯誤回應: {raw[:100]!r}")

            text = _decode_csv_bytes(raw)

            # 簡單健檢：第一行至少要有逗號（CSV 標頭）
            first_line = text.splitlines()[0] if text else ""
            if "," not in first_line and "\t" not in first_line:
                raise ValueError(f"非 CSV 格式: {first_line[:80]}")

            target.write_text(text, encoding="utf-8")
            # 同步更新 latest，方便下游固定讀檔名
            latest.write_text(text, encoding="utf-8")

            rows = text.count("\n")
            log.info(f"✓  {disease_id}: 下載完成，約 {rows:,} 列")
            _append_log(disease_id, url, "ok", rows, str(target))
            return target

        except Exception as e:
            last_err = e
            log.warning(f"✗  {disease_id}: 第 {attempt} 次失敗 — {e}")
            if attempt < RETRY:
                time.sleep(RETRY_DELAY)

    log.error(f"💥 {disease_id}: 三次都失敗，放棄。最後錯誤：{last_err}")
    _append_log(disease_id, url, f"error: {last_err}", 0, None)
    return None


def fetch_all(disease_ids=None, force: bool = False) -> dict:
    """
    批次下載多個疾病的 CSV。

    Parameters
    ----------
    disease_ids : list[str] | None
        要下載的疾病 id；None 代表全部
    force : bool
        是否強制重抓

    Returns
    -------
    dict
        {disease_id: Path | None}
    """
    if disease_ids is None:
        disease_ids = list(DISEASES.keys())

    results = {}
    for did in disease_ids:
        results[did] = fetch_one(did, force=force)
    return results


# ───── 紀錄檔 ───────────────────────────────────────────
def _append_log(disease_id, url, status, rows, path):
    history = []
    if LOG_PATH.exists():
        try:
            history = json.loads(LOG_PATH.read_text(encoding="utf-8"))
        except Exception:
            history = []
    history.append({
        "time": datetime.now().isoformat(timespec="seconds"),
        "disease": disease_id,
        "url": url,
        "status": status,
        "rows": rows,
        "path": path,
    })
    # 只留最近 200 筆
    LOG_PATH.write_text(
        json.dumps(history[-200:], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ───── CLI 入口 ─────────────────────────────────────────
if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="從 CDC 開放資料下載 CSV")
    p.add_argument("--disease", help="只下載某一個疾病（id），如 dengue")
    p.add_argument("--force", action="store_true", help="強制重新下載")
    args = p.parse_args()

    if args.disease:
        fetch_one(args.disease, force=args.force)
    else:
        fetch_all(force=args.force)
