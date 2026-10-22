#!/usr/bin/env python3
"""Standalone probe scrape failure; the lab TTL also restores after client loss."""
import argparse
import signal
from session import probe_control, wait, interrupted

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('seconds', type=int, nargs='?', default=90)
args = parser.parse_args()
if not 1 <= args.seconds <= 600:
    parser.error('A duração deve ser de 1 a 600 segundos.')
for name in (signal.SIGINT, signal.SIGTERM):
    signal.signal(name, interrupted)
try:
    probe_control(args.seconds)
    wait(args.seconds)
finally:
    probe_control(0)
