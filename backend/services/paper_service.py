"""
论文服务层 - 封装论文相关核心业务逻辑
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import Optional

from db_models import Paper, User, Group
from file_service import file_service


class PaperService:
    """论文服务"""

    def __init__(self, db: Session):
        self.db = db

    def get_paper(self, paper_id: int) -> Paper:
        paper = (
            self.db.query(Paper)
            .options(joinedload(Paper.groups), joinedload(Paper.owner))
            .filter(Paper.id == paper_id)
            .first()
        )
        if not paper:
            raise HTTPException(status_code=404, detail="论文不存在")
        return paper

    def ensure_access(self, paper: Paper, user: User) -> None:
        if user.role != "admin" and paper.owner_id != user.id:
            raise HTTPException(status_code=403, detail="无权访问此论文")

    def resolve_pdf_path(self, paper: Paper) -> str:
        file_path = file_service.resolve_paper_file_path(
            relative_path=paper.file_path,
            user_id=paper.owner_id,
            md5_hash=paper.md5_hash
        )
        if not file_path:
            raise HTTPException(status_code=404, detail="文件不存在或路径不安全")
        return file_path

    def get_filter_options(self, user: User) -> tuple[list[str], list[tuple[str, int]]]:
        """获取筛选选项（年份与期刊统计）"""
        query = self.db.query(Paper)
        if user.role != "admin":
            query = query.filter(Paper.owner_id == user.id)

        papers = query.all()
        years = sorted({p.year for p in papers if p.year}, reverse=True)

        journal_counts: dict[str, int] = {}
        for paper in papers:
            if paper.journal:
                journal_counts[paper.journal] = journal_counts.get(paper.journal, 0) + 1

        journals = sorted(journal_counts.items(), key=lambda item: -item[1])
        return years, journals

    def list_papers(
        self,
        user: User,
        view: str,
        search: Optional[str],
        search_fields: Optional[str],
        year_from: Optional[str],
        year_to: Optional[str],
        journals: Optional[str]
    ) -> list[Paper]:
        """获取论文列表（支持视图与高级搜索）"""
        query = (
            self.db.query(Paper)
            .options(joinedload(Paper.groups), joinedload(Paper.owner))
            .order_by(Paper.id.desc())
        )
        if user.role != "admin":
            query = query.filter(Paper.owner_id == user.id)

        if view == "ungrouped":
            query = query.filter(~Paper.groups.any())
        elif view != "all":
            query = query.filter(Paper.groups.any(name=view))

        if search:
            q = search.lower()
            fields = [f.strip() for f in search_fields.split(",")] if search_fields else ["all"]
            conditions = []
            if "all" in fields or "title" in fields:
                conditions.extend([
                    Paper.title.ilike(f"%{q}%"),
                    Paper.title_cn.ilike(f"%{q}%")
                ])
            if "all" in fields or "authors" in fields:
                conditions.append(Paper.authors.ilike(f"%{q}%"))
            if "all" in fields or "abstract" in fields:
                conditions.extend([
                    Paper.abstract.ilike(f"%{q}%"),
                    Paper.abstract_en.ilike(f"%{q}%")
                ])
            if "all" in fields or "journal" in fields:
                conditions.append(Paper.journal.ilike(f"%{q}%"))
            if conditions:
                query = query.filter(or_(*conditions))

        if year_from:
            query = query.filter(Paper.year >= year_from)
        if year_to:
            query = query.filter(Paper.year <= year_to)

        if journals:
            journal_list = [j.strip() for j in journals.split(",")]
            query = query.filter(Paper.journal.in_(journal_list))

        return query.all()

    def delete_paper_files(self, paper: Paper) -> None:
        if paper.file_path:
            file_service.delete_file_by_path(paper.file_path)
        elif paper.md5_hash and paper.owner_id:
            file_service.delete_file(paper.owner_id, paper.md5_hash)

        if paper.translated_file_path:
            file_service.delete_file_by_absolute_path(paper.translated_file_path)
        if paper.translated_dual_path:
            file_service.delete_file_by_absolute_path(paper.translated_dual_path)

    def update_groups(self, paper: Paper, group_names: list[str]) -> list[Group]:
        """更新论文分组"""
        groups = self.db.query(Group).filter(Group.name.in_(group_names)).all()
        paper.groups = groups
        self.db.commit()
        return groups

    def batch_delete(self, user: User, paper_ids: list[int]) -> tuple[int, list[int]]:
        """批量删除论文，返回删除数与失败 ID 列表"""
        deleted_count = 0
        failed_ids: list[int] = []

        for paper_id in paper_ids:
            paper = self.db.query(Paper).filter(Paper.id == paper_id).first()
            if not paper:
                failed_ids.append(paper_id)
                continue
            if user.role != "admin" and paper.owner_id != user.id:
                failed_ids.append(paper_id)
                continue

            self.delete_paper_files(paper)
            self.db.delete(paper)
            deleted_count += 1

        self.db.commit()
        return deleted_count, failed_ids

    def batch_update_groups(
        self,
        user: User,
        paper_ids: list[int],
        action: str,
        group_names: list[str]
    ) -> int:
        """批量更新论文分组，返回更新数量"""
        updated_count = 0
        target_groups = self.db.query(Group).filter(Group.name.in_(group_names)).all()

        for paper_id in paper_ids:
            paper = self.db.query(Paper).filter(Paper.id == paper_id).first()
            if not paper:
                continue
            if user.role != "admin" and paper.owner_id != user.id:
                continue

            if action == "add":
                for g in target_groups:
                    if g not in paper.groups:
                        paper.groups.append(g)
            elif action == "remove":
                paper.groups = [g for g in paper.groups if g not in target_groups]
            elif action == "set":
                paper.groups = target_groups

            updated_count += 1

        self.db.commit()
        return updated_count
