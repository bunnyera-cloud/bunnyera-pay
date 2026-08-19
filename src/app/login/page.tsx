'use client';

import { useState } from 'react';
import Image from 'next/image';
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

      if (!data.success || !data.token) {
        setError('登录失败，请重试');
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo：浅色背景使用主色版正式 logo（原图 428x263，登录页宽 240px 等比） */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex">
            <Image
              src="/brand/bunnyera-pay/logo/logo-primary.png"
              alt="BunnyEra Pay"
              width={240}
              height={147}
              className="w-60 h-auto"
              priority
            />
          </Link>
          <p className="text-slate-500 mt-2">多商户支付管理平台</p>
        </div>

        {/* 登录卡片 */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
          {/* Tab */}
          <div className="flex rounded-lg bg-slate-100 p-1 mb-6">
            <button
              onClick={() => setTab('merchant')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                tab === 'merchant' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              商户登录
            </button>
            <button
              onClick={() => setTab('platform')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
                tab === 'platform' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              管理员登录
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 transition"
                placeholder="请输入登录邮箱"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 transition"
                placeholder="请输入密码"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          {tab === 'merchant' && (
            <div className="mt-6 text-center">
              <p className="text-slate-500 text-sm">
                还没有商户账号？{' '}
                <Link href="/register" className="text-blue-600 hover:text-blue-700">
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
