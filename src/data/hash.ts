/** Deterministic 0–1 value per account id and purpose, for simulated attributes. */
export function hash01(id: number, salt: number): number {
  let x = (id * 2654435761 + salt * 40503) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0; x = Math.imul(x, 2246822519) >>> 0; x = (x ^ (x >>> 13)) >>> 0;
  return (x % 10000) / 10000;
}
