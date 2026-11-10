export type UserRole = 'super_admin' | 'employee';

export interface AppUser {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  role: UserRole;
  active: boolean;
}

const USERS_KEY = 'deloitte-ics-users.v2';

export const DEFAULT_USERS: AppUser[] = [
  {
    id: 'user-1',
    name: '吕薇庆',
    employeeId: 'MG-0001',
    department: 'Mindigital 全球交付中心',
    role: 'super_admin',
    active: true,
  },
  {
    id: 'user-2',
    name: '胡雅洁',
    employeeId: 'MG-0002',
    department: 'Mindigital 全球交付中心',
    role: 'employee',
    active: true,
  },
  {
    id: 'user-3',
    name: '曾悦婷',
    employeeId: 'MG-0003',
    department: 'Mindigital 全球交付中心',
    role: 'employee',
    active: true,
  },
  {
    id: 'user-4',
    name: '王红玮',
    employeeId: 'MG-0004',
    department: 'Mindigital 全球交付中心',
    role: 'employee',
    active: true,
  },
];

export function loadUsers(): AppUser[] {
  // 刷新即重置：每次进入都使用默认用户，不读取本地历史。
  return DEFAULT_USERS.map((user) => ({ ...user }));
}

export function saveUsers(users: AppUser[]): void {
  try {
    window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
}

export function newUserId(): string {
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
