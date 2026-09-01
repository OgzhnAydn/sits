import { AntdRegistry } from "@ant-design/nextjs-registry";

// /mercek'e özel: antd stillerini SSR'da topla (yalnız bu bölüm için).
export default function MercekLayout({ children }: { children: React.ReactNode }) {
  return <AntdRegistry>{children}</AntdRegistry>;
}
