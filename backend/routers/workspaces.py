"""
团队空间路由 - 空间的 CRUD 操作、成员管理、邀请管理、论文管理
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from datetime import datetime

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db_models import (
    User, Paper, Workspace, WorkspaceMember, 
    WorkspaceInvitation, WorkspacePaper
)

from deps import (
    get_db, get_current_user, 
    check_workspace_access, check_workspace_admin, check_workspace_owner,
    get_workspace_member
)
from schemas import (
    CreateWorkspaceRequest, UpdateWorkspaceRequest,
    WorkspaceResponse, WorkspaceListResponse, WorkspaceDetailResponse,
    WorkspaceMemberResponse, UpdateMemberRoleRequest,
    InviteUserRequest, InvitationResponse, InvitationListResponse,
    SharePaperRequest, WorkspacePaperResponse, WorkspacePaperListResponse,
    PaperResponse, GroupInfo
)

router = APIRouter(prefix="/api/workspaces", tags=["团队空间"])


# ================= 辅助函数 =================

def workspace_to_response(workspace: Workspace, current_user: User, db: Session) -> WorkspaceResponse:
    """将 Workspace ORM 对象转换为响应模型"""
    member = get_workspace_member(workspace.id, current_user, db)
    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        owner_id=workspace.owner_id,
        owner_username=workspace.owner.username,
        member_count=len(workspace.members),
        paper_count=len(workspace.papers),
        created_at=workspace.created_at,
        my_role=member.role if member else "none"
    )


def workspace_to_detail_response(workspace: Workspace, current_user: User, db: Session) -> WorkspaceDetailResponse:
    """将 Workspace ORM 对象转换为详情响应模型"""
    member = get_workspace_member(workspace.id, current_user, db)
    members = [
        WorkspaceMemberResponse(
            id=m.id,
            user_id=m.user_id,
            username=m.user.username,
            role=m.role,
            joined_at=m.joined_at
        )
        for m in workspace.members
    ]
    return WorkspaceDetailResponse(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        owner_id=workspace.owner_id,
        owner_username=workspace.owner.username,
        member_count=len(workspace.members),
        paper_count=len(workspace.papers),
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
        my_role=member.role if member else "none",
        members=members
    )


def paper_to_response(paper: Paper) -> PaperResponse:
    """将 Paper ORM 对象转换为响应模型"""
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
        owner_username=paper.owner.username if paper.owner else None
    )


# ================= 空间管理 API =================

@router.get("", response_model=WorkspaceListResponse)
async def get_workspaces(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取用户的所有空间（包括创建的和加入的）"""
    # 查询用户是成员的所有空间
    memberships = db.query(WorkspaceMember).filter(
        WorkspaceMember.user_id == current_user.id
    ).all()
    
    workspace_ids = [m.workspace_id for m in memberships]
    workspaces = db.query(Workspace).options(
        joinedload(Workspace.owner),
        joinedload(Workspace.members).joinedload(WorkspaceMember.user),
        joinedload(Workspace.papers)
    ).filter(Workspace.id.in_(workspace_ids)).all()
    
    return WorkspaceListResponse(
        workspaces=[workspace_to_response(w, current_user, db) for w in workspaces],
        total=len(workspaces)
    )


@router.post("", response_model=WorkspaceResponse)
async def create_workspace(
    request: CreateWorkspaceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建新空间"""
    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="空间名称不能为空")
    
    # 创建空间
    workspace = Workspace(
        name=request.name.strip(),
        description=request.description,
        owner_id=current_user.id
    )
    db.add(workspace)
    db.flush()  # 获取 workspace.id
    
    # 将创建者添加为 owner 成员
    member = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=current_user.id,
        role="owner"
    )
    db.add(member)
    db.commit()
    db.refresh(workspace)
    
    return workspace_to_response(workspace, current_user, db)


@router.get("/{workspace_id}", response_model=WorkspaceDetailResponse)
async def get_workspace(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取空间详情"""
    workspace, _ = check_workspace_access(workspace_id, current_user, db)
    
    # 重新加载带关联的空间
    workspace = db.query(Workspace).options(
        joinedload(Workspace.owner),
        joinedload(Workspace.members).joinedload(WorkspaceMember.user),
        joinedload(Workspace.papers)
    ).filter(Workspace.id == workspace_id).first()
    
    return workspace_to_detail_response(workspace, current_user, db)


@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: int,
    request: UpdateWorkspaceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新空间信息（需要管理员权限）"""
    workspace, _ = check_workspace_admin(workspace_id, current_user, db)
    
    if request.name is not None:
        if not request.name.strip():
            raise HTTPException(status_code=400, detail="空间名称不能为空")
        workspace.name = request.name.strip()
    
    if request.description is not None:
        workspace.description = request.description
    
    workspace.updated_at = datetime.now().isoformat()
    db.commit()
    db.refresh(workspace)
    
    return workspace_to_response(workspace, current_user, db)


@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除空间（需要所有者权限）"""
    workspace, _ = check_workspace_owner(workspace_id, current_user, db)
    
    db.delete(workspace)
    db.commit()
    
    return {"message": "空间已删除"}


# ================= 成员管理 API =================

@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberResponse])
async def get_workspace_members(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取空间成员列表"""
    workspace, _ = check_workspace_access(workspace_id, current_user, db)
    
    members = db.query(WorkspaceMember).options(
        joinedload(WorkspaceMember.user)
    ).filter(WorkspaceMember.workspace_id == workspace_id).all()
    
    return [
        WorkspaceMemberResponse(
            id=m.id,
            user_id=m.user_id,
            username=m.user.username,
            role=m.role,
            joined_at=m.joined_at
        )
        for m in members
    ]


@router.put("/{workspace_id}/members/{user_id}", response_model=WorkspaceMemberResponse)
async def update_member_role(
    workspace_id: int,
    user_id: int,
    request: UpdateMemberRoleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新成员角色（需要管理员权限）"""
    workspace, current_member = check_workspace_admin(workspace_id, current_user, db)
    
    # 不能修改所有者的角色
    target_member = db.query(WorkspaceMember).options(
        joinedload(WorkspaceMember.user)
    ).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id
    ).first()
    
    if not target_member:
        raise HTTPException(status_code=404, detail="成员不存在")
    
    if target_member.role == "owner":
        raise HTTPException(status_code=400, detail="不能修改所有者的角色")
    
    # 只有所有者可以设置管理员
    if request.role == "admin" and current_member.role != "owner":
        raise HTTPException(status_code=403, detail="只有所有者可以设置管理员")
    
    if request.role not in ["admin", "member"]:
        raise HTTPException(status_code=400, detail="无效的角色")
    
    target_member.role = request.role
    db.commit()
    db.refresh(target_member)
    
    return WorkspaceMemberResponse(
        id=target_member.id,
        user_id=target_member.user_id,
        username=target_member.user.username,
        role=target_member.role,
        joined_at=target_member.joined_at
    )


@router.delete("/{workspace_id}/members/{user_id}")
async def remove_member(
    workspace_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """移除成员（需要管理员权限）"""
    workspace, current_member = check_workspace_admin(workspace_id, current_user, db)
    
    target_member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id
    ).first()
    
    if not target_member:
        raise HTTPException(status_code=404, detail="成员不存在")
    
    if target_member.role == "owner":
        raise HTTPException(status_code=400, detail="不能移除所有者")
    
    # 管理员不能移除其他管理员，只有所有者可以
    if target_member.role == "admin" and current_member.role != "owner":
        raise HTTPException(status_code=403, detail="只有所有者可以移除管理员")
    
    db.delete(target_member)
    db.commit()
    
    return {"message": "成员已移除"}


@router.delete("/{workspace_id}/leave")
async def leave_workspace(
    workspace_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """离开空间"""
    workspace, member = check_workspace_access(workspace_id, current_user, db)
    
    if member.role == "owner":
        raise HTTPException(status_code=400, detail="所有者不能离开空间，请先转让所有权或删除空间")
    
    db.delete(member)
    db.commit()
    
    return {"message": "已离开空间"}


# ================= 邀请管理 API =================

@router.post("/{workspace_id}/invitations", response_model=InvitationResponse)
async def invite_user(
    workspace_id: int,
    request: InviteUserRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """邀请用户加入空间（需要管理员权限）"""
    workspace, _ = check_workspace_admin(workspace_id, current_user, db)
    
    # 查找被邀请用户
    invitee = db.query(User).filter(User.username == request.username).first()
    if not invitee:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    if invitee.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能邀请自己")
    
    # 检查是否已是成员
    existing_member = get_workspace_member(workspace_id, invitee, db)
    if existing_member:
        raise HTTPException(status_code=400, detail="该用户已是空间成员")
    
    # 检查是否已有待处理的邀请
    existing_invitation = db.query(WorkspaceInvitation).filter(
        WorkspaceInvitation.workspace_id == workspace_id,
        WorkspaceInvitation.invitee_id == invitee.id,
        WorkspaceInvitation.status == "pending"
    ).first()
    
    if existing_invitation:
        raise HTTPException(status_code=400, detail="已向该用户发送过邀请")
    
    # 创建邀请
    invitation = WorkspaceInvitation(
        workspace_id=workspace_id,
        inviter_id=current_user.id,
        invitee_id=invitee.id
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    
    return InvitationResponse(
        id=invitation.id,
        workspace_id=workspace_id,
        workspace_name=workspace.name,
        inviter_id=current_user.id,
        inviter_username=current_user.username,
        invitee_id=invitee.id,
        invitee_username=invitee.username,
        status=invitation.status,
        created_at=invitation.created_at
    )


@router.get("/invitations/received", response_model=InvitationListResponse)
async def get_received_invitations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取收到的邀请"""
    invitations = db.query(WorkspaceInvitation).options(
        joinedload(WorkspaceInvitation.workspace),
        joinedload(WorkspaceInvitation.inviter)
    ).filter(
        WorkspaceInvitation.invitee_id == current_user.id,
        WorkspaceInvitation.status == "pending"
    ).all()
    
    return InvitationListResponse(
        invitations=[
            InvitationResponse(
                id=inv.id,
                workspace_id=inv.workspace_id,
                workspace_name=inv.workspace.name,
                inviter_id=inv.inviter_id,
                inviter_username=inv.inviter.username,
                invitee_id=inv.invitee_id,
                invitee_username=current_user.username,
                status=inv.status,
                created_at=inv.created_at
            )
            for inv in invitations
        ],
        total=len(invitations)
    )


@router.post("/invitations/{invitation_id}/accept")
async def accept_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """接受邀请"""
    invitation = db.query(WorkspaceInvitation).filter(
        WorkspaceInvitation.id == invitation_id,
        WorkspaceInvitation.invitee_id == current_user.id
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="邀请不存在")
    
    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail="邀请已处理")
    
    # 更新邀请状态
    invitation.status = "accepted"
    
    # 添加为成员
    member = WorkspaceMember(
        workspace_id=invitation.workspace_id,
        user_id=current_user.id,
        role="member"
    )
    db.add(member)
    db.commit()
    
    return {"message": "已加入空间"}


@router.post("/invitations/{invitation_id}/reject")
async def reject_invitation(
    invitation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """拒绝邀请"""
    invitation = db.query(WorkspaceInvitation).filter(
        WorkspaceInvitation.id == invitation_id,
        WorkspaceInvitation.invitee_id == current_user.id
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="邀请不存在")
    
    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail="邀请已处理")
    
    invitation.status = "rejected"
    db.commit()
    
    return {"message": "已拒绝邀请"}


# ================= 论文管理 API =================

@router.get("/{workspace_id}/papers", response_model=WorkspacePaperListResponse)
async def get_workspace_papers(
    workspace_id: int,
    search: Optional[str] = Query(None, description="搜索关键词"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取空间论文列表"""
    workspace, _ = check_workspace_access(workspace_id, current_user, db)
    
    query = db.query(WorkspacePaper).options(
        joinedload(WorkspacePaper.paper).joinedload(Paper.owner),
        joinedload(WorkspacePaper.paper).joinedload(Paper.groups),
        joinedload(WorkspacePaper.sharer)
    ).filter(WorkspacePaper.workspace_id == workspace_id)
    
    # 搜索过滤
    if search:
        q = search.lower()
        query = query.join(Paper).filter(
            (Paper.title.ilike(f"%{q}%"))
            | (Paper.title_cn.ilike(f"%{q}%"))
            | (Paper.authors.ilike(f"%{q}%"))
        )
    
    workspace_papers = query.all()
    
    return WorkspacePaperListResponse(
        papers=[
            WorkspacePaperResponse(
                id=wp.id,
                paper=paper_to_response(wp.paper),
                shared_by_id=wp.shared_by,
                shared_by_username=wp.sharer.username,
                shared_at=wp.shared_at
            )
            for wp in workspace_papers
        ],
        total=len(workspace_papers)
    )


@router.post("/{workspace_id}/papers", response_model=dict)
async def share_papers_to_workspace(
    workspace_id: int,
    request: SharePaperRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """分享论文到空间"""
    workspace, _ = check_workspace_access(workspace_id, current_user, db)
    
    shared_count = 0
    already_shared = 0
    not_found = 0
    
    for paper_id in request.paper_ids:
        # 检查论文是否存在且属于当前用户
        paper = db.query(Paper).filter(Paper.id == paper_id).first()
        if not paper:
            not_found += 1
            continue
        
        # 检查是否有权分享（只能分享自己的论文，或者管理员可以分享任何论文）
        if paper.owner_id != current_user.id and current_user.role != "admin":
            not_found += 1
            continue
        
        # 检查是否已分享
        existing = db.query(WorkspacePaper).filter(
            WorkspacePaper.workspace_id == workspace_id,
            WorkspacePaper.paper_id == paper_id
        ).first()
        
        if existing:
            already_shared += 1
            continue
        
        # 创建分享记录
        workspace_paper = WorkspacePaper(
            workspace_id=workspace_id,
            paper_id=paper_id,
            shared_by=current_user.id
        )
        db.add(workspace_paper)
        shared_count += 1
    
    db.commit()
    
    return {
        "message": f"成功分享 {shared_count} 篇论文",
        "shared_count": shared_count,
        "already_shared": already_shared,
        "not_found": not_found
    }


@router.delete("/{workspace_id}/papers/{paper_id}")
async def remove_paper_from_workspace(
    workspace_id: int,
    paper_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """从空间移除论文"""
    workspace, member = check_workspace_access(workspace_id, current_user, db)
    
    workspace_paper = db.query(WorkspacePaper).filter(
        WorkspacePaper.workspace_id == workspace_id,
        WorkspacePaper.paper_id == paper_id
    ).first()
    
    if not workspace_paper:
        raise HTTPException(status_code=404, detail="论文不在此空间中")
    
    # 检查权限：管理员可以移除任何论文，普通成员只能移除自己分享的
    if member.role not in ["owner", "admin"] and workspace_paper.shared_by != current_user.id:
        raise HTTPException(status_code=403, detail="只能移除自己分享的论文")
    
    db.delete(workspace_paper)
    db.commit()
    
    return {"message": "论文已从空间移除"}