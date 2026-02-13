'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Group } from '@/lib/api';

type SidebarSection = 'papers' | 'workspaces' | 'admin';

interface SidebarUser {
  username?: string;
  role?: string;
}

interface AppSidebarProps {
  user?: SidebarUser | null;
  activeSection: SidebarSection;
  currentView?: string;
  groups?: Group[];
  onSelectView?: (view: string) => void;
  onLogout: () => void;
  navExtraContent?: (collapsed: boolean) => ReactNode;
  extraContent?: (collapsed: boolean) => ReactNode;
}

export default function AppSidebar({
  user,
  activeSection,
  currentView = 'all',
  groups = [],
  onSelectView,
  onLogout,
  navExtraContent,
  extraContent
}: AppSidebarProps) {
  const router = useRouter();
  const sidebarStorageKey = 'paperflow.sidebar.collapsed';
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      return localStorage.getItem(sidebarStorageKey) === '1';
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(sidebarStorageKey, next ? '1' : '0');
      } catch {
        // ignore localStorage write errors
      }
      return next;
    });
  };

  const handleViewSelect = (view: string) => {
    if (onSelectView) {
      onSelectView(view);
      return;
    }
    const nextPath = view === 'all' ? '/papers' : `/papers?view=${encodeURIComponent(view)}`;
    router.push(nextPath);
  };

  const showAdmin = user?.role === 'admin';

  return (
    <aside className={`${sidebarCollapsed ? 'w-20' : 'w-72'} fluent-sidebar flex flex-col h-screen sticky top-0 transition-all duration-300 overflow-hidden`}>
      <div className={`${sidebarCollapsed ? 'p-2' : 'p-4'} border-b border-[var(--fluent-border)]`}>
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <span className="text-xl">🧬</span>
            </div>
            <button
              onClick={handleToggleSidebar}
              className="fluent-button fluent-button-subtle p-1.5"
              title="展开侧边栏"
            >
              <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20 flex-shrink-0">
                <span className="text-xl">🧬</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-[var(--fluent-foreground)]">PaperFlow</h1>
                <p className="text-xs text-[var(--fluent-foreground-secondary)] truncate">👤 {user?.username}</p>
              </div>
            </div>
            <button
              onClick={handleToggleSidebar}
              className="fluent-button fluent-button-subtle p-2 flex-shrink-0"
              title="收起侧边栏"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <button
          onClick={() => handleViewSelect('all')}
          className={`fluent-nav-item w-full ${sidebarCollapsed ? 'justify-center px-2' : ''} ${activeSection === 'papers' && currentView === 'all' ? 'active' : ''}`}
          title="所有论文"
        >
          <span className="text-lg">📚</span>
          {!sidebarCollapsed && <span>所有论文</span>}
        </button>
        <button
          onClick={() => handleViewSelect('ungrouped')}
          className={`fluent-nav-item w-full ${sidebarCollapsed ? 'justify-center px-2' : ''} ${activeSection === 'papers' && currentView === 'ungrouped' ? 'active' : ''}`}
          title="未分类"
        >
          <span className="text-lg">📂</span>
          {!sidebarCollapsed && <span>未分类</span>}
        </button>
        <button
          onClick={() => router.push('/workspaces')}
          className={`fluent-nav-item w-full ${sidebarCollapsed ? 'justify-center px-2' : ''} ${activeSection === 'workspaces' ? 'active' : ''}`}
          title="团队空间"
        >
          <span className="text-lg">👥</span>
          {!sidebarCollapsed && <span>团队空间</span>}
        </button>
        {showAdmin && (
          <button
            onClick={() => router.push('/admin')}
            className={`fluent-nav-item w-full ${sidebarCollapsed ? 'justify-center px-2' : ''} ${activeSection === 'admin' ? 'active' : ''}`}
            title="系统管理"
          >
            <span className="text-lg">⚙️</span>
            {!sidebarCollapsed && <span>系统管理</span>}
          </button>
        )}

        <div className="pt-4 mt-4 border-t border-[var(--fluent-divider)]">
          {!sidebarCollapsed && (
            <p className="text-xs text-[var(--fluent-foreground-secondary)] mb-3 px-2 font-semibold uppercase tracking-wider">分组</p>
          )}
          {groups.map(group => (
            <button
              key={group.id}
              onClick={() => handleViewSelect(group.name)}
              className={`fluent-nav-item w-full ${sidebarCollapsed ? 'justify-center px-2' : ''} ${activeSection === 'papers' && currentView === group.name ? 'active' : ''}`}
              title={group.name}
            >
              <span className="text-lg">🏷️</span>
              {!sidebarCollapsed && <span>{group.name}</span>}
            </button>
          ))}
        </div>

        {navExtraContent && (
          <div className="pt-4 mt-2">
            {navExtraContent(sidebarCollapsed)}
          </div>
        )}
      </nav>

      {extraContent && (
        <div className="p-4 border-t border-[var(--fluent-border)]">
          {extraContent(sidebarCollapsed)}
        </div>
      )}

      <div className="p-4 border-t border-[var(--fluent-border)]">
        <button
          onClick={onLogout}
          className={`fluent-nav-item w-full ${sidebarCollapsed ? 'justify-center px-2' : ''}`}
          title="退出登录"
        >
          <span>🚪</span>
          {!sidebarCollapsed && <span>退出登录</span>}
        </button>
      </div>
    </aside>
  );
}
