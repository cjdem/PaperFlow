
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
    getMe, logout, User, Paper, getPapers,
    getWorkspace, WorkspaceDetail, WorkspacePaper,
    getWorkspacePapers, sharePapersToWorkspace, removePaperFromWorkspace,
    inviteUser, updateMemberRole, removeMember, leaveWorkspace,
    updateWorkspace, deleteWorkspace
} from '@/lib/api';
import MarkdownRenderer from '@/components/MarkdownRenderer';

type TabType = 'papers' | 'members';

export default function WorkspaceDetailPage() {
    const router = useRouter();
    const params = useParams();
    const workspaceId = Number(params.id);

    const [user, setUser] = useState<User | null>(null);
    const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
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
            const [workspaceData, papersData] = await Promise.all([
                getWorkspace(workspaceId),
                getWorkspacePapers(workspaceId, searchQuery || undefined)
            ]);
            setWorkspace(workspaceData);
            setWorkspacePapers(papersData.papers);
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

    useEffect(() => {
        if (user) loadData();
    }, [searchQuery, user, loadData]);

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
                return <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full">所有者</span>;
            case 'admin':
                return <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">管理员</span>;
            default:
                return <span className="px-2 py-0.5 bg-gray-600 text-white text-xs rounded-full">成员</span>;
        }
    };

    const isAdmin = workspace?.my_role === 'owner' || workspace?.my_role === 'admin';
    const isOwner = workspace?.my_role === 'owner';

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-white text-xl">加载中...</div>
            </div>
        );
    }

    if (!workspace) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-white text-xl">空间不存在</div>
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

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                    <button
                        onClick={() => router.push('/papers')}
                        className="w-full text-left px-3 py-2 rounded-lg transition text-gray-300 hover:bg-slate-700"
                    >
                        📚 我的论文
                    </button>
                    <button
                        onClick={() => router.push('/workspaces')}
                        className="w-full text-left px-3 py-2 rounded-lg transition text-gray-300 hover:bg-slate-700"
                    >
                        👥 团队空间
                    </button>
                    <div className="pt-2 border-t border-slate-700">
                        <p className="text-xs text-gray-500 mb-2 px-3">当前空间</p>
                        <div className="px-3 py-2 bg-purple-600/20 border border-purple-500/50 rounded-lg">
                            <p className="text-purple-300 font-medium truncate">🏢 {workspace.name}</p>
                            <p className="text-xs text-gray-500 mt-1">{getRoleBadge(workspace.my_role)}</p>
                        </div>
                    </div>
                </nav>

                <div className="p-4 border-t border-slate-700">
                    <button onClick={handleLogout} className="w-full py-2 text-gray-400 hover:text-white transition">
                        退出登录
                    </button>
                </div>
            </aside>

            {/* 主内容 */}
            <main className="flex-1 p-6 overflow-auto">
                {/* 标题栏 */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            🏢 {workspace.name}
                            {getRoleBadge(workspace.my_role)}
                        </h2>
                        {workspace.description && (
                            <p className="text-gray-400 mt-1">{workspace.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            <span>👤 {workspace.member_count} 成员</span>
                            <span>📄 {workspace.paper_count} 论文</span>
                            <span>创建者: {workspace.owner_username}</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {isAdmin && (
                            <button
                                onClick={openEditModal}
                                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
                            >
                                ⚙️ 设置
                            </button>
                        )}
                        {!isOwner && (
                            <button
                                onClick={handleLeaveWorkspace}
                                className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition"
                            >
                                🚪 离开
                            </button>
                        )}
                    </div>
                </div>

                {/* 标签页 */}
                <div className="flex border-b border-slate-700 mb-6">
                    <button
                        onClick={() => setActiveTab('papers')}
                        className={`px-6 py-3 font-medium transition-all ${activeTab === 'papers'
                            ? 'text-purple-400 border-b-2 border-purple-400'
                            : 'text-gray-400 hover:text-gray-200'
                            }`}
                    >
                        📚 论文 ({workspacePapers.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('members')}
                        className={`px-6 py-3 font-medium transition-all ${activeTab === 'members'
                            ? 'text-purple-400 border-b-2 border-purple-400'
                            : 'text-gray-400 hover:text-gray-200'
                            }`}
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
                                className="flex-1 max-w-md px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500"
                            />
                            <button
                                onClick={openShareModal}
                                className="px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition"
                            >
                                ➕ 分享论文
                            </button>
                        </div>

                        {workspacePapers.length === 0 ? (
                            <div className="text-center text-gray-500 py-20">
                                <div className="text-6xl mb-4">📄</div>
                                <p className="text-xl mb-2">暂无论文</p>
                                <p className="text-sm">点击"分享论文"将你的论文分享到此空间</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {workspacePapers.map(wp => (
                                    <div key={wp.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                                        <div className="p-4">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <h3 className="text-lg font-semibold text-white">{wp.paper.title}</h3>
                                                    {wp.paper.title_cn && (
                                                        <p className="text-gray-400 text-sm mt-1">{wp.paper.title_cn}</p>
                                                    )}
                                                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                                        <span className="px-2 py-1 bg-slate-700 rounded">{wp.paper.journal || 'Journal'}</span>
                                                        <span>📅 {wp.paper.year}</span>
                                                        <span>✍️ {wp.paper.authors?.slice(0, 50)}...</span>
                                                    </div>
                                                    <div className="mt-2 text-xs text-gray-600">
                                                        分享者: {wp.shared_by_username} | {new Date(wp.shared_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 ml-4">
                                                    <button
                                                        onClick={() => setExpandedPaper(expandedPaper === wp.paper.id ? null : wp.paper.id)}
                                                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                                                    >
                                                        {expandedPaper === wp.paper.id ? '收起' : '📖 阅读'}
                                                    </button>
                                                    {(isAdmin || wp.shared_by_id === user?.id) && (
                                                        <button
                                                            onClick={() => handleRemovePaper(wp.paper.id)}
                                                            className="px-3 py-1 bg-red-600/20 text-red-400 text-sm rounded-lg hover:bg-red-600/30"
                                                        >
                                                            🗑️
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {expandedPaper === wp.paper.id && (
                                            <div className="border-t border-slate-700 bg-slate-900">
                                                <div className="flex border-b border-slate-700">
                                                    <button
                                                        onClick={() => setDetailTab('analysis')}
                                                        className={`px-6 py-3 font-medium transition-all ${detailTab === 'analysis' ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-800' : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800'}`}
                                                    >
                                                        💡 深度分析
                                                    </button>
                                                    <button
                                                        onClick={() => setDetailTab('abstract_cn')}
                                                        className={`px-6 py-3 font-medium transition-all ${detailTab === 'abstract_cn' ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800' : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800'}`}
                                                    >
                                                        🇨🇳 中文摘要
                                                    </button>
                                                    <button
                                                        onClick={() => setDetailTab('abstract_en')}
                                                        className={`px-6 py-3 font-medium transition-all ${detailTab === 'abstract_en' ? 'text-green-400 border-b-2 border-green-400 bg-slate-800' : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800'}`}
                                                    >
                                                        🇬🇧 英文摘要
                                                    </button>
                                                </div>
                                                <div className="p-6">
                                                    {detailTab === 'analysis' && <MarkdownRenderer content={wp.paper.detailed_analysis || '暂无分析内容'} />}
                                                    {detailTab === 'abstract_cn' && <div className="text-gray-200 text-lg leading-9">{wp.paper.abstract || '暂无中文摘要'}</div>}
                                                    {detailTab === 'abstract_en' && <div className="text-gray-200 text-lg leading-9 font-serif italic">{wp.paper.abstract_en || 'No English abstract available'}</div>}
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
                                    className="px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition"
                                >
                                    📨 邀请成员
                                </button>
                            </div>
                        )}

                        <div className="space-y-3">
                            {workspace.members.map(member => (
                                <div key={member.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-white font-bold">
                                            {member.username.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-medium">{member.username}</span>
                                                {getRoleBadge(member.role)}
                                            </div>
                                            <p className="text-xs text-gray-500">加入于 {new Date(member.joined_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    {isAdmin && member.role !== 'owner' && member.user_id !== user?.id && (
                                        <div className="flex items-center gap-2">
                                            {isOwner && (
                                                <select
                                                    value={member.role}
                                                    onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                                                    className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                                                >
                                                    <option value="member">成员</option>
                                                    <option value="admin">管理员</option>
                                                </select>
                                            )}
                                            <button
                                                onClick={() => handleRemoveMember(member.user_id, member.username)}
                                                className="px-3 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition"
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
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-white">📤 分享论文到空间</h3>
                            <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto">
                            <p className="text-gray-400 mb-4">选择要分享的论文：</p>
                            {myPapers.length === 0 ? (
                                <p className="text-gray-500 text-center py-8">暂无可分享的论文</p>
                            ) : (
                                <div className="space-y-2">
                                    {myPapers.map(paper => {
                                        const isShared = workspacePapers.some(wp => wp.paper.id === paper.id);
                                        return (
                                            <label
                                                key={paper.id}
                                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition ${isShared ? 'bg-gray-700/50 cursor-not-allowed' : selectedPaperIds.has(paper.id) ? 'bg-purple-600/30 border border-purple-500' : 'bg-slate-700 border border-transparent hover:bg-slate-600'}`}
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
                                                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className={`truncate ${isShared ? 'text-gray-500' : 'text-white'}`}>{paper.title}</p>
                                                    <p className="text-xs text-gray-500 truncate">{paper.authors} | {paper.year}</p>
                                                </div>
                                                {isShared && <span className="text-xs text-green-500">已分享</span>}
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-700 flex justify-between items-center">
                            <span className="text-gray-400">已选择 {selectedPaperIds.size} 篇</span>
                            <div className="flex gap-2">
                                <button onClick={() => setShowShareModal(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition">取消</button>
                                <button onClick={handleSharePapers} disabled={selectedPaperIds.size === 0 || actionLoading} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                                    {actionLoading ? '分享中...' : '分享'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 邀请成员弹窗 */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md mx-4">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-white">📨 邀请成员</h3>
                            <button onClick={() => setShowInviteModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4">
                            <label className="block text-sm text-gray-400 mb-2">输入用户名</label>
                            <input
                                type="text"
                                value={inviteUsername}
                                onChange={(e) => setInviteUsername(e.target.value)}
                                placeholder="要邀请的用户名"
                                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                            />
                        </div>
                        <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
                            <button onClick={() => setShowInviteModal(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition">取消</button>
                            <button onClick={handleInviteUser} disabled={!inviteUsername.trim() || actionLoading} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
                                {actionLoading ? '发送中...' : '发送邀请'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 编辑空间弹窗 */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md mx-4">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-white">⚙️ 空间设置</h3>
                            <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">空间名称</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">空间描述（可选）</label>
                                <textarea
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    rows={3}
                                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-700 flex justify-between">
                            {isOwner && (
                                <button
                                    onClick={handleDeleteWorkspace}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                                >
                                    🗑️ 删除空间
                                </button>
                            )}
                            <div className="flex gap-2 ml-auto">
                                <button onClick={() => setShowEditModal(false)} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition">取消</button>
                                <button onClick={handleUpdateWorkspace} disabled={!editName.trim() || actionLoading} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition">
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
