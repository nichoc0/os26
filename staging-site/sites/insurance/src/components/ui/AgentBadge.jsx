export function AgentBadge({ agent, agentMeta }) {
  const meta = agentMeta?.[agent];
  if (!meta) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
        <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
        {agent}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold" style={{ color: meta.color }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}
