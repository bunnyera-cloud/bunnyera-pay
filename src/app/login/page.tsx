'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'platform' | 'merchant'>('platform');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = tab === 'platform' ? '/api/auth/platform' : '/api/auth/merchant';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登录失败');
        return;
      }

      if (tab === 'platform') {
        localStorage.setItem('bep_platform_token', data.token);
        localStorage.setItem('bep_platform_user', JSON.stringify(data.user));
        router.push('/admin/dashboard');
      } else {
        localStorage.setItem('bep_merchant_token', data.token);
        localStorage.setItem('bep_merchant_user', JSON.stringify(data.user));
        router.push('/dashboard');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold">B</span>
            </div>
            <span className="text-white font-semibold text-2xl">BunnyEra Pay</span>
          </Link>
          <p className="text-gray-400 mt-2">多商户支付管理平台</p>
        </div>

        {/* 登录卡片 */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          {/* Tab */}
          <div className="flex rounded-lg bg-white/5 p-1 mb-6">
            <button
              onClick={() => setTab('merchant')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                tab === 'merchant' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              商户登录
            </button>
            <button
              onClick={() => setTab('platform')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                tab === 'platform' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              管理员登录
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                placeholder="请输入登录邮箱"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                placeholder="请输入密码"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          {tab === 'merchant' && (
            <div className="mt-6 text-center">
              <p className="text-gray-400 text-sm">
                还没有商户账号？{' '}
                <Link href="/register" className="text-blue-400 hover:text-blue-300">
                  立即注册入驻
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
