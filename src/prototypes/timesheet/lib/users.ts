export type UserRole = 'employee' | 'manager' | 'admin';

export interface AppUser {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  role: UserRole;
  active: boolean;
}

const USERS_KEY = 'deloitte-ics-users.v1';

export const DEFAULT_USERS: AppUser[] = [
  {
    id: 'user-1',
    name: '吕薇庆',
    employeeId: 'MG-0001',
    department: 'Mindigital 全球交付中心',
    role: 'admin',
    active: true,
  },
  {
    id: 'user-2',
    name: '周敏',
    employeeId: 'MG-0002',
    department: 'Mindigital 全球交付中心',
    role: 'manager',
    active: true,
  },
  {
    id: 'user-3',
    name: '陈立',
    employeeId: 'MG-0003',
    department: 'Mindigital 全球交付中心',
    role: 'employee',
    active: true,
  },
];

export function loadUsers(): AppUser[] {
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppUser[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((user) => ({
          id: user.id,
          name: user.name,
          employeeId: user.employeeId,
          department: user.department,
          role: user.role,
          active: Boolean(user.active),
        }));
      }
    }
  } catch {
    // 读取失败时使用默认用户
  }
  const seeded = DEFAULT_USERS.map((user) => ({ ...user }));
  saveUsers(seeded);
  return seeded;
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
