// CSV for organizer exports. Opened in Excel or Sheets, so cells that start
// like a formula are prefixed with ' to stop them from running (CSV injection).

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
