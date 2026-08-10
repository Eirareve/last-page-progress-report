import { DynamicPortraitService, dynamicPortraitRequestSchema } from "../../../stage7/dynamic-portrait";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stage 9/10 submission is intentionally pinned to the three approved assets.
// The optional Agnes adapter remains isolated for future review, but this public
// route cannot activate it through environment configuration.
const service = new DynamicPortraitService(null);

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "invalid_content_type" }, 415);
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return json({ error: "payload_too_large" }, 413);
  }
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 4_096) return json({ error: "payload_too_large" }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = dynamicPortraitRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  return json(await service.request(parsed.data), 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
