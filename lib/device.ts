"use client";

// Anonim cihaz kimliği — aynı kişinin bir göstergeyi defalarca "farklı bildiren"
// gibi göstermesini engellemek için. Kişisel veri değildir, rastgele.
export function cihazId(): string {
  if (typeof window === "undefined") return "anon";
  let id = localStorage.getItem("sb_cihaz");
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "c-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("sb_cihaz", id);
  }
  return id;
}
