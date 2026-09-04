"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { immersiveMi } from "@/components/BottomNav";

// Global üst başlık (MirLeon / Nazar). Tam-ekran immersive rotalarda gizlenir —
// aksi halde 440px kapsayıcının ortasında kalıp overlay'lerin üstüne taşar.
export default function AppHeader() {
  const path = usePathname();
  if (immersiveMi(path)) return null;
  return (
    <header className="relative z-30 flex items-center justify-between px-5 pt-6 pb-2">
      <Link href="/" className="flex flex-col gap-1">
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mirleon.svg" alt="MirLeon" className="h-[19px] w-auto" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nazar.svg" alt="" className="h-6 w-6" />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold text-primary">Nazar</span>
          <span className="h-px w-8 bg-outline-variant" />
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
      </Link>
    </header>
  );
}
