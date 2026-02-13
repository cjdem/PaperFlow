'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    logout,
    getWorkspaces, createWorkspace, Workspace,
    getGroups, Group,
    getReceivedInvitations, acceptInvitation, rejectInvitation, Invitation
} from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { usePolling } from '@/lib/usePolling';
import AppSidebar from '@/components/AppSidebar';

export default function WorkspacesPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth({ redirectTo: '/' });
    const initialLoadRef = useRef(false);
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newWorkspaceName, setNewWorkspaceName] = useState('');
    const [newWorkspaceDesc, setNewWorkspaceDesc] = useState('');
    const [creating, setCreating] = useState(false);

    // 加载数据
    const loadData = useCallback(async () => {
        try {
            const [workspacesData, invitationsData, groupsData] = await Promise.all([
                getWorkspaces(),
                getReceivedInvitations(),
                getGroups()
            ]);
            setWorkspaces(workspacesData.workspaces);
            setInvitations(invitationsData.invitations);
            setGroups(groupsData);
        } catch (err) {
            console.error('加载数据失败:', err);
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
        deps: []
    });

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    const handleCreateWorkspace = async () => {
        if (!newWorkspaceName.trim()) return;

        setCreating(true);
        try {
            await createWorkspace(newWorkspaceName.trim(), newWorkspaceDesc.trim() || undefined);
            setNewWorkspaceName('');
            setNewWorkspaceDesc('');
            setShowCreateModal(false);
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '创建失败');
        } finally {
            setCreating(false);
        }
    };

    const handleAcceptInvitation = async (invitationId: number) => {
        try {
            await acceptInvitation(invitationId);
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '接受邀请失败');
        }
    };

    const handleRejectInvitation = async (invitationId: number) => {
        try {
            await rejectInvitation(invitationId);
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '拒绝邀请失败');
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

    if (authLoading || loading) {
        return (
            <div className="min-h-screen fluent-background flex items-center justify-center">
                <div className="text-[var(--fluent-foreground)] text-xl">加载中...</div>
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
            />

            {/* 主内容 */}
            <main className="flex-1 p-6 overflow-auto">
                {/* 标题栏 */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-[var(--fluent-foreground)]">👥 团队空间</h2>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="fluent-button fluent-button-accent px-4 py-2"
                    >
                        ➕ 创建空间
                    </button>
                </div>

                {/* 待处理邀请 */}
                {invitations.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-[var(--fluent-foreground)] mb-3">📬 待处理邀请 ({invitations.length})</h3>
                        <div className="space-y-3">
                            {invitations.map(inv => (
                                <div key={inv.id} className="fluent-card p-4 border-yellow-500/40">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-[var(--fluent-foreground)]">
                                                <span className="text-blue-400">{inv.inviter_username}</span>
                                                {' '}邀请你加入{' '}
                                                <span className="text-purple-400 font-semibold">「{inv.workspace_name}」</span>
                                            </p>
                                            <p className="text-sm text-[var(--fluent-foreground-secondary)] mt-1">
                                                {new Date(inv.created_at).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleAcceptInvitation(inv.id)}
                                                className="fluent-button px-4 py-2 bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30"
                                            >
                                                接受
                                            </button>
                                            <button
                                                onClick={() => handleRejectInvitation(inv.id)}
                                                className="fluent-button fluent-button-subtle px-4 py-2"
                                            >
                                                拒绝
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 空间列表 */}
                {workspaces.length === 0 ? (
                    <div className="text-center text-[var(--fluent-foreground-secondary)] py-20">
                        <div className="text-6xl mb-4">👥</div>
                        <p className="text-xl mb-2 text-[var(--fluent-foreground)]">暂无团队空间</p>
                        <p className="text-sm">创建一个空间，邀请团队成员一起管理论文</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {workspaces.map(workspace => (
                            <div
                                key={workspace.id}
                                onClick={() => router.push(`/workspaces/${workspace.id}`)}
                                className="fluent-card p-5 cursor-pointer transition-all hover:border-purple-500/60 hover:shadow-lg hover:shadow-purple-500/10"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="text-lg font-semibold text-[var(--fluent-foreground)] truncate flex-1">
                                        🏢 {workspace.name}
                                    </h3>
                                    {getRoleBadge(workspace.my_role)}
                                </div>
                                {workspace.description && (
                                    <p className="text-[var(--fluent-foreground-secondary)] text-sm mb-3 line-clamp-2">
                                        {workspace.description}
                                    </p>
                                )}
                                <div className="flex items-center gap-4 text-sm text-[var(--fluent-foreground-secondary)]">
                                    <span>👤 {workspace.member_count} 成员</span>
                                    <span>📄 {workspace.paper_count} 论文</span>
                                </div>
                                <div className="mt-3 pt-3 border-t border-[var(--fluent-divider)] text-xs text-[var(--fluent-foreground-secondary)]">
                                    创建者: {workspace.owner_username}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* 创建空间弹窗 */}
            {showCreateModal && (
                <div className="fluent-modal-overlay">
                    <div
                        className="fluent-modal-enhanced fluent-modal-zoom w-full max-w-md mx-4"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="create-workspace-title"
                        aria-describedby="create-workspace-desc"
                    >
                        <div className="fluent-modal-header">
                            <h3 id="create-workspace-title" className="fluent-modal-title">➕ 创建团队空间</h3>
                            <p id="create-workspace-desc" className="sr-only">填写空间名称和可选描述后创建团队空间。</p>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="fluent-modal-close"
                                aria-label="关闭弹窗"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="fluent-modal-body space-y-4">
                            <div>
                                <label className="block text-sm text-[var(--fluent-foreground-secondary)] mb-2">空间名称 *</label>
                                <input
                                    type="text"
                                    value={newWorkspaceName}
                                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                                    placeholder="例如：研究组论文库"
                                    className="fluent-input w-full"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-[var(--fluent-foreground-secondary)] mb-2">描述（可选）</label>
                                <textarea
                                    value={newWorkspaceDesc}
                                    onChange={(e) => setNewWorkspaceDesc(e.target.value)}
                                    placeholder="简单描述这个空间的用途..."
                                    rows={3}
                                    className="fluent-input w-full resize-none"
                                />
                            </div>
                        </div>
                        <div className="fluent-modal-footer flex justify-end gap-2">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="fluent-button fluent-button-subtle px-4 py-2"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreateWorkspace}
                                disabled={!newWorkspaceName.trim() || creating}
                                className="fluent-button fluent-button-accent px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {creating ? '创建中...' : '创建'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
