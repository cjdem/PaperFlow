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

    class Config:
        from_attributes = True


class PaperListResponse(BaseModel):
    papers: list[PaperResponse]
    total: int


class UpdatePaperGroupsRequest(BaseModel):
    groups: list[str]


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
