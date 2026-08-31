// Minimal client-side CSV helpers - no dependency needed for the simple
// flat, always-double-quoted-when-needed shape this app produces/consumes.

/** Turns a 2D array of cells into an RFC-4180-ish CSV string. Any cell
 *  containing a comma, quote, or newline is quoted, with quotes doubled. */
export function toCsv(rows: Array<Array<string | number>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '')
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\r\n')
}

/** Triggers a browser download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string): void {
  // A UTF-8 BOM keeps Excel from mangling non-ASCII characters.
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Parses a CSV string into rows of string cells. Handles quoted fields
 *  (including embedded commas/newlines/escaped quotes) - not a full RFC-4180
 *  implementation, but covers what a spreadsheet export/re-import round-trip
 *  needs. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += ch
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}
