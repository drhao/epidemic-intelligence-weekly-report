"""
測試用模擬資料產生器
====================
產生符合台灣 CDC 開放資料真實格式的 CSV，存到 data/raw/

用途：
- 在無法直連 CDC 的環境（如雲端沙箱）測試 pipeline
- 開發時不想頻繁打 CDC 主機

格式參考：
- Dengue_Daily.csv: 每列一個病例
- FluLikeAndCovidILI.csv: 週統計
- Enterovirus.csv: 週統計（含縣市）
- Weekly_Age_County_Gender_19CoV.csv: 週統計（縣市+年齡+性別）
- RSV.csv: 週統計
- NotifiableDiseases_5y.csv: 年度
"""
from __future__ import annotations

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

random.seed(20260524)

COUNTIES = [
    "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市",
    "基隆市", "新竹市", "新竹縣", "苗栗縣", "彰化縣", "南投縣",
    "雲林縣", "嘉義市", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣",
    "臺東縣", "澎湖縣", "金門縣", "連江縣",
]

AGE_GROUPS = ["0-4", "5-9", "10-14", "15-24", "25-49", "50-64", "65+"]
GENDERS = ["男", "女"]


# ───────────────────────────────────────────────────────
# 工具
# ───────────────────────────────────────────────────────
def _iso_week(d: date) -> tuple[int, int]:
    y, w, _ = d.isocalendar()
    return y, w


def _gen_weeks(num_weeks: int) -> list[tuple[int, int, date]]:
    """產生最近 num_weeks 週的 (year, week, monday_date)。"""
    today = date(2026, 5, 18)   # 為了讓輸出穩定，固定基準日
    monday = today - timedelta(days=today.weekday())
    weeks = []
    for i in range(num_weeks - 1, -1, -1):
        d = monday - timedelta(weeks=i)
        y, w = _iso_week(d)
        weeks.append((y, w, d))
    return weeks


def _seasonal_factor(month: int, peak_months: list[int]) -> float:
    """根據月份產生季節性係數，流行季倍數較高。"""
    if month in peak_months:
        return 2.5 + random.uniform(-0.3, 0.8)
    if (month % 12 + 1) in peak_months or (month - 2) % 12 + 1 in peak_months:
        return 1.3 + random.uniform(-0.2, 0.4)
    return 0.6 + random.uniform(-0.2, 0.3)


# ───────────────────────────────────────────────────────
# 每個疾病的產生函式
# ───────────────────────────────────────────────────────
def gen_dengue(path: Path, num_weeks: int = 156):
    """登革熱：每列一個病例，含發病日、居住縣市、年齡層、性別、感染國家。"""
    weeks = _gen_weeks(num_weeks)
    rows = []
    for (y, w, monday) in weeks:
        month = monday.month
        factor = _seasonal_factor(month, [7, 8, 9, 10, 11])
        base = random.gauss(40, 12)
        n = max(0, int(base * factor))
        for _ in range(n):
            offset = random.randint(0, 6)
            d = monday + timedelta(days=offset)
            # 8 成本土、2 成境外
            country = "臺灣" if random.random() < 0.8 else random.choice(["越南", "印尼", "菲律賓", "泰國"])
            rows.append({
                "發病日": d.strftime("%Y/%-m/%-d") if hasattr(d, 'strftime') else f"{d.year}/{d.month}/{d.day}",
                "個案研判日": d.strftime("%Y/%-m/%-d") if hasattr(d, 'strftime') else f"{d.year}/{d.month}/{d.day}",
                "性別": random.choice(GENDERS),
                "年齡層": random.choices(AGE_GROUPS, weights=[2, 3, 4, 8, 18, 10, 6])[0],
                "居住縣市": random.choices(
                    COUNTIES,
                    weights=[3, 4, 4, 5, 12, 14, 1, 2, 2, 2, 3, 1, 2, 2, 2, 4, 1, 1, 1, 1, 1, 1],
                )[0],
                "居住鄉鎮": "",
                "感染國家": country,
                "是否境外移入": "否" if country == "臺灣" else "是",
                "確定病例數": "1",
            })

    fieldnames = ["發病日", "個案研判日", "性別", "年齡層", "居住縣市", "居住鄉鎮", "感染國家", "是否境外移入", "確定病例數"]
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        # 自訂日期格式 (跨平台)
        for r in rows:
            d_parts = r["發病日"].split("/")
            r["發病日"] = f"{d_parts[0]}/{int(d_parts[1])}/{int(d_parts[2])}"
            d_parts = r["個案研判日"].split("/")
            r["個案研判日"] = f"{d_parts[0]}/{int(d_parts[1])}/{int(d_parts[2])}"
            w.writerow(r)
    print(f"  dengue: {len(rows):,} rows -> {path.name}")


def gen_influenza(path: Path, num_weeks: int = 156):
    """類流感：週統計，無縣市分布。"""
    weeks = _gen_weeks(num_weeks)
    rows = []
    for (y, w, monday) in weeks:
        month = monday.month
        factor = _seasonal_factor(month, [11, 12, 1, 2, 3])
        cases = max(0, int(random.gauss(40000, 8000) * factor))
        rows.append({
            "年週": f"{y}-W{w:02d}",
            "急診類流感就診人次": cases,
            "急診總就診人次": int(cases * random.uniform(8, 15)),
            "急診類流感就診百分比": round(cases / max(1, cases * random.uniform(8, 15)) * 100, 2),
        })
    with path.open("w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    print(f"  influenza: {len(rows):,} rows -> {path.name}")


def gen_enterovirus(path: Path, num_weeks: int = 156):
    """腸病毒：週統計 × 縣市 × 年齡別。"""
    weeks = _gen_weeks(num_weeks)
    rows = []
    for (y, w, monday) in weeks:
        month = monday.month
        factor = _seasonal_factor(month, [4, 5, 6, 7, 8, 9])
        for county in COUNTIES:
            county_weight = {"臺北市": 1.5, "新北市": 1.8, "桃園市": 1.4, "臺中市": 1.6,
                             "臺南市": 1.2, "高雄市": 1.5}.get(county, 0.5)
            for age in ["0-4", "5-9", "10-14"]:
                age_weight = {"0-4": 3.0, "5-9": 1.5, "10-14": 0.5}[age]
                cases = max(0, int(random.gauss(80, 25) * factor * county_weight * age_weight))
                rows.append({
                    "年週": f"{y}-W{w:02d}",
                    "縣市": county,
                    "年齡別": age,
                    "健保門急診就診人次": cases,
                })
    with path.open("w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    print(f"  enterovirus: {len(rows):,} rows -> {path.name}")


def gen_covid19(path: Path, num_weeks: int = 156):
    """COVID-19：週統計 × 縣市 × 年齡層 × 性別。"""
    weeks = _gen_weeks(num_weeks)
    rows = []
    for (y, w, monday) in weeks:
        month = monday.month
        factor = _seasonal_factor(month, [11, 12, 1, 2, 3])
        for county in COUNTIES:
            cw = {"臺北市": 1.5, "新北市": 2.0, "桃園市": 1.4, "臺中市": 1.6,
                  "臺南市": 1.2, "高雄市": 1.5}.get(county, 0.5)
            for age in AGE_GROUPS:
                aw = {"0-4": 0.4, "5-9": 0.5, "10-14": 0.7, "15-24": 1.1,
                      "25-49": 2.2, "50-64": 1.4, "65+": 1.6}[age]
                for gender in GENDERS:
                    cases = max(0, int(random.gauss(60, 20) * factor * cw * aw))
                    rows.append({
                        "年週": f"{y}-W{w:02d}",
                        "縣市": county,
                        "年齡層": age,
                        "性別": gender,
                        "確定病例數": cases,
                    })
    with path.open("w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    print(f"  covid19: {len(rows):,} rows -> {path.name}")


def gen_rsv(path: Path, num_weeks: int = 156):
    """RSV：週統計 × 年齡層。"""
    weeks = _gen_weeks(num_weeks)
    rows = []
    for (y, w, monday) in weeks:
        month = monday.month
        factor = _seasonal_factor(month, [10, 11, 12, 1, 2, 3])
        for age in AGE_GROUPS:
            aw = {"0-4": 4.0, "5-9": 0.8, "10-14": 0.3, "15-24": 0.2,
                  "25-49": 0.3, "50-64": 0.4, "65+": 0.8}[age]
            cases = max(0, int(random.gauss(50, 15) * factor * aw))
            rows.append({
                "年週": f"{y}-W{w:02d}",
                "年齡層": age,
                "陽性數": cases,
                "送驗數": int(cases * random.uniform(3, 6)),
            })
    with path.open("w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    print(f"  rsv: {len(rows):,} rows -> {path.name}")


def gen_notifiable_5y(path: Path):
    """法定傳染病 5 年彙整：年度 × 病名 × 縣市 × 年齡層 × 性別。"""
    diseases = [
        "登革熱", "流感併發重症", "新型A型流感", "腸病毒感染併發重症",
        "麻疹", "德國麻疹", "百日咳", "侵襲性肺炎鏈球菌感染症",
        "結核病", "桿菌性痢疾", "傷寒", "急性病毒性A型肝炎",
        "急性病毒性B型肝炎", "急性病毒性C型肝炎", "梅毒", "淋病",
        "愛滋病", "腸道出血性大腸桿菌感染症", "霍亂", "退伍軍人病",
    ]
    rows = []
    for year in range(2021, 2026):
        for d in diseases:
            base = random.gauss(500, 200)
            for county in COUNTIES:
                cw = {"臺北市": 1.5, "新北市": 2.0, "臺中市": 1.6,
                      "臺南市": 1.2, "高雄市": 1.5}.get(county, 0.5)
                cases = max(0, int(base * cw / len(COUNTIES) * random.uniform(0.5, 1.5)))
                if cases == 0:
                    continue
                rows.append({
                    "年": year,
                    "病名": d,
                    "縣市": county,
                    "年齡層": random.choice(AGE_GROUPS),
                    "性別": random.choice(GENDERS),
                    "確定病例數": cases,
                })
    with path.open("w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    print(f"  notifiable_5y: {len(rows):,} rows -> {path.name}")


# ───────────────────────────────────────────────────────
# 主入口
# ───────────────────────────────────────────────────────
def generate_all():
    print("產生模擬 CDC 開放資料 ...")
    gen_dengue(RAW_DIR / "dengue_latest.csv")
    gen_influenza(RAW_DIR / "influenza_latest.csv")
    gen_enterovirus(RAW_DIR / "enterovirus_latest.csv")
    gen_covid19(RAW_DIR / "covid19_latest.csv")
    gen_rsv(RAW_DIR / "rsv_latest.csv")
    gen_notifiable_5y(RAW_DIR / "notifiable_5y_latest.csv")
    print("完成。")


if __name__ == "__main__":
    generate_all()
