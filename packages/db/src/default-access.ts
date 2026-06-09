export const permissionCatalog = [
  {
    key: 'company.read',
    description: 'View company settings',
    category: 'company',
  },
  {
    key: 'company.manage',
    description: 'Update company settings',
    category: 'company',
  },
  {
    key: 'outlet.read',
    description: 'View assigned outlets',
    category: 'outlet',
  },
  {
    key: 'outlet.manage',
    description: 'Create and update outlets',
    category: 'outlet',
  },
  {
    key: 'payment.settings.read',
    description: 'View outlet payment availability',
    category: 'payments',
  },
  {
    key: 'payment.settings.manage',
    description: 'Enable or disable outlet payment methods',
    category: 'payments',
  },
  {
    key: 'menu.read',
    description: 'View menus and menu settings',
    category: 'menu',
  },
  {
    key: 'menu.manage',
    description: 'Create and update menus and items',
    category: 'menu',
  },
  {
    key: 'menu.publish',
    description: 'Publish menu versions',
    category: 'menu',
  },
  {
    key: 'table.read',
    description: 'View tables and dining zones',
    category: 'tables',
  },
  {
    key: 'table.manage',
    description: 'Create and update tables and dining zones',
    category: 'tables',
  },
  {
    key: 'qr.manage',
    description: 'Generate and revoke table QR codes',
    category: 'tables',
  },
  {
    key: 'user.manage',
    description: 'Manage staff users and access',
    category: 'users',
  },
  {
    key: 'printer.manage',
    description: 'Configure printers and print routing',
    category: 'printing',
  },
  {
    key: 'order.read',
    description: 'View outlet orders',
    category: 'orders',
  },
  {
    key: 'order.manage',
    description: 'Create and update outlet orders',
    category: 'orders',
  },
] as const;

const allPermissionKeys = permissionCatalog.map(({ key }) => key);

export const defaultRoleTemplates = [
  {
    systemKey: 'OWNER',
    name: 'Owner',
    description: 'Full tenant administration access.',
    permissions: allPermissionKeys,
  },
  {
    systemKey: 'MANAGER',
    name: 'Outlet Manager',
    description: 'Manages daily outlet setup and operations.',
    permissions: allPermissionKeys.filter((key) => key !== 'outlet.manage'),
  },
  {
    systemKey: 'CASHIER',
    name: 'Cashier',
    description: 'Takes orders and views payment availability.',
    permissions: [
      'outlet.read',
      'payment.settings.read',
      'payment.settings.manage',
      'menu.read',
      'menu.manage',
      'table.read',
      'table.manage',
      'qr.manage',
      'order.read',
      'order.manage',
    ],
  },
  {
    systemKey: 'WAITER',
    name: 'Waiter',
    description: 'Handles table service and staff-assisted orders.',
    permissions: [
      'outlet.read',
      'menu.read',
      'table.read',
      'order.read',
      'order.manage',
    ],
  },
  {
    systemKey: 'KITCHEN',
    name: 'Kitchen',
    description: 'Views and processes kitchen orders.',
    permissions: ['outlet.read', 'order.read'],
  },
] as const;
