const API_ORIGIN = "https://abiturient-api.vlsu.ru/api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export const onRequest: PagesFunction = async ({ request, params }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const pathParam = params.path;
  const path = Array.isArray(pathParam) ? pathParam.join("/") : pathParam || "";
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${API_ORIGIN}/${path}`);
  targetUrl.search = sourceUrl.search;

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: {
      "Content-Type": request.headers.get("Content-Type") || "application/json"
    },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text()
  });

  const headers = new Headers(upstream.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
};
