import type { Metadata } from "next";
import { Cairo, Tajawal } from "next/font/google";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["500", "700", "800"],
  variable: "--font-cairo",
});

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-tajawal",
});

export const metadata: Metadata = {
  title: "سوق مصر",
  description: "منصة سوق مصر — إعلانات مبوبة وسوق إلكتروني للمصريين",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body
        className={`${cairo.variable} ${tajawal.variable} font-tajawal antialiased bg-neutral-50 text-neutral-900`}
      >
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
