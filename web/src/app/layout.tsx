import type { Metadata } from "next";
import localFont from "next/font/local";
import "leaflet/dist/leaflet.css";
import "./globals.css";


const displayFont = localFont({
  src: [{ path: './fonts/Fraunces.ttf', style: 'normal', weight: '100 900' }, { path: './fonts/Fraunces-Italic.ttf', style: 'italic', weight: '100 900' }],
  variable: '--font-display', display: 'swap', preload: false,
});
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "TripWeave — Your next journey",
  description: "Plan your days, compare estimated itineraries and travel together. Explore the TripWeave field guide and start your next journey.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
