import type { Metadata } from "next";
import "@fontsource-variable/public-sans";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Central de Benefícios",
  description: "Gestão de benefícios de mobilidade: vale-transporte e fretado.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!rounded-lg !border !border-line !bg-surface !text-ink !shadow-pop !font-sans",
              description: "!text-ink-soft",
              error: "!border-bad/30",
            },
          }}
        />
      </body>
    </html>
  );
}
