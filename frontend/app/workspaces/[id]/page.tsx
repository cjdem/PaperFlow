'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
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
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ENTRANCE_VARIANTS } from '@/lib/animations/fluid-transitions';
import { toast } from 'sonner';
import { Loader2, Search, Share2, UserPlus, Settings, LogOut, Trash2, ChevronDown, ChevronUp, FileText, Calendar, PenLine } from 'lucide-react';

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
    const [showShareModal, setShowShareModal] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedPaperIds, setSelectedPaperIds] = useState<Set<number>>(new Set());
    const [inviteUsername, setInviteUsername] = useState('');
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [workspaceData, papersData, groupsData] = await Promise.all([
                getWorkspace(workspaceId), getWorkspacePapers(workspaceId, searchQuery || undefined), getGroups()
            ]);
            setWorkspace(workspaceData);
            setWorkspacePapers(papersData.papers);
            setGroups(groupsData);
        } catch (err) { console.error('加载数据失败:', err); router.push('/workspaces'); }
    }, [workspaceId, searchQuery, router]);

    const loadMyPapers = useCallback(async () => {
        try { const data = await getPapers('all'); setMyPapers(data.papers); }
        catch (err) { console.error('加载我的论文失败:', err); }
    }, []);

    const handleInitialLoad = useCallback(async () => {
        try { await loadData(); }
        finally { if (!initialLoadRef.current) { initialLoadRef.current = true; setLoading(false); } }
    }, [loadData]);

    usePolling(handleInitialLoad, { enabled: !!user, deps: [searchQuery] });
    const handleLogout = () => { logout(); router.push('/'); };

    const handleSharePapers = async () => {
        if (selectedPaperIds.size === 0) return;
        setActionLoading(true);
        try {
            const result = await sharePapersToWorkspace(workspaceId, Array.from(selectedPaperIds));
            toast.success(result.message);
            setShowShareModal(false); setSelectedPaperIds(new Set()); await loadData();
        } catch (err) { toast.error(err instanceof Error ? err.message : '分享失败'); }
        finally { setActionLoading(false); }
    };

    const handleRemovePaper = async (paperId: number) => {
        if (!confirm('确定要从空间中移除这篇论文吗？')) return;
        try { await removePaperFromWorkspace(workspaceId, paperId); await loadData(); }
        catch (err) { toast.error(err instanceof Error ? err.message : '移除失败'); }
    };

    const handleInviteUser = async () => {
        if (!inviteUsername.trim()) return;
        setActionLoading(true);
        try { await inviteUser(workspaceId, inviteUsername.trim()); toast.success('邀请已发送'); setInviteUsername(''); setShowInviteModal(false); }
        catch (err) { toast.error(err instanceof Error ? err.message : '邀请失败'); }
        finally { setActionLoading(false); }
    };

    const handleUpdateRole = async (userId: number, newRole: string) => {
        try { await updateMemberRole(workspaceId, userId, newRole); await loadData(); }
        catch (err) { toast.error(err instanceof Error ? err.message : '更新失败'); }
    };

    const handleRemoveMember = async (userId: number, username: string) => {
        if (!confirm(`确定要移除成员 ${username} 吗？`)) return;
        try { await removeMember(workspaceId, userId); await loadData(); }
        catch (err) { toast.error(err instanceof Error ? err.message : '移除失败'); }
    };

    const handleLeaveWorkspace = async () => {
        if (!confirm('确定要离开这个空间吗？')) return;
        try { await leaveWorkspace(workspaceId); router.push('/workspaces'); }
        catch (err) { toast.error(err instanceof Error ? err.message : '离开失败'); }
    };

    const handleUpdateWorkspace = async () => {
        if (!editName.trim()) return;
        setActionLoading(true);
        try { await updateWorkspace(workspaceId, { name: editName.trim(), description: editDesc.trim() || undefined }); setShowEditModal(false); await loadData(); }
        catch (err) { toast.error(err instanceof Error ? err.message : '更新失败'); }
        finally { setActionLoading(false); }
    };

    const handleDeleteWorkspace = async () => {
        if (!confirm('确定要删除这个空间吗？此操作不可撤销！')) return;
        if (!confirm('再次确认：删除后所有成员将失去访问权限，但论文不会被删除。')) return;
        try { await deleteWorkspace(workspaceId); router.push('/workspaces'); }
        catch (err) { toast.error(err instanceof Error ? err.message : '删除失败'); }
    };

    const openShareModal = async () => { await loadMyPapers(); setSelectedPaperIds(new Set()); setShowShareModal(true); };
    const openEditModal = () => { if (workspace) { setEditName(workspace.name); setEditDesc(workspace.description || ''); setShowEditModal(true); } };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'owner': return <Badge>所有者</Badge>;
            case 'admin': return <Badge variant="secondary">管理员</Badge>;
            default: return <Badge variant="outline">成员</Badge>;
        }
    };

    const isAdmin = workspace?.my_role === 'owner' || workspace?.my_role === 'admin';
    const isOwner = workspace?.my_role === 'owner';

    if (authLoading || loading) {
        return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
    }
    if (!workspace) {
        return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">空间不存在</div>;
    }

    const toolbar = (
        <div className="flex items-center gap-2">
            {isAdmin && <Button variant="ghost" size="icon-sm" onClick={openEditModal} title="设置"><Settings className="w-4 h-4" /></Button>}
            {!isOwner && (
                <Button variant="ghost" size="icon-sm" onClick={handleLeaveWorkspace} title="离开" className="text-destructive hover:text-destructive">
                    <LogOut className="w-4 h-4" />
                </Button>
            )}
        </div>
    );

    return (
        <AppShell title={workspace.name} userRole={user?.role} onLogout={handleLogout} toolbar={toolbar}>
            {/* Workspace info */}
            {workspace.description && <p className="text-muted-foreground text-sm mb-4">{workspace.description}</p>}
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                <span>{workspace.member_count} 成员</span>
                <span>{workspace.paper_count} 论文</span>
                <span>创建者: {workspace.owner_username}</span>
                <div className="flex-1" />
                {getRoleBadge(workspace.my_role)}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 p-1 bg-muted rounded-2xl w-fit">
                {(['papers', 'members'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            "px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                            activeTab === tab ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {tab === 'papers' ? `论文 (${workspacePapers.length})` : `成员 (${workspace.members.length})`}
                    </button>
                ))}
            </div>

            {/* Papers Tab */}
            {activeTab === 'papers' && (
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索论文..." className="pl-9" />
                        </div>
                        <Button size="sm" onClick={openShareModal}><Share2 className="w-4 h-4" />分享论文</Button>
                    </div>

                    {workspacePapers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4"><FileText className="w-8 h-8" /></div>
                            <p className="text-lg font-medium">暂无论文</p>
                            <p className="text-muted-foreground text-sm mt-1">点击"分享论文"将你的论文分享到此空间</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {workspacePapers.map((wp, index) => (
                                <motion.article key={wp.id} {...ENTRANCE_VARIANTS.card(index)} className="rounded-3xl border bg-card p-4">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold break-words">{wp.paper.title}</h3>
                                            {wp.paper.title_cn && <p className="text-muted-foreground text-sm mt-0.5">{wp.paper.title_cn}</p>}
                                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                                <Badge variant="secondary">{wp.paper.journal || 'Journal'}</Badge>
                                                <span><Calendar className="w-3 h-3 inline" /> {wp.paper.year}</span>
                                                <span><PenLine className="w-3 h-3 inline" /> {wp.paper.authors?.slice(0, 50)}</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">分享者: {wp.shared_by_username} | {new Date(wp.shared_at).toLocaleDateString()}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 ml-3">
                                            <Button variant="ghost" size="icon-sm" onClick={() => setExpandedPaper(expandedPaper === wp.paper.id ? null : wp.paper.id)}>
                                                {expandedPaper === wp.paper.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </Button>
                                            {(isAdmin || wp.shared_by_id === user?.id) && (
                                                <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => handleRemovePaper(wp.paper.id)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {expandedPaper === wp.paper.id && (
                                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                                <Separator className="my-3" />
                                                <div className="flex gap-1 mb-3">
                                                    {(['analysis', 'abstract_cn', 'abstract_en'] as const).map(tab => (
                                                        <button key={tab} onClick={() => setDetailTab(tab)} className={cn("px-3 py-1.5 rounded-xl text-sm font-medium transition-colors", detailTab === tab ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                                                            {tab === 'analysis' ? '深度分析' : tab === 'abstract_cn' ? '中文摘要' : '英文摘要'}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="rounded-2xl border bg-background p-4">
                                                    {detailTab === 'analysis' && <MarkdownRenderer content={wp.paper.detailed_analysis || '暂无分析内容'} />}
                                                    {detailTab === 'abstract_cn' && <p className="text-foreground leading-relaxed">{wp.paper.abstract || '暂无中文摘要'}</p>}
                                                    {detailTab === 'abstract_en' && <p className="text-foreground leading-relaxed italic">{wp.paper.abstract_en || 'No English abstract available'}</p>}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.article>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
                <div>
                    {isAdmin && (
                        <div className="mb-4">
                            <Button size="sm" onClick={() => setShowInviteModal(true)}><UserPlus className="w-4 h-4" />邀请成员</Button>
                        </div>
                    )}
                    <div className="space-y-2">
                        {workspace.members.map(member => (
                            <div key={member.id} className="rounded-2xl border bg-card p-4 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                                        {member.username.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{member.username}</span>
                                            {getRoleBadge(member.role)}
                                        </div>
                                        <p className="text-xs text-muted-foreground">加入于 {new Date(member.joined_at).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                {isAdmin && member.role !== 'owner' && member.user_id !== user?.id && (
                                    <div className="flex items-center gap-2">
                                        {isOwner && (
                                            <select value={member.role} onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                                                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
                                                <option value="member">成员</option>
                                                <option value="admin">管理员</option>
                                            </select>
                                        )}
                                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleRemoveMember(member.user_id, member.username)}>
                                            移除
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Share Modal */}
            <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
                <DialogContent className="max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle>分享论文到空间</DialogTitle>
                        <DialogDescription>选择要分享的论文。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto py-2">
                        {myPapers.length === 0 ? (
                            <p className="text-center py-8 text-muted-foreground">暂无可分享的论文</p>
                        ) : myPapers.map(paper => {
                            const isShared = workspacePapers.some(wp => wp.paper.id === paper.id);
                            return (
                                <label key={paper.id} className={cn("flex items-center gap-3 p-3 rounded-xl cursor-pointer transition", isShared && "opacity-50 cursor-not-allowed", !isShared && selectedPaperIds.has(paper.id) && "bg-primary/10 border border-primary/30", !isShared && !selectedPaperIds.has(paper.id) && "hover:bg-muted")}>
                                    <input type="checkbox" checked={selectedPaperIds.has(paper.id)} disabled={isShared}
                                        onChange={() => { if (isShared) return; setSelectedPaperIds(prev => { const next = new Set(prev); next.has(paper.id) ? next.delete(paper.id) : next.add(paper.id); return next; }); }}
                                        className="h-4 w-4 rounded border-input accent-primary" />
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate text-sm">{paper.title}</p>
                                        <p className="text-xs text-muted-foreground truncate">{paper.authors} | {paper.year}</p>
                                    </div>
                                    {isShared && <span className="text-xs text-primary">已分享</span>}
                                </label>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <span className="text-sm text-muted-foreground mr-auto">已选择 {selectedPaperIds.size} 篇</span>
                        <Button variant="outline" onClick={() => setShowShareModal(false)}>取消</Button>
                        <Button onClick={handleSharePapers} disabled={selectedPaperIds.size === 0 || actionLoading}>
                            {actionLoading && <Loader2 className="animate-spin h-4 w-4" />}分享
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Invite Modal */}
            <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>邀请成员</DialogTitle>
                        <DialogDescription>输入用户名后发送邀请。</DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Label className="mb-2">用户名</Label>
                        <Input value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} placeholder="要邀请的用户名" />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowInviteModal(false)}>取消</Button>
                        <Button onClick={handleInviteUser} disabled={!inviteUsername.trim() || actionLoading}>
                            {actionLoading && <Loader2 className="animate-spin h-4 w-4" />}发送邀请
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Modal */}
            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>空间设置</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>空间名称</Label>
                            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>描述（可选）</Label>
                            <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3}
                                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
                        </div>
                    </div>
                    <DialogFooter>
                        {isOwner && (
                            <Button variant="destructive" onClick={handleDeleteWorkspace} className="mr-auto">删除空间</Button>
                        )}
                        <Button variant="outline" onClick={() => setShowEditModal(false)}>取消</Button>
                        <Button onClick={handleUpdateWorkspace} disabled={!editName.trim() || actionLoading}>
                            {actionLoading && <Loader2 className="animate-spin h-4 w-4" />}保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppShell>
    );
}
