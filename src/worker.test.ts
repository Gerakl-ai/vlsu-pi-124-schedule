import { describe, expect, it, vi } from "vitest";
import { RELEASE_CHANNEL } from "./release";
import worker from "./worker";

function createEdgeCache() {
  const entries = new Map<string, Response>();
  return {
    match: vi.fn(async (request: RequestInfo | URL) => entries.get(String(request instanceof Request ? request.url : request))?.clone()),
    put: vi.fn(async (request: RequestInfo | URL, response: Response) => {
      entries.set(String(request instanceof Request ? request.url : request), response.clone());
    })
  };
}

function createSnapshotKv() {
  const entries = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => entries.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      entries.set(key, value);
    })
  };
}

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
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Permissions-Policy")).toBe("camera=(), geolocation=(), microphone=(self), payment=(), usb=()");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-store, must-revalidate");
    expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
  });

  it("serves /index.html as a direct app shell response without a redirect", async () => {
    const env = createEnv();
    const response = await worker.fetch(new Request("https://app.example/index.html"), env);
    const assetRequest = (env.ASSETS.fetch as unknown as { mock: { calls: Array<[Request]> } }).mock.calls[0]?.[0];

    expect(assetRequest && new URL(assetRequest.url).pathname).toBe("/");
    expect(response.status).toBe(200);
    expect(response.redirected).toBe(false);
  });

  it("falls back to the last successful edge copy when VLSU is unavailable", async () => {
    const edgeCache = createEdgeCache();
    const env = { ...createEnv(), EDGE_CACHE: edgeCache };
    const snapshotKv = createSnapshotKv();
    const request = () => new Request("https://app.example/vlsu-api/student/GetGroupCurrentInfo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify("group-id")
    });
    const waitUntil: Promise<unknown>[] = [];
    const context = { waitUntil: (promise: Promise<unknown>) => waitUntil.push(promise) };

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponseForTest({ CurrentWeekType: 1 })));
    const live = await worker.fetch(request(), env, context);
    await Promise.all(waitUntil.splice(0));
    expect(live.headers.get("X-Lad-Data-Source")).toBe("live");

    Object.assign(env, { SCHEDULE_SNAPSHOT: snapshotKv });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const cached = await worker.fetch(request(), env, context);
    expect(cached.status).toBe(200);
    expect(cached.headers.get("X-Lad-Data-Source")).toBe("edge-cache");
    expect(await cached.json()).toEqual({ CurrentWeekType: 1 });
    await Promise.all(waitUntil.splice(0));
    expect(snapshotKv.put).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("serves a global KV snapshot in a new edge location when VLSU is unavailable", async () => {
    const snapshotKv = createSnapshotKv();
    const request = () => new Request("https://app.example/vlsu-api/student/GetGroupSchedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Nrec: "group-id", WeekType: 0, WeekDays: "1,2,3,4,5,6" })
    });
    const firstWaitUntil: Promise<unknown>[] = [];
    const firstEnv = { ...createEnv(), EDGE_CACHE: createEdgeCache(), SCHEDULE_SNAPSHOT: snapshotKv };

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponseForTest([{ type: "Lessons", name: "Понедельник" }])));
    const live = await worker.fetch(request(), firstEnv, { waitUntil: (promise) => firstWaitUntil.push(promise) });
    await Promise.all(firstWaitUntil);
    expect(live.headers.get("X-Lad-Data-Source")).toBe("live");
    expect(snapshotKv.put).toHaveBeenCalledOnce();

    const secondWaitUntil: Promise<unknown>[] = [];
    const secondEnv = { ...createEnv(), EDGE_CACHE: createEdgeCache(), SCHEDULE_SNAPSHOT: snapshotKv };
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const snapshot = await worker.fetch(request(), secondEnv, { waitUntil: (promise) => secondWaitUntil.push(promise) });
    expect(snapshot.status).toBe(200);
    expect(snapshot.headers.get("X-Lad-Data-Source")).toBe("global-snapshot");
    expect(snapshot.headers.get("X-Lad-Snapshot-At")).toBeTruthy();
    expect(await snapshot.json()).toEqual([{ type: "Lessons", name: "Понедельник" }]);
    await Promise.all(secondWaitUntil);
    vi.unstubAllGlobals();
  });
});

function jsonResponseForTest(payload: unknown) {
  return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
}
