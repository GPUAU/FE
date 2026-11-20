import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../docker_erd_20261117/app/web/static/app.js', import.meta.url), 'utf8');
const exportSource = app.slice(app.indexOf('function downloadCSV('), app.indexOf('const stamp ='));

test('CSV exports preserve numeric signs and delimiters while storing external text as text', async () => {
  let contents;
  const anchor = { click() {}, remove() {} };
  const download = runInNewContext(exportSource + '\ndownloadCSV;', {
    Blob,
    URL: {
      createObjectURL(blob) { contents = blob.text(); return 'blob:test'; },
      revokeObjectURL() {},
    },
    document: { createElement: () => anchor, body: { appendChild() {} } },
    setTimeout: callback => callback(),
  });
  download('prices.csv', ['item', 'difference'],
    [[' =external text', '-5.25'], ['ACME, GPU', 0], ['＠an external label', null]]);
  const lines = (await contents).replace(/^\ufeff/, '').split('\n');
  assert.deepEqual(lines, ['item,difference', "' =external text,-5.25", '"ACME, GPU",0', "'＠an external label,"]);
});
