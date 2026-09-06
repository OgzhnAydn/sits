"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { immersiveMi } from "./BottomNav";

// Tam-ekran pano rotalarında (mercek/kontrol/canli/panel) global footer'ı gizle —
// bu sayfalar kendi tam-ekran kabuklarını çizer; footer üstten sızmasın.
export default function RootFooter() {
  const path = usePathname();
  if (immersiveMi(path)) return null;
  return (
    <div className="px-5 pb-2 pt-6 text-center text-[11px] text-on-surface-variant">
      <p>Resmi bir devlet uygulaması değildir. Acil durumda 155 / 112.</p>
      <p className="mt-0.5">
        <Link href="/gizlilik" className="underline">Gizlilik</Link>
        {" · "}
        <Link href="/kosullar" className="underline">Koşullar</Link>
      </p>
    </div>
  );
}
