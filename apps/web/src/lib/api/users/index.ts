// Re-export all user queries
export { useUser, useUserSearch } from './queries';

// Export the user API client and types
export { userApi } from '../user-api';
export type { User } from '@/types/user-api';
