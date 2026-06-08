import {
  Banknote,
  CreditCard,
  LayoutDashboard,
  MenuSquare,
  Printer,
  QrCode,
  Settings,
  Store,
  type LucideIcon,
} from 'lucide-react';

export const demoOutletId = 'demo-outlet';

export type StatusTone = 'success' | 'attention' | 'neutral' | 'danger';

export interface OwnerNavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const ownerNavItems: OwnerNavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    description: 'Launch checklist and outlet health',
    icon: LayoutDashboard,
  },
  {
    href: `/outlets/${demoOutletId}/menu`,
    label: 'Menu',
    description: 'Categories, items, sold-out state',
    icon: MenuSquare,
  },
  {
    href: `/outlets/${demoOutletId}/tables`,
    label: 'Tables and QR',
    description: 'Zones, tables, token rotation',
    icon: QrCode,
  },
  {
    href: `/outlets/${demoOutletId}/payment-settings`,
    label: 'Payments',
    description: 'HitPay, online card, PayNow controls',
    icon: CreditCard,
  },
  {
    href: `/outlets/${demoOutletId}/printing`,
    label: 'Printing',
    description: 'Printer agents, routes, test jobs',
    icon: Printer,
  },
];

export const dashboardStats: Array<{
  label: string;
  value: string;
  detail: string;
  tone: StatusTone;
}> = [
  {
    label: 'Pilot readiness',
    value: '72%',
    detail: 'Menu and tables ready, printing pending',
    tone: 'attention',
  },
  {
    label: 'Outlets',
    value: '1',
    detail: 'Demo outlet selected for setup',
    tone: 'success',
  },
  {
    label: 'Payment provider',
    value: 'HitPay',
    detail: 'Online card checkout is the live QR method',
    tone: 'success',
  },
  {
    label: 'Open setup tasks',
    value: '4',
    detail: 'Review before first restaurant handover',
    tone: 'neutral',
  },
];

export const onboardingSteps: Array<{
  title: string;
  description: string;
  status: string;
  tone: StatusTone;
  href: string;
}> = [
  {
    title: 'Activate owner account',
    description:
      'Owner accepts the invitation token and sets a secure password.',
    status: 'Ready to wire',
    tone: 'success',
    href: '/activate',
  },
  {
    title: 'Confirm outlet profile',
    description:
      'Validate address, GST, service charge, timezone, and currency.',
    status: 'Backend ready',
    tone: 'attention',
    href: '/dashboard',
  },
  {
    title: 'Publish first menu',
    description: 'Create categories, items, variants, and publish the QR menu.',
    status: 'Scaffolded',
    tone: 'neutral',
    href: `/outlets/${demoOutletId}/menu`,
  },
  {
    title: 'Generate table QR codes',
    description:
      'Set up zones and rotate QR tokens before printing table cards.',
    status: 'Scaffolded',
    tone: 'neutral',
    href: `/outlets/${demoOutletId}/tables`,
  },
  {
    title: 'Confirm payment controls',
    description:
      'Review HitPay online card availability and manual PayNow disable controls.',
    status: 'Scaffolded',
    tone: 'neutral',
    href: `/outlets/${demoOutletId}/payment-settings`,
  },
  {
    title: 'Validate printer setup',
    description:
      'Check Wi-Fi printer routes, local agent heartbeat, and test jobs.',
    status: 'Scaffolded',
    tone: 'neutral',
    href: `/outlets/${demoOutletId}/printing`,
  },
];

export const menuPreview = [
  {
    category: 'Signature plates',
    items: '8 items',
    state: 'Draft',
    next: 'Add variants and publish',
  },
  {
    category: 'Beverages',
    items: '12 items',
    state: 'Published',
    next: 'Review sold-out controls',
  },
  {
    category: 'Desserts',
    items: '4 items',
    state: 'Needs photos',
    next: 'Attach images before launch',
  },
];

export const tableZones = [
  {
    zone: 'Main dining',
    tables: '12 tables',
    qrState: 'QR ready',
    note: 'Rotate token after every pilot reset.',
  },
  {
    zone: 'Patio',
    tables: '6 tables',
    qrState: 'Draft',
    note: 'Outdoor table cards not printed yet.',
  },
  {
    zone: 'Counter',
    tables: '4 seats',
    qrState: 'Ready',
    note: 'Useful for quick pickup and counter orders.',
  },
];

export const paymentControls: Array<{
  scope: string;
  label: string;
  provider: string;
  state: string;
  tone: StatusTone;
  detail: string;
}> = [
  {
    scope: 'ONLINE',
    label: 'All online checkout',
    provider: 'Global outlet control',
    state: 'Enabled',
    tone: 'success',
    detail: 'Emergency switch for every customer-facing online payment method.',
  },
  {
    scope: 'ONLINE_CARD',
    label: 'HitPay online card',
    provider: 'Current QR checkout method',
    state: 'Enabled',
    tone: 'success',
    detail:
      'The customer QR flow currently creates HitPay hosted checkout sessions.',
  },
  {
    scope: 'MANUAL_PAYNOW',
    label: 'Manual PayNow',
    provider: 'Staff verification path',
    state: 'Can be disabled',
    tone: 'attention',
    detail:
      'Kept as a backend scope so owners can disable PayNow when the staff POS path ships.',
  },
  {
    scope: 'STRIPE_PAYNOW',
    label: 'Legacy hosted PayNow',
    provider: 'Compatibility scope',
    state: 'Hidden from QR',
    tone: 'neutral',
    detail:
      'Present for compatibility while the live hosted provider remains HitPay.',
  },
  {
    scope: 'CASH',
    label: 'Cash settlement',
    provider: 'Staff immediate-settlement path',
    state: 'Enabled',
    tone: 'success',
    detail:
      'Lets staff mark walk-in orders paid immediately and send them to the kitchen without hosted checkout.',
  },
];

export const printerChecks = [
  {
    title: 'Wi-Fi printer route',
    description: 'Map kitchen, bar, receipt, and backup printers by outlet.',
    icon: Printer,
    status: 'Needs physical test',
  },
  {
    title: 'Printer agent heartbeat',
    description: 'Local agent leases print jobs and reports health to the API.',
    icon: Settings,
    status: 'Backend ready',
  },
  {
    title: 'Receipt and kitchen tickets',
    description:
      'Trigger test print, retry, and reprint actions from owner tools.',
    icon: Banknote,
    status: 'Scaffolded',
  },
  {
    title: 'Outlet handover',
    description:
      'Store printer host, port, paper width, and station routing notes.',
    icon: Store,
    status: 'Scaffolded',
  },
];
