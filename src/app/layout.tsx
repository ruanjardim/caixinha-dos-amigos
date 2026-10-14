import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Caixinha dos Amigos", template: "%s · Caixinha dos Amigos" },
  description: "Gestão transparente da caixinha coletiva do grupo.",
  applicationName: "Caixinha dos Amigos",
  appleWebApp: { capable: true, title: "Caixinha", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false }, // grupo privado: não indexar
};

export const viewport: Viewport = {
  themeColor: "#039855",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
