import { ImageResponse } from "next/og";
import { IconImage } from "@/components/brand/icon-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<IconImage size={180} maskable />, size);
}
