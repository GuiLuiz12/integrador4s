"""Failure paths must preserve a truthful incident and stop simulated traffic."""
import contextlib
import io
import json
import pathlib
import signal
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
import session_sprint3 as security


class Clock:
    def __init__(self):
        self.now = 1800000000.0
        self.on_sleep = lambda: None

    def time(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds
        self.on_sleep()


class SecuritySessionFailures(unittest.TestCase):
    @contextlib.contextmanager
    def environment(self, clock):
        handlers = {}
        requests = []

        def login():
            requests.append(clock.time())
            return 401

        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(security, 'time', types.SimpleNamespace(
                time=clock.time, monotonic=clock.time, sleep=clock.sleep)))
            stack.enter_context(patch.object(security.signal, 'signal',
                                             side_effect=lambda sig, fn: handlers.update({sig: fn})))
            stack.enter_context(patch.object(security, 'context', return_value={}))
            stack.enter_context(patch.object(security, 'scalar',
                                             side_effect=lambda expr: 100 if expr == 'lab:collection_coverage_percent' else 0))
            stack.enter_context(patch.object(security, 'query', return_value={'result': []}))
            stack.enter_context(patch.object(security, 'invalid_login', side_effect=login))
            export = stack.enter_context(patch.object(security, 'export'))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            yield handlers, requests, export

    def assert_preserved_failure(self, folder, export):
        session = json.loads((folder / 'session.json').read_text())
        self.assertEqual(session['status'], 'interrupted_or_failed')
        events = [event['event'] for event in session['timeline']]
        self.assertIn('auth_failure_confirmed', events)
        self.assertIn('session_interrupted_or_failed', events)
        self.assertNotIn('auth_recovery_confirmed', events)
        self.assertTrue(session['error'])
        export.assert_called_once()
        self.assertEqual(export.call_args.args[-1]['status'], 'interrupted_or_failed')
        return events

    def test_signal_after_first_rejected_login_preserves_incomplete_session(self):
        clock = Clock()
        with tempfile.TemporaryDirectory() as directory, self.environment(clock) as (handlers, requests, export):
            folder = pathlib.Path(directory) / 'interrupted'

            def interrupt_after_failure():
                if requests:
                    handlers[signal.SIGTERM](signal.SIGTERM, None)

            clock.on_sleep = interrupt_after_failure
            with patch.object(security, 'check_flow', return_value={'success': True}), \
                    patch.object(security, 'first_firing', return_value=None), \
                    patch.object(security, 'export_logs') as read_logs:
                with self.assertRaises(InterruptedError):
                    security.run(folder)
            self.assert_preserved_failure(folder, export)
            self.assertEqual(len(requests), 1, 'Interruption must not schedule another invalid login.')
            read_logs.assert_not_called()

    def test_api_loss_during_quiet_window_cannot_be_reported_as_recovery(self):
        clock = Clock()
        with tempfile.TemporaryDirectory() as directory, self.environment(clock) as (_, requests, export):
            folder = pathlib.Path(directory) / 'api-lost'
            failed_flow_checks = []

            def flow():
                # API works at detection but is lost before the 60-second quiet window ends.
                if requests and clock.time() - requests[-1] >= 50:
                    failed_flow_checks.append(clock.time())
                    raise subprocess.CalledProcessError(1, ['check-api'])
                return {'success': True}

            def firing(_):
                return clock.time() if len(requests) >= 3 else None

            with patch.object(security, 'check_flow', side_effect=flow), \
                    patch.object(security, 'first_firing', side_effect=firing), \
                    patch.object(security, 'export_logs', return_value=([], {})):
                with self.assertRaises(subprocess.CalledProcessError):
                    security.run(folder)
            events = self.assert_preserved_failure(folder, export)
            self.assertIn('auth_alert_firing', events)
            self.assertIn('auth_generator_stopped', events)
            self.assertEqual(len(requests), 3, 'No invalid login may be generated after the response action.')
            self.assertTrue(failed_flow_checks, 'Closure must check API health again after the quiet window.')
            self.assertGreaterEqual(failed_flow_checks[0] - requests[-1], 60)


if __name__ == '__main__':
    unittest.main()
