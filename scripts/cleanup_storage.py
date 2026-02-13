"""
清理孤立文件脚本（默认仅输出，不执行删除）
"""
import os
import argparse
from datetime import datetime, timedelta

from db_models import Session, Paper
from file_service import file_service


def collect_known_files(session: Session) -> set[str]:
    known = set()
    papers = session.query(Paper).all()
    for p in papers:
        if p.file_path:
            path = file_service.get_file_path_by_relative(p.file_path)
            if path:
                known.add(os.path.realpath(path))
        if p.translated_file_path:
            path = file_service.get_safe_absolute_path(p.translated_file_path)
            if path:
                known.add(os.path.realpath(path))
        if p.translated_dual_path:
            path = file_service.get_safe_absolute_path(p.translated_dual_path)
            if path:
                known.add(os.path.realpath(path))
    return known


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--days', type=int, default=30, help='仅清理超过指定天数的文件')
    parser.add_argument('--apply', action='store_true', help='执行删除（默认仅输出）')
    args = parser.parse_args()

    cutoff = datetime.now() - timedelta(days=max(args.days, 0))

    session = Session()
    try:
        known_files = collect_known_files(session)
    finally:
        session.close()

    removed = 0
    scanned = 0
    for root, _, files in os.walk(file_service.base_path):
        for filename in files:
            if not filename.endswith('.pdf'):
                continue
            file_path = os.path.realpath(os.path.join(root, filename))
            scanned += 1
            if file_path in known_files:
                continue
            mtime = datetime.fromtimestamp(os.path.getmtime(file_path))
            if mtime > cutoff:
                continue
            if args.apply:
                try:
                    os.remove(file_path)
                    removed += 1
                except Exception:
                    pass
            else:
                print(f"[DRY RUN] {file_path}")

    print(f"扫描文件: {scanned}, 计划删除: {removed}")


if __name__ == '__main__':
    main()
