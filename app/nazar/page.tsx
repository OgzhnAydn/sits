"use client";

import { useEffect, useRef, useState } from "react";

type Mesaj = { role: "user" | "assistant"; content: string };

const ONERILER = [
  "Bu link güvenli mi: kargo-takip-tr.net",
  "e-Devlet'ten SMS geldi, ne yapmalıyım?",
  "05321234567 beni aradı, dolandırıcı mı?",
];

export default function NazarSohbet() {
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [metin, setMetin] = useState("");
  const [yaziyor, setYaziyor] = useState(false);
  const sonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sonRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mesajlar, yaziyor]);

  async function gonder(soru?: string) {
    const icerik = (soru ?? metin).trim();
    if (!icerik || yaziyor) return;
    const yeni: Mesaj[] = [...mesajlar, { role: "user", content: icerik }];
    setMesajlar(yeni);
    setMetin("");
    setYaziyor(true);
    try {
      const r = await fetch("/api/sohbet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mesajlar: yeni }),
      });
      const d = await r.json();
      setMesajlar((m) => [...m, { role: "assistant", content: d.cevap || "Bir sorun oldu, tekrar dener misin?" }]);
    } catch {
      setMesajlar((m) => [...m, { role: "assistant", content: "Bağlantı hatası. Tekrar dener misin?" }]);
    } finally {
      setYaziyor(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col px-4 pt-3">
      {/* Başlık */}
      <div className="flex items-center gap-3 px-1">
        <div className="h-12 w-12 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
        </div>
        <div>
          <h1 className="font-display text-xl font-extrabold text-on-surface">Nazar&apos;a Sor</h1>
          <p className="text-[12px] text-on-surface-variant">Şüpheli her şeyi sor — birlikte kontrol edelim.</p>
        </div>
      </div>

      {/* Mesajlar */}
      <div className="mt-4 flex-1 space-y-3">
        {mesajlar.length === 0 && (
          <div className="mt-2 space-y-2">
            <p className="px-1 text-xs font-semibold text-on-surface-variant">Örnek sorular</p>
            {ONERILER.map((o) => (
              <button
                key={o}
                onClick={() => gonder(o)}
                className="press flex w-full items-center gap-2 rounded-2xl bg-surface-lowest p-3 text-left text-sm text-on-surface soft"
              >
                <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>bolt</span>
                {o}
              </button>
            ))}
          </div>
        )}

        {mesajlar.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[82%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm text-on-primary" style={{ background: "var(--gradient-primary)" }}>
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <div className="h-8 w-8 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/casper-wave.webp" alt="Nazar" className="h-full w-full object-contain" />
              </div>
              <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-surface-lowest px-3.5 py-2.5 text-sm text-on-surface soft">
                {m.content}
              </div>
            </div>
          )
        )}

        {yaziyor && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/casper-wave.webp" alt="Nazar" className="animate-float-soft h-full w-full object-contain" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-surface-lowest px-4 py-3 soft">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "120ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "240ms" }} />
              </span>
            </div>
          </div>
        )}
        <div ref={sonRef} />
      </div>

      {/* Giriş */}
      <div className="sticky bottom-24 mt-3 flex items-center gap-2 rounded-full bg-surface-lowest py-2 pl-4 pr-2 soft-lg">
        <input
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && gonder()}
          placeholder="Bir mesaj, link, IBAN ya da soru yaz…"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-on-surface-variant"
        />
        <button
          onClick={() => gonder()}
          disabled={yaziyor || metin.trim().length === 0}
          aria-label="Gönder"
          className="press grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-primary shadow-glow disabled:opacity-50"
          style={{ background: "var(--gradient-primary)" }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_upward</span>
        </button>
      </div>
    </div>
  );
}
