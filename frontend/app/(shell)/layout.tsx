'use client';

import { type ReactNode, Suspense } from 'react';
import ShellLayout from '@/components/ShellLayout';

export default function ShellGroupLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <ShellLayout>{children}</ShellLayout>
    </Suspense>
  );
}
