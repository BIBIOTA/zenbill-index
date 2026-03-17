export interface TokenStorage {
  getToken(): Promise<string | null>
  setToken(token: string): Promise<void>
  removeToken(): Promise<void>
  getRefreshToken(): Promise<string | null>
  setRefreshToken(token: string): Promise<void>
  removeRefreshToken(): Promise<void>
}

export interface ApiClientConfig {
  storage: TokenStorage
  baseUrl: string
  onUnauthorized?: () => void
}

export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

let _client: ApiClient | null = null

export function setApiClient(client: ApiClient) {
  _client = client
}

export function getApiClient(): ApiClient {
  if (!_client) throw new Error('@zenbill/shared: API client not initialized. Call setApiClient() first.')
  return _client
}

export function createApiClient(config: ApiClientConfig) {
  const { storage, baseUrl, onUnauthorized } = config

  let refreshPromise: Promise<boolean> | null = null

  async function refreshTokens(): Promise<boolean> {
    const refreshToken = await storage.getRefreshToken()
    if (!refreshToken) return false

    try {
      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (!res.ok) return false

      const json = await res.json()
      if (json.data?.token && json.data?.refresh_token) {
        await storage.setToken(json.data.token)
        await storage.setRefreshToken(json.data.refresh_token)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await storage.getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    if (res.status === 401) {
      // Don't try to refresh if this IS the refresh endpoint
      if (path === '/auth/refresh') {
        await storage.removeToken()
        await storage.removeRefreshToken()
        onUnauthorized?.()
        throw new ApiError(401, 'Unauthorized')
      }

      // Deduplicate concurrent refresh attempts
      if (!refreshPromise) {
        refreshPromise = refreshTokens().finally(() => { refreshPromise = null })
      }

      const refreshed = await refreshPromise

      if (refreshed) {
        // Retry with new token
        const newToken = await storage.getToken()
        const retryHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`

        const retryRes = await fetch(`${baseUrl}${path}`, {
          method,
          headers: retryHeaders,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        })

        if (!retryRes.ok) {
          const retryJson = await retryRes.json()
          if (retryRes.status === 401) {
            await storage.removeToken()
            await storage.removeRefreshToken()
            onUnauthorized?.()
          }
          throw new ApiError(retryJson.code || retryRes.status, retryJson.message || 'Unknown error')
        }

        return retryRes.json()
      }

      // Refresh failed
      await storage.removeToken()
      await storage.removeRefreshToken()
      onUnauthorized?.()
      throw new ApiError(401, 'Unauthorized')
    }

    const json = await res.json()

    if (!res.ok) {
      throw new ApiError(json.code || res.status, json.message || 'Unknown error')
    }

    return json
  }

  return {
    get: <T>(path: string, options?: { params?: Record<string, string> }) => {
      if (options?.params) {
        const qs = new URLSearchParams(options.params).toString()
        return request<T>('GET', `${path}?${qs}`)
      }
      return request<T>('GET', path)
    },
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  }
}
