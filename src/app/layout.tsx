import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ImageIntakeProvider } from "@/components/intake/ImageIntakeProvider";

export const metadata: Metadata = {
  title: "Foodseyo",
  description: "AI Food Copilot for restaurant links and menu images.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFDF9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ImageIntakeProvider>{children}</ImageIntakeProvider>
      </body>
    </html>
  );
}
