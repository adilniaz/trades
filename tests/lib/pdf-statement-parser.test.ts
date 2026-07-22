import { describe, it, expect } from 'vitest';
import {
  parseStatementText,
  type ParsedTradeRow,
  type UnparsedRow,
} from '@/lib/pdf-statement-parser';

function isParsed(row: ParsedTradeRow | UnparsedRow): row is ParsedTradeRow {
  return !('unparsed' in row);
}

describe('parseStatementText', () => {
  it('extracts a BUY row, stitching its wrapped TYPE column back together', () => {
    const text = [
      'TRANSACTIONS',
      "DATE TYPE DESCRIPTION ENTRÉE D'ARGENT SORTIE D'ARGENT SOLDE",
      '06 mai 2025 Virement Card Top up with ****0113 250,00 € 250,00 €',
      '13 mai 2025 Exécution',
      "d'ordre",
      'Buy trade HK0285041858 BYD ELECTRONIC (INTL) CO. LTD., quantity: 50',
      '206,25 € 43,75 €',
    ].join('\n');

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(1); // the "Virement" row is dropped, not a trade

    const row = rows[0];
    expect(isParsed(row)).toBe(true);
    if (!isParsed(row)) throw new Error('expected a parsed row');
    expect(row.date.toISOString().slice(0, 10)).toBe('2025-05-13');
    expect(row.type).toBe('BUY');
    expect(row.isin).toBe('HK0285041858');
    expect(row.companyName).toBe('BYD ELECTRONIC (INTL) CO. LTD.');
    expect(row.quantity).toBe(50);
    expect(row.amount).toBeCloseTo(206.25);
    expect(row.pricePerShare).toBeCloseTo(4.125);
  });

  it('extracts a SELL row and parses French thousands-separated amounts', () => {
    const text = [
      '02 juin 2025 Exécution',
      "d'ordre",
      'Sell trade FR0000121014 LVMH MOET HENNESSY, quantity: 3',
      '1 234,56 € 9 876,54 €',
    ].join('\n');

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!isParsed(row)) throw new Error('expected a parsed row');
    expect(row.type).toBe('SELL');
    expect(row.isin).toBe('FR0000121014');
    expect(row.quantity).toBe(3);
    expect(row.amount).toBeCloseTo(1234.56);
    expect(row.pricePerShare).toBeCloseTo(411.52);
  });

  it('flags a trade-execution row with an unrecognized description as unparsed, not dropped', () => {
    const text = [
      '20 juin 2025 Exécution',
      "d'ordre",
      'Dividend payment HK0285041858 BYD ELECTRONIC (INTL) CO. LTD.',
      '12,50 € 500,00 €',
    ].join('\n');

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(isParsed(row)).toBe(false);
    if (isParsed(row)) throw new Error('expected an unparsed row');
    expect(row.unparsed).toBe(true);
    expect(row.raw).toContain('Dividend payment');
  });

  it('drops non-trade rows (e.g. transfers) entirely, without flagging them', () => {
    const text =
      '06 mai 2025 Virement Card Top up with ****0113 250,00 € 250,00 €';
    expect(parseStatementText(text)).toEqual([]);
  });

  it("flags a trade-execution row as unparsed if it's missing an amount/balance pair", () => {
    const text = [
      '13 mai 2025 Exécution',
      "d'ordre",
      'Buy trade HK0285041858 BYD ELECTRONIC (INTL) CO. LTD., quantity: 50',
      '206,25 €',
    ].join('\n');

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(1);
    expect(isParsed(rows[0])).toBe(false);
  });

  it('recognizes abbreviated French month names (e.g. juil. for juillet)', () => {
    const text = [
      '07 juil. 2025 Exécution',
      "d'ordre",
      'Buy trade JP3397200001 SUZUKI MOTOR CORP, quantity: 60',
      '585,88 € 1419,42 €',
    ].join('\n');

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!isParsed(row)) throw new Error('expected a parsed row');
    expect(row.date.toISOString().slice(0, 10)).toBe('2025-07-07');
    expect(row.isin).toBe('JP3397200001');
  });

  it('rejoins a row whose date is split across lines (day+month, then a bare year line)', () => {
    // Observed in real statements: the TYPE column's own wrap (e.g.
    // "Exécution d'ordre") shifts that row's date onto two physical lines.
    const text = [
      '06 août',
      '2025',
      'Exécution',
      "d'ordre",
      'Buy trade US5165441032 LANTHEUS HLDGS DL-,01, quantity: 45',
      '1963,45 € 1140,58 €',
    ].join('\n');

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!isParsed(row)) throw new Error('expected a parsed row');
    expect(row.date.toISOString().slice(0, 10)).toBe('2025-08-06');
    expect(row.isin).toBe('US5165441032');
    expect(row.quantity).toBe(45);
  });

  it('returns an empty array for text with no date-anchored rows', () => {
    expect(parseStatementText('TRANSACTIONS\nDATE TYPE DESCRIPTION')).toEqual(
      [],
    );
  });

  it('flags a fractional quantity as unparsed rather than silently truncating it to an integer', () => {
    const text = [
      '13 mai 2025 Exécution',
      "d'ordre",
      'Buy trade US0378331005 APPLE INC, quantity: 1.5',
      '206,25 € 43,75 €',
    ].join('\n');

    const rows = parseStatementText(text);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(isParsed(row)).toBe(false);
    if (isParsed(row)) throw new Error('expected an unparsed row');
    expect(row.unparsed).toBe(true);
    expect(row.raw).toContain('quantity: 1.5');
  });
});
