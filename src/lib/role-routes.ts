import type { Role } from '@prisma/client';

export const ADMIN_HOME = '/admin/companies';
export const USER_HOME = '/overview';

export function defaultRouteForRole(role: Role): string {
  return role === 'ADMIN' ? ADMIN_HOME : USER_HOME;
}
