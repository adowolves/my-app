import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // 직원용 도구라 검색엔진에 올리지 않는다(next.config.ts의 X-Robots-Tag와 같은 뜻).
  robots: { index: false, follow: false },
  title: "새출발 상담카드",
  description: "새출발기금 상담 직원용 공개 FAQ 추천과 사내 LLM 질문문 복사",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
