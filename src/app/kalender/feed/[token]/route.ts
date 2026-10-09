import { icsForToken } from "@/lib/academic/feed";

// Feed langganan kalender (publik, dilindungi token acak per anggota).
// URL: /kalender/feed/<token>.ics
export async function GET(_request: Request, { params }: RouteContext<"/kalender/feed/[token]">) {
  const { token } = await params;
  const ics = await icsForToken(token.replace(/\.ics$/, ""));
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=900",
      "X-Robots-Tag": "noindex",
    },
  });
}
