import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MagnifyingGlass, ShieldCheck, CaretDown, DownloadSimple, Sparkle, Eye, ShieldCheckered, Key, X, Copy, CheckCircle } from '@phosphor-icons/react';
import { OrganizationSwitcher, UserButton } from '@clerk/clerk-react';
import { useModeStore, countSuppressedBlocks } from '../../store/modeStore';
import { useIsDev } from '../../store/audienceStore';
import EnforcementOnboardingModal from '../common/EnforcementOnboardingModal';
import { exportPostureReportDocx } from './ExportMenu';

const IS_PROD_APP = import.meta.env.VITE_APP_MODE === 'production';

function ApiKeysModal({ open, onClose }) {
    const [copied, setCopied] = useState(null);
    if (!open) return null;
    const copy = async (cmd) => {
        try {
            await navigator.clipboard.writeText(cmd);
            setCopied(cmd);
            setTimeout(() => setCopied(null), 1200);
        } catch {}
    };
    const Cmd = ({ children }) => (
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 group">
            <code className="text-[12px] font-mono text-slate-700 dark:text-slate-300 flex-1 break-all">{children}</code>
            <button
                onClick={() => copy(children)}
                className="text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-blue-500 cursor-pointer bg-transparent border border-slate-300 dark:border-slate-700 hover:border-blue-500 px-2 py-0.5 transition-colors"
            >
                {copied === children ? <CheckCircle size={11} weight="bold" /> : <Copy size={11} weight="bold" />}
            </button>
        </div>
    );
    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">API Keys</h2>
                        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">Manage SDK credentials for this organization.</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer bg-transparent border-0 p-0">
                        <X size={18} weight="bold" />
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">Mint a new key</div>
                        <Cmd>bastion login</Cmd>
                        <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-1">Opens this dashboard, signs you in, and writes a key to <code className="font-mono">~/.bastion/credentials.json</code>.</p>
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">List active keys</div>
                        <Cmd>bastion key list</Cmd>
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">Rotate the current key</div>
                        <Cmd>bastion key rotate</Cmd>
                        <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-1">Mints a new key and revokes the old one after a 5-minute grace window.</p>
                    </div>
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">Revoke immediately</div>
                        <Cmd>bastion key revoke</Cmd>
                    </div>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-800 mt-5 pt-4 text-[11px] text-slate-500 dark:text-slate-500">
                    A web-based key inventory is on the roadmap. For now, all minting and rotation flows through the CLI.
                </div>
            </div>
        </div>,
        document.body
    );
}
// FileMenuDropdown removed, config accessible via sidebar

const SEARCH_INDEX = [
    { id: 'f1', title: 'Fleet Overview & Agent Status', view: 'overview', keywords: ['fleet', 'agents', 'status', 'overview'] },
    { id: 'f2', title: 'Live Telemetry Feed', view: 'telemetry', keywords: ['live', 'telemetry', 'events', 'stream'] },
    { id: 'f3', title: 'PII Detection & Safety', view: 'safety', keywords: ['pii', 'safety', 'detection', 'privacy'] },
    { id: 'f4', title: 'Event Drilldown & Transcripts', view: 'telemetry', keywords: ['transcript', 'thinking', 'tool calls', 'inspect', 'event detail', 'drilldown'] },
    { id: 'f5', title: 'Event Log', view: 'log', keywords: ['log', 'audit', 'events', 'terminal'] },
    { id: 'f6', title: 'Tool Policies & Configuration', view: 'config', keywords: ['policy', 'config', 'blocklist', 'tools'] },
];

export function TopBar({ onSearch, setCurrentView, onOpenChangelog, events = [] }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const mode = useModeStore((s) => s.mode);
    const setMode = useModeStore((s) => s.setMode);
    const suppressed = countSuppressedBlocks(events, mode);
    const isDev = useIsDev();
    const [enforcementModalOpen, setEnforcementModalOpen] = useState(false);
    const [apiKeysOpen, setApiKeysOpen] = useState(false);

    const handleSwitchTo = (next) => {
        if (next === mode) return;
        if (next === 'enforcement') {
            // Show the onboarding popup before flipping — this is the
            // "how easy is it" moment for prospective clients.
            setEnforcementModalOpen(true);
            return;
        }
        // Going back to Monitoring is instant — no popup.
        setMode('shadow');
    };

    const confirmEnforcement = () => {
        setMode('enforcement');
        setEnforcementModalOpen(false);
    };
    const searchRef = useRef(null);
    const menuRef = useRef(null);

    // Trigger the Posture Report .docx export from the global Bastion
    // header dropdown. Switches to the posture view first, programmatically
    // clicks the in-page "Generate Posture Report" button if the report is
    // still gated, then serialises the rendered article through the shared
    // exportPostureReportDocx utility. Same sequence used by the SideNav
    // ExportMenu, lifted here so the export is always one click from the
    // global header regardless of which view the user is on.
    const handleDownloadPostureReport = () => {
        setMenuOpen(false);
        if (setCurrentView) setCurrentView('posture');
        setTimeout(() => {
            const generateBtn = Array.from(document.querySelectorAll('button')).find((b) =>
                /Generate Posture Report/i.test(b.textContent || '')
            );
            if (generateBtn) generateBtn.click();
            setTimeout(() => exportPostureReportDocx(), 1700);
        }, 200);
    };

    const handleDownloadReport = async () => {
        setMenuOpen(false);
        try {
            const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL.replace(/\/$/, '') : '');
            const resp = await fetch(`${API_BASE}/api/policy/report-xlsx`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'bastion-blue-report.xlsx';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Report download failed:', e);
        }
    };

    // Light mode is the only mode now. Strip any leftover `dark` class from
    // a previous session and clear the saved preference so the OS-level
    // prefers-color-scheme: dark stops flipping us back.
    useEffect(() => {
        document.documentElement.classList.remove('dark');
        try { localStorage.removeItem('theme'); } catch {}
    }, []);

    useEffect(() => {
        const handler = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const searchResults = searchQuery.trim() === '' ? [] : SEARCH_INDEX.filter(item =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.keywords.some(k => k.includes(searchQuery.toLowerCase()))
    );

    const handleSelectResult = (item) => {
        setSearchOpen(false);
        const query = searchQuery;
        setSearchQuery('');
        if (onSearch) onSearch(item.view, query);
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (searchResults.length > 0) handleSelectResult(searchResults[0]);
    };

    return (
        <header className="h-16 sm:h-[100px] shrink-0 border-b border-slate-300 dark:border-slate-800/80 pl-2 sm:pl-6 pr-3 sm:pr-6 flex items-center justify-between sticky top-0 z-40 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md transition-colors">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                {/* Config accessible via sidebar */}
                <div className="min-w-0 flex items-center gap-4">
                    {/* Branding + Dropdown */}
                    <div className="hidden lg:flex flex-col border-r border-slate-200 dark:border-slate-800 pr-6 mr-6">
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setMenuOpen(!menuOpen)}
                                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                            >
                                <span className="text-slate-800 dark:text-slate-100 font-bold tracking-tight text-xl sm:text-2xl">Bastion</span>
                                <CaretDown size={16} weight="bold" className="text-slate-400" />
                            </button>
                            {menuOpen && (
                                <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg z-50">
                                    <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                        Export
                                    </div>
                                    <button
                                        onClick={handleDownloadPostureReport}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                    >
                                        <DownloadSimple size={16} weight="bold" className="text-slate-500 dark:text-slate-400" />
                                        Download Posture Report (.docx)
                                    </button>
                                    {!isDev && (
                                        <button
                                            onClick={handleDownloadReport}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800"
                                        >
                                            <DownloadSimple size={16} weight="bold" className="text-blue-500" />
                                            Download Underwriting Report (.xlsx)
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* (System status pill removed — Primary/Backup/Uptime were
                        demo-only fake numbers. A real status surface would need
                        per-component health from the backend.) */}
                </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                {/* (Search bar removed — entity index was demo-only and
                    leaked seeded data into the header on fresh tenants.
                    State + handlers above are unused now but kept so a
                    later add-back doesn't have to re-wire them.) */}

                {/* Mode toggle: pill with both states visible — clearly a toggle */}
                <div className="hidden sm:inline-flex items-stretch border border-slate-300 dark:border-slate-700 rounded-none overflow-hidden">
                    <button
                        onClick={() => handleSwitchTo('shadow')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer border-none ${
                            mode === 'shadow'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400'
                        }`}
                        title="Monitoring: detections logged, traffic flows through"
                        aria-pressed={mode === 'shadow'}
                    >
                        <Eye size={12} weight="bold" />
                        <span>Monitor</span>
                        {mode === 'shadow' && suppressed > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 bg-white/20 text-white text-[9px] font-mono">
                                {suppressed}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => handleSwitchTo('enforcement')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer border-none border-l border-slate-300 dark:border-slate-700 ${
                            mode === 'enforcement'
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400'
                        }`}
                        title="Enforcement: detected violations are blocked inline"
                        aria-pressed={mode === 'enforcement'}
                    >
                        <ShieldCheckered size={12} weight="bold" />
                        <span>Enforcement</span>
                    </button>
                </div>

                {onOpenChangelog && (
                    <button onClick={onOpenChangelog}
                        className="p-1.5 sm:p-2 rounded-none text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 border border-slate-300 dark:border-slate-700 bg-transparent transition-colors"
                        aria-label="What's new"
                        title="What's new">
                        <Sparkle size={14} weight="bold" />
                    </button>
                )}

                {/* Org + account switcher. Multi-tenant story — which
                    organization you're attesting under, which Clerk user is
                    logged in. */}
                <div className="hidden sm:block">
                    <OrganizationSwitcher
                        hidePersonal
                        afterCreateOrganizationUrl="/"
                        afterSelectOrganizationUrl="/"
                        appearance={{ elements: { rootBox: 'flex items-center', organizationSwitcherTrigger: 'px-2 py-1 border border-slate-300 dark:border-slate-700 rounded-none hover:border-blue-500' } }}
                    />
                </div>
                <UserButton
                    afterSignOutUrl="/"
                    appearance={{ elements: { userButtonAvatarBox: 'w-8 h-8 rounded-none border border-slate-300 dark:border-slate-700' } }}
                />
                {IS_PROD_APP && (
                    <button
                        onClick={() => setApiKeysOpen(true)}
                        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors rounded-none"
                        title="API Keys"
                    >
                        <Key size={12} weight="bold" />
                        <span>API Keys</span>
                    </button>
                )}

                <div className="flex sm:hidden items-center gap-1.5 px-2 py-1 rounded-none border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-none shrink-0 animate-pulse" />
                    <span className="text-[9px] font-mono font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">LIVE</span>
                </div>
            </div>

            <EnforcementOnboardingModal
                open={enforcementModalOpen}
                onClose={() => setEnforcementModalOpen(false)}
                onConfirm={confirmEnforcement}
            />
            <ApiKeysModal open={apiKeysOpen} onClose={() => setApiKeysOpen(false)} />
        </header >
    );
}
