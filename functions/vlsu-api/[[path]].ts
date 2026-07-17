const API_ORIGIN = "https://abiturient-api.vlsu.ru/api";
const UPSTREAM_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 16_384;

const allowedRoutes = new Map<string, "GET" | "POST">([
  ["catalogs/GetInstitutes", "GET"],
  ["student/GetStudGroups", "POST"],
  ["student/GetGroupCurrentInfo", "POST"],
  ["student/GetGroupSchedule", "POST"]
]);

function jsonResponse(payload: unknown, status: number, headers?: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}

export const onRequest: PagesFunction = async ({ request, params }) => {
  const pathParam = params.path;
  const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam || "";
  const allowedMethod = allowedRoutes.get(path.replace(/\/+$/, ""));
  if (!allowedMethod) return jsonResponse({ error: "VLSU route not found" }, 404);

  const sourceUrl = new URL(request.url);
  const requestOrigin = request.headers.get("Origin");
  if (requestOrigin && requestOrigin !== sourceUrl.origin) {
    return jsonResponse({ error: "Cross-origin request denied" }, 403);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": `${allowedMethod},OPTIONS`,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400"
      }
    });
  }
  if (request.method !== allowedMethod) {
    return jsonResponse({ error: "Method not allowed" }, 405, { Allow: allowedMethod });
  }

  let body: string | undefined;
  if (allowedMethod === "POST") {
    const declaredLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Payload too large" }, 413);
    }
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Payload too large" }, 413);
    }
  }

  const targetUrl = new URL(`${API_ORIGIN}/${path}`);
  targetUrl.search = sourceUrl.search;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(targetUrl, {
      method: allowedMethod,
      headers: allowedMethod === "POST"
        ? { "Content-Type": request.headers.get("Content-Type") || "application/json" }
        : undefined,
      body,
      signal: controller.signal
    });

    const headers = new Headers(upstream.headers);
    headers.delete("Access-Control-Allow-Origin");
    headers.delete("Access-Control-Allow-Credentials");
    headers.set("Cache-Control", "no-store");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  } catch {
    return controller.signal.aborted
      ? jsonResponse({ error: "VLSU API timed out" }, 504)
      : jsonResponse({ error: "VLSU API unavailable" }, 502);
  } finally {
    clearTimeout(timeout);
  }
};
