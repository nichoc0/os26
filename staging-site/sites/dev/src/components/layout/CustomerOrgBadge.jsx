import { useEffect, useState } from 'react';

export default function CustomerOrgBadge() {
    const [data, setData] = useState({ brand_name: 'Bastion', logo_url: '' });

    useEffect(() => {
        let cancelled = false;
        fetch('/customer.json', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (!cancelled && d && d.brand_name) setData(d); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const brand = data.brand_name || 'Bastion';
    const logo = data.logo_url || '';
    const initial = brand.slice(0, 1).toUpperCase();

    return (
        <div
            className="flex items-center gap-2 px-2 py-1 border border-slate-300 dark:border-slate-700 rounded-none"
            title={brand}
        >
            <div className="w-5 h-5 flex items-center justify-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
                {logo ? (
                    <img
                        src={logo}
                        alt={brand}
                        className="w-full h-full object-contain"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                ) : (
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{initial}</span>
                )}
            </div>
            <span className="text-[12px] font-semibold tracking-tight text-slate-700 dark:text-slate-200 max-w-[140px] truncate">
                {brand}
            </span>
        </div>
    );
}
