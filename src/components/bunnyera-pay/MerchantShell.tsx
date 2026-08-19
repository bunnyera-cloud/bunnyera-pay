'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Topbar, { MerchantUserInfo } from './Topbar';
import PageHeader from './PageHeader';

// Design System V1：统一商户后台 Shell（Sidebar + Topbar + PageHeader + Content）
// 所有商户后台页面共用，页面不再手写侧边栏
export default function MerchantShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<MerchantUserInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('bep_merchant_token');
    if (!token) {
      router.push('/login');
      return;
    }
    try {
      const raw = localStorage.getItem('bep_merchant_user');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    }
    setReady(true);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('bep_merchant_token');
    localStorage.removeItem('bep_merchant_user');
    router.push('/login');
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        pathname={pathname}
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="lg:pl-60 flex min-h-screen flex-col">
        <Topbar user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-[1400px]">
            <PageHeader title={title} description={description} actions={actions} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
