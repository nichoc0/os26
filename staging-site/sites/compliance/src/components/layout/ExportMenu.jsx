import { useState, useRef, useEffect } from 'react';
import { CaretDown, FileDoc, FileXls, X } from '@phosphor-icons/react';
import { usePersona } from '../../store/personaStore';

// Export menu surfaced from the Bastion wordmark in the top-left
// sidebar. Provides one-click export of the two customer-shippable
// documents the dashboard produces:
//
//   1. Risk Sheet (the underwriting report). Exports as XLSX — the
//      pre-built fixture under /public, rendered for HeySadie pilot.
//
//   2. Posture Report. Exports as DOCX (HTML-in-Word-wrapper, which
//      Microsoft Word and Google Docs both open cleanly).
//
// Print / save-as-PDF was previously offered for the Risk Sheet but
// removed per buyer feedback (Yousuf, 2026-05-27): the canonical
// export is the .xlsx; the platform itself is the source of truth.

export default function ExportMenu({ setCurrentView }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const persona = usePersona();

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const downloadXlsx = () => {
    setOpen(false);
    // Persona-aware download. Each persona has its own workbook built by
    // scripts/build-underwriting-xlsx.js (Demo Pharmacy = pharmacy data;
    // Demo Arabic Bank = banking data with CBB Vol 2 + AAOIFI GS mappings
    // and the 4 real GFH-recon findings). Fall back to the pharmacy
    // workbook for any unconfigured persona.
    const slug = persona?.slug || 'maple-pharmacy';
    const a = document.createElement('a');
    a.href = `${import.meta.env.BASE_URL}underwriting-${slug}.xlsx`;
    a.download = `risk-sheet-${slug}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadPostureReportDocx = () => {
    setOpen(false);
    if (setCurrentView) setCurrentView('posture');
    // Allow the report to render before serialising. The
    // PostureReportView gates its body behind a "generate" button, so
    // we trigger that button programmatically too.
    setTimeout(() => {
      const generateBtn = Array.from(document.querySelectorAll('button')).find((b) =>
        /Generate Posture Report/i.test(b.textContent || '')
      );
      if (generateBtn) generateBtn.click();
      setTimeout(() => exportPostureReportDocx(), 1700);
    }, 200);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 px-5 mb-6 md:mb-8 cursor-pointer hover:opacity-80 transition-opacity w-full text-left"
        title="Export reports"
      >
        <div className="w-10 h-10 bg-black border-2 border-slate-600 dark:border-slate-700 flex items-center justify-center overflow-hidden p-1.5 rounded-none shadow-sm">
          <img
            src={`${import.meta.env.BASE_URL}bastion-logo.png`}
            alt="Bastion Logo"
            className="w-full h-full object-contain"
          />
        </div>
        <span className="text-slate-800 dark:text-slate-100 font-bold tracking-tight text-lg flex items-center gap-1">
          Bastion <CaretDown size={12} weight="bold" className="text-slate-500 dark:text-slate-400" />
        </span>
      </button>

      {open && (
        <div className="absolute top-12 left-3 z-50 w-72 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-lg">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-mono text-slate-500 dark:text-slate-400">
              Export
            </span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>

          <ExportGroup label="Risk sheet">
            <ExportItem icon={FileXls} label="Download .xlsx" onClick={downloadXlsx} />
          </ExportGroup>

          <ExportGroup label="Posture report">
            <ExportItem
              icon={FileDoc}
              label="Download .docx"
              onClick={downloadPostureReportDocx}
            />
          </ExportGroup>
        </div>
      )}
    </div>
  );
}

function ExportGroup({ label, children }) {
  return (
    <div className="border-b border-slate-100 dark:border-slate-900 last:border-b-0 py-1.5">
      <div className="px-3 py-1 text-[9px] uppercase tracking-widest font-mono text-slate-400 dark:text-slate-500">
        {label}
      </div>
      {children}
    </div>
  );
}

function ExportItem({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
    >
      <Icon size={14} className="text-slate-500 dark:text-slate-400" />
      {label}
    </button>
  );
}

// Posture report DOCX export. Serialises the rendered report article
// into a Word-compatible HTML document. Word and Google Docs both open
// .docx files containing this format (Microsoft documents it as "Word
// HTML format"). No npm dependencies required.
export function exportPostureReportDocx() {
  const article = document.querySelector('article');
  if (!article) {
    console.warn('[export] posture report article not found');
    return;
  }
  // Clone the article so we can strip dashboard-only affordances
  // (the in-header download button, drill-in links to Live Activity,
  // anything tagged `data-export-skip` or `.print:hidden`) without
  // mutating the live DOM. The exported .docx is the static
  // attestation artifact and must not carry SPA chrome.
  const clone = article.cloneNode(true);
  clone
    .querySelectorAll('[data-export-skip], .print\\:hidden')
    .forEach((node) => node.remove());
  const inner = clone.outerHTML;
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>Bastion Posture Report</title>
  <!--[if gte mso 9]>
    <xml>
      <w:WordDocument>
        <w:View>Print</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
      </w:WordDocument>
    </xml>
  <![endif]-->
  <style>
    body { font-family: 'Segoe UI', 'Helvetica Neue', sans-serif; color: #1e293b; padding: 1in; }
    h1 { font-size: 22pt; margin-bottom: 8pt; }
    h2 { font-size: 14pt; margin-top: 18pt; margin-bottom: 6pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 3pt; }
    h3 { font-size: 11pt; margin-top: 12pt; margin-bottom: 4pt; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    h4 { font-size: 10.5pt; margin-bottom: 2pt; }
    p, li, td, th { font-size: 10pt; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
    th, td { border: 1px solid #cbd5e1; padding: 6pt 8pt; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; font-weight: 600; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; }
    code { font-family: Consolas, monospace; background: #f1f5f9; padding: 1pt 3pt; }
    .stat { display: inline-block; border: 1px solid #cbd5e1; padding: 6pt 12pt; margin-right: 8pt; min-width: 90pt; }
    footer { margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #cbd5e1; font-size: 9pt; color: #64748b; text-align: center; }
  </style>
</head>
<body>
${inner}
</body>
</html>`;
  const blob = new Blob([html], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'posture-report.docx';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}
