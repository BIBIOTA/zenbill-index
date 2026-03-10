import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { Notification, PaginatedResponse, ApiResponse } from '../types/index.ts'

export function useNotifications(page = 1, pageSize = 20) {
  const api = getApiClient()
  return useQuery({
    queryKey: ['notifications', { page, pageSize }],
    queryFn: () =>
      api.get<PaginatedResponse<Notification>>(
        `/notifications?page=${page}&page_size=${pageSize}`,
      ),
  })
}

export function useUnreadCount() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () =>
      api
        .get<ApiResponse<{ count: number }>>('/notifications/unread-count')
        .then((r) => r.data.count),
    refetchInterval: 30000,
  })
}

export function useMarkAsRead() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.patch<ApiResponse<null>>(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllAsRead() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.patch<ApiResponse<null>>('/notifications/read-all', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
