import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: "Digital Leap GPOMS",
  description:
    "Digital Leap Marketing Solutions — run your guest-post operations like a pro. Projects, outreach, payments, and reporting in one branded platform.",
  applicationName: "Digital Leap GPOMS",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
