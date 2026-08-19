'use client';

import Link from 'next/link';
import {
  DashboardIcon,
  WalletIcon,
  OrdersIcon,
  RefundIcon,
  StoreIcon,
  QrIcon,
  ChannelIcon,
  UsersIcon,
  ReconcileIcon,
  SettingsIcon,
  CashierIcon,
  LogoutIcon,
} from './icons';

// Design System V1：统一商户后台左侧导航（active route 自动高亮）
const NAV_ITEMS = [
  { href: '/dashboard', label: '工作台', Icon: DashboardIcon },
  { href: '/dashboard/collect', label: '创建收款', Icon: WalletIcon },
  { href: '/dashboard/orders', label: '订单管理', Icon: OrdersIcon },
  { href: '/dashboard/refunds', label: '退款管理', Icon: RefundIcon },
  { href: '/dashboard/stores', label: '门店管理', Icon: StoreIcon },
  { href: '/dashboard/qrcodes', label: '收款码', Icon: QrIcon },
  { href: '/dashboard/channels', label: '支付渠道', Icon: ChannelIcon },
  { href: '/dashboard/employees', label: '员工管理', Icon: UsersIcon },
  { href: '/dashboard/finance', label: '对账结算', Icon: ReconcileIcon },
  { href: '/dashboard/settings', label: '商户设置', Icon: SettingsIcon },
];

export function BrandLogo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
        <span className="text-white font-bold text-sm">B</span>
      </div>
      <span className="text-slate-900 font-bold">BunnyEra Pay</span>
    </Link>
  );
}

export default function Sidebar({
  pathname,
  onLogout,
  mobileOpen,
  onClose,
}: {
  pathname: string;
  onLogout: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
              isActive(href)
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-slate-100 space-y-0.5">
        <Link
          href="/cashier"
          onClick={onClose}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-blue-600 hover:bg-blue-50 transition"
        >
          <CashierIcon className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium">收银台</span>
        </Link>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
        >
          <LogoutIcon className="w-5 h-5 flex-shrink-0" />
          <span>退出登录</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* 桌面端固定侧边栏 */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col bg-white border-r border-slate-200 z-30">
        <div className="h-16 flex items-center px-4 border-b border-slate-100 flex-shrink-0">
          <BrandLogo />
        </div>
        {nav}
      </aside>

      {/* 移动端抽屉 */}
      {mobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col bg-white border-r border-slate-200">
            <div className="h-16 flex items-center px-4 border-b border-slate-100 flex-shrink-0">
              <BrandLogo />
            </div>
            {nav}
          </aside>
        </div>
      ) : null}
    </>
  );
}
