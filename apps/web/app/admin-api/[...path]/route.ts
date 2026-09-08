import type { NextRequest } from 'next/server';
import { apiBase } from '@/lib/api/client';

export const dynamic = 'force-dynamic';

/**
 * Same-origin proxy for `/api/v1/admin/*`.
 *
 * The Go service's CORS allow-list is `GET, POST, DELETE, OPTIONS`, so a browser
 * `PATCH` — which is how the panel edits a lesson and renames a placeholder —
 * never gets past the preflight. Rather than change `services/`, the panel sends
 * its admin traffic to this route on its own origin and the Node side forwards it.
 *
 * It grants no privileges of its own: the caller's `X-Api-Key` is passed through
 * unchanged and nothing is injected, so an unauthenticated request is still
 * answered with the API's own `401`.
 *
 * The path is `/admin-api/*`, not `/api/*`, because `infra/Caddyfile` routes
 * `/api/*` straight to the Go service.
 */
async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = new URL(`${apiBase()}/api/v1/admin/${path.map(encodeURIComponent).join('/')}`);
  req.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));

  const headers = new Headers();
  const key = req.headers.get('x-api-key');
  if (key) headers.set('X-Api-Key', key);
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  headers.set('Accept', 'application/json');

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE';

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      cache: 'no-store',
    });
    const text = await upstream.text();
    return new Response(text.length > 0 ? text : null, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json(
      { error: { code: 'internal', message: 'the API is unreachable' } },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
