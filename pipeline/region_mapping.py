"""
6 區管中心對應
==============
疾管署六個區管中心（Regional Centers for Disease Control）與台灣 22 縣市的對應。

宜蘭、金門、連江 歸 台北區（非東區）。
東區僅含 花蓮、臺東。
"""

# Canonical zone → 縣市清單（包含 台/臺 兩種寫法以容錯）
REGION_CENTER_COUNTIES = {
    "台北區": ["基隆市", "臺北市", "台北市", "新北市", "宜蘭縣", "金門縣", "連江縣"],
    "北區":   ["桃園市", "新竹縣", "新竹市", "苗栗縣"],
    "中區":   ["臺中市", "台中市", "彰化縣", "南投縣"],
    "南區":   ["雲林縣", "嘉義縣", "嘉義市", "臺南市", "台南市"],
    "高屏區": ["高雄市", "屏東縣", "澎湖縣"],
    "東區":   ["花蓮縣", "臺東縣", "台東縣"],
}

# 圖例固定順序（對應前端 --cat-1..--cat-6）
REGION_CENTER_ORDER = ["台北區", "北區", "中區", "南區", "高屏區", "東區"]

# 反向索引：縣市 → 區管中心
COUNTY_TO_CENTER = {
    county: zone
    for zone, counties in REGION_CENTER_COUNTIES.items()
    for county in counties
}


def get_region_center(county: str) -> str | None:
    """回傳給定縣市所屬的區管中心。找不到回 None。"""
    if not county:
        return None
    return COUNTY_TO_CENTER.get(str(county).strip())
