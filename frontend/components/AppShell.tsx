'use client';

import { type ReactNode } from 'react';
import { motion } from 'motion/react';
import NavBar from './NavBar';
import { Dna } from 'lucide-react';

interface AppShellProps {
  children: ReactNode;
  title?: string;
  userRole?: string;
  onLogout?: () => void;
  toolbar?: ReactNode;
}

export default function AppShell({ children, title, userRole, onLogout, toolbar }: AppShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto flex h-dvh max-w-6xl flex-col overflow-hidden px-3 md:grid md:grid-cols-[auto_1fr] md:gap-6 md:px-6"
    >
      <NavBar userRole={userRole} onLogout={onLogout} />
      <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <header className="my-6 flex flex-none items-center gap-x-2 px-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Dna className="w-4 h-4" />
          </div>
          <div className="flex-1 overflow-hidden">
            {title && (
              <span className="text-2xl font-bold">{title}</span>
            )}
          </div>
          {toolbar && <div className="ml-auto">{toolbar}</div>}
        </header>
        <div className="h-full min-h-0 flex-1 overflow-y-auto pb-24 md:pb-6">
          {children}
        </div>
      </main>
    </motion.div>
  );
}
