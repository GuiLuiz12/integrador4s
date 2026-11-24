import { readFileSync, writeFileSync } from 'node:fs';
import { buildDashboards, DASHBOARDS } from './dashboard-model.mjs';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const dashboards = buildDashboards(read('../analysis/sprint2/analysis.json'), read('../analysis/sprint3/analysis.json'));
for (const [name, definition] of Object.entries(dashboards)) {
  writeFileSync(new URL('../dashboards/' + DASHBOARDS[name].file, import.meta.url), JSON.stringify(definition, null, 2) + '\n');
}
console.log('CyPark: visões executiva e técnica geradas a partir das fontes preservadas.');
