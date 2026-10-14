import { ImageResponse } from "next/og";
import { IconImage } from "@/components/brand/icon-image";

const ALLOWED = new Set([192, 512]);

export async function GET(request: Request, { params }: RouteContext<"/pwa-icon/[size]">) {
  const size = Number((await params).size);
  if (!ALLOWED.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(request.url).searchParams.has("maskable");
  return new ImageResponse(<IconImage size={size} maskable={maskable} />, {
    width: size,
    height: size,
    headers: { "Cache-Control": "public, max-age=86400, immutable" },
  });
}
