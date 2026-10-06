import { useQuery } from '@tanstack/react-query';

import { USER_KEYS } from '@/types/user-api';

import { userApi } from '../user-api';

export const useUser = (id?: string) =>
  useQuery({
    queryKey: USER_KEYS.detail(id ?? ''),
    queryFn: async () => await userApi.getUserById(id ?? ''),
    enabled: id !== undefined && id !== '',
  });

export const useUserSearch = (query: string) =>
  useQuery({
    queryKey: USER_KEYS.list({ search: query }),
    queryFn: async () => await userApi.searchUsers(query),
    enabled: query.length > 0,
    // 5 minutes
    staleTime: 5 * 60 * 1000,
  });
