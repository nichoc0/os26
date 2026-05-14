import { useEffect, useState } from 'react';
import { computeLiveRiskNumbers } from './fleetReportFixture';

const RUNNER_BASE = (() => {
    if (import.meta.env.VITE_RUNNER_URL) return import.meta.env.VITE_RUNNER_URL;
    if (typeof window !== 'undefined') {
        const h = window.location.hostname;
        if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') {
            return 'http://127.0.0.1:18790';
        }
    }
    const prefix = import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/'
        ? import.meta.env.BASE_URL.replace(/\/$/, '')
        : '';
    return `${prefix}/api/runner`;
})();

// Shared live-pulse hook. Polls the runner once every 4 seconds for run
// count + total findings, advances a deterministic pulse bucket, and
// returns the live-jittered risk numbers + raw counters. The pulse
// bucket is shared module-state so the Overview card and the Agent
// Risk Assessment view tick in lock-step — same bucket means same
// jitter sign + magnitude across both surfaces.
//
// Returns: { grossRisk, netRisk, reductionPct, liveStats, pulseBucket }.
export function useLiveRiskPulse(reportData) {
    const [pulseBucket, setPulseBucket] = useState(() => Math.floor(Date.now() / 4000));
    const [liveStats, setLiveStats] = useState({ runs: 0, findings: 0 });
    useEffect(() => {
        const tick = async () => {
            setPulseBucket(Math.floor(Date.now() / 4000));
            try {
                const r = await fetch(`${RUNNER_BASE}/v1/runs`).then((r) => r.json());
                const runs = r.runs || [];
                const findings = runs.reduce((a, x) => a + (x.finding_count || 0), 0);
                setLiveStats({ runs: runs.length, findings });
            } catch {}
        };
        tick();
        const id = setInterval(tick, 4000);
        return () => clearInterval(id);
    }, []);

    const { grossRisk, netRisk, reductionPct, baseGross, baseNet } =
        computeLiveRiskNumbers(reportData, liveStats, pulseBucket);

    return { grossRisk, netRisk, reductionPct, baseGross, baseNet, liveStats, pulseBucket };
}
