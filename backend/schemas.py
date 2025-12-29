"""
Pydantic 模型定义 - 用于 API 请求/响应验证
"""
from pydantic import BaseModel
from typing import Optional


# ================= Auth =================
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    username: str
    role: str

    class Config:
        from_attributes = True


# ================= Papers =================
class GroupInfo(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class PaperResponse(BaseModel):
    id: int
    title: str
    title_cn: Optional[str] = None
    authors: Optional[str] = None
    year: Optional[str] = None
    journal: Optional[str] = None
    abstract: Optional[str] = None
    abstract_en: Optional[str] = None
    detailed_analysis: Optional[str] = None
    groups: list[GroupInfo] = []
    owner_username: Optional[str] = None
    # 文件相关字段
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    original_filename: Optional[str] = None
    uploaded_at: Optional[str] = None
    has_file: bool = False  # 是否有关联文件

    class Config:
        from_attributes = True


class PaperListResponse(BaseModel):
    papers: list[PaperResponse]
    total: int


class UpdatePaperGroupsRequest(BaseModel):
    groups: list[str]


# ================= Filter Options =================
class JournalOption(BaseModel):
    """期刊选项（带论文数量）"""
    name: str
    count: int


class FilterOptionsResponse(BaseModel):
    """筛选选项响应"""
    years: list[str]
    journals: list[JournalOption]


# ================= Groups =================
class CreateGroupRequest(BaseModel):
    name: str


class GroupResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


# ================= Admin =================
class DbStatsResponse(BaseModel):
    user_count: int
    paper_count: int
    group_count: int


# ================= Storage Stats =================
class UserStorageStats(BaseModel):
    """用户存储统计"""
    user_id: int
    username: str
    file_count: int
    total_size: int
    total_size_formatted: str


class StorageStatsResponse(BaseModel):
    """存储统计响应"""
    total_size: int
    total_size_formatted: str
    total_files: int
    users: list[UserStorageStats]


class LLMProviderResponse(BaseModel):
    id: int
    name: str
    base_url: str
    api_key: str  # 前端需要展示（已加密）
    pool_type: str
    api_type: str
    is_primary: bool
    weight: int  # 保留向后兼容
    priority: int  # 优先级 (1 最高, 数值越小越优先)
    models: str
    enabled: bool

    class Config:
        from_attributes = True


class CreateLLMProviderRequest(BaseModel):
    name: str
    base_url: str
    api_key: str
    pool_type: str
    api_type: str = "openai"
    models: str
    is_primary: bool = False
    weight: int = 10  # 保留向后兼容
    priority: int = 1  # 优先级 (1 最高)


class UpdateLLMProviderRequest(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    models: Optional[str] = None
    api_type: Optional[str] = None
    pool_type: Optional[str] = None
    weight: Optional[int] = None  # 保留向后兼容
    priority: Optional[int] = None  # 优先级 (1 最高)


class SystemConfigRequest(BaseModel):
    key: str
    value: str


# ================= Batch Operations =================
class BatchDeleteRequest(BaseModel):
    paper_ids: list[int]


class BatchDeleteResponse(BaseModel):
    message: str
    deleted_count: int
    failed_ids: list[int] = []


class BatchGroupRequest(BaseModel):
    paper_ids: list[int]
    action: str  # add, remove, set
    groups: list[str]


class BatchGroupResponse(BaseModel):
    message: str
    updated_count: int


class BatchExportRequest(BaseModel):
    paper_ids: list[int]
    format: str  # csv, bibtex, markdown, json


# ================= Workspace（团队空间）=================
class CreateWorkspaceRequest(BaseModel):
    """创建空间请求"""
    name: str
    description: Optional[str] = None


class UpdateWorkspaceRequest(BaseModel):
    """更新空间请求"""
    name: Optional[str] = None
    description: Optional[str] = None


class WorkspaceMemberResponse(BaseModel):
    """空间成员响应"""
    id: int
    user_id: int
    username: str
    role: str  # owner, admin, member
    joined_at: str

    class Config:
        from_attributes = True


class WorkspaceResponse(BaseModel):
    """空间响应"""
    id: int
    name: str
    description: Optional[str] = None
    owner_id: int
    owner_username: str
    member_count: int
    paper_count: int
    created_at: str
    my_role: str  # 当前用户在此空间的角色

    class Config:
        from_attributes = True


class WorkspaceListResponse(BaseModel):
    """空间列表响应"""
    workspaces: list[WorkspaceResponse]
    total: int


class WorkspaceDetailResponse(BaseModel):
    """空间详情响应（包含成员列表）"""
    id: int
    name: str
    description: Optional[str] = None
    owner_id: int
    owner_username: str
    member_count: int
    paper_count: int
    created_at: str
    updated_at: str
    my_role: str
    members: list[WorkspaceMemberResponse] = []

    class Config:
        from_attributes = True


class InviteUserRequest(BaseModel):
    """邀请用户请求"""
    username: str  # 通过用户名邀请


class InvitationResponse(BaseModel):
    """邀请响应"""
    id: int
    workspace_id: int
    workspace_name: str
    inviter_id: int
    inviter_username: str
    invitee_id: int
    invitee_username: str
    status: str  # pending, accepted, rejected, expired
    created_at: str

    class Config:
        from_attributes = True


class InvitationListResponse(BaseModel):
    """邀请列表响应"""
    invitations: list[InvitationResponse]
    total: int


class SharePaperRequest(BaseModel):
    """分享论文请求"""
    paper_ids: list[int]  # 支持批量分享


class WorkspacePaperResponse(BaseModel):
    """空间论文响应"""
    id: int
    paper: PaperResponse
    shared_by_id: int
    shared_by_username: str
    shared_at: str

    class Config:
        from_attributes = True


class WorkspacePaperListResponse(BaseModel):
    """空间论文列表响应"""
    papers: list[WorkspacePaperResponse]
    total: int


class UpdateMemberRoleRequest(BaseModel):
    """更新成员角色请求"""
    role: str  # admin, member
