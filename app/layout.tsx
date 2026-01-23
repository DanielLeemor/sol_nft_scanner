import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SolNFTscanner | Discover Hidden Value in Your Solana NFT Portfolio",
  description: "Scan your Solana wallet to find NFTs with traits worth more than floor price. Get detailed reports with last sale data, trait values, and transaction history.",
  keywords: ["Solana", "NFT", "Audit", "Trait", "Floor Price", "Portfolio", "Blink", "Web3"],
  authors: [{ name: "SolNFTscanner", url: "https://twitter.com/solnftscanner" }],
  openGraph: {
    title: "SolNFTscanner",
    description: "Discover hidden value in your Solana NFT portfolio",
    type: "website",
    locale: "en_US",
    siteName: "SolNFTscanner",
  },
  twitter: {
    card: "summary_large_image",
    title: "SolNFTscanner",
    description: "Discover hidden value in your Solana NFT portfolio",
    creator: "@solnftscanner",
  },
};

import AppWalletProvider from "./components/AppWalletProvider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <div className="bg-gradient"></div>
        <AppWalletProvider>{children}</AppWalletProvider>
      </body>
    </html>
  );
}
