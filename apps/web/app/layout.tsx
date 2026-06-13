import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "NEET Mock Test AI",
  description: "AI-native NEET preparation platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
