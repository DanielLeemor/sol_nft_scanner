"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import NavConnect from "../components/NavConnect";

const WalletMultiButtonDynamic = dynamic(
    // ... (keep this for the connect prompt below)
    async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
    { ssr: false }
);

interface Report {
    id: string;
    wallet_address: string;
    status: string;
    created_at: string;
    nft_count: number;
    is_expired: boolean;
    pending_mints?: string[];
}

export default function MyReportsPage() {
    const { publicKey, connected } = useWallet();
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (connected && publicKey) {
            fetchReports();
        } else {
            setReports([]);
        }
    }, [connected, publicKey]);

    // Auto-process loop
    useEffect(() => {
        const processNextBatch = async () => {
            const reportToProcess = reports.find(r =>
                r.status === "processing" && !processingIds.has(r.id)
            );

            if (!reportToProcess) return;

            setProcessingIds(prev => new Set(prev).add(reportToProcess.id));

            try {
                const res = await fetch("/api/reports/process", {
                    method: "POST",
                    body: JSON.stringify({ reportId: reportToProcess.id })
                });

                if (res.ok) {
                    await fetchReports(); // Refresh data
                }
            } catch (err) {
                console.error("Batch error:", err);
            } finally {
                setProcessingIds(prev => {
                    const next = new Set(prev);
                    next.delete(reportToProcess.id);
                    return next;
                });
            }
        };

        if (reports.some(r => r.status === "processing")) {
            const timer = setTimeout(processNextBatch, 1000);
            return () => clearTimeout(timer);
        }
    }, [reports, processingIds]);

    const fetchReports = async () => {
        if (!publicKey) return;

        // Only show spinner on initial load, not for refreshes
        if (reports.length === 0) setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/reports?wallet=${publicKey.toBase58()}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch reports");
            }

            setReports(data.reports || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error fetching reports");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();

        if (!window.confirm("Are you sure you want to delete this report?")) {
            return;
        }

        try {
            const res = await fetch(`/api/reports?id=${id}`, {
                method: "DELETE"
            });

            if (res.ok) {
                // Optimistic update
                setReports(prev => prev.filter(r => r.id !== id));
            } else {
                alert("Failed to delete report");
            }
        } catch (err) {
            console.error("Delete error:", err);
            alert("Error deleting report");
        }
    };

    // ... formatDate and getStatusBadge unchanged ...
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    };

    const getStatusBadge = (status: string, isExpired: boolean) => {
        if (isExpired) {
            return <span className="status-badge expired">Expired</span>;
        }
        switch (status) {
            case "complete":
                return <span className="status-badge complete">Complete</span>;
            case "partial":
                return <span className="status-badge partial">Partial</span>;
            case "processing":
                return <span className="status-badge processing">Processing...</span>;
            case "failed":
                return <span className="status-badge failed">Failed</span>;
            default:
                return <span className="status-badge">{status}</span>;
        }
    };

    return (
        <>
            <div className="bg-gradient" />
            {/* ... navbar unchanged ... */}
            <nav className="navbar">
                <div className="container">
                    <Link href="/" className="logo">
                        <img src="/logo.png" alt="SolNFTscanner" className="logo-img" />
                        <span className="logo-text">SolNFTscanner</span>
                    </Link>
                    <ul className="nav-links">
                        <li><Link href="/#how-it-works">How It Works</Link></li>
                        <li><Link href="/#pricing">Pricing</Link></li>
                        <li><Link href="/#sample">Sample Report</Link></li>
                        <li><Link href="/#faq">FAQ</Link></li>
                        <li><Link href="/reports">My Reports</Link></li>
                    </ul>
                    <NavConnect />
                </div>
            </nav>

            <main className="reports-page">
                <div className="container">
                    <div className="reports-header">
                        <h1>My Reports</h1>
                        <p>View and download your previous NFT audit reports</p>
                    </div>

                    {!connected ? (
                        <div className="connect-prompt">
                            <div className="connect-card">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                <h3>Connect Your Wallet</h3>
                                <p>Connect your wallet to view your audit history</p>
                                <WalletMultiButtonDynamic style={{
                                    background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    padding: '0 32px',
                                    height: '52px',
                                    borderRadius: '12px',
                                    marginTop: '16px'
                                }} />
                            </div>
                        </div>
                    ) : loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>Loading your reports...</p>
                        </div>
                    ) : error ? (
                        <div className="error-state">
                            <p>{error}</p>
                            <button onClick={fetchReports} className="btn-secondary">
                                Try Again
                            </button>
                        </div>
                    ) : reports.length === 0 ? (
                        <div className="empty-state">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                            </svg>
                            <h3>No Reports Yet</h3>
                            <p>You haven&apos;t generated any audit reports yet.</p>
                            <Link href="/" className="btn-primary">
                                Start Your First Audit
                            </Link>
                        </div>
                    ) : (
                        <div className="reports-grid">
                            {reports.map((report) => {
                                const total = report.nft_count;
                                const pendingCount = report.pending_mints?.length || 0;
                                const processedCount = total - pendingCount;
                                const progress = total > 0 ? (processedCount / total) * 100 : 0;

                                return (
                                    <div key={report.id} className={`report-card ${report.is_expired ? "expired" : ""}`}>
                                        <div className="report-card-header">
                                            <div className="status-container">
                                                {getStatusBadge(report.status, report.is_expired)}
                                                <span className="report-date">{formatDate(report.created_at)}</span>
                                            </div>

                                            {!report.is_expired && (
                                                <button
                                                    className="btn-delete"
                                                    onClick={(e) => handleDelete(e, report.id)}
                                                    title="Delete Report"
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="3 6 5 6 21 6"></polyline>
                                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                        <line x1="10" y1="11" x2="10" y2="17"></line>
                                                        <line x1="14" y1="11" x2="14" y2="17"></line>
                                                    </svg>
                                                </button>
                                            )}
                                        </div>

                                        <div className="report-card-body">
                                            <div className="report-stat">
                                                <span className="stat-value">{processedCount} / {total}</span>
                                                <span className="stat-label">NFTs Processed</span>
                                            </div>

                                            {report.status === "processing" && (
                                                <div className="progress-container">
                                                    <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="report-card-footer">
                                            {report.is_expired ? (
                                                <span className="expired-text">Report expired after 24 hours</span>
                                            ) : report.status === "complete" || (report.status === "partial" && processedCount > 0) ? (
                                                <a
                                                    href={`/api/download?id=${report.id}`}
                                                    className="btn-download"
                                                    download
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                        <polyline points="7 10 12 15 17 10" />
                                                        <line x1="12" y1="15" x2="12" y2="3" />
                                                    </svg>
                                                    Download CSV
                                                </a>
                                            ) : (
                                                <span className="pending-text">Processing your data...</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="back-link">
                        <Link href="/">← Back to Home</Link>
                    </div>
                </div>
            </main>

            <style jsx>{`
                .reports-page {
                    min-height: 100vh;
                    padding: 120px 0 60px;
                }

                .reports-header {
                    text-align: center;
                    margin-bottom: 48px;
                }

                .reports-header h1 {
                    font-size: 2.5rem;
                    font-weight: 700;
                    margin-bottom: 8px;
                    background: linear-gradient(135deg, #9945FF 0%, #14F195 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .reports-header p {
                    color: var(--text-secondary);
                    font-size: 1.125rem;
                }

                .connect-prompt, .loading-state, .error-state, .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    padding: 60px 20px;
                }

                .connect-card {
                    background: var(--bg-card);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    padding: 48px;
                    max-width: 400px;
                }

                .connect-card svg, .empty-state svg {
                    color: var(--solana-purple);
                    margin-bottom: 24px;
                }

                .connect-card h3, .empty-state h3 {
                    font-size: 1.5rem;
                    font-weight: 600;
                    margin-bottom: 8px;
                }

                .connect-card p, .empty-state p {
                    color: var(--text-secondary);
                    margin-bottom: 24px;
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: var(--solana-purple);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 16px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .reports-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 24px;
                }

                .report-card {
                    background: var(--bg-card);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 24px;
                    transition: all 0.3s ease;
                }

                .report-card:hover:not(.expired) {
                    border-color: var(--solana-purple);
                    transform: translateY(-4px);
                }

                .report-card.expired {
                    opacity: 0.6;
                }

                .report-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 20px;
                }

                .status-container {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .btn-delete {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 8px;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .btn-delete:hover {
                    color: #ff5252;
                    background: rgba(255, 82, 82, 0.1);
                    transform: scale(1.1);
                }

                .status-badge {
                    padding: 4px 12px;
                    border-radius: 100px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                }

                .status-badge.complete {
                    background: rgba(20, 241, 149, 0.15);
                    color: var(--solana-green);
                }

                .status-badge.partial {
                    background: rgba(255, 193, 7, 0.15);
                    color: #ffc107;
                }

                .status-badge.processing {
                    background: rgba(153, 69, 255, 0.15);
                    color: var(--solana-purple);
                }
                
                .progress-container {
                    width: 100%;
                    height: 8px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 4px;
                    margin-top: 20px;
                    overflow: hidden;
                }

                .progress-bar {
                    height: 100%;
                    background: linear-gradient(90deg, #9945FF 0%, #14F195 100%);
                    transition: width 0.5s ease;
                }

                .report-card.expired {
                    opacity: 0.6;
                }

                .report-stat .stat-value {
                    display: block;
                    font-size: 2.5rem;
                    font-weight: 700;
                    background: linear-gradient(135deg, #9945FF 0%, #14F195 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .report-stat .stat-label {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .report-card-footer {
                    padding-top: 20px;
                    text-align: center;
                }

                .btn-download {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #9945FF 0%, #14F195 100%);
                    border-radius: 10px;
                    color: white;
                    font-weight: 600;
                    text-decoration: none;
                    transition: all 0.3s ease;
                }

                .btn-download:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 30px rgba(153, 69, 255, 0.3);
                }

                .expired-text, .pending-text {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                }

                .back-link {
                    text-align: center;
                    margin-top: 48px;
                }

                .back-link a {
                    color: var(--text-secondary);
                    text-decoration: none;
                    transition: color 0.3s ease;
                }

                .back-link a:hover {
                    color: var(--solana-purple);
                }

                .error-state {
                    color: #ff5252;
                }
            `}</style>
        </>
    );
}
