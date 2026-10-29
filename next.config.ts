import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// 보안 헤더. 다른 사이트가 이 화면을 몰래 끼워 넣거나(클릭재킹), 외부 스크립트·주소로 데이터를 보내지 못하게 한다.
// 근거: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md "Without Nonces"
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // 개발 서버(http://localhost)에서는 https로 바꾸면 깨지므로 배포에서만 켠다.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 카메라·마이크·위치는 쓰지 않으므로 아예 막는다.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // 직원용 도구라 검색엔진에 올리지 않는다.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
