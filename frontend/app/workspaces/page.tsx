'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    getMe, logout, User,
    getWorkspaces, createWorkspace, Workspace,
    getReceivedInvitations, acceptInvitation, rejectInvitation, Invitation
} from '@/lib/api';

export default function WorkspacesPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newWorkspaceName, setNewWorkspaceName] = useState('');
    const [newWorkspaceDesc, setNewWorkspaceDesc] = useState('');
    const [creating, setCreating] = useState(false);

    // 加载数据
    const loadData = useCallback(async () => {
        try {
            const [workspacesData, invitationsData] = await Promise.all([
                getWorkspaces(),
                getReceivedInvitations()
            ]);
            setWorkspaces(workspacesData.workspaces);
            setInvitations(invitationsData.invitations);
        } catch (err) {
            console.error('加载数据失败:', err);
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                const userData = await getMe();
                setUser(userData);
                await loadData();
            } catch {
                router.push('/');
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [router, loadData]);

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
                return <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full">所有者</span>;
            case 'admin':
                return <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">管理员</span>;
            default:
                return <span className="px-2 py-0.5 bg-gray-600 text-white text-xs rounded-full">成员</span>;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-white text-xl">加载中...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 flex">
            {/* 侧边栏 */}
            <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col h-screen sticky top-0">
                <div className="p-4 border-b border-slate-700">
                    <h1 className="text-xl font-bold text-white">🧬 PaperFlow</h1>
                    <p className="text-sm text-gray-400 mt-1">👤 {user?.username}</p>
                </div>

                {/* 导航 */}
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <button
                        onClick={() => router.push('/papers')}
                        className="w-full text-left px-3 py-2 rounded-lg transition text-gray-300 hover:bg-slate-700"
                    >
                        📚 我的论文
                    </button>
                    <button
                        className="w-full text-left px-3 py-2 rounded-lg transition bg-purple-600 text-white"
                    >
                        👥 团队空间
                    </button>
                    {user?.role === 'admin' && (
                        <button
                            onClick={() => router.push('/admin')}
                            className="w-full text-left px-3 py-2 rounded-lg transition text-gray-300 hover:bg-slate-700"
                        >
                            ⚙️ 系统管理
                        </button>
                    )}
                </nav>

                {/* 退出 */}
                <div className="p-4 border-t border-slate-700">
                    <button onClick={handleLogout} className="w-full py-2 text-gray-400 hover:text-white transition">
                        退出登录
                    </button>
                </div>
            </aside>

            {/* 主内容 */}
            <main className="flex-1 p-6 overflow-auto">
                {/* 标题栏 */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">👥 团队空间</h2>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition"
                    >
                        ➕ 创建空间
                    </button>
                </div>

                {/* 待处理邀请 */}
                {invitations.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-lg font-semibold text-white mb-3">📬 待处理邀请 ({invitations.length})</h3>
                        <div className="space-y-3">
                            {invitations.map(inv => (
                                <div key={inv.id} className="bg-slate-800 border border-yellow-500/50 rounded-xl p-4">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="text-white">
                                                <span className="text-blue-400">{inv.inviter_username}</span>
                                                {' '}邀请你加入{' '}
                                                <span className="text-purple-400 font-semibold">「{inv.workspace_name}」</span>
                                            </p>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {new Date(inv.created_at).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleAcceptInvitation(inv.id)}
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                                            >
                                                接受
                                            </button>
                                            <button
                                                onClick={() => handleRejectInvitation(inv.id)}
                                                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
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
                    <div className="text-center text-gray-500 py-20">
                        <div className="text-6xl mb-4">👥</div>
                        <p className="text-xl mb-2">暂无团队空间</p>
                        <p className="text-sm">创建一个空间，邀请团队成员一起管理论文</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {workspaces.map(workspace => (
                            <div
                                key={workspace.id}
                                onClick={() => router.push(`/workspaces/${workspace.id}`)}
                                className="bg-slate-800 border border-slate-700 rounded-xl p-5 cursor-pointer hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/10 transition-all"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="text-lg font-semibold text-white truncate flex-1">
                                        🏢 {workspace.name}
                                    </h3>
                                    {getRoleBadge(workspace.my_role)}
                                </div>
                                {workspace.description && (
                                    <p className="text-gray-400 text-sm mb-3 line-clamp-2">
                                        {workspace.description}
                                    </p>
                                )}
                                <div className="flex items-center gap-4 text-sm text-gray-500">
                                    <span>👤 {workspace.member_count} 成员</span>
                                    <span>📄 {workspace.paper_count} 论文</span>
                                </div>
                                <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-gray-600">
                                    创建者: {workspace.owner_username}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* 创建空间弹窗 */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md mx-4">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-white">➕ 创建团队空间</h3>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">空间名称 *</label>
                                <input
                                    type="text"
                                    value={newWorkspaceName}
                                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                                    placeholder="例如：研究组论文库"
                                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">描述（可选）</label>
                                <textarea
                                    value={newWorkspaceDesc}
                                    onChange={(e) => setNewWorkspaceDesc(e.target.value)}
                                    placeholder="简单描述这个空间的用途..."
                                    rows={3}
                                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreateWorkspace}
                                disabled={!newWorkspaceName.trim() || creating}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
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