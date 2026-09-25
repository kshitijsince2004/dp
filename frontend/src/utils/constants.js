export const APP_NAME = 'PRISM';
export const APP_DESCRIPTION = 'Police Reporting, Intelligence & Statistics Management';
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const ROLES = {
  USER: 'user',
  AUTHOR: 'author',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
};

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  PROFILE: '/profile',
  DASHBOARD: '/dashboard',
  NOT_FOUND: '*',
};

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 12,
};

export const QUERY_KEYS = {
  ME: ['auth', 'me'],
  USERS: ['users'],
  USER: (id) => ['users', id],
  NOTIFICATIONS: ['notifications'],
  NOTIFICATION_COUNT: ['notifications', 'count'],
};

export const MAX_AVATAR_SIZE_MB = 5;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
