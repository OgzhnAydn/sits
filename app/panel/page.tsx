"use client";

// Analitik panel artık AYRI sayfa değil — kokpitin (/mercek) içinde bir görünüm.
// Eski /panel bağlantıları kokpite yönlenir.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PanelYonlendir() {
  const router = useRouter();
  useEffect(() => { router.replace("/mercek"); }, [router]);
  return null;
}
