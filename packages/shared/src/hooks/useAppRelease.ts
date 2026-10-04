import { getApiClient, ApiError } from '../api/client.ts'
import type { ApiResponse, AppRelease } from '../types/index.ts'

// Returns null when no release has been recorded yet (backend responds 404).
export async function getLatestAppVersion(): Promise<AppRelease | null> {
  try {
    const res = await getApiClient().get<ApiResponse<AppRelease>>('/app/latest-version')
    return res.data
  } catch (e) {
    if (e instanceof ApiError && e.code === 404) return null
    throw e
  }
}
