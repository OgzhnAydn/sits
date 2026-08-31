import sharp from "sharp";
import { statSync } from "node:fs";
import path from "node:path";

const pub = path.resolve("public");
const jobs = [
  { src: "maskot.png", out: "maskot.webp", width: 560 },
  { src: "hero-topluluk.png", out: "hero-topluluk.webp", width: 1024 },
  { src: "ikon-bildir.png", out: "ikon-bildir.webp", width: 256 },
];

for (const j of jobs) {
  const srcPath = path.join(pub, j.src);
  const outPath = path.join(pub, j.out);
  await sharp(srcPath)
    .resize({ width: j.width, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(outPath);
  const before = statSync(srcPath).size / 1024;
  const after = statSync(outPath).size / 1024;
  console.log(
    `${j.src} (${before.toFixed(0)} KB) -> ${j.out} (${after.toFixed(0)} KB)`
  );
}
