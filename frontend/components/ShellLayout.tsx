'use client';

import { type ReactNode } from 'react';
import NavBar from '@/components/NavBar';

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-dvh max-w-6xl flex-col overflow-hidden px-3 md:grid md:grid-cols-[auto_1fr] md:gap-6 md:px-6">
      <NavBar />
      <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
