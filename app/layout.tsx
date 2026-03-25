import "./globals.css";
import "leaflet/dist/leaflet.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Investor Homebase",
  description: "Zillow-like search and investor analytics for U.S. properties",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <div className="brand">
              <div className="brand-mark">IH</div>
              <div>
                <div className="brand-title">Investor Homebase</div>
                <div className="brand-subtitle">U.S. real estate insights for investors</div>
              </div>
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container">
            <span>Data sources and formulas documented in README.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
