// utils/normalizePlaca.js
// Estandariza placas a UPPERCASE sin guiones ni espacios.
// No valida formato (TALLER.md acepta variedad de formatos legacy).

export function normalizePlaca(raw) {
  if (!raw) return '';
  return String(raw).toUpperCase().replace(/[-\s]/g, '');
}
