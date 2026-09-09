import type { Metadata } from "next";
import "./globals.css";
import { ShopProvider } from "@/components/shop-provider";
export const metadata: Metadata = {
  title: "Recursos da Tia Cris | Aprender pode ser uma brincadeira",
  description:
    "Recursos pedagógicos feitos à mão para transformar pequenas brincadeiras em grandes descobertas. Conheça o catálogo da Tia Cris.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <ShopProvider>{children}</ShopProvider>
      </body>
    </html>
  );
}
