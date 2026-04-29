import type { Metadata, Viewport } from "next";
import "./globals.css";
import { readBusinessSettings } from "@/lib/business-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  let title = "Prenotazioni Online";
  let description = "Prenota il tuo appuntamento";

  try {
    const settings = await readBusinessSettings();
    title = settings.brandTitle?.trim() || title;
    description = settings.brandSubtitle?.trim() || description;
  } catch {}

  return {
    title,
    description,
    applicationName: title,
    manifest: "/manifest",
    icons: {
      icon: [
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png" }],
      shortcut: ["/icons/icon-192.png"],
    },
    openGraph: {
      title,
      description,
      images: [{ url: "/icons/icon-512.png" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0F0F0F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
