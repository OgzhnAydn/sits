import type { Metadata, Viewport } from "next";
import "./globals.css";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import RizaKapisi from "@/components/RizaKapisi";
import PWA from "@/components/PWA";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://siber-bildir-web.vercel.app"),
  title: {
    default: "SİTS — Nazar senin siber koruyucun",
    template: "%s | SİTS",
  },
  description:
    "Link, IBAN veya telefon numarasını saniyeler içinde sorgula. Nazar ile riskleri tespit et, dolandırıcılığı bildir, herkesi koru.",
  icons: { icon: "/nazar.svg", apple: "/nazar.svg" },
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "SİTS", statusBarStyle: "default" },
  // WhatsApp / sosyal medya link önizlemesi — maskotlu kart (üçgen/kırık ikon yerine)
  openGraph: {
    type: "website",
    siteName: "SİTS — Nazar",
    title: "Nazar senin siber koruyucun",
    description: "Şüpheli link, IBAN, telefon ya da hesabı saniyeler içinde sorgula. Nazar riskleri tespit eder, seni ve yakınlarını korur.",
    locale: "tr_TR",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SİTS — Nazar senin siber koruyucun" }],
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

          <header className="relative z-30 flex items-center justify-between px-5 pt-6 pb-2">
            <Link href="/" className="flex flex-col">
              <span className="flex items-center gap-1.5">
                <span className="font-display text-2xl font-extrabold tracking-tight text-on-surface">SİTS</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/nazar.svg" alt="" className="h-6 w-6" />
              </span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <span className="text-[13px] font-bold text-primary">Nazar</span>
                <span className="h-px w-8 bg-outline-variant" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
            </Link>
          </header>

          <main className="relative z-10 flex-1 pb-32">
            {children}
            <div className="px-5 pb-2 pt-6 text-center text-[11px] text-on-surface-variant">
              <p>Resmi bir devlet uygulaması değildir. Acil durumda 155 / 112.</p>
              <p className="mt-0.5">
                <Link href="/gizlilik" className="underline">Gizlilik</Link>
                {" · "}
                <Link href="/kosullar" className="underline">Koşullar</Link>
              </p>
            </div>
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
