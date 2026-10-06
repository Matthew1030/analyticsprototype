import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDataset, DATA_FILES, type Dataset, type RawFiles } from '../src/data/model';

let cached: Dataset | null = null;

export function loadDataset(): Dataset {
  if (cached) return cached;
  const dir = join(__dirname, '..', 'public', 'data');
  const raw = Object.fromEntries(DATA_FILES.map((f) => [f, JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8'))]));
  cached = buildDataset(raw as RawFiles);
  return cached;
}
