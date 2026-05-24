"""
一鍵執行：抓取 + 轉換
====================
用法：
    python pipeline/run_pipeline.py            # 全部
    python pipeline/run_pipeline.py --force    # 強制重抓
    python pipeline/run_pipeline.py --skip-fetch  # 跳過下載直接用既有 CSV
    python pipeline/run_pipeline.py --disease dengue   # 只跑一個
"""
import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from disease_registry import DISEASES
import fetch
import transform

log = logging.getLogger("pipeline")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--force", action="store_true", help="強制重新下載")
    p.add_argument("--skip-fetch", action="store_true", help="跳過下載階段")
    p.add_argument("--disease", help="只處理一個疾病")
    args = p.parse_args()

    targets = [args.disease] if args.disease else list(DISEASES.keys())

    # Step 1: 下載
    if not args.skip_fetch:
        print("━" * 60)
        print("  Step 1/2  下載資料")
        print("━" * 60)
        fetch.fetch_all(disease_ids=targets, force=args.force)

    # Step 2: 轉換
    print()
    print("━" * 60)
    print("  Step 2/2  處理資料")
    print("━" * 60)
    if args.disease:
        transform.transform_disease(args.disease)
        # 即便只處理一個，也更新 overview
        all_summaries = {}
        for did in DISEASES:
            sum_path = transform.PROCESSED_DIR / f"{did}_summary.json"
            if sum_path.exists():
                import json
                all_summaries[did] = json.loads(sum_path.read_text(encoding="utf-8"))
        overview = transform.build_overview(all_summaries)
        import json
        (transform.PROCESSED_DIR / "overview.json").write_text(
            json.dumps(overview, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
    else:
        transform.run_all()

    print()
    print("━" * 60)
    print("  ✓ 完成")
    print("━" * 60)
    print(f"  原始檔: {fetch.RAW_DIR}")
    print(f"  處理後: {transform.PROCESSED_DIR}")
    print()
    print("  下一步：python -m http.server 8000")
    print("        然後開 http://localhost:8000/dashboard/")
    print()


if __name__ == "__main__":
    main()
