export default function ScoreGauge({ puan }: { puan: number }) {
  const r = 45;
  const c = 2 * Math.PI * r;
  const dolu = (puan / 100) * c;
  const renk = puan >= 80 ? "#46673d" : puan >= 60 ? "#b15f00" : "#ba1a1a";
  const etiket = puan >= 80 ? "İyi" : puan >= 60 ? "Orta" : "Riskli";
  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e3e2e1" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={renk}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dolu} ${c}`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-4xl font-bold" style={{ color: renk }}>
          {puan}
        </span>
        <span className="text-[13px] font-semibold uppercase tracking-wider text-on-surface-variant">
          {etiket}
        </span>
      </div>
    </div>
  );
}
