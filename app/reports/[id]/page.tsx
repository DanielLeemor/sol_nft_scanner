"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

interface NFTAuditData {
    wallet_address: string;
    collection_name: string;
    collection_id: string;
    nft_id: string;
    nft_name: string;
    floor_price_sol: number;
    floor_price_usd?: number;
    zero_price_trait_count: number;
    highest_trait_price_sol: number;
    highest_trait_usd?: number;
    highest_trait_name: string;
    last_tx_date: string;
    last_tx_price_sol: number;
    last_sale_usd?: number;
    sol_price_at_sale?: number;
    profit_vs_floor_usd?: number;
    profit_vs_trait_usd?: number;
    last_tx_from: string;
    last_tx_to: string;
    last_tx_id: string;
    current_sol_price?: number;
    last_tx_fees_sol?: number;
}

interface ReportData {
    id: string;
    wallet_address: string;
    report_json: NFTAuditData[];
    status: string;
    created_at: string;
}

type SortField = "nft_name" | "collection_name" | "floor_price_sol" | "floor_price_usd" |
    "highest_trait_price_sol" | "last_tx_price_sol" | "profit_vs_floor_usd" | "profit_vs_trait_usd";
type SortDirection = "asc" | "desc";

export default function ReportViewerPage() {
    const params = useParams();
    const { publicKey } = useWallet();
    const reportId = params.id as string;

    const [report, setReport] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCollection, setSelectedCollection] = useState<string>("all");
    const [profitFilter, setProfitFilter] = useState<"all" | "profit" | "loss">("all");
    const [showOnlyRareTraits, setShowOnlyRareTraits] = useState(false);

    // Column Customization
    const [visibleColumns, setVisibleColumns] = useState({
        floorSol: true,
        floorUsd: true,
        bought: true,
        profitFloor: true,
        bestTrait: true,
        bestTraitUsd: false,
        profitTrait: false,
        fees: false,
        heldTime: false
    });
    const [showColumnMenu, setShowColumnMenu] = useState(false);

    // Sorting
    const [sortField, setSortField] = useState<SortField>("profit_vs_floor_usd");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    useEffect(() => {
        fetchReport();
    }, [reportId]);

    const fetchReport = async () => {
        try {
            const res = await fetch(`/api/reports/${reportId}`);
            if (!res.ok) {
                throw new Error("Report not found");
            }
            const data = await res.json();
            setReport(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load report");
        } finally {
            setLoading(false);
        }
    };

    // Get unique collections for filter dropdown
    const collections = useMemo(() => {
        if (!report?.report_json || !Array.isArray(report.report_json)) return [];
        const uniqueCollections = new Set(report.report_json.map(nft => nft.collection_name));
        return Array.from(uniqueCollections).sort();
    }, [report]);

    // Filter and sort data
    const filteredData = useMemo(() => {
        if (!report?.report_json || !Array.isArray(report.report_json)) return [];

        let data = [...report.report_json];

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            data = data.filter(nft =>
                nft.nft_name.toLowerCase().includes(query) ||
                nft.collection_name.toLowerCase().includes(query) ||
                nft.highest_trait_name.toLowerCase().includes(query)
            );
        }

        // Collection filter
        if (selectedCollection !== "all") {
            data = data.filter(nft => nft.collection_name === selectedCollection);
        }

        // Profit/Loss filter
        if (profitFilter === "profit") {
            data = data.filter(nft => (nft.profit_vs_floor_usd || 0) > 0);
        } else if (profitFilter === "loss") {
            data = data.filter(nft => (nft.profit_vs_floor_usd || 0) < 0);
        }

        // Rare traits filter
        if (showOnlyRareTraits) {
            data = data.filter(nft => nft.highest_trait_price_sol > nft.floor_price_sol);
        }

        // Sort
        data.sort((a, b) => {
            let aVal = a[sortField] ?? 0;
            let bVal = b[sortField] ?? 0;

            if (typeof aVal === "string") {
                aVal = aVal.toLowerCase();
                bVal = (bVal as string).toLowerCase();
            }

            if (sortDirection === "asc") {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });

        return data;
    }, [report, searchQuery, selectedCollection, profitFilter, showOnlyRareTraits, sortField, sortDirection]);

    // Pagination
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const paginatedData = filteredData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Summary stats
    const summaryStats = useMemo(() => {
        if (!filteredData.length) return null;

        const totalFloorUsd = filteredData.reduce((sum, nft) => sum + (nft.floor_price_usd || 0), 0);
        const totalProfitLoss = filteredData.reduce((sum, nft) => sum + (nft.profit_vs_floor_usd || 0), 0);
        const profitableCount = filteredData.filter(nft => (nft.profit_vs_floor_usd || 0) > 0).length;
        const rareTraitsCount = filteredData.filter(nft => nft.highest_trait_price_sol > nft.floor_price_sol).length;

        return {
            totalNfts: filteredData.length,
            totalFloorUsd,
            totalProfitLoss,
            profitableCount,
            rareTraitsCount,
        };
    }, [filteredData]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("desc");
        }
    };

    const formatUsd = (val: number | undefined) => {
        if (val === undefined || val === null) return "$0.00";
        return val >= 0 ? `$${val.toFixed(2)}` : `-$${Math.abs(val).toFixed(2)}`;
    };

    const formatSol = (val: number) => {
        return `${val.toFixed(3)} SOL`;
    };

    const getSortIcon = (field: SortField) => {
        if (sortField !== field) return "↕️";
        return sortDirection === "asc" ? "↑" : "↓";
    };

    if (loading) {
        return (
            <>
                <div className="bg-gradient" />
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Loading report...</p>
                </div>
                <style jsx>{styles}</style>
            </>
        );
    }

    if (error || !report) {
        return (
            <>
                <div className="bg-gradient" />
                <div className="error-container">
                    <h2>Report Not Found</h2>
                    <p>{error || "This report doesn't exist or has expired."}</p>
                    <Link href="/reports" className="btn-primary">
                        Back to Reports
                    </Link>
                </div>
                <style jsx>{styles}</style>
            </>
        );
    }

    // Check if user owns this report
    const isOwner = publicKey?.toBase58() === report.wallet_address;

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
                        <Link href="/reports" className="nav-link">My Reports</Link>
                        <WalletMultiButton />
                    </div>
                </div>
            </nav>

            <main className="main-content">
                <div className="container">
                    {/* Header */}
                    <div className="page-header">
                        <div className="header-left">
                            <Link href="/reports" className="back-link">← Back to Reports</Link>
                            <h1>Portfolio Report</h1>
                            <p className="wallet-address">
                                {report.wallet_address.slice(0, 4)}...{report.wallet_address.slice(-4)}
                            </p>
                        </div>
                        <div className="header-right">
                            <a
                                href={`/api/download?id=${reportId}`}
                                className="btn-secondary"
                            >
                                📥 Download CSV
                            </a>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    {summaryStats && (
                        <div className="summary-cards">
                            <div className="summary-card">
                                <div className="summary-value">{summaryStats.totalNfts}</div>
                                <div className="summary-label">NFTs</div>
                            </div>
                            <div className="summary-card">
                                <div className="summary-value">{formatUsd(summaryStats.totalFloorUsd)}</div>
                                <div className="summary-label">Total Floor Value</div>
                            </div>
                            <div className={`summary-card ${summaryStats.totalProfitLoss >= 0 ? 'positive' : 'negative'}`}>
                                <div className="summary-value">{formatUsd(summaryStats.totalProfitLoss)}</div>
                                <div className="summary-label">Total P/L vs Purchase</div>
                            </div>
                            <div className="summary-card">
                                <div className="summary-value">{summaryStats.profitableCount}</div>
                                <div className="summary-label">Profitable NFTs</div>
                            </div>
                            <div className="summary-card highlight">
                                <div className="summary-value">{summaryStats.rareTraitsCount}</div>
                                <div className="summary-label">Rare Traits Found</div>
                            </div>
                        </div>
                    )}

                    {/* Filters */}
                    <div className="filters-container">
                        <div className="filter-group">
                            <input
                                type="text"
                                placeholder="Search NFTs, collections, traits..."
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                className="search-input"
                            />
                        </div>

                        <div className="filter-group">
                            <select
                                value={selectedCollection}
                                onChange={(e) => { setSelectedCollection(e.target.value); setCurrentPage(1); }}
                                className="filter-select"
                            >
                                <option value="all">All Collections ({collections.length})</option>
                                {collections.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                        </div>

                        <div className="filter-group">
                            <select
                                value={profitFilter}
                                onChange={(e) => { setProfitFilter(e.target.value as any); setCurrentPage(1); }}
                                className="filter-select"
                            >
                                <option value="all">All NFTs</option>
                                <option value="profit">Profitable Only</option>
                                <option value="loss">Losses Only</option>
                            </select>
                        </div>

                        <div className="filter-group">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={showOnlyRareTraits}
                                    onChange={(e) => { setShowOnlyRareTraits(e.target.checked); setCurrentPage(1); }}
                                />
                                <span>Rare Traits Only</span>
                            </label>
                        </div>

                        <div className="filter-group relative">
                            <button
                                className="filter-select flex items-center justify-between"
                                onClick={() => setShowColumnMenu(!showColumnMenu)}
                            >
                                <span>Customize Columns</span>
                                <span>▼</span>
                            </button>
                            {showColumnMenu && (
                                <div className="column-menu">
                                    <label><input type="checkbox" checked={visibleColumns.floorSol} onChange={e => setVisibleColumns({ ...visibleColumns, floorSol: e.target.checked })} /> Floor (SOL)</label>
                                    <label><input type="checkbox" checked={visibleColumns.floorUsd} onChange={e => setVisibleColumns({ ...visibleColumns, floorUsd: e.target.checked })} /> Floor (USD)</label>
                                    <label><input type="checkbox" checked={visibleColumns.bought} onChange={e => setVisibleColumns({ ...visibleColumns, bought: e.target.checked })} /> Bought Price</label>
                                    <label><input type="checkbox" checked={visibleColumns.fees} onChange={e => setVisibleColumns({ ...visibleColumns, fees: e.target.checked })} /> Fees Paid</label>
                                    <label><input type="checkbox" checked={visibleColumns.heldTime} onChange={e => setVisibleColumns({ ...visibleColumns, heldTime: e.target.checked })} /> Time Held</label>
                                    <label><input type="checkbox" checked={visibleColumns.profitFloor} onChange={e => setVisibleColumns({ ...visibleColumns, profitFloor: e.target.checked })} /> P/L (Floor)</label>
                                    <label><input type="checkbox" checked={visibleColumns.bestTrait} onChange={e => setVisibleColumns({ ...visibleColumns, bestTrait: e.target.checked })} /> Best Trait</label>
                                    <label><input type="checkbox" checked={visibleColumns.bestTraitUsd} onChange={e => setVisibleColumns({ ...visibleColumns, bestTraitUsd: e.target.checked })} /> Best Trait ($)</label>
                                    <label><input type="checkbox" checked={visibleColumns.profitTrait} onChange={e => setVisibleColumns({ ...visibleColumns, profitTrait: e.target.checked })} /> P/L (Trait)</label>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Results count */}
                    <div className="results-info">
                        Showing {paginatedData.length} of {filteredData.length} NFTs
                    </div>

                    {/* Mobile Sort Dropdown */}
                    <div className="mobile-sort">
                        <select
                            value={`${sortField}-${sortDirection}`}
                            onChange={(e) => {
                                const [field, dir] = e.target.value.split("-");
                                setSortField(field as SortField);
                                setSortDirection(dir as SortDirection);
                            }}
                            className="filter-select"
                        >
                            <option value="profit_vs_floor_usd-desc">Sort: Highest P/L</option>
                            <option value="profit_vs_floor_usd-asc">Sort: Lowest P/L</option>
                            <option value="floor_price_usd-desc">Sort: Highest Floor</option>
                            <option value="floor_price_usd-asc">Sort: Lowest Floor</option>
                            <option value="highest_trait_price_sol-desc">Sort: Best Traits</option>
                            <option value="nft_name-asc">Sort: Name A-Z</option>
                            <option value="collection_name-asc">Sort: Collection A-Z</option>
                        </select>
                    </div>

                    {/* Mobile Card View */}
                    <div className="mobile-cards">
                        {paginatedData.map((nft, idx) => {
                            const profitLoss = nft.profit_vs_floor_usd || 0;
                            const hasRareTrait = nft.highest_trait_price_sol > nft.floor_price_sol;

                            return (
                                <div key={`mobile-${nft.nft_id}-${idx}`} className={`nft-card ${hasRareTrait ? "has-rare" : ""}`}>
                                    <div className="nft-card-header">
                                        <div className="nft-card-title">
                                            <div className="nft-card-name">{nft.nft_name}</div>
                                            <div className="nft-card-collection">{nft.collection_name}</div>
                                        </div>
                                        <div className={`nft-card-pl ${profitLoss > 0 ? 'positive' : profitLoss < 0 ? 'negative' : ''}`}>
                                            {nft.last_tx_price_sol > 0 ? formatUsd(profitLoss) : "-"}
                                        </div>
                                    </div>

                                    <div className="nft-card-stats">
                                        <div className="nft-card-stat">
                                            <span className="stat-label">Floor</span>
                                            <span className="stat-value">{formatSol(nft.floor_price_sol)}</span>
                                            <span className="stat-sub">{formatUsd(nft.floor_price_usd)}</span>
                                        </div>
                                        <div className="nft-card-stat">
                                            <span className="stat-label">Bought</span>
                                            <span className="stat-value">
                                                {nft.last_tx_price_sol > 0 ? formatSol(nft.last_tx_price_sol) : "-"}
                                            </span>
                                            <span className="stat-sub">
                                                {nft.last_tx_price_sol > 0 ? formatUsd(nft.last_sale_usd) : ""}
                                            </span>
                                        </div>
                                        {hasRareTrait && (
                                            <div className="nft-card-stat rare">
                                                <span className="stat-label">🔥 Rare Trait</span>
                                                <span className="stat-value">{formatSol(nft.highest_trait_price_sol)}</span>
                                                <span className="stat-sub trait-name">{nft.highest_trait_name}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="nft-card-actions">
                                        <a
                                            href={`https://magiceden.io/item-details/${nft.nft_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="card-action-btn"
                                        >
                                            Magic Eden
                                        </a>
                                        <a
                                            href={`https://tensor.trade/item/${nft.nft_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="card-action-btn"
                                        >
                                            Tensor
                                        </a>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Desktop Data Table */}
                    <div className="table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th onClick={() => handleSort("nft_name")} className="sortable">
                                        NFT {getSortIcon("nft_name")}
                                    </th>
                                    <th onClick={() => handleSort("collection_name")} className="sortable">
                                        Collection {getSortIcon("collection_name")}
                                    </th>
                                    {visibleColumns.floorSol && (
                                        <th onClick={() => handleSort("floor_price_sol")} className="sortable">
                                            Floor (SOL) {getSortIcon("floor_price_sol")}
                                        </th>
                                    )}
                                    {visibleColumns.floorUsd && (
                                        <th onClick={() => handleSort("floor_price_usd")} className="sortable">
                                            Floor (USD) {getSortIcon("floor_price_usd")}
                                        </th>
                                    )}
                                    {visibleColumns.bought && (
                                        <th onClick={() => handleSort("last_tx_price_sol")} className="sortable">
                                            Bought (SOL) {getSortIcon("last_tx_price_sol")}
                                        </th>
                                    )}
                                    {visibleColumns.fees && <th>Fees (SOL)</th>}
                                    {visibleColumns.heldTime && <th>Time Held</th>}
                                    {visibleColumns.profitFloor && (
                                        <th onClick={() => handleSort("profit_vs_floor_usd")} className="sortable">
                                            P/L (USD) {getSortIcon("profit_vs_floor_usd")}
                                        </th>
                                    )}
                                    {visibleColumns.bestTrait && (
                                        <th onClick={() => handleSort("highest_trait_price_sol")} className="sortable">
                                            Best Trait {getSortIcon("highest_trait_price_sol")}
                                        </th>
                                    )}
                                    {visibleColumns.bestTraitUsd && (
                                        <th onClick={() => handleSort("highest_trait_usd" as any)} className="sortable">
                                            Trait ($)
                                        </th>
                                    )}
                                    {visibleColumns.profitTrait && (
                                        <th onClick={() => handleSort("profit_vs_trait_usd")} className="sortable">
                                            P/L (Trait)
                                        </th>
                                    )}
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedData.map((nft, idx) => {
                                    const profitLoss = nft.profit_vs_floor_usd || 0;
                                    const hasRareTrait = nft.highest_trait_price_sol > nft.floor_price_sol;

                                    return (
                                        <tr key={`${nft.nft_id}-${idx}`} className={hasRareTrait ? "rare-trait-row" : ""}>
                                            <td>
                                                <div className="nft-name">{nft.nft_name}</div>
                                            </td>
                                            <td>
                                                <div className="collection-name">{nft.collection_name}</div>
                                            </td>
                                            {visibleColumns.floorSol && <td>{formatSol(nft.floor_price_sol)}</td>}
                                            {visibleColumns.floorUsd && <td>{formatUsd(nft.floor_price_usd)}</td>}
                                            {visibleColumns.bought && (
                                                <td>
                                                    {nft.last_tx_price_sol > 0 ? (
                                                        <div>
                                                            <a href={`https://solscan.io/tx/${nft.last_tx_id}`} target="_blank" rel="noopener noreferrer" className="tx-link">
                                                                {formatSol(nft.last_tx_price_sol)} ↗
                                                            </a>
                                                            <div className="sub-text">{formatUsd(nft.last_sale_usd)}</div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted">No sale data</span>
                                                    )}
                                                </td>
                                            )}
                                            {visibleColumns.fees && (
                                                <td>{nft.last_tx_fees_sol ? formatSol(nft.last_tx_fees_sol) : "-"}</td>
                                            )}
                                            {visibleColumns.heldTime && (
                                                <td>
                                                    {nft.last_tx_date ? (() => {
                                                        const days = Math.floor((new Date().getTime() - new Date(nft.last_tx_date).getTime()) / (1000 * 60 * 60 * 24));
                                                        return days > 0 ? `${days} days` : "Just now";
                                                    })() : "-"}
                                                </td>
                                            )}
                                            {visibleColumns.profitFloor && (
                                                <td>
                                                    <span className={`profit-cell ${profitLoss > 0 ? 'positive' : profitLoss < 0 ? 'negative' : ''}`}>
                                                        {nft.last_tx_price_sol > 0 ? formatUsd(profitLoss) : "-"}
                                                    </span>
                                                </td>
                                            )}
                                            {visibleColumns.bestTrait && (
                                                <td>
                                                    {hasRareTrait ? (
                                                        <div className="trait-info">
                                                            <div className="trait-price">{formatSol(nft.highest_trait_price_sol)}</div>
                                                            <div className="trait-name">{nft.highest_trait_name}</div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted">Floor</span>
                                                    )}
                                                </td>
                                            )}
                                            {visibleColumns.bestTraitUsd && (
                                                <td>{hasRareTrait ? formatUsd(nft.highest_trait_usd) : "-"}</td>
                                            )}
                                            {visibleColumns.profitTrait && (
                                                <td>
                                                    <span className={`profit-cell ${(nft.profit_vs_trait_usd || 0) > 0 ? 'positive' : (nft.profit_vs_trait_usd || 0) < 0 ? 'negative' : ''}`}>
                                                        {formatUsd(nft.profit_vs_trait_usd)}
                                                    </span>
                                                </td>
                                            )}
                                            <td>
                                                <div className="action-buttons">
                                                    <a
                                                        href={`https://magiceden.io/item-details/${nft.nft_id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="action-btn"
                                                        title="View on Magic Eden"
                                                    >
                                                        ME
                                                    </a>
                                                    <a
                                                        href={`https://tensor.trade/item/${nft.nft_id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="action-btn"
                                                        title="View on Tensor"
                                                    >
                                                        T
                                                    </a>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages >= 1 && (
                        <div className="pagination-container">
                            <div className="items-per-page">
                                <span>Show:</span>
                                <select
                                    value={itemsPerPage}
                                    onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                    className="per-page-select"
                                >
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={500}>All</option>
                                </select>
                            </div>

                            {totalPages > 1 && (
                                <div className="pagination">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="page-btn"
                                    >
                                        Previous
                                    </button>
                                    <span className="page-info">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="page-btn"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
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
        gap: 20px;
    }

    .nav-link {
        color: rgba(255, 255, 255, 0.7);
        text-decoration: none;
        font-weight: 500;
        transition: color 0.2s;
    }

    .nav-link:hover {
        color: white;
    }

    .main-content {
        padding-top: 100px;
        padding-bottom: 60px;
        min-height: 100vh;
    }

    .container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 0 24px;
    }

    .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 32px;
    }

    .back-link {
        color: var(--solana-purple);
        text-decoration: none;
        font-size: 0.9rem;
        margin-bottom: 8px;
        display: inline-block;
    }

    .back-link:hover {
        text-decoration: underline;
    }

    .page-header h1 {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 4px;
    }

    .wallet-address {
        color: var(--text-muted);
        font-family: monospace;
    }

    .btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        text-decoration: none;
        font-weight: 600;
        transition: all 0.2s;
    }

    .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: var(--solana-purple);
    }

    .summary-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 16px;
        margin-bottom: 32px;
    }

    .summary-card {
        background: var(--bg-card);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 20px;
        text-align: center;
    }

    .summary-card.positive .summary-value {
        color: var(--solana-green);
    }

    .summary-card.negative .summary-value {
        color: #ff5252;
    }

    .summary-card.highlight {
        border-color: var(--solana-purple);
        background: rgba(153, 69, 255, 0.1);
    }

    .summary-value {
        font-size: 1.75rem;
        font-weight: 700;
        margin-bottom: 4px;
    }

    .summary-label {
        color: var(--text-muted);
        font-size: 0.85rem;
    }

    .filters-container {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin-bottom: 24px;
        padding: 20px;
        background: var(--bg-card);
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .filter-group {
        flex: 1;
        min-width: 200px;
    }

    .search-input {
        width: 100%;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: white;
        font-size: 0.95rem;
    }

    .search-input:focus {
        outline: none;
        border-color: var(--solana-purple);
    }

    .filter-select {
        width: 100%;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: white;
        font-size: 0.95rem;
        cursor: pointer;
    }

    .filter-select option {
        background: var(--bg-secondary);
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding: 12px 0;
    }

    .checkbox-label input {
        width: 18px;
        height: 18px;
        accent-color: var(--solana-purple);
    }

    .results-info {
        color: var(--text-muted);
        margin-bottom: 16px;
        font-size: 0.9rem;
    }

    .table-container {
        overflow-x: auto;
        background: var(--bg-card);
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        max-height: 800px; /* Limit height to force scroll if too long */
        overflow-y: auto;
    }

    .data-table {
        width: 100%;
        border-collapse: collapse;
        position: relative;
    }
    
    .data-table thead {
        position: sticky;
        top: 0;
        z-index: 10;
        background: var(--bg-card); /* Opaque background to hide scrolling content */
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    .data-table th {
        text-align: left;
        padding: 16px;
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-secondary);
        font-weight: 600;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
        cursor: pointer;
    }

    .relative { position: relative; }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }

    .column-menu {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--bg-card);
        border: 1px solid var(--solana-purple);
        border-radius: 8px;
        padding: 12px;
        z-index: 100;
        margin-top: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }

    .column-menu label {
        display: block;
        padding: 6px 0;
        color: white;
        font-size: 0.9rem;
        cursor: pointer;
    }
    
    .column-menu input {
        margin-right: 8px;
        accent-color: var(--solana-purple);
    }

    .tx-link {
        color: var(--solana-green);
        text-decoration: none;
        font-weight: 500;
    }

    .tx-link:hover {
        text-decoration: underline;
    }
    }

    .data-table th.sortable {
        cursor: pointer;
        user-select: none;
    }

    .data-table th.sortable:hover {
        color: var(--solana-purple);
    }

    .data-table td {
        padding: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        vertical-align: middle;
    }

    .data-table tr:hover {
        background: rgba(255, 255, 255, 0.02);
    }

    .data-table tr.rare-trait-row {
        background: rgba(153, 69, 255, 0.05);
    }

    .nft-name {
        font-weight: 600;
        color: white;
    }

    .collection-name {
        color: var(--text-secondary);
    }

    .sub-text {
        font-size: 0.8rem;
        color: var(--text-muted);
    }

    .text-muted {
        color: var(--text-muted);
    }

    .profit-cell {
        font-weight: 600;
    }

    .profit-cell.positive {
        color: var(--solana-green);
    }

    .profit-cell.negative {
        color: #ff5252;
    }

    .trait-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .trait-price {
        color: var(--solana-green);
        font-weight: 600;
    }

    .trait-name {
        font-size: 0.8rem;
        color: var(--text-muted);
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .action-buttons {
        display: flex;
        gap: 8px;
    }

    .action-btn {
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        color: white;
        text-decoration: none;
        font-size: 0.8rem;
        font-weight: 600;
        transition: all 0.2s;
    }

    .action-btn:hover {
        background: var(--solana-purple);
    }

    .pagination-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 24px;
        flex-wrap: wrap;
        gap: 16px;
        padding: 0 20px;
    }

    .items-per-page {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--text-muted);
        font-size: 0.9rem;
    }

    .per-page-select {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        padding: 4px 8px;
        border-radius: 6px;
        cursor: pointer;
    }

    .per-page-select option {
        background-color: #1a1a2e; /* Hardcoded dark background for browser consistency */
        color: white;
    }

    .pagination {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 16px;
    }

    .page-btn {
        padding: 10px 20px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        color: white;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
    }

    .page-btn:hover:not(:disabled) {
        background: var(--solana-purple);
        border-color: var(--solana-purple);
    }

    .page-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .page-info {
        color: var(--text-muted);
    }

    .loading-container,
    .error-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        text-align: center;
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

    .btn-primary {
        background: linear-gradient(135deg, #9945FF 0%, #14F195 100%);
        color: white;
        padding: 12px 24px;
        border-radius: 12px;
        text-decoration: none;
        font-weight: 600;
    }

    /* Mobile sort dropdown - hidden on desktop */
    .mobile-sort {
        display: none;
        margin-bottom: 16px;
    }

    /* Mobile cards - hidden on desktop */
    .mobile-cards {
        display: none;
        flex-direction: column;
        gap: 12px;
    }

    .nft-card {
        background: var(--bg-card);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 16px;
    }

    .nft-card.has-rare {
        border-color: var(--solana-purple);
        background: linear-gradient(135deg, rgba(153, 69, 255, 0.1) 0%, rgba(20, 241, 149, 0.05) 100%);
    }

    .nft-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
    }

    .nft-card-title {
        flex: 1;
        min-width: 0;
    }

    .nft-card-name {
        font-weight: 600;
        font-size: 1rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .nft-card-collection {
        font-size: 0.85rem;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .nft-card-pl {
        font-size: 1.1rem;
        font-weight: 700;
        padding-left: 12px;
        white-space: nowrap;
    }

    .nft-card-pl.positive {
        color: var(--solana-green);
    }

    .nft-card-pl.negative {
        color: #ff5252;
    }

    .nft-card-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 12px;
    }

    .nft-card-stat {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .nft-card-stat.rare {
        grid-column: span 2;
        background: rgba(153, 69, 255, 0.15);
    }

    .nft-card-stat .stat-label {
        font-size: 0.7rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .nft-card-stat .stat-value {
        font-weight: 600;
        font-size: 0.95rem;
    }

    .nft-card-stat .stat-sub {
        font-size: 0.8rem;
        color: var(--text-muted);
    }

    .nft-card-stat .stat-sub.trait-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .nft-card-actions {
        display: flex;
        gap: 8px;
    }

    .card-action-btn {
        flex: 1;
        padding: 10px 16px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: white;
        text-decoration: none;
        font-size: 0.85rem;
        font-weight: 600;
        text-align: center;
        transition: all 0.2s;
    }

    .card-action-btn:hover {
        background: var(--solana-purple);
    }

    @media (max-width: 768px) {
        /* Show mobile elements, hide desktop */
        .mobile-sort {
            display: block;
        }

        .mobile-cards {
            display: flex;
        }

        .table-container {
            display: none;
        }

        .page-header {
            flex-direction: column;
            gap: 16px;
        }

        .header-right {
            width: 100%;
        }

        .btn-secondary {
            width: 100%;
            text-align: center;
        }

        .summary-cards {
            grid-template-columns: repeat(2, 1fr);
        }

        .summary-value {
            font-size: 1.25rem;
        }

        .filters-container {
            flex-direction: column;
        }

        .filter-group {
            min-width: 100%;
        }

        .pagination {
            flex-wrap: wrap;
        }

        .page-btn {
            padding: 8px 16px;
            font-size: 0.9rem;
        }

        .navbar .container {
            padding: 0 16px;
        }

        .nav-actions {
            gap: 8px;
        }

        .nav-link {
            display: none;
        }
    }

    @media (max-width: 480px) {
        .summary-cards {
            grid-template-columns: 1fr;
        }

        .summary-card {
            padding: 16px;
        }

        .page-header h1 {
            font-size: 1.5rem;
        }

        .nft-card-stats {
            grid-template-columns: 1fr;
        }

        .nft-card-stat.rare {
            grid-column: span 1;
        }

        .container {
            padding: 0 16px;
        }
    }
`;
