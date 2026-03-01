import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiClient } from '../api/client.ts'
import type { Category, ApiResponse, CreateCategoryInput } from '../types/index.ts'

export function useCategories() {
  const api = getApiClient()
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<ApiResponse<Category[]>>('/categories').then((r) => r.data),
  })
}

export function useCreateCategory() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      api.post<ApiResponse<Category>>('/categories', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useUpdateCategory() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<CreateCategoryInput> & { id: string }) =>
      api.put<ApiResponse<Category>>(`/categories/${id}`, {
        ...input,
        parent_id: input.parent_id ?? '',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useDeleteCategory() {
  const api = getApiClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete<ApiResponse<null>>(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}
