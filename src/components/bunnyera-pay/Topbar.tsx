'use client';

import Image from 'next/image';
import { MenuIcon } from './icons';

export interface MerchantUserInfo {
  name?: string;
  email?: string;
  role?: string;
  merchantName?: string;
  merchantNo?: string;
}

// Design System V1：顶栏（商户信息区 + 移动端菜单入口）
export default function Topbar({
  user,
  onMenuClick,
}: {
  user: MerchantUserInfo | null;
  onMenuClick: () => void;
}) {
  const initial = (user?.name || '商').slice(0, 1);
  return (
    <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="lg:hidden text-slate-500 hover:text-slate-700" aria-label="打开菜单">
          <MenuIcon className="w-6 h-6" />
        </button>
        {/* 移动端侧边栏隐藏时，顶栏展示品牌标识 */}
        <Image
          src="/brand/bunnyera-pay/logo/logo-horizontal.png"
          alt="BunnyEra Pay"
          width={404}
          height={64}
          className="h-6 w-auto lg:hidden"
        />
        <div className="hidden sm:block text-sm text-slate-500">
          {user?.merchantName || user?.merchantNo || '商户中心'}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-slate-900 text-sm font-medium leading-tight">{user?.name || '商户'}</p>
          <p className="text-slate-400 text-xs leading-tight">{user?.merchantNo || user?.email || ''}</p>
        </div>
        <div className="w-9 h-9 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center text-sm font-semibold">
          {initial}
        </div>
      </div>
    </header>
  );
}
