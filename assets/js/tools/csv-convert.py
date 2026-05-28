#!/usr/bin/env python3
"""
csv-convert.py
Converts French-format TP CSV files to cahier standard formats.

Two output formats depending on input column headers:

1. BODE format (f, Ue, Us columns detected):
   f_hz,u_f_hz,ue_v,u_ue_v,us_v,u_us_v,phi_deg,u_phi_deg

2. LOADING format (RL, fc columns detected):
   rl_ohm,u_rl_ohm,fc_hz,u_fc_hz,phi_deg,u_phi_deg

Usage:
  python csv-convert.py input.csv output.csv
  python csv-convert.py input.csv          # prints to stdout
"""

import csv
import sys
import re
import io

# ── Bode format aliases ───────────────────────────────────────────────────────

BODE_ALIASES = {
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
                 'phi_deg', 'phi(deg)', 'phi', 'phase_deg', 'déphasage(°)',
                 'measured_phase_shift(°)'],
    'u_phi_deg':['u_measured_phaseshift(°)', 'u_phaseshift(°)', 'u_phase(°)',
                 'u_phi_deg', 'u_phi(deg)', 'u_phi', 'u_phase_deg',
                 'u_measured_phase_shift(°)'],
}

BODE_COLS = ['f_hz', 'u_f_hz', 'ue_v', 'u_ue_v', 'us_v', 'u_us_v', 'phi_deg', 'u_phi_deg']

# ── Loading format aliases ────────────────────────────────────────────────────

LOADING_ALIASES = {
    'rl_ohm':   ['rl_(ohm)', 'rl(ohm)', 'rl_ohm', 'rl', 'r_l(ohm)', 'r_l_(ohm)',
                 'rcharge(ohm)', 'r_charge'],
    'u_rl_ohm': ['u_rl_(ohm)', 'u_rl(ohm)', 'u_rl_ohm', 'u_rl'],
    'fc_hz':    ['f_c(hz)', 'fc(hz)', 'fc_hz', 'fc', 'f_c', 'fréquencedecoupure(hz)',
                 'cutofffrequency(hz)'],
    'u_fc_hz':  ['u_f_c(hz)', 'u_fc(hz)', 'u_fc_hz', 'u_fc', 'u_f_c'],
    'phi_deg':  ['measured_phase_shift(°)', 'phase_shift(°)', 'phase(°)',
                 'phi_deg', 'phi', 'measured_phaseshift(°)'],
    'u_phi_deg':['u_measured_phase_shift(°)', 'u_phase_shift(°)', 'u_phi_deg', 'u_phi'],
}

LOADING_COLS = ['rl_ohm', 'u_rl_ohm', 'fc_hz', 'u_fc_hz', 'phi_deg', 'u_phi_deg']


def normalise_header(h):
    return re.sub(r'\s+', '', h.strip().lower())


def detect_separator(text):
    first_line = text.split('\n')[0]
    if first_line.count(';') >= first_line.count(','):
        return ';'
    return ','


def parse_french_float(s):
    if not s or s.strip() in ('', '?', '-', 'n/a'):
        return ''
    cleaned = s.strip().replace(' ', '').replace('\xa0', '')
    if ',' in cleaned and '.' in cleaned:
        cleaned = cleaned.replace(',', '')
    else:
        cleaned = cleaned.replace(',', '.')
    try:
        return str(float(cleaned))
    except ValueError:
        return ''


def build_col_map(headers, aliases):
    norm_headers = [normalise_header(h) for h in headers]
    col_map = {}
    for std_col, alias_list in aliases.items():
        for alias in alias_list:
            norm_alias = normalise_header(alias)
            if norm_alias in norm_headers:
                col_map[std_col] = norm_headers.index(norm_alias)
                break
    return col_map


def detect_format(headers):
    """Return 'bode', 'loading', or None."""
    norm = [normalise_header(h) for h in headers]
    bode_map = build_col_map(headers, BODE_ALIASES)
    loading_map = build_col_map(headers, LOADING_ALIASES)

    has_bode = 'f_hz' in bode_map and ('ue_v' in bode_map or 'us_v' in bode_map)
    has_loading = 'rl_ohm' in loading_map and 'fc_hz' in loading_map

    if has_loading:
        return 'loading'
    if has_bode:
        return 'bode'
    return None


def convert_rows(rows_raw, headers, aliases, out_cols, required_key):
    col_map = build_col_map(headers, aliases)
    if required_key not in col_map:
        raise ValueError(
            f"Could not find required column '{required_key}'.\n"
            f"Headers found: {headers}\n"
            f"Normalised: {[normalise_header(h) for h in headers]}"
        )

    out_rows = [out_cols]
    for raw in rows_raw[1:]:
        if not any(c.strip() for c in raw):
            continue
        out_row = []
        for std_col in out_cols:
            if std_col in col_map:
                idx = col_map[std_col]
                val = raw[idx] if idx < len(raw) else ''
                out_row.append(parse_french_float(val))
            else:
                out_row.append('')
        if out_row[0] == '':
            continue
        out_rows.append(out_row)

    out = io.StringIO()
    writer = csv.writer(out, lineterminator='\r\n')
    writer.writerows(out_rows)
    return out.getvalue()


def convert(input_text):
    sep = detect_separator(input_text)
    reader = csv.reader(io.StringIO(input_text), delimiter=sep)
    rows_raw = list(reader)

    if not rows_raw:
        raise ValueError("Empty file")

    headers = rows_raw[0]
    fmt = detect_format(headers)

    if fmt == 'loading':
        print("Detected: loading effect format (R_L vs f_c)", file=sys.stderr)
        return convert_rows(rows_raw, headers, LOADING_ALIASES, LOADING_COLS, 'rl_ohm')
    elif fmt == 'bode':
        print("Detected: Bode format (f, Ue, Us)", file=sys.stderr)
        return convert_rows(rows_raw, headers, BODE_ALIASES, BODE_COLS, 'f_hz')
    else:
        raise ValueError(
            f"Could not detect format (Bode or Loading).\n"
            f"Headers found: {headers}\n"
            f"For Bode: need frequency + Ue/Us columns.\n"
            f"For Loading: need RL + fc columns."
        )


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
        print(f"Written to {output_path}", file=sys.stderr)
    else:
        print(result)


if __name__ == '__main__':
    main()