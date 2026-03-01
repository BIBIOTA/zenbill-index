export interface TokenStorage {
  getToken(): Promise<string | null>
  setToken(token: string): Promise<void>
  removeToken(): Promise<void>
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
      await storage.removeToken()
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
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  }
}
