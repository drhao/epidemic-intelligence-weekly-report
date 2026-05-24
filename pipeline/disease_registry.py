"""
疾病監測設定檔
==============
集中管理所有要追蹤的疾病。新增疾病只要在這裡加一筆設定即可。

每個疾病的設定包含：
- name_zh / name_en: 顯示名稱
- category: 分類（呼吸道 / 蟲媒 / 腸道 / 接觸 / 新興）
- data_url: CDC 開放資料 CSV 直連網址
- date_col / case_col: CSV 中代表「日期」與「病例數」的欄位名稱
- region_col: 地理欄位（縣市）
- age_col / gender_col: 年齡、性別欄位（若有）
- aggregation: 'weekly' 或 'daily'
- alert_thresholds: 警示等級門檻（單週新增病例）
- season_months: 流行季月份（用於季節提示）
"""

DISEASES = {
    "dengue": {
        "name_zh": "登革熱",
        "name_en": "Dengue Fever",
        "category": "蟲媒傳染病",
        "icon": "🦟",
        "color": "#e63946",
        "data_url": "https://od.cdc.gov.tw/eic/Dengue_Daily.csv",
        "date_col": "發病日",
        "case_col": None,             # 每列即一個病例，count 即可
        "region_col": "居住縣市",
        "age_col": "年齡層",
        "gender_col": "性別",
        "type_col": "感染國家",        # 可區分本土/境外
        "aggregation": "daily_to_weekly",
        "alert_thresholds": {"low": 10, "medium": 50, "high": 100},
        "season_months": [7, 8, 9, 10, 11],
        "advice": "清除積水容器、安裝紗窗紗門、外出穿著淺色長袖、使用防蚊液",
    },
    "influenza": {
        "name_zh": "類流感",
        "name_en": "Influenza-Like Illness",
        "category": "呼吸道傳染病",
        "icon": "🤧",
        "color": "#f4a261",
        "data_url": "https://od.cdc.gov.tw/eic/FluLikeAndCovidILI.csv",
        "date_col": "年週",
        "case_col": "急診類流感就診人次",
        "region_col": None,
        "age_col": None,
        "gender_col": None,
        "aggregation": "weekly",
        "alert_thresholds": {"low": 30000, "medium": 60000, "high": 100000},
        "season_months": [11, 12, 1, 2, 3],
        "advice": "施打流感疫苗、勤洗手、戴口罩、保持室內通風、發燒咳嗽應就醫",
    },
    "enterovirus": {
        "name_zh": "腸病毒",
        "name_en": "Enterovirus",
        "category": "腸道傳染病",
        "icon": "🦠",
        "color": "#f1c40f",
        "data_url": "https://od.cdc.gov.tw/eic/Enterovirus.csv",
        "date_col": "年週",
        "case_col": "健保門急診就診人次",
        "region_col": "縣市",
        "age_col": "年齡別",
        "aggregation": "weekly",
        "alert_thresholds": {"low": 3000, "medium": 8000, "high": 15000},
        "season_months": [4, 5, 6, 7, 8, 9],
        "advice": "勤洗手、避免出入擁擠場所、玩具定期消毒、家中有兒童者注意手足口症徵兆",
    },
    "covid19": {
        "name_zh": "COVID-19",
        "name_en": "COVID-19",
        "category": "新興呼吸道傳染病",
        "icon": "😷",
        "color": "#9b59b6",
        "data_url": "https://od.cdc.gov.tw/eic/Weekly_Age_County_Gender_19CoV.csv",
        "date_col": "年週",
        "case_col": "確定病例數",
        "region_col": "縣市",
        "age_col": "年齡層",
        "gender_col": "性別",
        "aggregation": "weekly",
        "alert_thresholds": {"low": 1000, "medium": 5000, "high": 15000},
        "season_months": [11, 12, 1, 2, 3],
        "advice": "施打疫苗追加劑、有症狀儘速快篩、高風險族群儘早就醫評估抗病毒藥物",
    },
    "rsv": {
        "name_zh": "呼吸道融合病毒",
        "name_en": "RSV",
        "category": "呼吸道傳染病",
        "icon": "👶",
        "color": "#3498db",
        "data_url": "https://od.cdc.gov.tw/eic/RSV.csv",
        "date_col": "年週",
        "case_col": "陽性數",
        "region_col": None,
        "age_col": "年齡層",
        "aggregation": "weekly",
        "alert_thresholds": {"low": 100, "medium": 300, "high": 600},
        "season_months": [10, 11, 12, 1, 2, 3],
        "advice": "二歲以下幼兒避免出入人潮、家有新生兒者照顧前洗手、有早產等風險者諮詢免疫球蛋白",
    },
    "notifiable_5y": {
        "name_zh": "法定傳染病五年統計",
        "name_en": "Notifiable Diseases 5-Year",
        "category": "綜合監測",
        "icon": "📊",
        "color": "#34495e",
        "data_url": "https://od.cdc.gov.tw/eic/NotifiableDiseases_5y.csv",
        "date_col": "年",
        "case_col": "確定病例數",
        "region_col": "縣市",
        "age_col": "年齡層",
        "gender_col": "性別",
        "type_col": "病名",
        "aggregation": "yearly",
        "alert_thresholds": None,
        "season_months": None,
        "advice": None,
    },
}


def list_diseases():
    """回傳所有疾病的 id 清單"""
    return list(DISEASES.keys())


def get_disease(disease_id):
    """取得單一疾病設定"""
    if disease_id not in DISEASES:
        raise KeyError(f"未知疾病 id: {disease_id}，可用的有 {list_diseases()}")
    return DISEASES[disease_id]


def get_alert_level(disease_id, weekly_cases):
    """根據單週病例數判定警示等級"""
    cfg = get_disease(disease_id)
    th = cfg.get("alert_thresholds")
    if not th:
        return None
    if weekly_cases >= th["high"]:
        return "high"
    if weekly_cases >= th["medium"]:
        return "medium"
    if weekly_cases >= th["low"]:
        return "low"
    return "normal"


if __name__ == "__main__":
    print(f"目前監測 {len(DISEASES)} 種疾病：")
    for did, cfg in DISEASES.items():
        print(f"  {cfg['icon']} {cfg['name_zh']:18}  類別: {cfg['category']}")
