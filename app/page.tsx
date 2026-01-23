"use client";

import HeroActions from "./components/HeroActions";
import NavConnect from "./components/NavConnect";

export default function Home() {
  return (
    <>
      {/* Navigation */}
      <nav className="navbar">
        <div className="container">
          <div className="logo">
            <img src="/logo.png" alt="SolNFTscanner" className="logo-img" />
            SolNFTscanner
          </div>
          <ul className="nav-links">
            <li><a href="#how-it-works">How It Works</a></li>
            <li><a href="#pricing">Pricing</a></li>
            <li><a href="#sample">Sample Report</a></li>
            <li><a href="#faq">FAQ</a></li>
            <li><a href="/reports">My Reports</a></li>
          </ul>
          {/* Nav CTA */}
          <NavConnect />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <div className="hero-badge">
                <span className="dot"></span>
                Powered by Solana Actions
              </div>
              <h1>
                Discover <span className="gradient-text">Hidden Value</span> in Your NFT Portfolio
              </h1>
              <p className="hero-description">
                Scan your Solana wallet to find NFTs with traits worth more than floor price.
                Get detailed reports with last sale data, trait values, and transaction history.
              </p>
              <HeroActions />
            </div>

            <div className="hero-visual">
              <div className="hero-card">
                <div className="hero-card-header">
                  <span className="hero-card-title">Portfolio Snapshot</span>
                  <div className="status-badge">
                    <span className="dot"></span>
                    Live
                  </div>
                </div>
                <div className="nft-grid">
                  <div className="nft-item">
                    <span className="nft-item-icon">🦁</span>
                    <span className="nft-item-label">DeGods</span>
                  </div>
                  <div className="nft-item">
                    <span className="nft-item-icon">😎</span>
                    <span className="nft-item-label">Mad Lads</span>
                  </div>
                  <div className="nft-item">
                    <span className="nft-item-icon">🤖</span>
                    <span className="nft-item-label">Tensorians</span>
                  </div>
                  <div className="nft-item">
                    <span className="nft-item-icon">🐵</span>
                    <span className="nft-item-label">SMB</span>
                  </div>
                  <div className="nft-item">
                    <span className="nft-item-icon">🎭</span>
                    <span className="nft-item-label">Okay Bears</span>
                  </div>
                  <div className="nft-item">
                    <span className="nft-item-icon">✨</span>
                    <span className="nft-item-label">More...</span>
                  </div>
                </div>
                <div className="hero-card-stats">
                  <div className="stat-item">
                    <div className="stat-value">47</div>
                    <div className="stat-label">NFTs Found</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">6</div>
                    <div className="stat-label">Collections</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">12</div>
                    <div className="stat-label">Rare Traits</div>
                  </div>
                </div>
              </div>

              <div className="float-element float-element-1">
                <span style={{ marginRight: '8px' }}>🔥</span>
                <span style={{ color: 'var(--solana-green)' }}>+120 SOL</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>hidden value</span>
              </div>

              <div className="float-element float-element-2">
                <span style={{ marginRight: '8px' }}>⚡</span>
                <span>Trait: Gold BG</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="section">
        <div className="container">
          <div className="section-header">
            <span className="section-label">How It Works</span>
            <h2 className="section-title">Three Simple Steps</h2>
            <p className="section-description">
              Get a comprehensive audit of your NFT portfolio in under a minute
            </p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3 className="step-title">Connect</h3>
              <p className="step-description">
                Enter your wallet address or connect directly. We&apos;ll scan all your NFT holdings using Helius DAS API.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">2</div>
              <h3 className="step-title">Select</h3>
              <p className="step-description">
                Choose which collections to audit. See the total NFT count and price before paying.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">3</div>
              <h3 className="step-title">Get Report</h3>
              <p className="step-description">
                Receive a detailed CSV with trait floors, last sale data, and hidden value opportunities.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="section pricing-section">
        <div className="container">
          <div className="section-header">
            <span className="section-label">Pricing</span>
            <h2 className="section-title">Simple, Transparent Pricing</h2>
            <p className="section-description">
              Pay based on the number of NFTs you want to audit. No subscriptions, no hidden fees.
            </p>
          </div>

          <div className="pricing-table">
            <div className="pricing-header">
              <span>NFT Count</span>
              <span>Price</span>
            </div>
            <div className="pricing-row">
              <span className="pricing-tier">1 - 20 NFTs</span>
              <span className="pricing-amount">0.02 SOL</span>
            </div>
            <div className="pricing-row">
              <span className="pricing-tier">21 - 100 NFTs</span>
              <span className="pricing-amount">0.05 SOL</span>
            </div>
            <div className="pricing-row">
              <span className="pricing-tier">Every +100 NFTs</span>
              <span className="pricing-amount">+0.05 SOL</span>
            </div>
          </div>
        </div>
      </section>

      {/* Sample Report Section */}
      <section id="sample" className="section sample-section">
        <div className="container">
          <div className="section-header">
            <span className="section-label">Sample Report</span>
            <h2 className="section-title">What You&apos;ll Get</h2>
            <p className="section-description">
              A comprehensive CSV file with detailed information for each NFT in your portfolio
            </p>
          </div>

          <div className="sample-table-wrapper">
            <table className="sample-table">
              <thead>
                <tr>
                  <th>Collection</th>
                  <th>NFT Name</th>
                  <th>Floor Price</th>
                  <th>Highest Trait</th>
                  <th>Trait Price</th>
                  <th>Unlisted Traits</th>
                  <th>Last Sale</th>
                  <th>Sale Date</th>
                  <th>From / To</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>DeGods</td>
                  <td>DeGod #1234</td>
                  <td>45.5 SOL</td>
                  <td>Background: Gold</td>
                  <td className="highlight">120.0 SOL</td>
                  <td>2</td>
                  <td>52.3 SOL</td>
                  <td>Jan 15, 2026</td>
                  <td className="wallet-cell">4xK9...7mPq → You</td>
                </tr>
                <tr>
                  <td>DeGods</td>
                  <td>DeGod #5678</td>
                  <td>45.5 SOL</td>
                  <td>Eyes: Laser</td>
                  <td className="highlight">48.2 SOL</td>
                  <td>0</td>
                  <td>46.1 SOL</td>
                  <td>Jan 10, 2026</td>
                  <td className="wallet-cell">Magic Eden → You</td>
                </tr>
                <tr>
                  <td>Mad Lads</td>
                  <td>Mad Lad #420</td>
                  <td>12.3 SOL</td>
                  <td>Hat: Crown</td>
                  <td className="highlight">15.8 SOL</td>
                  <td>1</td>
                  <td>13.0 SOL</td>
                  <td>Jan 12, 2026</td>
                  <td className="wallet-cell">Tensor → You</td>
                </tr>
                <tr>
                  <td>Mad Lads</td>
                  <td>Mad Lad #069</td>
                  <td>12.3 SOL</td>
                  <td>No traits found</td>
                  <td>0 SOL</td>
                  <td>5</td>
                  <td>12.5 SOL</td>
                  <td>Jan 8, 2026</td>
                  <td className="wallet-cell">8zR3...nQ2w → You</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="section faq-section">
        <div className="container">
          <div className="section-header">
            <span className="section-label">FAQ</span>
            <h2 className="section-title">Frequently Asked Questions</h2>
          </div>

          <div className="faq-grid">
            <div className="faq-item">
              <h3 className="faq-question">What data do I get?</h3>
              <p className="faq-answer">
                A CSV file with floor prices, trait values, last sale prices, and transaction history
                for each NFT in your selected collections.
              </p>
            </div>

            <div className="faq-item">
              <h3 className="faq-question">Is my wallet safe?</h3>
              <p className="faq-answer">
                Yes. We only request a payment transaction — we never have access to your NFTs or
                private keys. All scanning is read-only.
              </p>
            </div>

            <div className="faq-item">
              <h3 className="faq-question">How long does it take?</h3>
              <p className="faq-answer">
                Usually under 30 seconds after payment confirms, depending on the number of NFTs
                and collections being analyzed.
              </p>
            </div>

            <div className="faq-item">
              <h3 className="faq-question">What if I have issues?</h3>
              <p className="faq-answer">
                DM <a href="https://twitter.com/solnftscanner" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--solana-purple)' }}>@solnftscanner</a> on Twitter for support.
                We typically respond within a few hours.
              </p>
            </div>

            <div className="faq-item">
              <h3 className="faq-question">Which marketplaces do you track?</h3>
              <p className="faq-answer">
                We use Magic Eden for listing data and trait floor calculations. Last sale data
                comes from Helius Enhanced Transactions API and includes all major marketplaces.
              </p>
            </div>

            <div className="faq-item">
              <h3 className="faq-question">How often can I scan?</h3>
              <p className="faq-answer">
                Scans are rate-limited to once every 5 minutes per wallet. After payment,
                your report is cached for 24 hours for re-download.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-left">
              <span className="footer-logo">SolNFTscanner</span>
              <span className="footer-text">© 2026 SolNFTscanner. All rights reserved.</span>
            </div>
            <div className="footer-links">
              <a href="https://twitter.com/solnftscanner" target="_blank" rel="noopener noreferrer">
                <svg className="twitter-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @solnftscanner
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
