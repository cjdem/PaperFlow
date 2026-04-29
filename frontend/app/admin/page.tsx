
'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '@/lib/api';
import { apiClient } from '@/lib/apiClient';
import { useAuth } from '@/lib/useAuth';
import { usePolling } from '@/lib/usePolling';
import TranslationMonitor from '@/components/TranslationMonitor';
import { ModelConfigPanel } from '@/components/admin/model-config/ModelConfigPanel';

interface AdminStats {
    user_count: number;
    paper_count: number;
    group_count: number;
}

interface UserStorageStats {
    user_id: number;
    username: string;
    file_count: number;
    total_size: number;
    total_size_formatted: string;
}

interface StorageStats {
    total_files: number;
    total_size: number;
    total_size_formatted: string;
    users: UserStorageStats[];
}

interface AdminUserDetail {
    id: number;
    username: string;
    role: string;
}

interface AdminResetPasswordResponse {
    user_id: number;
    username: string;
    temporary_password: string;
    generated: boolean;
}

interface AdminPaperDetail {
    id: number;
    title: string | null;
    title_cn: string | null;
    authors: string | null;
    year: string | null;
    journal: string | null;
    owner_id: number | null;
    owner_username: string | null;
}

interface AdminGroupPaperItem {
    id: number;
    title: string | null;
    owner_id: number | null;
    owner_username: string | null;
}

interface AdminGroupDetail {
    id: number;
    name: string;
    paper_count: number;
    papers: AdminGroupPaperItem[];
}

export default function AdminPage() {
    const router = useRouter();
    const { user, loading: authLoading, isAuthorized } = useAuth({
        redirectTo: '/',
        requireRole: 'admin',
        forbiddenRedirectTo: '/papers',
        onForbidden: () => alert('需要管理员权限')
    });
    const initialLoadRef = useRef(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
    const [activeTab, setActiveTab] = useState<'stats' | 'storage' | 'llm' | 'translate'>('stats');
    const [retryCount, setRetryCount] = useState('3');
    const [statsDetailType, setStatsDetailType] = useState<'users' | 'papers' | 'groups' | null>(null);
    const [statsDetailLoading, setStatsDetailLoading] = useState(false);
    const [userDetails, setUserDetails] = useState<AdminUserDetail[]>([]);
    const [paperDetails, setPaperDetails] = useState<AdminPaperDetail[]>([]);
    const [groupDetails, setGroupDetails] = useState<AdminGroupDetail[]>([]);

    const loadRetryConfig = useCallback(async () => {
        const data = await apiClient.get<{ key: string; value: string | null }>('/api/admin/config/llm_max_retries');
        if (data.value) setRetryCount(data.value);
    }, []);

    const saveRetryConfig = async () => {
        await apiClient.post('/api/admin/config', {
            key: 'llm_max_retries',
            value: retryCount
        });
        alert('重试次数已保存');
    };

    const loadData = useCallback(async () => {
        const [statsRes, storageRes] = await Promise.all([
            apiClient.get<AdminStats>('/api/admin/stats'),
            apiClient.get<StorageStats>('/api/admin/storage-stats')
        ]);
        setStats(statsRes);
        setStorageStats(storageRes);
    }, []);

    const handleInitialLoad = useCallback(async () => {
        if (!isAuthorized) return;
        try {
            await Promise.all([loadData(), loadRetryConfig()]);
        } finally {
            if (!initialLoadRef.current) {
                initialLoadRef.current = true;
                setLoading(false);
            }
        }
    }, [isAuthorized, loadData, loadRetryConfig]);

    usePolling(handleInitialLoad, {
        enabled: isAuthorized,
        deps: [activeTab]
    });

    const openStatsDetail = async (type: 'users' | 'papers' | 'groups') => {
        setStatsDetailType(type);
        setStatsDetailLoading(true);
        try {
            if (type === 'users') {
                const data = await apiClient.get<AdminUserDetail[]>('/api/admin/stats/users');
                setUserDetails(data);
                return;
            }
            if (type === 'papers') {
                const data = await apiClient.get<AdminPaperDetail[]>('/api/admin/stats/papers');
                setPaperDetails(data);
                return;
            }
            const data = await apiClient.get<AdminGroupDetail[]>('/api/admin/stats/groups');
            setGroupDetails(data);
        } catch (error) {
            const msg = error instanceof Error ? error.message : '加载详情失败';
            alert(msg);
            setStatsDetailType(null);
        } finally {
            setStatsDetailLoading(false);
        }
    };

    const closeStatsDetail = () => {
        setStatsDetailType(null);
        setStatsDetailLoading(false);
    };

    const resetUserPassword = async (user: AdminUserDetail) => {
        const input = prompt(
            `为用户「${user.username}」设置新密码。\n留空将自动生成临时密码（至少 6 位）。`,
            ''
        );
        if (input === null) return;

        const newPassword = input.trim();
        if (newPassword && newPassword.length < 6) {
            alert('密码长度至少 6 位');
            return;
        }

        try {
            const payload = newPassword ? { new_password: newPassword } : {};
            const res = await apiClient.post<AdminResetPasswordResponse>(`/api/admin/users/${user.id}/reset-password`, payload);
            const mode = res.generated ? '（系统生成）' : '（手动设置）';
            alert(`✅ 用户 ${res.username} 密码已重置 ${mode}\n新密码：${res.temporary_password}\n请妥善保存并尽快通知用户修改。`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : '重置密码失败';
            alert(`❌ ${msg}`);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen fluent-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-[var(--fluent-blue-500)] border-t-transparent rounded-full animate-spin" />
                    <div className="text-[var(--fluent-foreground)] text-lg font-medium" role="status" aria-live="polite">加载中...</div>
                </div>
            </div>
        );
    }

    const renderStatsDetailModal = () => {
        if (!statsDetailType) return null;

        const titleMap: Record<'users' | 'papers' | 'groups', string> = {
            users: '👥 用户明细',
            papers: '📄 论文明细',
            groups: '🏷️ 分组明细'
        };

        return (
            <div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={closeStatsDetail}
            >
                <div
                    className="fluent-card w-full max-w-6xl max-h-[88vh] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-5 border-b border-[var(--fluent-divider)] flex items-center justify-between">
                        <h3 className="text-xl font-bold text-[var(--fluent-foreground)]">{titleMap[statsDetailType]}</h3>
                        <button
                            onClick={closeStatsDetail}
                            className="fluent-button fluent-button-subtle px-3 py-1.5 text-sm"
                        >
                            关闭
                        </button>
                    </div>

                    <div className="p-5 overflow-y-auto max-h-[72vh]">
                        {statsDetailLoading && (
                            <div className="py-12 text-center text-[var(--fluent-foreground-secondary)]">
                                加载中...
                            </div>
                        )}

                        {!statsDetailLoading && statsDetailType === 'users' && (
                            <div className="space-y-3">
                                <p className="text-sm text-[var(--fluent-foreground-secondary)]">
                                    系统不存储明文密码；如用户忘记密码，请点击“重置密码”生成新密码后告知用户。
                                </p>
                                <div className="overflow-x-auto">
                                    <table className="fluent-table-glass w-full">
                                        <thead>
                                            <tr>
                                                <th className="text-left">ID</th>
                                                <th className="text-left">用户名</th>
                                                <th className="text-left">角色</th>
                                                <th className="text-left">操作</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {userDetails.map((u) => (
                                                <tr key={u.id}>
                                                    <td>{u.id}</td>
                                                    <td className="font-medium text-[var(--fluent-foreground)]">{u.username}</td>
                                                    <td>{u.role}</td>
                                                    <td>
                                                        <button
                                                            onClick={() => resetUserPassword(u)}
                                                            className="fluent-button px-3 py-1.5 text-sm bg-orange-500/20 text-orange-300 hover:bg-orange-500/30"
                                                        >
                                                            🔐 重置密码
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {!statsDetailLoading && statsDetailType === 'papers' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {paperDetails.map((p) => (
                                    <div key={p.id} className="fluent-card p-4">
                                        <h4 className="text-base font-semibold text-[var(--fluent-foreground)] break-words">
                                            {p.title || `论文 #${p.id}`}
                                        </h4>
                                        {p.title_cn && (
                                            <p className="text-sm text-[var(--fluent-foreground-secondary)] mt-1 break-words">{p.title_cn}</p>
                                        )}
                                        <div className="mt-3 text-sm text-[var(--fluent-foreground-secondary)] space-y-1">
                                            <p>👤 用户：<span className="text-[var(--fluent-foreground)] font-medium">{p.owner_username || '-'}</span></p>
                                            <p>📚 期刊：{p.journal || '-'}</p>
                                            <p>📅 年份：{p.year || '-'}</p>
                                            <p className="break-words">✍️ 作者：{p.authors || '-'}</p>
                                        </div>
                                    </div>
                                ))}
                                {paperDetails.length === 0 && (
                                    <div className="col-span-full text-center py-12 text-[var(--fluent-foreground-secondary)]">
                                        暂无论文数据
                                    </div>
                                )}
                            </div>
                        )}

                        {!statsDetailLoading && statsDetailType === 'groups' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {groupDetails.map((g) => (
                                    <div key={g.id} className="fluent-card p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <h4 className="text-base font-semibold text-[var(--fluent-foreground)] break-words">{g.name}</h4>
                                            <span className="fluent-badge">{g.paper_count} 篇</span>
                                        </div>
                                        <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
                                            {g.papers.map((p) => (
                                                <div key={p.id} className="text-sm text-[var(--fluent-foreground-secondary)] break-words">
                                                    <span className="text-[var(--fluent-foreground)]">{p.title || `论文 #${p.id}`}</span>
                                                    <span className="ml-2">({p.owner_username || '-'})</span>
                                                </div>
                                            ))}
                                            {g.papers.length === 0 && (
                                                <div className="text-sm text-[var(--fluent-foreground-secondary)]">该分组暂无论文</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {groupDetails.length === 0 && (
                                    <div className="col-span-full text-center py-12 text-[var(--fluent-foreground-secondary)]">
                                        暂无分组数据
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen fluent-background p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8 fluent-fade-in">
                    <div>
                        <h1 className="text-3xl font-bold text-[var(--fluent-foreground)]">⚙️ 管理员控制台</h1>
                        <p className="text-[var(--fluent-foreground-secondary)] mt-1">👤 {user?.username}</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => router.push('/papers')} className="fluent-button fluent-button-accent px-4 py-2.5 font-medium">
                            📚 返回论文
                        </button>
                        <button onClick={() => { logout(); router.push('/'); }} className="fluent-button fluent-button-subtle px-4 py-2.5">
                            🚪 退出登录
                        </button>
                    </div>
                </div>

                {/* Main Tabs */}
                <div className="fluent-tabs mb-6 fluent-fade-in" style={{ animationDelay: '50ms' }}>
                    <button onClick={() => setActiveTab('stats')} className={`fluent-tab ${activeTab === 'stats' ? 'active' : ''}`}>
                        📊 系统统计
                    </button>
                    <button onClick={() => setActiveTab('storage')} className={`fluent-tab ${activeTab === 'storage' ? 'active' : ''}`}>
                        💾 存储统计
                    </button>
                    <button onClick={() => setActiveTab('llm')} className={`fluent-tab ${activeTab === 'llm' ? 'active' : ''}`}>
                        🤖 LLM 提供商
                    </button>
                    <button onClick={() => setActiveTab('translate')} className={`fluent-tab ${activeTab === 'translate' ? 'active' : ''}`}>
                        🌐 翻译配置
                    </button>
                </div>

                {/* Stats Tab */}
                {activeTab === 'stats' && stats && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <button
                            type="button"
                            onClick={() => openStatsDetail('users')}
                            className="fluent-stat-card-enhanced fluent-stat-card-blue fluent-stagger-item group text-left cursor-pointer"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">用户数</div>
                                    <div className="text-4xl font-bold text-[var(--text-primary)] mb-1">{stats.user_count}</div>
                                    <div className="text-xs text-[var(--text-tertiary)]">注册用户总数（点击查看详情）</div>
                                </div>
                                <div className="fluent-stat-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                        <circle cx="9" cy="7" r="4"/>
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                    </svg>
                                </div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => openStatsDetail('papers')}
                            className="fluent-stat-card-enhanced fluent-stat-card-purple fluent-stagger-item group text-left cursor-pointer"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">论文数</div>
                                    <div className="text-4xl font-bold text-[var(--text-primary)] mb-1">{stats.paper_count}</div>
                                    <div className="text-xs text-[var(--text-tertiary)]">已上传论文总数（点击查看详情）</div>
                                </div>
                                <div className="fluent-stat-icon fluent-stat-icon-purple">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14,2 14,8 20,8"/>
                                        <line x1="16" y1="13" x2="8" y2="13"/>
                                        <line x1="16" y1="17" x2="8" y2="17"/>
                                        <polyline points="10,9 9,9 8,9"/>
                                    </svg>
                                </div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => openStatsDetail('groups')}
                            className="fluent-stat-card-enhanced fluent-stat-card-green fluent-stagger-item group text-left cursor-pointer"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">分组数</div>
                                    <div className="text-4xl font-bold text-[var(--text-primary)] mb-1">{stats.group_count}</div>
                                    <div className="text-xs text-[var(--text-tertiary)]">论文分组总数（点击查看详情）</div>
                                </div>
                                <div className="fluent-stat-icon fluent-stat-icon-green">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                    </svg>
                                </div>
                            </div>
                        </button>
                    </div>
                )}

                {/* Storage Stats Tab */}
                {activeTab === 'storage' && storageStats && (
                    <div className="space-y-6">
                        {/* 总体统计 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="fluent-stat-card-enhanced fluent-stat-card-blue fluent-stagger-item group">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">总文件数</div>
                                        <div className="text-4xl font-bold text-[var(--text-primary)] mb-1">{storageStats.total_files}</div>
                                        <div className="text-xs text-[var(--text-tertiary)]">所有用户上传的文件</div>
                                    </div>
                                    <div className="fluent-stat-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                                            <polyline points="13,2 13,9 20,9"/>
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div className="fluent-stat-card-enhanced fluent-stat-card-orange fluent-stagger-item group">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">总存储空间</div>
                                        <div className="text-4xl font-bold text-[var(--text-primary)] mb-1">{storageStats.total_size_formatted}</div>
                                        <div className="text-xs text-[var(--text-tertiary)]">已使用的磁盘空间</div>
                                    </div>
                                    <div className="fluent-stat-icon fluent-stat-icon-orange">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <ellipse cx="12" cy="5" rx="9" ry="3"/>
                                            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                                            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 用户存储详情 */}
                        <div className="fluent-card overflow-hidden fluent-stagger-item" style={{ animationDelay: '100ms' }}>
                            <div className="p-5 border-b border-[var(--fluent-divider)] flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--fluent-blue-400)]">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                        <circle cx="9" cy="7" r="4"/>
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                    </svg>
                                    用户存储详情
                                </h3>
                                <span className="fluent-badge fluent-badge-info">{storageStats.users.length} 位用户</span>
                            </div>
                            <div className="overflow-x-auto scrollbar-glass">
                                <table className="fluent-table-glass w-full">
                                    <thead>
                                        <tr>
                                            <th className="text-left">用户</th>
                                            <th className="text-right">文件数</th>
                                            <th className="text-right">存储空间</th>
                                            <th className="text-right">占比</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {storageStats.users.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="text-center py-12">
                                                    <div className="text-4xl mb-2">📭</div>
                                                    <span className="text-[var(--text-secondary)]">暂无存储数据</span>
                                                </td>
                                            </tr>
                                        ) : (
                                            storageStats.users.map((user, index) => (
                                                <tr key={user.user_id} className="fluent-stagger-item" style={{ animationDelay: `${(index + 2) * 50}ms` }}>
                                                    <td>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                                                                {user.username.charAt(0).toUpperCase()}
                                                            </div>
                                                            <span className="font-medium text-[var(--text-primary)]">{user.username}</span>
                                                        </div>
                                                    </td>
                                                    <td className="text-right text-[var(--text-secondary)]">
                                                        <span className="fluent-badge">{user.file_count} 个</span>
                                                    </td>
                                                    <td className="text-right text-[var(--text-primary)] font-medium">
                                                        {user.total_size_formatted}
                                                    </td>
                                                    <td className="text-right">
                                                        <div className="flex items-center justify-end gap-3">
                                                            <div className="w-24 fluent-progress-glass">
                                                                <div
                                                                    className="fluent-progress-glass-bar"
                                                                    style={{
                                                                        width: `${storageStats.total_size > 0
                                                                            ? (user.total_size / storageStats.total_size) * 100
                                                                            : 0}%`
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="text-[var(--text-secondary)] text-sm w-14 text-right font-medium">
                                                                {storageStats.total_size > 0
                                                                    ? ((user.total_size / storageStats.total_size) * 100).toFixed(1)
                                                                    : 0}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 存储说明 */}
                        <div className="fluent-card p-5">
                            <h4 className="text-sm font-semibold text-[var(--fluent-foreground)] mb-3">💡 存储说明</h4>
                            <ul className="text-sm text-[var(--fluent-foreground-secondary)] space-y-2">
                                <li>• 文件按用户隔离存储，每个用户的文件存放在独立目录</li>
                                <li>• 同一用户上传相同文件（MD5 相同）会自动去重</li>
                                <li>• 删除论文时会同步删除对应的 PDF 文件</li>
                                <li>• 存储路径：<code className="fluent-badge px-2 py-0.5 text-purple-400">uploads/papers/user_&#123;id&#125;/</code></li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* LLM Tab */}
                {activeTab === 'llm' && (
                    <div className="space-y-6 fluent-fade-in" style={{ animationDelay: '100ms' }}>
                        <ModelConfigPanel />

                        {/* Retry Configuration */}
                        <div className="fluent-card p-5">
                            <h4 className="text-base font-semibold text-[var(--fluent-foreground)] mb-4">⚙️ 重试配置</h4>
                            <div className="flex items-end gap-4">
                                <div className="flex-1 max-w-xs">
                                    <label className="block text-sm font-medium text-[var(--fluent-foreground-secondary)] mb-2">单模型重试次数</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={retryCount}
                                        onChange={e => setRetryCount(e.target.value)}
                                        className="fluent-input w-full"
                                    />
                                    <p className="text-xs text-[var(--fluent-foreground-secondary)] mt-1.5">💡 每个模型失败后重试的次数，用尽后切换到下一个模型</p>
                                </div>
                                <button
                                    onClick={saveRetryConfig}
                                    className="fluent-button fluent-button-accent px-5 py-2.5 font-medium"
                                >
                                    💾 保存
                                </button>
                            </div>
                        </div>

                        {/* Info Box */}
                        <div className="fluent-card p-5">
                            <h4 className="text-base font-semibold text-[var(--fluent-foreground)] mb-3">💡 配置说明</h4>
                            <ul className="text-sm text-[var(--fluent-foreground-secondary)] space-y-2">
                                <li>• <strong className="text-blue-400">元数据提取</strong>：处理论文头部信息，推荐快速模型如 gpt-4o-mini、gemini-flash</li>
                                <li>• <strong className="text-purple-400">深度分析</strong>：生成详细报告，推荐强力模型如 gpt-4o、claude-3.5-sonnet</li>
                                <li>• 两个池独立配置，互不影响，支持不同的 API 类型和模型</li>
                                <li>• <strong className="text-yellow-400">优先级越小越优先</strong>：模型按优先级顺序尝试，每个模型会先重试 N 次再切换</li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* Translation Tab */}
                {activeTab === 'translate' && (
                    <div className="fluent-fade-in" style={{ animationDelay: '100ms' }}>
                        <TranslationMonitor />
                    </div>
                )}

                {renderStatsDetailModal()}
            </div>
        </div>
    );
}
