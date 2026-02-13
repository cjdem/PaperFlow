'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, register } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(username, password);
        router.push('/papers');
      } else {
        await register(username, password, email || undefined);
        setMode('login');
        setError('注册成功，请登录');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen fluent-background flex items-center justify-center p-6 relative overflow-hidden">
      {/* 背景装饰元素 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-purple-500/20 to-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 fluent-slide-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-purple-500/30 mb-4">
            <span className="text-4xl">🧬</span>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradient_3s_linear_infinite]">
            PaperFlow Pro
          </h1>
          <p className="text-[var(--fluent-foreground-secondary)] mt-3 text-base">智能论文管理与分析平台</p>
        </div>

        {/* Fluent Acrylic Card */}
        <div className="fluent-acrylic p-8 fluent-scale-in" style={{ animationDelay: '100ms' }}>
          {/* 卡片顶部高光 */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          
          <h2 className="text-2xl font-semibold text-[var(--fluent-foreground)] mb-6 flex items-center gap-3">
            <span className="w-1 h-6 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full" />
            {mode === 'login' ? '欢迎回来' : '创建账户'}
          </h2>

          {error && (
            <div className={`p-4 rounded-xl mb-5 flex items-center gap-3 fluent-fade-in ${
              error.includes('成功')
                ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              <span className="text-lg">{error.includes('成功') ? '✓' : '⚠'}</span>
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--fluent-foreground-secondary)]">用户名</label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fluent-foreground-secondary)] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="fluent-input py-3"
                  style={{ paddingLeft: '2.75rem' }}
                  placeholder="请输入用户名"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[var(--fluent-foreground-secondary)]">密码</label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fluent-foreground-secondary)] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="fluent-input py-3"
                  style={{ paddingLeft: '2.75rem' }}
                  placeholder="请输入密码"
                  required
                />
              </div>
            </div>

            {mode === 'register' && (
              <div className="space-y-2 fluent-fade-in">
                <label className="block text-sm font-medium text-[var(--fluent-foreground-secondary)]">邮箱 (可选)</label>
                <div className="relative">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fluent-foreground-secondary)] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="fluent-input py-3"
                    style={{ paddingLeft: '2.75rem' }}
                    placeholder="请输入邮箱"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="fluent-button w-full py-3.5 mt-2 text-base font-semibold bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:from-blue-400 hover:to-purple-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  处理中...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  {mode === 'login' ? '🚀 登录' : '✨ 注册'}
                </span>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-[var(--fluent-divider)] text-center">
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-[var(--fluent-foreground-secondary)] hover:text-[var(--fluent-foreground)] transition-colors duration-200 text-sm font-medium group"
            >
              {mode === 'login' ? (
                <span>没有账户？<span className="text-purple-400 group-hover:text-purple-300 ml-1">立即注册 →</span></span>
              ) : (
                <span>已有账户？<span className="text-blue-400 group-hover:text-blue-300 ml-1">返回登录 →</span></span>
              )}
            </button>
          </div>
        </div>

        {/* 底部版权信息 */}
        <p className="text-center text-[var(--fluent-foreground-secondary)] text-xs mt-8 opacity-60">
          © 2024 PaperFlow Pro · Powered by Fluent Design
        </p>
      </div>
    </div>
  );
}
