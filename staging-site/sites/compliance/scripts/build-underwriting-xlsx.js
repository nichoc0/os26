#!/usr/bin/env node
/**
 * Build the Bastion AI-Agent Cyber Self-Assessment workbook from the
 * canonical data source (src/underwriting/data.js). Output lands in
 * public/underwriting-<client-slug>.xlsx so Vercel serves it statically
 * and the Report tab's "Download Excel" button links directly to it.
 *
 * Design mirrors Marsh Cyber Self-Assessment Standard tier:
 *   - one sheet per top-level section, hierarchical numbering
 *   - 4-column layout (Sr.No | Question | Available Option | Response)
 *   - section-title banner row, subsection group headers, question rows,
 *     composite option rows, optional inline tables (for fleet inventory,
 *     findings register, framework mapping, risk score summary)
 *   - cover sheet with metadata (version, tier, client, date, frameworks)
 *
 * Run: node scripts/build-underwriting-xlsx.js
 */
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { UNDERWRITING_PHARMACY, UNDERWRITING_BANK } from '../src/underwriting/data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = resolve(__dirname, '..', 'public');
mkdirSync(OUT_DIR, { recursive: true });

const SLATE_900 = { argb: 'FF0F172A' };
const SLATE_700 = { argb: 'FF334155' };
const SLATE_500 = { argb: 'FF64748B' };
const SLATE_200 = { argb: 'FFE2E8F0' };
const SLATE_100 = { argb: 'FFF1F5F9' };
const SLATE_50  = { argb: 'FFF8FAFC' };
const BLUE_600  = { argb: 'FF2563EB' };
const BLUE_50   = { argb: 'FFEFF6FF' };
const WHITE     = { argb: 'FFFFFFFF' };

const style = {
  coverTitle: { font: { size: 18, bold: true, color: WHITE }, fill: { type: 'pattern', pattern: 'solid', fgColor: SLATE_900 }, alignment: { vertical: 'middle', horizontal: 'left', indent: 1 } },
  sectionTitle: { font: { size: 14, bold: true, color: WHITE }, fill: { type: 'pattern', pattern: 'solid', fgColor: SLATE_900 }, alignment: { vertical: 'middle', horizontal: 'left', indent: 1 } },
  subsection: { font: { size: 11, bold: true, color: SLATE_900 }, fill: { type: 'pattern', pattern: 'solid', fgColor: SLATE_100 }, alignment: { vertical: 'middle', indent: 1 } },
  narrative: { font: { size: 10, italic: true, color: SLATE_500 }, alignment: { vertical: 'top', wrapText: true, indent: 1 } },
  columnHeader: { font: { size: 10, bold: true, color: WHITE }, fill: { type: 'pattern', pattern: 'solid', fgColor: SLATE_700 }, alignment: { vertical: 'middle', horizontal: 'left', indent: 1 } },
  questionId: { font: { size: 10, bold: true, color: SLATE_900 }, alignment: { vertical: 'top', horizontal: 'left' } },
  questionText: { font: { size: 10, color: SLATE_900 }, alignment: { vertical: 'top', wrapText: true } },
  optionText: { font: { size: 10, color: SLATE_700 }, alignment: { vertical: 'top', wrapText: true, indent: 1 } },
  response: { font: { size: 10, color: SLATE_900 }, alignment: { vertical: 'top', wrapText: true } },
  responseTrue: { font: { size: 10, bold: true, color: BLUE_600 }, alignment: { vertical: 'top', horizontal: 'center' } },
  responseFalse: { font: { size: 10, color: SLATE_500 }, alignment: { vertical: 'top', horizontal: 'center' } },
  tableHeader: { font: { size: 10, bold: true, color: WHITE }, fill: { type: 'pattern', pattern: 'solid', fgColor: SLATE_700 }, alignment: { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 } },
  tableCell: { font: { size: 10, color: SLATE_900 }, alignment: { vertical: 'top', wrapText: true } },
  metaLabel: { font: { size: 10, bold: true, color: SLATE_700 }, alignment: { vertical: 'middle', indent: 1 } },
  metaValue: { font: { size: 10, color: SLATE_900 }, alignment: { vertical: 'middle', indent: 1 } },
  severityCritical: { font: { size: 10, bold: true, color: { argb: 'FFB91C1C' } }, alignment: { horizontal: 'center', vertical: 'top' } },
  severityHigh: { font: { size: 10, bold: true, color: { argb: 'FFC2410C' } }, alignment: { horizontal: 'center', vertical: 'top' } },
  severityMedium: { font: { size: 10, color: SLATE_700 }, alignment: { horizontal: 'center', vertical: 'top' } },
  severityLow: { font: { size: 10, color: SLATE_500 }, alignment: { horizontal: 'center', vertical: 'top' } },
};

function applyStyle(cell, s) {
  if (s.font) cell.font = s.font;
  if (s.fill) cell.fill = s.fill;
  if (s.alignment) cell.alignment = s.alignment;
  if (s.border) cell.border = s.border;
}

function thinBorderAll(cell) {
  cell.border = {
    top: { style: 'thin', color: SLATE_200 },
    left: { style: 'thin', color: SLATE_200 },
    right: { style: 'thin', color: SLATE_200 },
    bottom: { style: 'thin', color: SLATE_200 },
  };
}

function severityStyleFor(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('critical')) return style.severityCritical;
  if (t.includes('high'))     return style.severityHigh;
  if (t.includes('medium'))   return style.severityMedium;
  return style.severityLow;
}

// ---------------------------- build ---------------------------- //

async function buildWorkbook(UNDERWRITING) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bastion Security';
  wb.lastModifiedBy = 'Bastion Underwriting Engine';
  wb.created = new Date();
  wb.modified = new Date();
  wb.title = 'Bastion AI-Agent Risk Assessment';
  wb.subject = `${UNDERWRITING.meta.client} — ${UNDERWRITING.meta.tier} tier`;

  // ========== Cover / Details sheet ==========
  const cover = wb.addWorksheet('Details', { views: [{ showGridLines: false }] });
  cover.getColumn(1).width = 32;
  cover.getColumn(2).width = 80;

  cover.mergeCells('A1:B1');
  cover.getCell('A1').value = 'BASTION AI-AGENT RISK ASSESSMENT';
  applyStyle(cover.getCell('A1'), style.coverTitle);
  cover.getRow(1).height = 36;

  const metaRows = [
    ['Report ID',        UNDERWRITING.meta.report_id],
    ['Version',          UNDERWRITING.meta.version],
    ['Tier',             UNDERWRITING.meta.tier],
    ['Last modified',    UNDERWRITING.meta.last_modified],
    ['Client',           UNDERWRITING.meta.client],
    ['Client industry',  UNDERWRITING.meta.client_industry],
    ['Assessor',         UNDERWRITING.meta.assessor],
    ['Methodology',      UNDERWRITING.meta.methodology],
    ['Frameworks aligned', UNDERWRITING.meta.frameworks_aligned.join(' · ')],
  ];
  let r = 3;
  for (const [label, value] of metaRows) {
    cover.getCell(r, 1).value = label;
    cover.getCell(r, 2).value = value;
    applyStyle(cover.getCell(r, 1), style.metaLabel);
    applyStyle(cover.getCell(r, 2), style.metaValue);
    cover.getRow(r).height = 22;
    r++;
  }

  // Section index (clickable if we had hyperlinks — for now just listed)
  r += 1;
  cover.getCell(r, 1).value = 'Section Index';
  applyStyle(cover.getCell(r, 1), style.subsection);
  cover.mergeCells(r, 1, r, 2);
  r++;
  for (const sec of UNDERWRITING.sections) {
    cover.getCell(r, 1).value = `${sec.id}. ${sec.title}`;
    cover.getCell(r, 2).value = sec.bastion_unique ? 'Bastion AI-native evidence' : 'Standard underwriting evidence';
    applyStyle(cover.getCell(r, 1), style.questionText);
    applyStyle(cover.getCell(r, 2), { font: { size: 10, color: sec.bastion_unique ? BLUE_600 : SLATE_500, italic: !sec.bastion_unique }, alignment: { vertical: 'middle', indent: 1 } });
    r++;
  }

  // ========== One sheet per section ==========
  for (const section of UNDERWRITING.sections) {
    // Excel limits: 31 chars, no * ? : \ / [ ]
    const sheetName = `${section.id} ${section.title}`
      .replace(/[*?:\\\/\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31);
    const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false, zoomScale: 100 }] });

    // Column widths sized for readability
    ws.getColumn(1).width = 10;   // Sr.No
    ws.getColumn(2).width = 52;   // Question
    ws.getColumn(3).width = 45;   // Available Option
    ws.getColumn(4).width = 45;   // Response

    // Banner row
    ws.mergeCells(1, 1, 1, 4);
    const banner = ws.getCell(1, 1);
    banner.value = `${section.id}. ${section.title.toUpperCase()}`;
    applyStyle(banner, style.sectionTitle);
    ws.getRow(1).height = 32;

    // Column headers
    const headers = ['Sr.No', 'Question', 'Available Option', 'Company Response'];
    headers.forEach((h, i) => {
      const cell = ws.getCell(3, i + 1);
      cell.value = h;
      applyStyle(cell, style.columnHeader);
      thinBorderAll(cell);
    });
    ws.getRow(3).height = 24;

    let row = 5;
    for (const sub of section.subsections) {
      // Subsection group header — merge across 4 cols
      ws.mergeCells(row, 1, row, 4);
      const subCell = ws.getCell(row, 1);
      subCell.value = `${sub.id} — ${sub.title}`;
      applyStyle(subCell, style.subsection);
      thinBorderAll(subCell);
      ws.getRow(row).height = 24;
      row++;

      if (sub.narrative) {
        ws.mergeCells(row, 1, row, 4);
        const n = ws.getCell(row, 1);
        n.value = sub.narrative;
        applyStyle(n, style.narrative);
        ws.getRow(row).height = Math.max(30, Math.min(90, 18 + Math.floor(sub.narrative.length / 90) * 14));
        row++;
      }

      // Table (fleet inventory / findings register / framework matrix / risk scores)
      if (sub.table) {
        const t = sub.table;
        // Distribute available columns across the table columns
        const cols = t.columns.length;
        // Re-widen columns if the table is wider than 4
        for (let c = 1; c <= Math.max(cols, 4); c++) {
          if (c > 4) ws.getColumn(c).width = 34;
        }
        // Table header
        t.columns.forEach((col, i) => {
          const cell = ws.getCell(row, i + 1);
          cell.value = col;
          applyStyle(cell, style.tableHeader);
          thinBorderAll(cell);
        });
        ws.getRow(row).height = 28;
        row++;
        for (const dataRow of t.rows) {
          dataRow.forEach((val, i) => {
            const cell = ws.getCell(row, i + 1);
            cell.value = val || '';
            // Severity column gets color coding if the header contains 'sever'
            const headerLower = t.columns[i]?.toLowerCase() || '';
            if (headerLower.includes('sever') || headerLower.includes('risk')) {
              applyStyle(cell, severityStyleFor(val));
            } else {
              applyStyle(cell, style.tableCell);
            }
            thinBorderAll(cell);
          });
          // Auto-fit row height (rough: based on longest cell)
          const longest = dataRow.reduce((a, v) => Math.max(a, String(v || '').length), 0);
          ws.getRow(row).height = Math.max(22, Math.min(70, 18 + Math.floor(longest / 35) * 14));
          row++;
        }
        row++; // spacer
      }

      // Questions
      for (const q of sub.questions || []) {
        if (q.type === 'checkbox' || q.type === 'radio') {
          // Question header spans first two columns
          ws.getCell(row, 1).value = q.id;
          ws.getCell(row, 2).value = q.text;
          ws.mergeCells(row, 3, row, 4);
          ws.getCell(row, 3).value = q.type === 'radio' ? '(select one)' : '(check all that apply)';
          applyStyle(ws.getCell(row, 1), style.questionId);
          applyStyle(ws.getCell(row, 2), style.questionText);
          applyStyle(ws.getCell(row, 3), { font: { size: 9, italic: true, color: SLATE_500 }, alignment: { vertical: 'middle', indent: 1 } });
          thinBorderAll(ws.getCell(row, 1));
          thinBorderAll(ws.getCell(row, 2));
          thinBorderAll(ws.getCell(row, 3));
          const qLineCount = Math.ceil((q.text.length) / 50);
          ws.getRow(row).height = Math.max(22, qLineCount * 16);
          row++;
          for (const opt of q.options || []) {
            ws.mergeCells(row, 1, row, 2);
            ws.getCell(row, 1).value = '';
            ws.getCell(row, 3).value = opt.label;
            ws.getCell(row, 4).value = opt.checked ? '✓' : '—';
            applyStyle(ws.getCell(row, 3), style.optionText);
            applyStyle(ws.getCell(row, 4), opt.checked ? style.responseTrue : style.responseFalse);
            thinBorderAll(ws.getCell(row, 1));
            thinBorderAll(ws.getCell(row, 3));
            thinBorderAll(ws.getCell(row, 4));
            const optLines = Math.ceil(opt.label.length / 45);
            ws.getRow(row).height = Math.max(18, optLines * 15);
            row++;
          }
        } else {
          // Single-line question
          ws.getCell(row, 1).value = q.id;
          ws.getCell(row, 2).value = q.text;
          ws.mergeCells(row, 3, row, 4);
          ws.getCell(row, 3).value = q.response ?? '';
          applyStyle(ws.getCell(row, 1), style.questionId);
          applyStyle(ws.getCell(row, 2), style.questionText);
          // Yes/No gets emphasis styling
          if (q.type === 'yes_no') {
            const isYes = /^yes/i.test(String(q.response || ''));
            applyStyle(ws.getCell(row, 3), isYes ? style.responseTrue : { font: { size: 10, color: SLATE_700 }, alignment: { vertical: 'top', wrapText: true, indent: 1 } });
          } else {
            applyStyle(ws.getCell(row, 3), { ...style.response, alignment: { ...style.response.alignment, indent: 1 } });
          }
          thinBorderAll(ws.getCell(row, 1));
          thinBorderAll(ws.getCell(row, 2));
          thinBorderAll(ws.getCell(row, 3));
          const qLines = Math.ceil(q.text.length / 48);
          const rLines = Math.ceil(String(q.response || '').length / 40);
          ws.getRow(row).height = Math.max(22, Math.max(qLines, rLines) * 16);
          row++;
        }
      }
      row++; // spacer between subsections
    }

    // Freeze banner + headers
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, showGridLines: false }];
  }

  return wb;
}

async function build() {
  // Per-persona workbooks, keyed by the persona slug used in
  // src/store/personaStore.js so the frontend can pick the right file
  // off /public.
  const personas = [
    { slug: 'maple-pharmacy',    data: UNDERWRITING_PHARMACY },
    { slug: 'demo-arabic-bank',  data: UNDERWRITING_BANK },
  ];

  for (const { slug, data } of personas) {
    const wb = await buildWorkbook(data);
    const out = resolve(OUT_DIR, `underwriting-${slug}.xlsx`);
    await wb.xlsx.writeFile(out);
    console.log(`[build-underwriting-xlsx] wrote ${out}`);
  }

  // Stable "latest" alias = pharmacy (back-compat for any caller still
  // hard-linking to underwriting-latest.xlsx). Persona-aware callers
  // should use underwriting-<slug>.xlsx via ExportMenu.
  const latestWb = await buildWorkbook(UNDERWRITING_PHARMACY);
  const latest = resolve(OUT_DIR, 'underwriting-latest.xlsx');
  await latestWb.xlsx.writeFile(latest);
  console.log(`[build-underwriting-xlsx] wrote ${latest}`);
}

build().catch((e) => { console.error(e); process.exit(1); });
