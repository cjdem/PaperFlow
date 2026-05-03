'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { BookOpen, FolderOpen, Users, Settings, LogOut, Dna, Star, Clock } from 'lucide-react';
import { ENTRANCE_VARIANTS } from '@/lib/animations/fluid-transitions';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useAuthContext } from '@/provider/auth';

const NAV_ITEMS = [
  { id: 'papers', icon: BookOpen, label: '论文', path: '/papers' },
  { id: 'ungrouped', icon: FolderOpen, label: '未分类', path: '/papers?view=ungrouped' },
  { id: 'starred', icon: Star, label: '收藏', path: '/papers?view=starred' },
  { id: 'recent', icon: Clock, label: '最近', path: '/papers?view=recent' },
  { id: 'workspaces', icon: Users, label: '空间', path: '/workspaces' },
];

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuthContext();

  const isActive = (item: typeof NAV_ITEMS[number]) => {
    if (item.id === 'workspaces' && pathname.startsWith('/workspaces')) return true;
    if (pathname !== '/papers') return false;
    const viewParam = searchParams.get('view');
    if (item.id === 'papers' && !viewParam) return true;
    if (item.id === 'ungrouped' && viewParam === 'ungrouped') return true;
    if (item.id === 'starred' && viewParam === 'starred') return true;
    if (item.id === 'recent' && viewParam === 'recent') return true;
    return false;
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="relative z-50 md:min-h-screen">
      <motion.nav
        aria-label="主导航"
        className={cn(
          "fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 p-2",
          "md:sticky md:top-6 md:left-auto md:bottom-auto md:translate-x-0 md:flex-col md:gap-2",
          "bg-sidebar text-sidebar-foreground border border-sidebar-border rounded-3xl shadow-lg"
        )}
        variants={ENTRANCE_VARIANTS.navbar}
        initial="initial"
        animate="animate"
      >
        {/* Logo */}
        <div className="hidden md:flex items-center justify-center p-2 mb-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Dna className="w-4 h-4" />
          </div>
        </div>

        {/* Nav Items */}
        {NAV_ITEMS.map((item, index) => {
          const active = isActive(item);
          return (
            <motion.button
              key={item.id}
              type="button"
              onClick={() => router.push(item.path)}
              className={cn(
                "relative p-2 md:p-3 rounded-2xl z-20",
                active
                  ? "text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent"
              )}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: 1,
                scale: 1,
                transition: { delay: index * 0.05, duration: 0.3 },
              }}
              whileHover={{ scale: 1.1, zIndex: 30 }}
              whileTap={{ scale: 0.95 }}
              title={item.label}
            >
              {active && (
                <motion.div
                  layoutId="navbar-indicator"
                  className="absolute inset-0 bg-sidebar-primary rounded-2xl z-0"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <span className="relative z-10">
                <item.icon strokeWidth={2} className="w-5 h-5" />
              </span>
            </motion.button>
          );
        })}

        {/* Admin */}
        {user?.role === 'admin' && (
          <motion.button
            type="button"
            onClick={() => router.push('/admin')}
            className={cn(
              "relative p-2 md:p-3 rounded-2xl z-20",
              pathname === '/admin'
                ? "text-sidebar-primary-foreground"
                : "text-sidebar-foreground/60 hover:bg-sidebar-accent"
            )}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, transition: { delay: 0.2, duration: 0.3 } }}
            whileHover={{ scale: 1.1, zIndex: 30 }}
            whileTap={{ scale: 0.95 }}
            title="管理"
          >
            {pathname === '/admin' && (
              <motion.div
                layoutId="navbar-indicator"
                className="absolute inset-0 bg-sidebar-primary rounded-2xl z-0"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <span className="relative z-10">
              <Settings strokeWidth={2} className="w-5 h-5" />
            </span>
          </motion.button>
        )}

        {/* Divider */}
        <div className="hidden md:block w-6 h-px bg-sidebar-border mx-auto my-1" />

        {/* Theme Toggle */}
        <motion.button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="relative p-2 md:p-3 rounded-2xl z-20 text-sidebar-foreground/60 hover:bg-sidebar-accent"
          whileHover={{ scale: 1.1, zIndex: 30 }}
          whileTap={{ scale: 0.95 }}
          title="切换主题"
        >
          <Sun className="w-5 h-5 hidden dark:block" />
          <Moon className="w-5 h-5 block dark:hidden" />
        </motion.button>

        {/* Logout */}
        {user && (
          <motion.button
            type="button"
            onClick={handleLogout}
            className="relative p-2 md:p-3 rounded-2xl z-20 text-sidebar-foreground/60 hover:bg-sidebar-accent"
            whileHover={{ scale: 1.1, zIndex: 30 }}
            whileTap={{ scale: 0.95 }}
            title="退出登录"
          >
            <LogOut strokeWidth={2} className="w-5 h-5" />
          </motion.button>
        )}
      </motion.nav>
    </div>
  );
}
