#!/usr/bin/env python3
"""Validate and summarize new or historical evidence, entirely offline."""
import argparse
import json
import pathlib
from evidence import write_json
from evidence_analysis import summarize

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('folder', type=pathlib.Path)
args = parser.parse_args()
try:
    result = summarize(args.folder)
    write_json(args.folder / 'summary.json', result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
except (ValueError, AssertionError, KeyError, OSError) as error:
    parser.exit(1, f'Evidências rejeitadas: {error}\n')
