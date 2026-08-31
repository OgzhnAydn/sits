export default function Hero() {
  return (
    <div className="relative">
      <div className="animate-glow pointer-events-none absolute left-1/2 top-1/2 h-[115%] w-[115%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(217,164,65,0.35)_0%,rgba(217,164,65,0)_65%)]" />
      <div className="soft-lg relative overflow-hidden rounded-[28px] bg-white/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-topluluk.webp"
          alt="Dijital koruyucusuyla güvende olan topluluk"
          className="h-auto w-full object-cover opacity-95 mix-blend-multiply"
        />
      </div>
    </div>
  );
}
