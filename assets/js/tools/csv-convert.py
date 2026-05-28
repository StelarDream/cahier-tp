#!/usr/bin/env python3
"""
csv-convert.py
Converts French-format TP CSV files to the cahier standard format.

Standard output columns:
  f_hz, u_f_hz, ue_v, u_ue_v, us_v, u_us_v, phi_deg, u_phi_deg

Usage:
  python csv-convert.py input.csv output.csv
  python csv-convert.py input.csv          # prints to stdout
"""

import csv
import sys
import re
import io

# Column name aliases — maps French/variant names to standard names
ALIASES = {
    'f_hz':     ['gbf_fréquence(hz)', 'gbf_frequence(hz)', 'gbf_frequency(hz)',
                 'f(hz)', 'frequency', 'freq', 'f_hz', 'gbf_fréquence(°)',
                 'gbf_frequency(°)'],
    'u_f_hz':   ['u_gbf_fréquence(hz)', 'u_gbf_frequence(hz)', 'u_gbf_frequency(hz)',
                 'u_f(hz)', 'u_frequency', 'u_f_hz', 'u_gbf_fréquence(°)',
                 'u_gbf_frequency(°)'],
    'ue_v':     ['ue(v_cc)', 'ue(v_e)', 'ue(v)', 'ue_v', 'ue', 'u_e(v)', 'ue_(ve)'],
    'u_ue_v':   ['u_ue(v_cc)', 'u_ue(v_e)', 'u_ue(v)', 'u_ue_v', 'u_ue', 'u_ue_(ve)'],
    'us_v':     ['us(v_cc)', 'us(v_e)', 'us(v)', 'us_v', 'us', 'u_s(v)', 'us_(ve)'],
    'u_us_v':   ['u_us(v_cc)', 'u_us(v_e)', 'u_us(v)', 'u_us_v', 'u_us', 'u_us_(ve)'],
    'phi_deg':  ['measured_phaseshift(°)', 'phaseshift(°)', 'phase(°)',
                 'phi_deg', 'phi(deg)', 'phi', 'phase_deg', 'déphasage(°)'],
    'u_phi_deg':['u_measured_phaseshift(°)', 'u_phaseshift(°)', 'u_phase(°)',
                 'u_phi_deg', 'u_phi(deg)', 'u_phi', 'u_phase_deg'],
}

STANDARD_COLS = ['f_hz', 'u_f_hz', 'ue_v', 'u_ue_v', 'us_v', 'u_us_v', 'phi_deg', 'u_phi_deg']


def normalise_header(h):
    """Normalise a header string for matching."""
    return re.sub(r'\s+', '', h.strip().lower())


def detect_separator(text):
    """Detect whether the file uses ; or , as separator."""
    first_line = text.split('\n')[0]
    if first_line.count(';') >= first_line.count(','):
        return ';'
    return ','


def parse_french_float(s):
    """Parse French decimal notation (comma as decimal separator)."""
    if not s or s.strip() in ('', '?', '-', 'n/a'):
        return ''
    cleaned = s.strip().replace(' ', '').replace('\xa0', '')
    # If there's both a dot and a comma, the comma is thousands separator
    if ',' in cleaned and '.' in cleaned:
        cleaned = cleaned.replace(',', '')
    else:
        cleaned = cleaned.replace(',', '.')
    try:
        return str(float(cleaned))
    except ValueError:
        return ''


def build_col_map(headers):
    """Build a mapping from standard column names to input column indices."""
    norm_headers = [normalise_header(h) for h in headers]
    col_map = {}
    for std_col, alias_list in ALIASES.items():
        for alias in alias_list:
            norm_alias = normalise_header(alias)
            if norm_alias in norm_headers:
                col_map[std_col] = norm_headers.index(norm_alias)
                break
    return col_map


def convert(input_text):
    """Convert a French-format CSV string to standardised format."""
    sep = detect_separator(input_text)
    reader = csv.reader(io.StringIO(input_text), delimiter=sep)
    rows_raw = list(reader)

    if not rows_raw:
        raise ValueError("Empty file")

    headers = rows_raw[0]
    col_map = build_col_map(headers)

    if 'f_hz' not in col_map:
        raise ValueError(
            f"Could not find frequency column. Headers found: {headers}\n"
            f"Normalised: {[normalise_header(h) for h in headers]}"
        )

    out_rows = [STANDARD_COLS]

    for raw in rows_raw[1:]:
        if not any(c.strip() for c in raw):
            continue
        out_row = []
        for std_col in STANDARD_COLS:
            if std_col in col_map:
                idx = col_map[std_col]
                val = raw[idx] if idx < len(raw) else ''
                out_row.append(parse_french_float(val))
            else:
                out_row.append('')
        # Skip rows where f is empty or couldn't be parsed
        if out_row[0] == '':
            continue
        out_rows.append(out_row)

    out = io.StringIO()
    writer = csv.writer(out, lineterminator='\r\n')
    writer.writerows(out_rows)
    return out.getvalue()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    with open(input_path, encoding='utf-8-sig', errors='replace') as f:
        text = f.read()

    result = convert(text)

    if output_path:
        with open(output_path, 'w', encoding='utf-8', newline='') as f:
            f.write(result)
        print(f"Written to {output_path}")
    else:
        print(result)


if __name__ == '__main__':
    main()
