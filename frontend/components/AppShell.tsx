'use client';

import { type ReactNode } from 'react';
import { Dna } from 'lucide-react';

interface AppShellProps {
  children: ReactNode;
  title?: string;
  toolbar?: ReactNode;
}

export default function AppShell({ children, title, toolbar }: AppShellProps) {
  return (
    <>
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
    </>
  );
}
