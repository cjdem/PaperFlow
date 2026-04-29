'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '@/lib/api';
import { Loader2, Users, FileText, FolderOpen, Database, HardDrive, Settings, Globe, KeyRound } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { useAuth } from '@/lib/useAuth';
import { usePolling } from '@/lib/usePolling';
import TranslationMonitor from '@/components/TranslationMonitor';
import { ModelConfigPanel } from '@/components/admin/model-config/ModelConfigPanel';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ENTRANCE_VARIANTS } from '@/lib/animations/fluid-transitions';
import { motion } from 'motion/react';
import { toast } from 'sonner';

interface AdminStats { user_count: number; paper_count: number; group_count: number; }
interface UserStorageStats { user_id: number; username: string; file_count: number; total_size: number; total_size_formatted: string; }
interface StorageStats { total_files: number; total_size: number; total_size_formatted: string; users: UserStorageStats[]; }
interface AdminUserDetail { id: number; username: string; role: string; }
interface AdminResetPasswordResponse { user_id: number; username: string; temporary_password: string; generated: boolean; }
interface AdminPaperDetail { id: number; title: string | null; title_cn: string | null; authors: string | null; year: string | null; journal: string | null; owner_id: number | null; owner_username: string | null; }
interface AdminGroupPaperItem { id: number; title: string | null; owner_id: number | null; owner_username: string | null; }
interface AdminGroupDetail { id: number; name: string; paper_count: number; papers: AdminGroupPaperItem[]; }

export default function AdminPage() {
    const router = useRouter();
    const { user, loading: authLoading, isAuthorized } = useAuth({
        redirectTo: '/',
        requireRole: 'admin',
        forbiddenRedirectTo: '/papers',
        onForbidden: () => toast.error('需要管理员权限')
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
        await apiClient.post('/api/admin/config', { key: 'llm_max_retries', value: retryCount });
        toast.success('重试次数已保存');
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
            if (!initialLoadRef.current) { initialLoadRef.current = true; setLoading(false); }
        }
    }, [isAuthorized, loadData, loadRetryConfig]);

    usePolling(handleInitialLoad, { enabled: isAuthorized, deps: [activeTab] });

    const openStatsDetail = async (type: 'users' | 'papers' | 'groups') => {
        setStatsDetailType(type);
        setStatsDetailLoading(true);
        try {
            if (type === 'users') { setUserDetails(await apiClient.get<AdminUserDetail[]>('/api/admin/stats/users')); return; }
            if (type === 'papers') { setPaperDetails(await apiClient.get<AdminPaperDetail[]>('/api/admin/stats/papers')); return; }
            setGroupDetails(await apiClient.get<AdminGroupDetail[]>('/api/admin/stats/groups'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '加载详情失败');
            setStatsDetailType(null);
        } finally { setStatsDetailLoading(false); }
    };

    const resetUserPassword = async (u: AdminUserDetail) => {
        const input = prompt(`为用户「${u.username}」设置新密码。\n留空将自动生成临时密码（至少 6 位）。`, '');
        if (input === null) return;
        const newPassword = input.trim();
        if (newPassword && newPassword.length < 6) { toast.error('密码长度至少 6 位'); return; }
        try {
            const payload = newPassword ? { new_password: newPassword } : {};
            const res = await apiClient.post<AdminResetPasswordResponse>(`/api/admin/users/${u.id}/reset-password`, payload);
            const mode = res.generated ? '（系统生成）' : '（手动设置）';
            toast.success(`用户 ${res.username} 密码已重置 ${mode}\n新密码：${res.temporary_password}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '重置密码失败');
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
        );
    }

    const TABS = [
        { key: 'stats' as const, label: '系统统计', Icon: Database },
        { key: 'storage' as const, label: '存储统计', Icon: HardDrive },
        { key: 'llm' as const, label: 'LLM 配置', Icon: Settings },
        { key: 'translate' as const, label: '翻译配置', Icon: Globe },
    ];

    const handleLogout = () => { logout(); router.push('/'); };

    return (
        <AppShell title="管理" userRole={user?.role} onLogout={handleLogout}>
            {/* Tabs */}
            <div className="flex gap-1 mb-6 p-1 bg-muted rounded-2xl w-fit">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                            "px-3 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5",
                            activeTab === tab.key
                                ? "bg-background shadow-sm text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <tab.Icon className="w-3.5 h-3.5" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Stats Tab */}
            {activeTab === 'stats' && stats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {([
                        { label: '用户数', value: stats.user_count, desc: '注册用户总数', Icon: Users, type: 'users' as const },
                        { label: '论文数', value: stats.paper_count, desc: '已上传论文总数', Icon: FileText, type: 'papers' as const },
                        { label: '分组数', value: stats.group_count, desc: '论文分组总数', Icon: FolderOpen, type: 'groups' as const },
                    ]).map((card, index) => (
                        <motion.button
                            key={card.type}
                            {...ENTRANCE_VARIANTS.card(index)}
                            onClick={() => openStatsDetail(card.type)}
                            className="rounded-3xl border bg-card p-5 text-left hover:border-primary/30 transition-all"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">{card.label}</p>
                                    <p className="text-3xl font-bold text-foreground mt-1">{card.value}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
                                </div>
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                    <card.Icon className="w-5 h-5" />
                                </div>
                            </div>
                        </motion.button>
                    ))}
                </div>
            )}

            {/* Storage Tab */}
            {activeTab === 'storage' && storageStats && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <motion.div {...ENTRANCE_VARIANTS.card(0)} className="rounded-3xl border bg-card p-5">
                            <p className="text-sm text-muted-foreground">总文件数</p>
                            <p className="text-3xl font-bold text-foreground mt-1">{storageStats.total_files}</p>
                        </motion.div>
                        <motion.div {...ENTRANCE_VARIANTS.card(1)} className="rounded-3xl border bg-card p-5">
                            <p className="text-sm text-muted-foreground">总存储空间</p>
                            <p className="text-3xl font-bold text-foreground mt-1">{storageStats.total_size_formatted}</p>
                        </motion.div>
                    </div>
                    <div className="rounded-3xl border bg-card overflow-hidden">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="font-semibold">用户存储详情</h3>
                            <Badge variant="secondary">{storageStats.users.length} 位用户</Badge>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left p-3 font-medium">用户</th>
                                        <th className="text-right p-3 font-medium">文件数</th>
                                        <th className="text-right p-3 font-medium">存储空间</th>
                                        <th className="text-right p-3 font-medium">占比</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {storageStats.users.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">暂无存储数据</td></tr>
                                    ) : storageStats.users.map((u) => (
                                        <tr key={u.user_id} className="border-b last:border-b-0">
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                                                        {u.username.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="font-medium">{u.username}</span>
                                                </div>
                                            </td>
                                            <td className="p-3 text-right"><Badge variant="secondary">{u.file_count} 个</Badge></td>
                                            <td className="p-3 text-right font-medium">{u.total_size_formatted}</td>
                                            <td className="p-3">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Progress value={storageStats.total_size > 0 ? (u.total_size / storageStats.total_size) * 100 : 0} className="w-20" />
                                                    <span className="text-muted-foreground text-xs w-12 text-right">
                                                        {storageStats.total_size > 0 ? ((u.total_size / storageStats.total_size) * 100).toFixed(1) : 0}%
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* LLM Tab */}
            {activeTab === 'llm' && (
                <div className="space-y-4">
                    <ModelConfigPanel />
                    <div className="rounded-3xl border bg-card p-5">
                        <h4 className="font-semibold mb-4">重试配置</h4>
                        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                            <div className="flex-1 max-w-xs">
                                <Label className="mb-2">单模型重试次数</Label>
                                <Input type="number" min="1" max="10" value={retryCount} onChange={e => setRetryCount(e.target.value)} />
                                <p className="text-xs text-muted-foreground mt-1">每个模型失败后重试的次数</p>
                            </div>
                            <Button onClick={saveRetryConfig}>保存</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Translation Tab */}
            {activeTab === 'translate' && <TranslationMonitor />}

            {/* Stats Detail Dialog */}
            <Dialog open={!!statsDetailType} onOpenChange={() => setStatsDetailType(null)}>
                <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {statsDetailType === 'users' ? '用户明细' : statsDetailType === 'papers' ? '论文明细' : '分组明细'}
                        </DialogTitle>
                    </DialogHeader>
                    {statsDetailLoading ? (
                        <div className="py-12 text-center"><Loader2 className="animate-spin h-6 w-6 text-primary mx-auto" /></div>
                    ) : (
                        <>
                            {statsDetailType === 'users' && (
                                <div className="space-y-3">
                                    <p className="text-sm text-muted-foreground">如用户忘记密码，请点击"重置密码"生成新密码后告知用户。</p>
                                    <table className="w-full text-sm">
                                        <thead><tr className="border-b bg-muted/30">
                                            <th className="text-left p-2">ID</th><th className="text-left p-2">用户名</th><th className="text-left p-2">角色</th><th className="text-left p-2">操作</th>
                                        </tr></thead>
                                        <tbody>
                                            {userDetails.map(u => (
                                                <tr key={u.id} className="border-b last:border-b-0">
                                                    <td className="p-2">{u.id}</td>
                                                    <td className="p-2 font-medium">{u.username}</td>
                                                    <td className="p-2">{u.role}</td>
                                                    <td className="p-2">
                                                        <Button variant="outline" size="sm" onClick={() => resetUserPassword(u)}>
                                                            <KeyRound className="w-3.5 h-3.5" />重置密码
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {statsDetailType === 'papers' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {paperDetails.map(p => (
                                        <div key={p.id} className="rounded-2xl border p-4">
                                            <h4 className="font-semibold break-words">{p.title || `论文 #${p.id}`}</h4>
                                            {p.title_cn && <p className="text-sm text-muted-foreground mt-0.5 break-words">{p.title_cn}</p>}
                                            <Separator className="my-2" />
                                            <div className="text-sm text-muted-foreground space-y-0.5">
                                                <p>用户：<span className="text-foreground font-medium">{p.owner_username || '-'}</span></p>
                                                <p>期刊：{p.journal || '-'} | 年份：{p.year || '-'}</p>
                                                <p className="break-words">作者：{p.authors || '-'}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {paperDetails.length === 0 && <div className="col-span-full text-center py-8 text-muted-foreground">暂无论文数据</div>}
                                </div>
                            )}
                            {statsDetailType === 'groups' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {groupDetails.map(g => (
                                        <div key={g.id} className="rounded-2xl border p-4">
                                            <div className="flex items-center justify-between gap-2">
                                                <h4 className="font-semibold break-words">{g.name}</h4>
                                                <Badge variant="secondary">{g.paper_count} 篇</Badge>
                                            </div>
                                            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                                                {g.papers.map(p => (
                                                    <p key={p.id} className="text-sm text-muted-foreground break-words">
                                                        <span className="text-foreground">{p.title || `论文 #${p.id}`}</span>
                                                        <span className="ml-1">({p.owner_username || '-'})</span>
                                                    </p>
                                                ))}
                                                {g.papers.length === 0 && <p className="text-sm text-muted-foreground">暂无论文</p>}
                                            </div>
                                        </div>
                                    ))}
                                    {groupDetails.length === 0 && <div className="col-span-full text-center py-8 text-muted-foreground">暂无分组数据</div>}
                                </div>
                            )}
                        </>
                    )}
                    <DialogFooter><Button variant="outline" onClick={() => setStatsDetailType(null)}>关闭</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </AppShell>
    );
}
