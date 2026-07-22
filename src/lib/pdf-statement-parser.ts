// Parses Trade Republic's French-locale periodic account statement
// ("SYNTHÈSE DU RELEVÉ DE COMPTE") PDF text into structured trade rows.
// Deterministic regex/layout parsing only — see
// docs/superpowers/specs/2026-07-20-pdf-statement-import-design.md.
//
// Known open item (see spec): the DIVIDEND row description format hasn't
// been confirmed against a real statement, only the "Buy trade"/"Sell
// trade" pattern has. A trade-execution-typed row whose description
// doesn't match that pattern is surfaced as `unparsed` rather than
// silently dropped, so a future DIVIDEND format can be added here once
// confirmed — until then those rows need manual entry.

// Trade Republic abbreviates most month names (with a trailing period) in
// the date column — only the already-short mars/mai/juin/août are spelled
// out in full. Map both forms to the same index.
const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0,
  'janv.': 0,
  février: 1,
  'févr.': 1,
  mars: 2,
  avril: 3,
  'avr.': 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  'juil.': 6,
  août: 7,
  septembre: 8,
  'sept.': 8,
  octobre: 9,
  'oct.': 9,
  novembre: 10,
  'nov.': 10,
  décembre: 11,
  'déc.': 11,
};

const DATE_LINE = new RegExp(
  `^(\\d{1,2}) (${Object.keys(FRENCH_MONTHS)
    .map((m) => m.replace('.', '\\.'))
    .join('|')}) (\\d{4})`,
);

// A row's "<day> <month>" and its "<year>" occasionally land on two
// separate physical lines (observed whenever the TYPE column's own label
// wraps, e.g. "Exécution d'ordre" — shifts the rest of that row's layout).
// Not matched by DATE_LINE on either line alone, so silently merges into
// the previous buffer as noise unless rejoined first.
const DAY_MONTH_ONLY_LINE = new RegExp(
  `^\\d{1,2} (${Object.keys(FRENCH_MONTHS)
    .map((m) => m.replace('.', '\\.'))
    .join('|')})$`,
);
const YEAR_LEAD_LINE = /^\d{4}\b/;

// Trade Republic's TYPE column label for a buy/sell order execution.
// Confirmed via a redacted reference statement. Other TYPE values (e.g.
// "Virement" for a transfer) are not trade activity and are dropped.
const TRADE_TYPE_LABEL = "Exécution d'ordre";

// The negative lookahead after the digit group keeps a fractional quantity
// (e.g. "quantity: 1.5", plausible for a savings-plan execution — see the
// header comment) from partial-matching as `1` and silently producing a
// corrupted row. Fractional-share parsing isn't implemented since that
// format is unconfirmed; failing the match here routes it to the existing
// safe `unparsed` fallback instead.
const TRADE_DESCRIPTION =
  /(Buy|Sell) trade ([A-Z]{2}[A-Z0-9]{9}[0-9]) (.+?), quantity: (\d+)(?![.,]\d)/;

// French-formatted money: comma decimal, optional space/non-breaking-space
// thousands separators, trailing €.
const MONEY = /(-?[\d\s ]{1,12},\d{2})\s?€/g;

export type ParsedTradeRow = {
  date: Date;
  type: 'BUY' | 'SELL';
  isin: string;
  companyName: string;
  quantity: number;
  amount: number;
  pricePerShare: number;
};

export type UnparsedRow = {
  unparsed: true;
  raw: string;
};

function parseFrenchDate(day: string, month: string, year: string): Date {
  const monthIndex = FRENCH_MONTHS[month];
  return new Date(Date.UTC(Number(year), monthIndex, Number(day)));
}

function parseFrenchAmount(raw: string): number {
  const cleaned = raw.replace(/[\s ]/g, '').replace(',', '.');
  return Number(cleaned);
}

function parseRow(buffer: string): ParsedTradeRow | UnparsedRow | null {
  const dateMatch = buffer.match(DATE_LINE);
  if (!dateMatch) return null;

  // Not a trade-execution row (e.g. a transfer) — not in scope, not flagged.
  if (!buffer.includes(TRADE_TYPE_LABEL)) return null;

  const date = parseFrenchDate(dateMatch[1], dateMatch[2], dateMatch[3]);

  const descMatch = buffer.match(TRADE_DESCRIPTION);
  if (!descMatch) {
    return { unparsed: true, raw: buffer.trim() };
  }

  const quantity = Number(descMatch[4]);

  // Find where the description ends in the buffer to avoid matching money
  // from wrapped quantity fields. E.g., "quantity: 50 206,25 €" should not
  // match "50 206,25" as an amount.
  const descIndex = buffer.indexOf(descMatch[0]);
  const descEndIndex = descIndex + descMatch[0].length;

  // Only look for money matches after the description ends
  const afterDescText = buffer.substring(descEndIndex);
  const moneyMatches = [...afterDescText.matchAll(MONEY)];

  // The last money match on a row is always the running balance (SOLDE);
  // the one before it is the actual trade amount, regardless of whether it
  // came from the "money in" or "money out" column (only one of those two
  // is ever populated for a single row).
  if (moneyMatches.length < 2) {
    return { unparsed: true, raw: buffer.trim() };
  }

  const amount = parseFrenchAmount(moneyMatches[moneyMatches.length - 2][1]);

  return {
    date,
    type: descMatch[1] === 'Buy' ? 'BUY' : 'SELL',
    isin: descMatch[2],
    companyName: descMatch[3].trim(),
    quantity,
    amount,
    // Round away float division noise (e.g. 41.836666666666666) — 4dp is
    // more precision than a real per-share price ever carries.
    pricePerShare: Math.round((amount / quantity) * 10000) / 10000,
  };
}

/**
 * Splits extracted PDF text into logical statement rows (a date-anchored
 * line plus any lines that wrapped under it, joined back into one string),
 * then parses each into a trade row, an unparsed-but-trade-shaped row, or
 * drops it if it's not a trade-execution row at all.
 */
export function parseStatementText(
  text: string,
): (ParsedTradeRow | UnparsedRow)[] {
  const rawLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const next = rawLines[i + 1];
    if (DAY_MONTH_ONLY_LINE.test(line) && next && YEAR_LEAD_LINE.test(next)) {
      lines.push(`${line} ${next}`);
      i++;
    } else {
      lines.push(line);
    }
  }

  const buffers: string[] = [];
  for (const line of lines) {
    if (DATE_LINE.test(line)) {
      buffers.push(line);
    } else if (buffers.length > 0) {
      buffers[buffers.length - 1] += ' ' + line;
    }
  }

  const rows: (ParsedTradeRow | UnparsedRow)[] = [];
  for (const buffer of buffers) {
    const row = parseRow(buffer);
    if (row) rows.push(row);
  }
  return rows;
}
