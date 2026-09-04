import { AntdRegistry } from "@ant-design/nextjs-registry";

// /panel'e özel: antd stillerini SSR'da topla.
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return <AntdRegistry>{children}</AntdRegistry>;
}
