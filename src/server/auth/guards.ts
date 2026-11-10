import { headers } from 'next/headers';
import { auth } from './index';

export class AuthError extends Error {
  constructor(
    public readonly code: 'unauthenticated' | 'forbidden',
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function getSession() {
  const reqHeaders = await headers();
  return auth.api.getSession({
    headers: reqHeaders,
  });
}

export async function requireSession() {
  const sessionData = await getSession();
  if (!sessionData || !sessionData.user) {
    throw new AuthError('unauthenticated', 'You must be signed in to perform this action.');
  }
  return sessionData;
}

export async function requireRole(allowedRoles: ('admin' | 'staff')[]) {
  const sessionData = await requireSession();
  const userRole = (sessionData.user.role ?? 'staff') as 'admin' | 'staff';

  if (!allowedRoles.includes(userRole)) {
    throw new AuthError(
      'forbidden',
      `Access denied. This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
    );
  }

  return {
    ...sessionData,
    user: {
      ...sessionData.user,
      role: userRole,
    },
  };
}

