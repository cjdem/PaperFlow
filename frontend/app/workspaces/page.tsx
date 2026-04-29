'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
    logout, getWorkspaces, createWorkspace, Workspace,
    getGroups, Group, getReceivedInvitations, acceptInvitation, rejectInvitation, Invitation
} from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { usePolling } from '@/lib/usePolling';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ENTRANCE_VARIANTS } from '@/lib/animations/fluid-transitions';
import { toast } from 'sonner';
import { Loader2, Users, Plus } from 'lucide-react';

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

    const loadData = useCallback(async () => {
        try {
            const [workspacesData, invitationsData, groupsData] = await Promise.all([
                getWorkspaces(), getReceivedInvitations(), getGroups()
            ]);
            setWorkspaces(workspacesData.workspaces);
            setInvitations(invitationsData.invitations);
            setGroups(groupsData);
        } catch (err) { console.error('加载数据失败:', err); }
    }, []);

    const handleInitialLoad = useCallback(async () => {
        try { await loadData(); }
        finally { if (!initialLoadRef.current) { initialLoadRef.current = true; setLoading(false); } }
    }, [loadData]);

    usePolling(handleInitialLoad, { enabled: !!user, deps: [] });

    const handleLogout = () => { logout(); router.push('/'); };

    const handleCreateWorkspace = async () => {
        if (!newWorkspaceName.trim()) return;
        setCreating(true);
        try {
            await createWorkspace(newWorkspaceName.trim(), newWorkspaceDesc.trim() || undefined);
            setNewWorkspaceName(''); setNewWorkspaceDesc('');
            setShowCreateModal(false);
            toast.success('空间已创建');
            await loadData();
        } catch (err) { toast.error(err instanceof Error ? err.message : '创建失败'); }
        finally { setCreating(false); }
    };

    const handleAcceptInvitation = async (id: number) => {
        try { await acceptInvitation(id); toast.success('已接受邀请'); await loadData(); }
        catch (err) { toast.error(err instanceof Error ? err.message : '接受邀请失败'); }
    };

    const handleRejectInvitation = async (id: number) => {
        try { await rejectInvitation(id); toast.success('已拒绝邀请'); await loadData(); }
        catch (err) { toast.error(err instanceof Error ? err.message : '拒绝邀请失败'); }
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case 'owner': return <Badge>所有者</Badge>;
            case 'admin': return <Badge variant="secondary">管理员</Badge>;
            default: return <Badge variant="outline">成员</Badge>;
        }
    };

    if (authLoading || loading) {
        return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
    }

    const toolbar = (
        <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4" />创建空间
        </Button>
    );

    return (
        <AppShell title="团队空间" userRole={user?.role} onLogout={handleLogout} toolbar={toolbar}>
            {/* Invitations */}
            {invitations.length > 0 && (
                <div className="mb-6">
                    <h3 className="font-semibold mb-3">待处理邀请 ({invitations.length})</h3>
                    <div className="space-y-2">
                        {invitations.map(inv => (
                            <div key={inv.id} className="rounded-2xl border bg-card p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                    <p className="text-foreground">
                                        <span className="text-primary font-medium">{inv.inviter_username}</span>
                                        {' '}邀请你加入{' '}
                                        <span className="font-semibold">「{inv.workspace_name}」</span>
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(inv.created_at).toLocaleString()}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={() => handleAcceptInvitation(inv.id)}>接受</Button>
                                    <Button variant="outline" size="sm" onClick={() => handleRejectInvitation(inv.id)}>拒绝</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Workspace list */}
            {workspaces.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                        <Users className="w-8 h-8" />
                    </div>
                    <p className="text-lg font-medium text-foreground">暂无团队空间</p>
                    <p className="text-muted-foreground mt-1 text-sm">创建一个空间，邀请团队成员一起管理论文</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {workspaces.map((workspace, index) => (
                        <motion.div
                            key={workspace.id}
                            {...ENTRANCE_VARIANTS.card(index)}
                            onClick={() => router.push(`/workspaces/${workspace.id}`)}
                            className="rounded-3xl border bg-card p-5 cursor-pointer hover:border-primary/30 transition-all"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="text-lg font-semibold truncate flex-1">{workspace.name}</h3>
                                {getRoleBadge(workspace.my_role)}
                            </div>
                            {workspace.description && (
                                <p className="text-muted-foreground text-sm mb-3 line-clamp-2">{workspace.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>{workspace.member_count} 成员</span>
                                <span>{workspace.paper_count} 论文</span>
                            </div>
                            <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                                创建者: {workspace.owner_username}
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>创建团队空间</DialogTitle>
                        <DialogDescription>填写空间名称和可选描述后创建。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>空间名称 *</Label>
                            <Input value={newWorkspaceName} onChange={(e) => setNewWorkspaceName(e.target.value)} placeholder="例如：研究组论文库" />
                        </div>
                        <div className="space-y-2">
                            <Label>描述（可选）</Label>
                            <textarea
                                value={newWorkspaceDesc}
                                onChange={(e) => setNewWorkspaceDesc(e.target.value)}
                                placeholder="简单描述这个空间的用途..."
                                rows={3}
                                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateModal(false)}>取消</Button>
                        <Button onClick={handleCreateWorkspace} disabled={!newWorkspaceName.trim() || creating}>
                            {creating && <Loader2 className="animate-spin h-4 w-4" />}创建
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppShell>
    );
}
