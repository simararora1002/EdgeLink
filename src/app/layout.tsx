import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TRPCReactProvider } from "@/trpc/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "EdgeLink",
  description: "A tiny link shortener built for the edge",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
