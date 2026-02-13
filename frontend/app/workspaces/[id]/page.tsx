
'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
    logout, Paper, getPapers,
    getGroups, Group,
    getWorkspace, WorkspaceDetail, WorkspacePaper,
    getWorkspacePapers, sharePapersToWorkspace, removePaperFromWorkspace,
    inviteUser, updateMemberRole, removeMember, leaveWorkspace,
    updateWorkspace, deleteWorkspace
} from '@/lib/api';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { useAuth } from '@/lib/useAuth';
import { usePolling } from '@/lib/usePolling';
import AppSidebar from '@/components/AppSidebar';

type TabType = 'papers' | 'members';

export default function WorkspaceDetailPage() {
    const router = useRouter();
    const params = useParams();
    const workspaceId = Number(params.id);

    const { user, loading: authLoading } = useAuth({ redirectTo: '/' });
    const initialLoadRef = useRef(false);
    const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
    const [groups, setGroups] = useState<Group[]>([]);
    const [workspacePapers, setWorkspacePapers] = useState<WorkspacePaper[]>([]);
    const [myPapers, setMyPapers] = useState<Paper[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('papers');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedPaper, setExpandedPaper] = useState<number | null>(null);
    const [detailTab, setDetailTab] = useState<'analysis' | 'abstract_cn' | 'abstract_en'>('analysis');

    // 弹窗状态
    const [showShareModal, setShowShareModal] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedPaperIds, setSelectedPaperIds] = useState<Set<number>>(new Set());
    const [inviteUsername, setInviteUsername] = useState('');
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    // 加载数据
    const loadData = useCallback(async () => {
        try {
            const [workspaceData, papersData, groupsData] = await Promise.all([
                getWorkspace(workspaceId),
                getWorkspacePapers(workspaceId, searchQuery || undefined),
                getGroups()
            ]);
            setWorkspace(workspaceData);
            setWorkspacePapers(papersData.papers);
            setGroups(groupsData);
        } catch (err) {
            console.error('加载数据失败:', err);
            router.push('/workspaces');
        }
    }, [workspaceId, searchQuery, router]);

    const loadMyPapers = useCallback(async () => {
        try {
            const data = await getPapers('all');
            setMyPapers(data.papers);
        } catch (err) {
            console.error('加载我的论文失败:', err);
        }
    }, []);

    const handleInitialLoad = useCallback(async () => {
        try {
            await loadData();
        } finally {
            if (!initialLoadRef.current) {
                initialLoadRef.current = true;
                setLoading(false);
            }
        }
    }, [loadData]);

    usePolling(handleInitialLoad, {
        enabled: !!user,
        deps: [searchQuery]
    });

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    // 分享论文
    const handleSharePapers = async () => {
        if (selectedPaperIds.size === 0) return;

        setActionLoading(true);
        try {
            const result = await sharePapersToWorkspace(workspaceId, Array.from(selectedPaperIds));
            alert(result.message);
            setShowShareModal(false);
            setSelectedPaperIds(new Set());
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '分享失败');
        } finally {
            setActionLoading(false);
        }
    };

    // 移除论文
    const handleRemovePaper = async (paperId: number) => {
        if (!confirm('确定要从空间中移除这篇论文吗？')) return;

        try {
            await removePaperFromWorkspace(workspaceId, paperId);
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '移除失败');
        }
    };

    // 邀请用户
    const handleInviteUser = async () => {
        if (!inviteUsername.trim()) return;

        setActionLoading(true);
        try {
            await inviteUser(workspaceId, inviteUsername.trim());
            alert('邀请已发送');
            setInviteUsername('');
            setShowInviteModal(false);
        } catch (err) {
            alert(err instanceof Error ? err.message : '邀请失败');
        } finally {
            setActionLoading(false);
        }
    };

    // 更新成员角色
    const handleUpdateRole = async (userId: number, newRole: string) => {
        try {
            await updateMemberRole(workspaceId, userId, newRole);
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '更新失败');
        }
    };

    // 移除成员
    const handleRemoveMember = async (userId: number, username: string) => {
        if (!confirm(`确定要移除成员 ${username} 吗？`)) return;

        try {
            await removeMember(workspaceId, userId);
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '移除失败');
        }
    };

    // 离开空间
    const handleLeaveWorkspace = async () => {
        if (!confirm('确定要离开这个空间吗？')) return;

        try {
            await leaveWorkspace(workspaceId);
            router.push('/workspaces');
        } catch (err) {
            alert(err instanceof Error ? err.message : '离开失败');
        }
    };

    // 更新空间信息
    const handleUpdateWorkspace = async () => {
        if (!editName.trim()) return;

        setActionLoading(true);
        try {
            await updateWorkspace(workspaceId, {
                name: editName.trim(),
                description: editDesc.trim() || undefined
            });
            setShowEditModal(false);
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '更新失败');
        } finally {
            setActionLoading(false);
        }
    };

    // 删除空间
    const handleDeleteWorkspace = async () => {
        if (!confirm('确定要删除这个空间吗？此操作不可撤销！')) return;
        if (!confirm('再次确认：删除后所有成员将失去访问权限，但论文不会被删除。')) return;

        try {
            await deleteWorkspace(workspaceId);
            router.push('/workspaces');
        } catch (err) {
            alert(err instanceof Error ? err.message : '删除失败');
        }
    };

    // 打开分享弹窗
    const openShareModal = async () => {
        await loadMyPapers();
        setSelectedPaperIds(new Set());
        setShowShareModal(true);
    };

    // 打开编辑弹窗
    const openEditModal = () => {
        if (workspace) {
            setEditName(workspace.name);
            setEditDesc(workspace.description || '');
            setShowEditModal(true);
        }
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'owner':
                return <span className="fluent-badge-accent px-2 py-0.5 text-xs rounded-full">所有者</span>;
            case 'admin':
                return <span className="fluent-badge-primary px-2 py-0.5 text-xs rounded-full">管理员</span>;
            default:
                return <span className="fluent-badge px-2 py-0.5 text-xs rounded-full">成员</span>;
        }
    };

    const isAdmin = workspace?.my_role === 'owner' || workspace?.my_role === 'admin';
    const isOwner = workspace?.my_role === 'owner';

    if (authLoading || loading) {
        return (
            <div className="min-h-screen fluent-background flex items-center justify-center">
                <div className="text-[var(--fluent-foreground)] text-xl">加载中...</div>
            </div>
        );
    }

    if (!workspace) {
        return (
            <div className="min-h-screen fluent-background flex items-center justify-center">
                <div className="text-[var(--fluent-foreground)] text-xl">空间不存在</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen fluent-background flex">
            <AppSidebar
                user={user}
                activeSection="workspaces"
                groups={groups}
                onLogout={handleLogout}
                navExtraContent={(collapsed) => (
                    <div className="pt-2 border-t border-[var(--fluent-divider)]">
                        {!collapsed ? (
                            <>
                                <p className="text-xs text-[var(--fluent-foreground-secondary)] mb-2 px-3">当前空间</p>
                                <div className="px-3 py-2 bg-purple-600/20 border border-purple-500/50 rounded-lg">
                                    <p className="text-purple-300 font-medium truncate">🏢 {workspace.name}</p>
                                    <div className="mt-1">{getRoleBadge(workspace.my_role)}</div>
                                </div>
                            </>
                        ) : (
                            <div className="flex justify-center pt-1">
                                <div className="w-10 h-10 rounded-lg bg-purple-600/20 border border-purple-500/50 flex items-center justify-center text-purple-300">
                                    🏢
                                </div>
                            </div>
                        )}
                    </div>
                )}
            />

            {/* 主内容 */}
            <main className="flex-1 p-6 overflow-auto">
                {/* 标题栏 */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-[var(--fluent-foreground)] flex items-center gap-2">
                            🏢 {workspace.name}
                            {getRoleBadge(workspace.my_role)}
                        </h2>
                        {workspace.description && (
                            <p className="text-[var(--fluent-foreground-secondary)] mt-1">{workspace.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-[var(--fluent-foreground-secondary)]">
                            <span>👤 {workspace.member_count} 成员</span>
                            <span>📄 {workspace.paper_count} 论文</span>
                            <span>创建者: {workspace.owner_username}</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {isAdmin && (
                            <button
                                onClick={openEditModal}
                                className="fluent-button fluent-button-subtle px-4 py-2"
                            >
                                ⚙️ 设置
                            </button>
                        )}
                        {!isOwner && (
                            <button
                                onClick={handleLeaveWorkspace}
                                className="fluent-button px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30"
                            >
                                🚪 离开
                            </button>
                        )}
                    </div>
                </div>

                {/* 标签页 */}
                <div className="fluent-tabs mb-6">
                    <button
                        onClick={() => setActiveTab('papers')}
                        className={`fluent-tab ${activeTab === 'papers' ? 'active' : ''}`}
                    >
                        📚 论文 ({workspacePapers.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('members')}
                        className={`fluent-tab ${activeTab === 'members' ? 'active' : ''}`}
                    >
                        👥 成员 ({workspace.members.length})
                    </button>
                </div>

                {/* 论文标签页 */}
                {activeTab === 'papers' && (
                    <div>
                        <div className="flex items-center gap-4 mb-4">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="🔍 搜索论文..."
                                className="fluent-input flex-1 max-w-md"
                            />
                            <button
                                onClick={openShareModal}
                                className="fluent-button fluent-button-accent px-4 py-3"
                            >
                                ➕ 分享论文
                            </button>
                        </div>

                        {workspacePapers.length === 0 ? (
                            <div className="text-center text-[var(--fluent-foreground-secondary)] py-20">
                                <div className="text-6xl mb-4">📄</div>
                                <p className="text-xl mb-2 text-[var(--fluent-foreground)]">暂无论文</p>
                                <p className="text-sm">点击&quot;分享论文&quot;将你的论文分享到此空间</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {workspacePapers.map(wp => (
                                    <div key={wp.id} className="fluent-card overflow-hidden">
                                        <div className="p-4">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <h3 className="text-lg font-semibold text-[var(--fluent-foreground)]">{wp.paper.title}</h3>
                                                    {wp.paper.title_cn && (
                                                        <p className="text-[var(--fluent-foreground-secondary)] text-sm mt-1">{wp.paper.title_cn}</p>
                                                    )}
                                                    <div className="flex items-center gap-4 mt-2 text-sm text-[var(--fluent-foreground-secondary)]">
                                                        <span className="fluent-badge px-2 py-1">{wp.paper.journal || 'Journal'}</span>
                                                        <span>📅 {wp.paper.year}</span>
                                                        <span>✍️ {wp.paper.authors?.slice(0, 50)}...</span>
                                                    </div>
                                                    <div className="mt-2 text-xs text-[var(--fluent-foreground-secondary)]">
                                                        分享者: {wp.shared_by_username} | {new Date(wp.shared_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 ml-4">
                                                    <button
                                                        onClick={() => setExpandedPaper(expandedPaper === wp.paper.id ? null : wp.paper.id)}
                                                        className="fluent-button fluent-button-subtle px-3 py-1 text-sm"
                                                    >
                                                        {expandedPaper === wp.paper.id ? '收起' : '📖 阅读'}
                                                    </button>
                                                    {(isAdmin || wp.shared_by_id === user?.id) && (
                                                        <button
                                                            onClick={() => handleRemovePaper(wp.paper.id)}
                                                            className="fluent-button px-3 py-1 bg-red-600/20 text-red-400 border border-red-500/30 text-sm hover:bg-red-600/30"
                                                        >
                                                            🗑️
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {expandedPaper === wp.paper.id && (
                                            <div className="border-t border-[var(--fluent-divider)]">
                                                <div className="p-4 border-b border-[var(--fluent-divider)]">
                                                    <div className="fluent-tabs">
                                                    <button
                                                        onClick={() => setDetailTab('analysis')}
                                                        className={`fluent-tab ${detailTab === 'analysis' ? 'active' : ''}`}
                                                    >
                                                        💡 深度分析
                                                    </button>
                                                    <button
                                                        onClick={() => setDetailTab('abstract_cn')}
                                                        className={`fluent-tab ${detailTab === 'abstract_cn' ? 'active' : ''}`}
                                                    >
                                                        🇨🇳 中文摘要
                                                    </button>
                                                    <button
                                                        onClick={() => setDetailTab('abstract_en')}
                                                        className={`fluent-tab ${detailTab === 'abstract_en' ? 'active' : ''}`}
                                                    >
                                                        🇬🇧 英文摘要
                                                    </button>
                                                </div>
                                                </div>
                                                <div className="p-6">
                                                    {detailTab === 'analysis' && <MarkdownRenderer content={wp.paper.detailed_analysis || '暂无分析内容'} />}
                                                    {detailTab === 'abstract_cn' && <div className="text-[var(--fluent-foreground)] text-lg leading-9">{wp.paper.abstract || '暂无中文摘要'}</div>}
                                                    {detailTab === 'abstract_en' && <div className="text-[var(--fluent-foreground)] text-lg leading-9 font-serif italic">{wp.paper.abstract_en || 'No English abstract available'}</div>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 成员标签页 */}
                {activeTab === 'members' && (
                    <div>
                        {isAdmin && (
                            <div className="mb-4">
                                <button
                                    onClick={() => setShowInviteModal(true)}
                                    className="fluent-button fluent-button-accent px-4 py-3"
                                >
                                    📨 邀请成员
                                </button>
                            </div>
                        )}

                        <div className="space-y-3">
                            {workspace.members.map(member => (
                                <div key={member.id} className="fluent-card p-4 flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-[var(--fluent-surface-elevated)] rounded-full flex items-center justify-center text-[var(--fluent-foreground)] font-bold">
                                            {member.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[var(--fluent-foreground)] font-medium">{member.username}</span>
                                                {getRoleBadge(member.role)}
                                            </div>
                                            <p className="text-xs text-[var(--fluent-foreground-secondary)]">加入于 {new Date(member.joined_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    {isAdmin && member.role !== 'owner' && member.user_id !== user?.id && (
                                        <div className="flex items-center gap-2">
                                            {isOwner && (
                                                <select
                                                    value={member.role}
                                                    onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                                                    className="fluent-select px-3 py-2 text-sm"
                                                >
                                                    <option value="member">成员</option>
                                                    <option value="admin">管理员</option>
                                                </select>
                                            )}
                                            <button
                                                onClick={() => handleRemoveMember(member.user_id, member.username)}
                                                className="fluent-button px-3 py-2 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30"
                                            >
                                                移除
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* 分享论文弹窗 */}
            {showShareModal && (
                <div className="fluent-modal-overlay">
                    <div
                        className="fluent-modal-enhanced fluent-modal-zoom w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="share-modal-title"
                        aria-describedby="share-modal-desc"
                    >
                        <div className="fluent-modal-header">
                            <h3 id="share-modal-title" className="fluent-modal-title">📤 分享论文到空间</h3>
                            <p id="share-modal-desc" className="sr-only">选择要分享的论文并确认分享。</p>
                            <button
                                onClick={() => setShowShareModal(false)}
                                className="fluent-modal-close"
                                aria-label="关闭弹窗"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="fluent-modal-body flex-1 overflow-y-auto">
                            <p className="text-[var(--fluent-foreground-secondary)] mb-4">选择要分享的论文：</p>
                            {myPapers.length === 0 ? (
                                <p className="text-[var(--fluent-foreground-secondary)] text-center py-8">暂无可分享的论文</p>
                            ) : (
                                <div className="space-y-2">
                                    {myPapers.map(paper => {
                                        const isShared = workspacePapers.some(wp => wp.paper.id === paper.id);
                                        return (
                                            <label
                                                key={paper.id}
                                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition ${isShared ? 'bg-white/5 cursor-not-allowed' : selectedPaperIds.has(paper.id) ? 'bg-purple-600/20 border border-purple-500/60' : 'bg-[var(--fluent-surface)] border border-transparent hover:bg-[var(--fluent-surface-elevated)]'}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPaperIds.has(paper.id)}
                                                    disabled={isShared}
                                                    onChange={() => {
                                                        if (isShared) return;
                                                        setSelectedPaperIds(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(paper.id)) next.delete(paper.id);
                                                            else next.add(paper.id);
                                                            return next;
                                                        });
                                                    }}
                                                    className="fluent-checkbox"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className={`truncate ${isShared ? 'text-[var(--fluent-foreground-secondary)]' : 'text-[var(--fluent-foreground)]'}`}>{paper.title}</p>
                                                    <p className="text-xs text-[var(--fluent-foreground-secondary)] truncate">{paper.authors} | {paper.year}</p>
                                                </div>
                                                {isShared && <span className="text-xs text-green-500">已分享</span>}
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="fluent-modal-footer flex justify-between items-center">
                            <span className="text-[var(--fluent-foreground-secondary)]">已选择 {selectedPaperIds.size} 篇</span>
                            <div className="flex gap-2">
                                <button onClick={() => setShowShareModal(false)} className="fluent-button fluent-button-subtle px-4 py-2">取消</button>
                                <button onClick={handleSharePapers} disabled={selectedPaperIds.size === 0 || actionLoading} className="fluent-button fluent-button-accent px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {actionLoading ? '分享中...' : '分享'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 邀请成员弹窗 */}
            {showInviteModal && (
                <div className="fluent-modal-overlay">
                    <div
                        className="fluent-modal-enhanced fluent-modal-zoom w-full max-w-md mx-4"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="invite-modal-title"
                        aria-describedby="invite-modal-desc"
                    >
                        <div className="fluent-modal-header">
                            <h3 id="invite-modal-title" className="fluent-modal-title">📨 邀请成员</h3>
                            <p id="invite-modal-desc" className="sr-only">输入用户名后发送邀请。</p>
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="fluent-modal-close"
                                aria-label="关闭弹窗"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="fluent-modal-body">
                            <label className="block text-sm text-[var(--fluent-foreground-secondary)] mb-2">输入用户名</label>
                            <input
                                type="text"
                                value={inviteUsername}
                                onChange={(e) => setInviteUsername(e.target.value)}
                                placeholder="要邀请的用户名"
                                className="fluent-input w-full"
                            />
                        </div>
                        <div className="fluent-modal-footer flex justify-end gap-2">
                            <button onClick={() => setShowInviteModal(false)} className="fluent-button fluent-button-subtle px-4 py-2">取消</button>
                            <button onClick={handleInviteUser} disabled={!inviteUsername.trim() || actionLoading} className="fluent-button fluent-button-accent px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                {actionLoading ? '发送中...' : '发送邀请'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 编辑空间弹窗 */}
            {showEditModal && (
                <div className="fluent-modal-overlay">
                    <div
                        className="fluent-modal-enhanced fluent-modal-zoom w-full max-w-md mx-4"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="edit-modal-title"
                        aria-describedby="edit-modal-desc"
                    >
                        <div className="fluent-modal-header">
                            <h3 id="edit-modal-title" className="fluent-modal-title">⚙️ 空间设置</h3>
                            <p id="edit-modal-desc" className="sr-only">修改空间名称或描述并保存。</p>
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="fluent-modal-close"
                                aria-label="关闭弹窗"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="fluent-modal-body space-y-4">
                            <div>
                                <label className="block text-sm text-[var(--fluent-foreground-secondary)] mb-2">空间名称</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="fluent-input w-full"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-[var(--fluent-foreground-secondary)] mb-2">空间描述（可选）</label>
                                <textarea
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    rows={3}
                                    className="fluent-input w-full resize-none"
                                />
                            </div>
                        </div>
                        <div className="fluent-modal-footer flex justify-between">
                            {isOwner && (
                                <button
                                    onClick={handleDeleteWorkspace}
                                    className="fluent-button px-4 py-2 bg-red-600/80 text-white hover:bg-red-700"
                                >
                                    🗑️ 删除空间
                                </button>
                            )}
                            <div className="flex gap-2 ml-auto">
                                <button onClick={() => setShowEditModal(false)} className="fluent-button fluent-button-subtle px-4 py-2">取消</button>
                                <button onClick={handleUpdateWorkspace} disabled={!editName.trim() || actionLoading} className="fluent-button fluent-button-accent px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {actionLoading ? '保存中...' : '保存'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
