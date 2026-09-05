import { AntdRegistry } from "@ant-design/nextjs-registry";

export default function KontrolLayout({ children }: { children: React.ReactNode }) {
  return <AntdRegistry>{children}</AntdRegistry>;
}
