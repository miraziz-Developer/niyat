import type { createAuthHandler } from './auth-endpoints'
import { endpoint, type EndpointDependencies } from './endpoint'
import { problem } from './request-validation'
import { resources, type Services } from './resources'
import { HttpError } from './security'

type Route = { pattern: RegExp; names: string[]; handle: ReturnType<typeof endpoint> }

export function createApiRouter(dependencies: EndpointDependencies & Services & { auth?: ReturnType<typeof createAuthHandler> }) {
  const routes: Route[] = resources(dependencies).map(({ path, methods }) => {
    const names: string[] = []
    const source = path.replace(/:([A-Za-z]+)/g, (_, name: string) => { names.push(name); return '([^/]+)' })
    return { pattern: new RegExp(`^${source}$`), names, handle: endpoint(dependencies, methods) }
  })

  return async (request: Request): Promise<Response> => {
    const { pathname } = new URL(request.url)
    if (pathname === '/v1/health' && request.method === 'GET') return Response.json({ status: 'ok' })
    const authResponse = await dependencies.auth?.(request, pathname)
    if (authResponse) return authResponse
    for (const route of routes) {
      const match = pathname.match(route.pattern)
      if (match) return route.handle(request, Object.fromEntries(route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])])))
    }
    return problem(new HttpError(404, 'not_found', 'Route not found'), dependencies.requestId?.() ?? crypto.randomUUID())
  }
}
