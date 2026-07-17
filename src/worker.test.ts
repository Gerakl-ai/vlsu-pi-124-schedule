import { describe, expect, it, vi } from "vitest";
import { RELEASE_CHANNEL } from "./release";
import worker from "./worker";

function createEnv() {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response("app shell", { headers: { "Content-Type": "text/html" } }))
    },
    CF_VERSION_METADATA: {
      id: "worker-version-id",
      tag: "production",
      timestamp: "2026-07-17T12:00:00.000Z"
    }
  };
}

describe("Cloudflare worker", () => {
  it("exposes verifiable deployment metadata", async () => {
    const response = await worker.fetch(new Request("https://app.example/app-api/health"), createEnv());
    const payload = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Lad-Release")).toBe(RELEASE_CHANNEL);
    expect(response.headers.get("X-Lad-Worker-Version")).toBe("worker-version-id");
    expect(payload).toMatchObject({
      ok: true,
      release: RELEASE_CHANNEL,
      workerVersion: "worker-version-id",
      deployedAt: "2026-07-17T12:00:00.000Z"
    });
  });

  it("does not expose an arbitrary upstream proxy", async () => {
    const response = await worker.fetch(new Request("https://app.example/vlsu-api/private/unknown"), createEnv());
    expect(response.status).toBe(404);
  });

  it("enforces the method of each VLSU endpoint", async () => {
    const response = await worker.fetch(new Request("https://app.example/vlsu-api/student/GetGroupSchedule"), createEnv());
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("rejects cross-origin API calls", async () => {
    const response = await worker.fetch(new Request("https://app.example/app-api/classify", {
      method: "POST",
      headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "test" })
    }), createEnv());

    expect(response.status).toBe(403);
  });

  it("adds release and security headers to static assets", async () => {
    const env = createEnv();
    const response = await worker.fetch(new Request("https://app.example/"), env);

    expect(await response.text()).toBe("app shell");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
  });
});
