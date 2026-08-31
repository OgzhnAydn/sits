import { readFileSync } from "node:fs";
import path from "node:path";
import { itibarliMi } from "./itibarli";

let seedSet: Set<string> | null = null;

function yukle(): Set<string> {
  if (seedSet) return seedSet;
  try {
    const raw = readFileSync(
      path.join(process.cwd(), "public", "seed-links.json"),
      "utf8"
    );
    const arr: { deger: string }[] = JSON.parse(raw);
    seedSet = new Set(arr.map((x) => x.deger.toLowerCase()));
  } catch {
    seedSet = new Set();
  }
  return seedSet;
}

// Açık tehdit listesinde (tohum) var mı? Sadece url/domain için.
export function seedKontrol(deger: string, tip: string): boolean {
  if (tip !== "url") return false;
  // İtibarlı siteyi feed kirliliğine karşı koru (ör. github.com'da barındırılan
  // bir phishing sayfası tüm github.com'u işaretlemesin).
  if (itibarliMi(deger)) return false;
  return yukle().has(deger.toLowerCase());
}

export function seedAdet(): number {
  return yukle().size;
}
