"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

interface Transaction {
    signature: string;
    wallet_address: string;
    amount_paid: number;
    nft_count: number;
    report_id: string;
    created_at: string;
}

interface DailyStats {
    date: string;
    revenue: number;
    transactions: number;
    nfts_processed: number;
}

interface AdminStats {
    totalRevenue: number;
    totalTransactions: number;
    totalNftsProcessed: number;
    totalUniqueWallets: number;
    recentTransactions: Transaction[];
    dailyStats: DailyStats[];
    averageOrderValue: number;
    averageNftsPerOrder: number;
}

export default function AdminDashboardPage() {
    const { publicKey, connected } = useWallet();
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

    useEffect(() => {
        if (connected && publicKey) {
            checkAuthorization();
        } else {
            setIsAuthorized(false);
            setLoading(false);
        }
    }, [connected, publicKey]);

    useEffect(() => {
        if (isAuthorized) {
            fetchStats();
        }
    }, [isAuthorized, dateRange]);

    const checkAuthorization = async () => {
        try {
            const res = await fetch("/api/admin/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wallet: publicKey?.toBase58() }),
            });
            
            if (res.ok) {
                setIsAuthorized(true);
            } else {
                setIsAuthorized(false);
                setError("Not authorized. Please connect with the treasury wallet.");
            }
        } catch (err) {
            setError("Failed to verify authorization");
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/admin/stats?range=${dateRange}`, {
                headers: {
                    "x-wallet-address": publicKey?.toBase58() || "",
                },
            });
            if (!res.ok) throw new Error("Failed to fetch stats");
            const data = await res.json();
            setStats(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load stats");
        } finally {
            setLoading(false);
        }
    };

    const formatSol = (val: number) => `${val.toFixed(4)} SOL`;
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const formatShortDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    // Calculate max revenue for chart scaling
    const maxDailyRevenue = useMemo(() => {
        if (!stats?.dailyStats) return 1;
        return Math.max(...stats.dailyStats.map(d => d.revenue), 0.01);
    }, [stats]);

    if (!connected) {
        return (
            <>
                <div className="bg-gradient" />
                <div className="auth-container">
                    <div className="auth-card">
                        <div className="auth-icon">🔒</div>
                        <h1>Admin Dashboard</h1>
                        <p>Connect your treasury wallet to access the admin dashboard.</p>
                        <div className="wallet-button-container">
                            <WalletMultiButton />
                        </div>
                    </div>
                </div>
                <style jsx>{styles}</style>
            </>
        );
    }

    if (loading) {
        return (
            <>
                <div className="bg-gradient" />
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Loading dashboard...</p>
                </div>
                <style jsx>{styles}</style>
            </>
        );
    }

    if (!isAuthorized) {
        return (
            <>
                <div className="bg-gradient" />
                <div className="auth-container">
                    <div className="auth-card error">
                        <div className="auth-icon">⛔</div>
                        <h1>Access Denied</h1>
                        <p>This wallet is not authorized to access the admin dashboard.</p>
                        <p className="wallet-info">
                            Connected: {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
                        </p>
                        <Link href="/" className="btn-primary">
                            Back to Home
                        </Link>
                    </div>
                </div>
                <style jsx>{styles}</style>
            </>
        );
    }

    return (
        <>
            <div className="bg-gradient" />
            
            {/* Navigation */}
            <nav className="navbar">
                <div className="container">
                    <Link href="/" className="logo">
                        <img src="/logo.png" alt="SolNFTscanner" className="logo-img" />
                        <span className="logo-text">SolNFTscanner</span>
                    </Link>
                    <div className="nav-actions">
                        <span className="admin-badge">Admin</span>
                        <WalletMultiButton />
                    </div>
                </div>
            </nav>

            <main className="main-content">
                <div className="container">
                    {/* Header */}
                    <div className="page-header">
                        <div>
                            <h1>Revenue Dashboard</h1>
                            <p className="subtitle">Track your SolNFTscanner earnings</p>
                        </div>
                        <div className="date-range-selector">
                            {(["7d", "30d", "90d", "all"] as const).map(range => (
                                <button
                                    key={range}
                                    className={`range-btn ${dateRange === range ? "active" : ""}`}
                                    onClick={() => setDateRange(range)}
                                >
                                    {range === "all" ? "All Time" : range.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    {stats && (
                        <>
                            {/* Main Stats */}
                            <div className="stats-grid">
                                <div className="stat-card primary">
                                    <div className="stat-icon">💰</div>
                                    <div className="stat-content">
                                        <div className="stat-value">{formatSol(stats.totalRevenue)}</div>
                                        <div className="stat-label">Total Revenue</div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">📊</div>
                                    <div className="stat-content">
                                        <div className="stat-value">{stats.totalTransactions}</div>
                                        <div className="stat-label">Total Orders</div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">🖼️</div>
                                    <div className="stat-content">
                                        <div className="stat-value">{stats.totalNftsProcessed.toLocaleString()}</div>
                                        <div className="stat-label">NFTs Processed</div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">👛</div>
                                    <div className="stat-content">
                                        <div className="stat-value">{stats.totalUniqueWallets}</div>
                                        <div className="stat-label">Unique Customers</div>
                                    </div>
                                </div>
                            </div>

                            {/* Secondary Stats */}
                            <div className="stats-row">
                                <div className="mini-stat">
                                    <span className="mini-label">Avg Order Value</span>
                                    <span className="mini-value">{formatSol(stats.averageOrderValue)}</span>
                                </div>
                                <div className="mini-stat">
                                    <span className="mini-label">Avg NFTs/Order</span>
                                    <span className="mini-value">{stats.averageNftsPerOrder.toFixed(1)}</span>
                                </div>
                            </div>

                            {/* Revenue Chart */}
                            <div className="chart-section">
                                <h2>Daily Revenue</h2>
                                <div className="chart-container">
                                    {stats.dailyStats.length > 0 ? (
                                        <div className="bar-chart">
                                            {stats.dailyStats.slice(-30).map((day, idx) => (
                                                <div key={day.date} className="bar-wrapper">
                                                    <div 
                                                        className="bar"
                                                        style={{ 
                                                            height: `${(day.revenue / maxDailyRevenue) * 100}%`,
                                                            minHeight: day.revenue > 0 ? "4px" : "0"
                                                        }}
                                                        title={`${formatShortDate(day.date)}: ${formatSol(day.revenue)} (${day.transactions} orders)`}
                                                    />
                                                    {idx % 5 === 0 && (
                                                        <span className="bar-label">{formatShortDate(day.date)}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="no-data">No data for selected period</div>
                                    )}
                                </div>
                            </div>

                            {/* Recent Transactions */}
                            <div className="transactions-section">
                                <h2>Recent Transactions</h2>
                                <div className="table-container">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Wallet</th>
                                                <th>NFTs</th>
                                                <th>Amount</th>
                                                <th>TX</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.recentTransactions.map((tx) => (
                                                <tr key={tx.signature}>
                                                    <td>{formatDate(tx.created_at)}</td>
                                                    <td className="wallet-cell">
                                                        <a 
                                                            href={`https://solscan.io/account/${tx.wallet_address}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            {tx.wallet_address.slice(0, 4)}...{tx.wallet_address.slice(-4)}
                                                        </a>
                                                    </td>
                                                    <td>{tx.nft_count}</td>
                                                    <td className="amount-cell">{formatSol(tx.amount_paid)}</td>
                                                    <td>
                                                        <a 
                                                            href={`https://solscan.io/tx/${tx.signature}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="tx-link"
                                                        >
                                                            View
                                                        </a>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </main>

            <style jsx>{styles}</style>
        </>
    );
}

const styles = `
    .navbar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        padding: 16px 24px;
        background: rgba(10, 10, 15, 0.8);
        backdrop-filter: blur(20px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .navbar .container {
        max-width: 1400px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .logo {
        display: flex;
        align-items: center;
        gap: 12px;
        text-decoration: none;
    }

    .logo-img {
        width: 40px;
        height: 40px;
    }

    .logo-text {
        font-size: 1.25rem;
        font-weight: 700;
        color: white;
    }

    .nav-actions {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .admin-badge {
        background: linear-gradient(135deg, #9945FF 0%, #14F195 100%);
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
    }

    .main-content {
        padding-top: 100px;
        padding-bottom: 60px;
        min-height: 100vh;
    }

    .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 24px;
    }

    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 32px;
        flex-wrap: wrap;
        gap: 16px;
    }

    .page-header h1 {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 4px;
    }

    .subtitle {
        color: var(--text-muted);
    }

    .date-range-selector {
        display: flex;
        gap: 8px;
        background: var(--bg-card);
        padding: 4px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .range-btn {
        padding: 8px 16px;
        background: transparent;
        border: none;
        border-radius: 8px;
        color: var(--text-secondary);
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
    }

    .range-btn:hover {
        color: white;
    }

    .range-btn.active {
        background: var(--solana-purple);
        color: white;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 20px;
        margin-bottom: 24px;
    }

    .stat-card {
        background: var(--bg-card);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 24px;
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .stat-card.primary {
        background: linear-gradient(135deg, rgba(153, 69, 255, 0.2) 0%, rgba(20, 241, 149, 0.1) 100%);
        border-color: var(--solana-purple);
    }

    .stat-icon {
        font-size: 2rem;
    }

    .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 4px;
    }

    .stat-label {
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    .stats-row {
        display: flex;
        gap: 24px;
        margin-bottom: 32px;
        flex-wrap: wrap;
    }

    .mini-stat {
        background: var(--bg-card);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 16px 24px;
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .mini-label {
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    .mini-value {
        font-weight: 600;
        color: var(--solana-green);
    }

    .chart-section {
        background: var(--bg-card);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 32px;
    }

    .chart-section h2 {
        font-size: 1.25rem;
        margin-bottom: 20px;
    }

    .chart-container {
        height: 200px;
        position: relative;
    }

    .bar-chart {
        display: flex;
        align-items: flex-end;
        height: 100%;
        gap: 4px;
        padding-bottom: 24px;
    }

    .bar-wrapper {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        position: relative;
    }

    .bar {
        width: 100%;
        max-width: 20px;
        background: linear-gradient(180deg, #9945FF 0%, #14F195 100%);
        border-radius: 4px 4px 0 0;
        transition: all 0.3s ease;
        cursor: pointer;
        margin-top: auto;
    }

    .bar:hover {
        opacity: 0.8;
        transform: scaleY(1.02);
    }

    .bar-label {
        position: absolute;
        bottom: 0;
        font-size: 0.7rem;
        color: var(--text-muted);
        white-space: nowrap;
    }

    .no-data {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-muted);
    }

    .transactions-section {
        background: var(--bg-card);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 24px;
    }

    .transactions-section h2 {
        font-size: 1.25rem;
        margin-bottom: 20px;
    }

    .table-container {
        overflow-x: auto;
    }

    .data-table {
        width: 100%;
        border-collapse: collapse;
    }

    .data-table th {
        text-align: left;
        padding: 12px 16px;
        color: var(--text-muted);
        font-weight: 600;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .data-table td {
        padding: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .wallet-cell a {
        color: var(--solana-purple);
        text-decoration: none;
        font-family: monospace;
    }

    .wallet-cell a:hover {
        text-decoration: underline;
    }

    .amount-cell {
        font-weight: 600;
        color: var(--solana-green);
    }

    .tx-link {
        color: var(--text-secondary);
        text-decoration: none;
        padding: 4px 12px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        font-size: 0.85rem;
    }

    .tx-link:hover {
        background: var(--solana-purple);
        color: white;
    }

    .auth-container {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 24px;
    }

    .auth-card {
        background: var(--bg-card);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        padding: 48px;
        text-align: center;
        max-width: 400px;
    }

    .auth-card.error {
        border-color: #ff5252;
    }

    .auth-icon {
        font-size: 4rem;
        margin-bottom: 24px;
    }

    .auth-card h1 {
        font-size: 1.5rem;
        margin-bottom: 12px;
    }

    .auth-card p {
        color: var(--text-secondary);
        margin-bottom: 24px;
    }

    .wallet-info {
        font-family: monospace;
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    .wallet-button-container {
        display: flex;
        justify-content: center;
    }

    .btn-primary {
        display: inline-block;
        background: linear-gradient(135deg, #9945FF 0%, #14F195 100%);
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        text-decoration: none;
        font-weight: 600;
    }

    .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        gap: 16px;
    }

    .loading-spinner {
        width: 48px;
        height: 48px;
        border: 3px solid rgba(255, 255, 255, 0.1);
        border-top-color: var(--solana-purple);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
        .page-header {
            flex-direction: column;
            align-items: flex-start;
        }

        .page-header h1 {
            font-size: 1.5rem;
        }

        .date-range-selector {
            width: 100%;
            justify-content: space-between;
        }

        .range-btn {
            padding: 8px 12px;
            font-size: 0.85rem;
        }

        .stats-grid {
            grid-template-columns: 1fr 1fr;
        }

        .stat-card {
            padding: 16px;
        }

        .stat-value {
            font-size: 1.25rem;
        }

        .stat-icon {
            font-size: 1.5rem;
        }

        .stats-row {
            flex-direction: column;
        }

        .mini-stat {
            width: 100%;
            justify-content: space-between;
        }

        .bar-label {
            display: none;
        }

        .chart-section,
        .transactions-section {
            padding: 16px;
        }

        .data-table {
            font-size: 0.8rem;
        }

        .data-table th,
        .data-table td {
            padding: 10px 8px;
        }

        .data-table th:nth-child(3),
        .data-table td:nth-child(3) {
            display: none;
        }

        .navbar .container {
            padding: 0 16px;
        }

        .admin-badge {
            font-size: 0.65rem;
            padding: 4px 8px;
        }
    }

    @media (max-width: 480px) {
        .stats-grid {
            grid-template-columns: 1fr;
        }

        .stat-card {
            flex-direction: column;
            text-align: center;
            gap: 8px;
        }

        .data-table th:nth-child(2),
        .data-table td:nth-child(2) {
            display: none;
        }

        .auth-card {
            padding: 32px 24px;
        }

        .auth-icon {
            font-size: 3rem;
        }
    }
`;
