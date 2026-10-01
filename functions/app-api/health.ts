const RELEASE_CHANNEL = "2026.07.17.1";

export const onRequest: PagesFunction = ({ request }) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", Allow: "GET, HEAD" }
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    release: RELEASE_CHANNEL,
    platform: "cloudflare-pages"
  }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Lad-Release": RELEASE_CHANNEL,
      "X-Content-Type-Options": "nosniff"
    }
  });
};
