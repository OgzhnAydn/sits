"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Ana Sayfa", icon: "home" },
  { href: "/sorgula", label: "Sorgula", icon: "search" },
  null, // ortadaki Nazar butonu için boşluk
  { href: "/bildir", label: "Bildir", icon: "flag" },
  { href: "/servisler", label: "Servisler", icon: "grid_view" },
];

// Tam-ekran immersive rotalar (kendi kabuğu var) — global nav/başlık gizlenir.
const IMMERSIVE = ["/canli", "/mercek", "/panel"];
export function immersiveMi(path: string | null): boolean {
  return !!path && IMMERSIVE.some((r) => path === r || path.startsWith(r + "/"));
}

export default function BottomNav() {
  const path = usePathname();
  if (immersiveMi(path)) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[440px] px-4 pb-4">
      <div className="relative flex items-end justify-between rounded-[28px] bg-surface-lowest/90 px-6 py-3 shadow-float backdrop-blur-xl">
        {ITEMS.map((it, i) =>
          it === null ? (
            <div key={i} className="w-14" />
          ) : (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-1 ${path === it.href ? "text-primary" : "text-on-surface-variant"}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: path === it.href ? "'FILL' 1" : undefined }}>{it.icon}</span>
              <span className="text-[10px] font-semibold">{it.label}</span>
            </Link>
          )
        )}

        <Link
          href="/nazar"
          aria-label="Nazar ile sohbet"
          className="press absolute -top-7 left-1/2 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full shadow-glow"
          style={{ background: "var(--gradient-primary)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="" className="w-10 drop-shadow-[0_4px_8px_oklch(0.2_0.05_265_/_0.35)]" />
        </Link>
      </div>
    </nav>
  );
}
