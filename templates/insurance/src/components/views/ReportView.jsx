// Bastion AI-Agent Cyber Self-Assessment — HTML view that looks and
// navigates like Excel.
//
// - Sheet tabs along the BOTTOM (classic spreadsheet UX)
// - Dense grid-style table per sheet with visible cell borders
// - Same canonical data source as the downloadable xlsx
//   (src/underwriting/data.js) so HTML and Excel never drift
// - Download Excel button links to /underwriting-latest.xlsx which
//   is generated at build time by scripts/build-underwriting-xlsx.js

import { useState, useMemo } from 'react';
import { FileText, DownloadSimple, CheckCircle, X } from '@phosphor-icons/react';
import { UNDERWRITING } from '../../underwriting/data.js';

const BORDER = 'border border-slate-300 dark:border-slate-700';
const CELL_BASE = 'px-2 py-1.5 align-top text-[11px]';

function SeverityCell({ value }) {
  const v = String(value || '').toLowerCase();
  if (v.includes('critical')) return <span className="font-bold text-red-700 dark:text-red-400">{value}</span>;
  if (v.includes('high'))     return <span className="font-bold text-orange-700 dark:text-orange-400">{value}</span>;
  if (v.includes('medium'))   return <span className="text-slate-700 dark:text-slate-300">{value}</span>;
  return <span className="text-slate-500">{value}</span>;
}

// --- Build a flat grid (array of rows, each row is array of cells) for a sheet ---
// Matches the xlsx layout:
//   row 1: banner (merged across 4)
//   row 3: column headers
//   row 5+: subsection banner, optional narrative, optional table, questions

function buildGrid(section) {
  const rows = [];
  // Banner
  rows.push([{ kind: 'banner', value: `${section.id}. ${section.title.toUpperCase()}${section.bastion_unique ? '   ·   BASTION-SPECIFIC' : ''}`, span: 4 }]);
  rows.push([{ kind: 'spacer', span: 4 }]);
  // Column headers
  rows.push([
    { kind: 'colheader', value: 'Sr.No' },
    { kind: 'colheader', value: 'Question' },
    { kind: 'colheader', value: 'Available Option' },
    { kind: 'colheader', value: 'Company Response' },
  ]);
  rows.push([{ kind: 'spacer', span: 4 }]);

  for (const sub of section.subsections) {
    rows.push([{ kind: 'subheader', value: `${sub.id} — ${sub.title}`, span: 4 }]);
    if (sub.narrative) {
      rows.push([{ kind: 'narrative', value: sub.narrative, span: 4 }]);
    }
    if (sub.table) {
      rows.push([{ kind: 'tableheader', columns: sub.table.columns }]);
      for (const r of sub.table.rows) {
        rows.push([{ kind: 'tablerow', cells: r, columns: sub.table.columns }]);
      }
    }
    for (const q of (sub.questions || [])) {
      if (q.type === 'checkbox' || q.type === 'radio') {
        rows.push([
          { kind: 'qid', value: q.id },
          { kind: 'qtext', value: q.text },
          { kind: 'qhint', value: q.type === 'radio' ? '(select one)' : '(check all that apply)', span: 2 },
        ]);
        for (const opt of (q.options || [])) {
          rows.push([
            { kind: 'empty' },
            { kind: 'empty' },
            { kind: 'option', value: opt.label },
            { kind: 'check', value: !!opt.checked },
          ]);
        }
      } else {
        rows.push([
          { kind: 'qid', value: q.id },
          { kind: 'qtext', value: q.text },
          { kind: 'answer', value: q.response ?? '', isYes: q.type === 'yes_no' && /^yes/i.test(String(q.response || '')), span: 2 },
        ]);
      }
    }
    rows.push([{ kind: 'spacer', span: 4 }]);
  }
  return rows;
}

function renderCell(cell, ci, sheetColWidths) {
  const common = `${CELL_BASE} ${BORDER}`;
  switch (cell.kind) {
    case 'banner':
      return (
        <td key={ci} colSpan={cell.span || 1} className={`${BORDER} bg-slate-900 text-white text-sm font-bold uppercase tracking-wider px-3 py-3`}>
          {cell.value}
        </td>
      );
    case 'colheader':
      return (
        <td key={ci} className={`${BORDER} bg-slate-700 dark:bg-slate-800 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-2`}>
          {cell.value}
        </td>
      );
    case 'subheader':
      return (
        <td key={ci} colSpan={cell.span || 1} className={`${BORDER} bg-slate-100 dark:bg-slate-800/70 text-slate-800 dark:text-slate-200 text-[11px] font-bold px-3 py-2`}>
          {cell.value}
        </td>
      );
    case 'narrative':
      return (
        <td key={ci} colSpan={cell.span || 1} className={`${BORDER} bg-slate-50/60 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 italic text-[11px] px-3 py-2`}>
          {cell.value}
        </td>
      );
    case 'tableheader':
      return cell.columns.map((c, i) => (
        <td key={`th-${i}`} className={`${BORDER} bg-slate-700 dark:bg-slate-800 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1.5`}>
          {c}
        </td>
      ));
    case 'tablerow':
      return cell.cells.map((v, i) => {
        const header = (cell.columns[i] || '').toLowerCase();
        const isSev = header.includes('sever') || header.includes('risk');
        return (
          <td key={`tc-${i}`} className={`${common} text-slate-900 dark:text-slate-100`}>
            {isSev ? <SeverityCell value={v} /> : (v || '')}
          </td>
        );
      });
    case 'qid':
      return <td key={ci} className={`${common} font-mono font-bold text-slate-900 dark:text-slate-100 w-20`}>{cell.value}</td>;
    case 'qtext':
      return <td key={ci} className={`${common} text-slate-900 dark:text-slate-100`}>{cell.value}</td>;
    case 'qhint':
      return <td key={ci} colSpan={cell.span || 1} className={`${common} text-slate-500 italic text-[10px]`}>{cell.value}</td>;
    case 'option':
      return <td key={ci} className={`${common} text-slate-700 dark:text-slate-300`}>{cell.value}</td>;
    case 'check':
      return (
        <td key={ci} className={`${common} text-center`}>
          {cell.value
            ? <CheckCircle size={14} weight="fill" className="inline text-blue-600 dark:text-blue-400" />
            : <X size={12} weight="bold" className="inline text-slate-400 dark:text-slate-600" />}
        </td>
      );
    case 'answer':
      return (
        <td key={ci} colSpan={cell.span || 1} className={`${common} ${cell.isYes ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>
          {cell.value}
        </td>
      );
    case 'empty':
      return <td key={ci} className={`${common} bg-slate-50/40 dark:bg-slate-900/40`}>&nbsp;</td>;
    case 'spacer':
    default:
      return <td key={ci} colSpan={cell.span || 1} className={`${BORDER} bg-slate-50/30 dark:bg-slate-900/30 h-2`}>&nbsp;</td>;
  }
}

function Sheet({ section }) {
  const grid = useMemo(() => buildGrid(section), [section]);
  // Column widths: 80 / 360 / 320 / 240 but table auto-adapts
  return (
    <div className="overflow-auto bg-white dark:bg-[#0a0a12]">
      <table className="w-full border-collapse text-[11px]" style={{ tableLayout: 'auto' }}>
        <colgroup>
          <col style={{ width: '80px' }} />
          <col style={{ width: '42%' }} />
          <col style={{ width: '32%' }} />
          <col style={{ width: '22%' }} />
        </colgroup>
        <tbody>
          {grid.map((row, ri) => {
            // Expand tableheader / tablerow which return arrays rather than single cells
            return (
              <tr key={ri}>
                {row.flatMap((cell, ci) => {
                  const out = renderCell(cell, ci);
                  return Array.isArray(out) ? out : [out];
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CoverSheet({ meta, sections, setSelected }) {
  const metaRows = [
    ['Report ID', meta.report_id],
    ['Version', meta.version],
    ['Tier', meta.tier],
    ['Last modified', meta.last_modified],
    ['Client', meta.client],
    ['Client industry', meta.client_industry],
    ['Assessor', meta.assessor],
    ['Methodology', meta.methodology],
    ['Frameworks aligned', meta.frameworks_aligned.join(' · ')],
  ];
  return (
    <div className="overflow-auto bg-white dark:bg-[#0a0a12]">
      <table className="w-full border-collapse text-[11px]">
        <colgroup>
          <col style={{ width: '240px' }} />
          <col />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={2} className={`${BORDER} bg-slate-900 text-white text-sm font-bold uppercase tracking-wider px-3 py-3`}>
              BASTION AI-AGENT CYBER SELF-ASSESSMENT
            </td>
          </tr>
          <tr><td colSpan={2} className={`${BORDER} h-2 bg-slate-50/30 dark:bg-slate-900/30`}>&nbsp;</td></tr>
          {metaRows.map(([label, value]) => (
            <tr key={label}>
              <td className={`${CELL_BASE} ${BORDER} bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 font-bold`}>{label}</td>
              <td className={`${CELL_BASE} ${BORDER} text-slate-900 dark:text-slate-100`}>{value}</td>
            </tr>
          ))}
          <tr><td colSpan={2} className={`${BORDER} h-2 bg-slate-50/30 dark:bg-slate-900/30`}>&nbsp;</td></tr>
          <tr>
            <td colSpan={2} className={`${BORDER} bg-slate-100 dark:bg-slate-800/70 text-slate-800 dark:text-slate-200 font-bold text-[11px] px-3 py-2`}>
              Section Index
            </td>
          </tr>
          {sections.map((s) => (
            <tr key={s.id} className="hover:bg-blue-50/40 dark:hover:bg-blue-500/5 cursor-pointer" onClick={() => setSelected(s.id)}>
              <td className={`${CELL_BASE} ${BORDER} font-mono font-bold text-slate-600 dark:text-slate-400`}>{s.id}.</td>
              <td className={`${CELL_BASE} ${BORDER} text-slate-900 dark:text-slate-100`}>
                {s.title}
                {s.bastion_unique && <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 border border-blue-400/40 text-blue-600 dark:text-blue-400">Bastion</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportView() {
  const [selected, setSelected] = useState('cover');
  const sections = UNDERWRITING.sections;
  const meta = UNDERWRITING.meta;
  const activeSection = useMemo(() => sections.find((s) => s.id === selected), [sections, selected]);

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col pb-2" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Top strip — compact */}
      <div className="border border-slate-300 dark:border-slate-700 border-b-0 bg-slate-50 dark:bg-slate-900 px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText size={16} weight="bold" className="text-blue-500 dark:text-blue-400" />
          <div className="text-[12px] font-bold text-slate-800 dark:text-slate-100">
            {meta.client} — AI-Agent Cyber Self-Assessment
          </div>
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 ml-3">
            {meta.report_id} · {meta.version} · {meta.tier}
          </span>
        </div>
        <a
          href={`${import.meta.env.BASE_URL}underwriting-latest.xlsx`}
          className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-bold uppercase tracking-wider border border-blue-500 bg-blue-500 text-white hover:bg-blue-600 rounded-none cursor-pointer"
          download={`bastion-underwriting-${meta.client.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xlsx`}
        >
          <DownloadSimple size={12} weight="bold" />
          Download Excel
        </a>
      </div>

      {/* Top sheet tabs */}
      <div className="border border-slate-300 dark:border-slate-700 border-b-0 bg-slate-100 dark:bg-slate-900 overflow-x-auto">
        <div className="flex items-stretch">
          <TabButton
            id="cover"
            label="Details"
            active={selected === 'cover'}
            onClick={() => setSelected('cover')}
          />
          {sections.map((s) => (
            <TabButton
              key={s.id}
              id={s.id}
              label={`${s.id}. ${s.title}`}
              active={selected === s.id}
              bastion={s.bastion_unique}
              onClick={() => setSelected(s.id)}
            />
          ))}
        </div>
      </div>

      {/* Main sheet area */}
      <div className="flex-1 border border-slate-300 dark:border-slate-700 overflow-hidden" style={{ minHeight: 560 }}>
        {selected === 'cover'
          ? <CoverSheet meta={meta} sections={sections} setSelected={setSelected} />
          : activeSection ? <Sheet section={activeSection} />
          : <div className="p-6 text-sm text-slate-400 italic">Select a sheet.</div>}
      </div>
    </div>
  );
}

function TabButton({ label, active, bastion, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap px-3 py-1.5 text-[11px] border-r border-slate-300 dark:border-slate-700 transition-colors cursor-pointer ${
        active
          ? 'bg-white dark:bg-[#0a0a12] text-slate-900 dark:text-slate-100 font-bold border-b-2 border-b-blue-500 -mb-px'
          : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 border-b border-b-transparent'
      }`}
    >
      {label}
      {bastion && <span className="ml-1.5 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 border border-blue-400/40 text-blue-600 dark:text-blue-400">B</span>}
    </button>
  );
}
