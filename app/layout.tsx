import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import RootFooter from "@/components/RootFooter";
import AppHeader from "@/components/AppHeader";
import RizaKapisi from "@/components/RizaKapisi";
import PWA from "@/components/PWA";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://siber-bildir-web.vercel.app"),
  title: {
    default: "MirLeon — Nazar senin siber koruyucun",
    template: "%s | MirLeon",
  },
  description:
    "Link, IBAN veya telefon numarasını saniyeler içinde sorgula. Nazar ile riskleri tespit et, dolandırıcılığı bildir, herkesi koru.",
  icons: { icon: "/nazar.svg", apple: "/nazar.svg" },
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "MirLeon", statusBarStyle: "default" },
  // WhatsApp / sosyal medya link önizlemesi — maskotlu kart (üçgen/kırık ikon yerine)
  openGraph: {
    type: "website",
    siteName: "MirLeon — Nazar",
    title: "Nazar senin siber koruyucun",
    description: "Şüpheli link, IBAN, telefon ya da hesabı saniyeler içinde sorgula. Nazar riskleri tespit eder, seni ve yakınlarını korur.",
    locale: "tr_TR",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "MirLeon — Nazar senin siber koruyucun" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nazar senin siber koruyucun",
    description: "Şüpheli link, IBAN, telefon ya da hesabı saniyeler içinde sorgula. Nazar seni ve yakınlarını korur.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0e3a6e",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className="antialiased">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="text-on-surface">
        <div className="relative mx-auto flex min-h-screen w-full max-w-[440px] flex-col">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
            style={{ background: "var(--gradient-halo)" }}
            aria-hidden="true"
          />

          <AppHeader />

          <main className="relative z-10 flex-1 pb-32">
            {children}
            <RootFooter />
          </main>

          <BottomNav />
        </div>
        <RizaKapisi />
        <PWA />
        <Analytics />
      </body>
    </html>
  );
}
