interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

const API_ORIGIN = "https://abiturient-api.vlsu.ru/api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function proxyVlsuApi(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const sourceUrl = new URL(request.url);
  const apiPath = sourceUrl.pathname.replace(/^\/vlsu-api\/?/, "");
  const targetUrl = new URL(`${API_ORIGIN}/${apiPath}`);
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
}

export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/vlsu-api/")) {
      return proxyVlsuApi(request);
    }

    return env.ASSETS.fetch(request);
  }
};
