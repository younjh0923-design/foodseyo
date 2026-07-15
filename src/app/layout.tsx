import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PassportProvider } from "@/components/passport/PassportProvider";

export const metadata: Metadata = {
  title: "Foodseyo",
  description: "Understand the menu. Order with confidence.",
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
        <PassportProvider>{children}</PassportProvider>
      </body>
    </html>
  );
}
