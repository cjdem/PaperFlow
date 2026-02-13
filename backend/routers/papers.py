"""
论文路由 - 论文的 CRUD 操作
"""
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from typing import Optional, List
from urllib.parse import quote

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_models import Paper, User
from file_service import file_service
from audit_service import log_audit_event
# 注意：reanalyze_paper 使用延迟导入以避免循环导入

from deps import get_current_user, get_paper_service
from backend.services.paper_service import PaperService
from schemas import (
    PaperResponse, PaperListResponse, UpdatePaperGroupsRequest, GroupInfo,
    BatchDeleteRequest, BatchDeleteResponse, BatchGroupRequest, BatchGroupResponse,
    FilterOptionsResponse, JournalOption
)

router = APIRouter(prefix="/api/papers", tags=["论文"])


def sanitize_filename(filename: str) -> str:
    """清理文件名，移除不安全字符"""
    # 移除或替换不安全的文件名字符
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
    # 限制长度
    if len(filename) > 200:
        filename = filename[:200]
    return filename


def paper_to_response(paper: Paper) -> PaperResponse:
    """将 Paper ORM 对象转换为响应模型"""
    # 判断是否有关联文件
    has_file = bool(paper.file_path) or (
        paper.md5_hash and paper.owner_id and
        file_service.file_exists(paper.owner_id, paper.md5_hash)
    )
    
    return PaperResponse(
        id=paper.id,
        title=paper.title,
        title_cn=paper.title_cn,
        authors=paper.authors,
        year=paper.year,
        journal=paper.journal,
        abstract=paper.abstract,
        abstract_en=paper.abstract_en,
        detailed_analysis=paper.detailed_analysis,
        groups=[GroupInfo(id=g.id, name=g.name) for g in paper.groups],
        owner_username=paper.owner.username if paper.owner else None,
        # 文件相关字段
        file_path=paper.file_path,
        file_size=paper.file_size,
        original_filename=paper.original_filename,
        uploaded_at=paper.uploaded_at,
        has_file=has_file
    )


@router.get("/filter-options", response_model=FilterOptionsResponse)
async def get_filter_options(
    current_user: User = Depends(get_current_user),
    paper_service: PaperService = Depends(get_paper_service)
):
    """获取筛选选项（年份列表、期刊列表）"""
    years, journals = paper_service.get_filter_options(current_user)
    journal_options = [JournalOption(name=name, count=count) for name, count in journals]
    
    return FilterOptionsResponse(years=years, journals=journal_options)


@router.get("", response_model=PaperListResponse)
async def get_papers(
    view: str = Query("all", description="视图模式: all, ungrouped, 或分组名"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    search_fields: Optional[str] = Query("all", description="搜索字段: all, title, authors, abstract, journal（逗号分隔）"),
    year_from: Optional[str] = Query(None, description="起始年份"),
    year_to: Optional[str] = Query(None, description="结束年份"),
    journals: Optional[str] = Query(None, description="期刊列表（逗号分隔）"),
    current_user: User = Depends(get_current_user),
    paper_service: PaperService = Depends(get_paper_service)
):
    """获取论文列表（支持高级搜索）"""
    papers = paper_service.list_papers(
        user=current_user,
        view=view,
        search=search,
        search_fields=search_fields,
        year_from=year_from,
        year_to=year_to,
        journals=journals
    )
    return PaperListResponse(
        papers=[paper_to_response(p) for p in papers],
        total=len(papers)
    )


@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    paper_service: PaperService = Depends(get_paper_service)
):
    """获取单篇论文详情"""
    paper = paper_service.get_paper(paper_id)
    paper_service.ensure_access(paper, current_user)
    
    return paper_to_response(paper)


@router.delete("/{paper_id}")
async def delete_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    paper_service: PaperService = Depends(get_paper_service)
):
    """删除论文（同时删除物理文件和翻译文件）"""
    paper = paper_service.get_paper(paper_id)
    paper_service.ensure_access(paper, current_user)
    paper_service.delete_paper_files(paper)
    
    db.delete(paper)
    db.commit()
    log_audit_event(
        action="delete_paper",
        resource_type="paper",
        resource_id=paper_id,
        user_id=current_user.id,
        details={"title": paper.title}
    )
    return {"message": "删除成功"}


@router.get("/{paper_id}/download")
async def download_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    paper_service: PaperService = Depends(get_paper_service)
):
    """下载论文 PDF 文件"""
    paper = paper_service.get_paper(paper_id)
    paper_service.ensure_access(paper, current_user)
    file_path = paper_service.resolve_pdf_path(paper)

    # 使用论文标题作为下载文件名
    download_filename = sanitize_filename(paper.title or "paper") + ".pdf"
    
    # 对文件名进行 URL 编码以支持中文
    encoded_filename = quote(download_filename)

    log_audit_event(
        action="download_paper",
        resource_type="paper",
        resource_id=paper_id,
        user_id=current_user.id
    )
    
    return FileResponse(
        path=file_path,
        filename=download_filename,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )


@router.get("/{paper_id}/preview")
async def preview_paper(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    paper_service: PaperService = Depends(get_paper_service)
):
    """预览论文 PDF 文件（在浏览器中打开）"""
    paper = paper_service.get_paper(paper_id)
    paper_service.ensure_access(paper, current_user)
    file_path = paper_service.resolve_pdf_path(paper)
    
    # 使用论文标题作为文件名
    preview_filename = sanitize_filename(paper.title or "paper") + ".pdf"
    encoded_filename = quote(preview_filename)

    log_audit_event(
        action="preview_paper",
        resource_type="paper",
        resource_id=paper_id,
        user_id=current_user.id
    )
    
    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}"
        }
    )


@router.put("/{paper_id}/groups")
async def update_paper_groups(
    paper_id: int,
    request: UpdatePaperGroupsRequest,
    current_user: User = Depends(get_current_user),
    paper_service: PaperService = Depends(get_paper_service)
):
    """更新论文的分组"""
    paper = paper_service.get_paper(paper_id)
    paper_service.ensure_access(paper, current_user)
    paper_service.update_groups(paper, request.groups)
    log_audit_event(
        action="update_paper_groups",
        resource_type="paper",
        resource_id=paper_id,
        user_id=current_user.id,
        details={"groups": request.groups}
    )
    
    return {"message": "分组更新成功"}


# ================= 批量操作 API =================

@router.delete("/batch", response_model=BatchDeleteResponse)
async def batch_delete_papers(
    request: BatchDeleteRequest,
    current_user: User = Depends(get_current_user),
    paper_service: PaperService = Depends(get_paper_service)
):
    """批量删除论文（同时删除物理文件和翻译文件）"""
    deleted_count, failed_ids = paper_service.batch_delete(current_user, request.paper_ids)
    log_audit_event(
        action="batch_delete_papers",
        resource_type="paper",
        resource_id=",".join(str(pid) for pid in request.paper_ids),
        user_id=current_user.id,
        details={"deleted_count": deleted_count, "failed_ids": failed_ids}
    )
    return BatchDeleteResponse(
        message=f"成功删除 {deleted_count} 篇论文",
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )


@router.put("/batch/groups", response_model=BatchGroupResponse)
async def batch_update_groups(
    request: BatchGroupRequest,
    current_user: User = Depends(get_current_user),
    paper_service: PaperService = Depends(get_paper_service)
):
    """批量更新论文分组"""
    updated_count = paper_service.batch_update_groups(
        user=current_user,
        paper_ids=request.paper_ids,
        action=request.action,
        group_names=request.groups
    )
    log_audit_event(
        action="batch_update_groups",
        resource_type="paper",
        resource_id=",".join(str(pid) for pid in request.paper_ids),
        user_id=current_user.id,
        details={"action": request.action, "groups": request.groups}
    )
    return BatchGroupResponse(
        message=f"成功更新 {updated_count} 篇论文的分组",
        updated_count=updated_count
    )


# ================= 重新分析 API =================

@router.post("/{paper_id}/reanalyze")
async def reanalyze_paper_endpoint(
    paper_id: int,
    current_user: User = Depends(get_current_user),
    paper_service: PaperService = Depends(get_paper_service)
):
    """
    重新分析论文（使用已存储的 PDF 文件）
    
    需要论文有关联的 PDF 文件才能重新分析
    """
    # 先检查论文是否存在
    paper = paper_service.get_paper(paper_id)
    paper_service.ensure_access(paper, current_user)
    
    # 检查是否有文件
    has_file = bool(paper.file_path) or (
        paper.md5_hash and paper.owner_id and
        file_service.file_exists(paper.owner_id, paper.md5_hash)
    )
    
    if not has_file:
        raise HTTPException(status_code=400, detail="论文没有关联的 PDF 文件，无法重新分析")
    
    try:
        # 延迟导入以避免循环导入
        from main import reanalyze_paper
        
        # 执行重新分析（允许管理员分析任何论文）
        owner_id = None if current_user.role == "admin" else current_user.id
        analysis = await reanalyze_paper(paper_id, owner_id)

        log_audit_event(
            action="reanalyze_paper",
            resource_type="paper",
            resource_id=paper_id,
            user_id=current_user.id
        )
        return {
            "message": "重新分析完成",
            "paper_id": paper_id,
            "analysis_preview": analysis[:500] + "..." if len(analysis) > 500 else analysis
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重新分析失败: {str(e)}")
