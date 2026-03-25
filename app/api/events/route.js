import { sseSubscribe } from "@/lib/sseHub";
import { loadActor } from "@/lib/actor";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const actor = await loadActor(request);
  if (!actor) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (text) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          unsubscribe();
        }
      };
      send(`data: ${JSON.stringify({ type: "connected", role: actor.role })}\n\n`);
      unsubscribe = sseSubscribe(send);
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 25000);
      request.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
