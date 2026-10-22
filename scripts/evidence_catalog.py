"""Versioned selectors and formulas; only these monitoring fields are exported."""
PROJECT = 'container_label_com_docker_compose_project="governanca-saude",container_label_com_docker_compose_service!=""'
CLINICAL = 'route="/prontuarios/:id",traffic="clinical"'
SERVICES = ['api', 'postgres', 'lab', 'prometheus', 'grafana', 'node-exporter', 'cadvisor']
JOBS = ['api', 'probe', 'lab', 'prometheus', 'grafana', 'node', 'cadvisor']
# name: selector, unit, scope, metric type
RAW = {
    'probe_history': ('probe_success{job="probe"}', 'boolean', 'clinical_flow', 'gauge'),
    'probe_duration': ('probe_duration_seconds{job="probe"}', 'seconds', 'clinical_flow', 'gauge'),
    'targets': ('up', 'boolean', 'collection', 'gauge'),
    'collection_history': ('lab:target_up', 'boolean', 'collection', 'gauge'),
    'coverage': ('lab:collection_coverage_percent', 'percent', 'collection', 'gauge'),
    'alert_history': ('ALERTS', 'boolean', 'collection', 'gauge'),
    'load_history': ('lab_load_rate', 'requests/second', 'generator', 'gauge'),
    'load_attempts': ('lab_load_attempts_total', 'attempts', 'generator', 'counter'),
    'requests': ('clinical_requests_total', 'responses', 'api', 'counter'),
    'auth_failures': ('clinical_auth_failures_total', 'events', 'api', 'counter'),
    'duration_bucket': (f'clinical_request_duration_seconds_bucket{{{CLINICAL}}}', 'observations', 'api', 'counter'),
    'duration_count': (f'clinical_request_duration_seconds_count{{{CLINICAL}}}', 'observations', 'api', 'counter'),
    'duration_sum': (f'clinical_request_duration_seconds_sum{{{CLINICAL}}}', 'seconds', 'api', 'counter'),
    'host_cpu': ('node_cpu_seconds_total', 'seconds', 'host', 'counter'),
    'host_memory_available': ('node_memory_MemAvailable_bytes', 'bytes', 'host', 'gauge'),
    'host_memory_total': ('node_memory_MemTotal_bytes', 'bytes', 'host', 'gauge'),
    'container_cpu': (f'container_cpu_usage_seconds_total{{{PROJECT}}}', 'seconds', 'project_containers', 'counter'),
    'container_memory': (f'container_memory_working_set_bytes{{{PROJECT}}}', 'bytes', 'project_containers', 'gauge'),
    'container_network_receive': (f'container_network_receive_bytes_total{{{PROJECT}}}', 'bytes', 'project_containers', 'counter'),
    'container_network_transmit': (f'container_network_transmit_bytes_total{{{PROJECT}}}', 'bytes', 'project_containers', 'counter'),
}
VOLUME = f'sum(rate(clinical_requests_total{{{CLINICAL}}}[5m]))'
P95 = (f'histogram_quantile(0.95, sum by(le)(rate(clinical_request_duration_seconds_bucket{{{CLINICAL}}}[5m]))) '
       f'and on() (sum(rate(clinical_request_duration_seconds_count{{{CLINICAL}}}[5m])) > 0)')
# Derived curves are evaluation points, not evidence of scrape completeness.
DERIVED = {
    'host_cpu_percent': ('100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])))', 'percent', ['host_cpu']),
    'host_memory_percent': ('100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)', 'percent', ['host_memory_available', 'host_memory_total']),
    'container_cpu_cores': (f'sum by(container_label_com_docker_compose_service)(rate(container_cpu_usage_seconds_total{{{PROJECT}}}[5m]))', 'cores', ['container_cpu']),
    'container_network_bytes_per_second': (f'sum by(container_label_com_docker_compose_service)(rate(container_network_receive_bytes_total{{{PROJECT}}}[5m]) + rate(container_network_transmit_bytes_total{{{PROJECT}}}[5m]))', 'bytes/second', ['container_network_receive', 'container_network_transmit']),
    'clinical_volume': (VOLUME, 'responses/second', ['requests']),
    'clinical_errors_percent': (f'100 * sum(rate(clinical_requests_total{{{CLINICAL},status=~"5.."}}[5m])) / ({VOLUME} > 0)', 'percent', ['requests']),
    'clinical_p95': (P95, 'seconds', ['duration_bucket', 'duration_count']),
}
