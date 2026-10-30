import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./missing-asins.css";
import { GlobalDateRangeProvider } from "../components/GlobalDateRange";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CDC Sales Analytics",
  description: "Continuous product intelligence for sales and ASIN performance.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "CDC Sales Analytics",
    description: "Continuous product intelligence for sales and ASIN performance.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "CDC Sales Analytics dashboard" }],
  },
  twitter: { card: "summary_large_image", title: "CDC Sales Analytics", description: "Continuous product intelligence", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}><GlobalDateRangeProvider>{children}</GlobalDateRangeProvider></body></html>;
}
