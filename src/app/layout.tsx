import type { Metadata, Viewport } from "next";
import { Movimento } from "@/components/Movimento";
import { Sprite } from "@/components/Icones";
import "./globals.css";

export const metadata: Metadata = {
  title: "Servio",
  description: "Escala de voluntários da igreja",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Aplica tema e acento salvos antes da primeira pintura, para não piscar a cor errada.
const TEMA = `(function(d){try{var t=localStorage.getItem('ui:theme')||'light';d.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;var a=localStorage.getItem('ui:accent');if(a&&a!=='azul')d.dataset.accent=a}catch(e){}})(document.documentElement)`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA }} />
      </head>
      <body>
        <Sprite />
        {children}
        <Movimento />
      </body>
    </html>
  );
}
