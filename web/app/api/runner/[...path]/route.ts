import { NextRequest } from "next/server";

const RUNNER_URL = process.env.RUNNER_URL ?? "http://runner:8100";

export const dynamic = "force-dynamic";

const FORWARDED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await context.params;
  const target = `${RUNNER_URL}/${path.join("/")}${request.nextUrl.search}`;

  const headers: Record<string, string> = {};
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers["content-type"] = contentType;
  }

  const init: RequestInit = { method: request.method, headers, cache: "no-store" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  try {
    const response = await fetch(target, init);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "runner_unreachable",
        detail: "Runner is unreachable. Please retry in a moment.",
        technical: String(error),
      },
      { status: 502 },
    );
  }
}

export const GET = proxy;

async function methodHandler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  if (!FORWARDED_METHODS.includes(request.method as (typeof FORWARDED_METHODS)[number])) {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  return proxy(request, context);
}

export const POST = methodHandler;
export const PUT = methodHandler;
export const PATCH = methodHandler;
export const DELETE = methodHandler;
