import { SVGProps } from 'react';

// BunnyEra Pay 统一线性图标库（SVG，适配高 DPI 屏幕）
type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function Svg({ children, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className || 'w-5 h-5'}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const DashboardIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></Svg>
);

export const OrdersIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8 3h8l3 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h2z" /><path d="M9 12h6M9 16h6" /></Svg>
);

export const RefundIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v0a6 6 0 0 1-6 6h-3" /></Svg>
);

export const StoreIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" /><path d="M3.5 6 5 3.5A1 1 0 0 1 5.9 3h12.2a1 1 0 0 1 .9.5L20.5 6c.8 1.4-.2 4-2.5 4-1.5 0-2.5-1-2.7-2-.2 1-1.2 2-2.8 2s-2.6-1-2.8-2c-.2 1-1.2 2-2.7 2-2.3 0-3.3-2.6-2.5-4z" /><path d="M9.5 20v-5h5v5" /></Svg>
);

export const QrIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3h-3z" /></Svg>
);

export const ChannelIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M16 5a3.5 3.5 0 0 1 0 6.5M17.5 14.8c2 .7 3.5 2.3 3.5 5.2" /></Svg>
);

export const ReconcileIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v18" /><path d="M5 7h14" /><path d="M5 7 3 12c0 1.4 1 2.5 2 2.5s2-1.1 2-2.5L5 7zM19 7l-2 5c0 1.4 1 2.5 2 2.5s2-1.1 2-2.5l-2-5z" /><path d="M7 21h10" /></Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.8 13.5 5h2.6l1.3 2.2 2.2 1.3v2.6L21.2 12 19.6 13.5v2.6l-2.2 1.3-1.3 2.2h-2.6L12 21.2 10.5 19.6H7.9l-1.3-2.2-2.2-1.3v-2.6L2.8 12l1.6-1.5V7.9l2.2-1.3L7.9 4.4h2.6L12 2.8z" /></Svg>
);

export const CashierIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>
);

export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}><path d="M14 4h-8a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8" /><path d="m17 8 4 4-4 4M21 12H10" /></Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}><path d="m6 6 12 12M18 6 6 18" /></Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}><path d="m14 6-6 6 6 6" /></Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}><path d="m10 6 6 6-6 6" /></Svg>
);

export const InboxIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 13.5 5.5 5A1 1 0 0 1 6.5 4h11a1 1 0 0 1 1 .5L21 13.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5.5z" /><path d="M3 13.5h5l1.5 2.5h5L16 13.5h5" /></Svg>
);

export const WalletIcon = (p: IconProps) => (
  <Svg {...p}><path d="M20 7V5.5A1.5 1.5 0 0 0 18.5 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H5" /><circle cx="16" cy="13.5" r="1" fill="currentColor" stroke="none" /></Svg>
);

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 5 5.8v5.4c0 4.3 2.9 8 7 9.8 4.1-1.8 7-5.5 7-9.8V5.8L12 3z" /><path d="m9 11.8 2.2 2.2L15.5 9.5" /></Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>
);

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 6.5h16M4 12h16M4 17.5h16" /></Svg>
);

export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18z" /></Svg>
);

export const ChartIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5M12 16V8M16 16v-8" /></Svg>
);

export const BuildingIcon = (p: IconProps) => (
  <Svg {...p}><rect x="4" y="3" width="12" height="18" rx="1" /><path d="M16 9h3a1 1 0 0 1 1 1v11" /><path d="M8 7h2M8 11h2M8 15h2M2 21h20" /></Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}><path d="M10 14a5 5 0 0 0 7.1 0l2.4-2.4a5 5 0 0 0-7-7.1l-1.4 1.3" /><path d="M14 10a5 5 0 0 0-7.1 0l-2.4 2.4a5 5 0 0 0 7 7.1l1.4-1.3" /></Svg>
);

export const DocIcon = (p: IconProps) => (
  <Svg {...p}><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5" /><path d="M9.5 13h5M9.5 17h5" /></Svg>
);
