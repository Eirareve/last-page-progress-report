import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { assertFirstRequestContentGate } from "../content/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "最后一页进步报告",
  description: "这句话能留给未来的我吗？",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await connection();
  await assertFirstRequestContentGate();

  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
