// utils/formatMiles.js
// Formatea numero con punto como separador de miles (estilo EC/ES):
//   300000 -> "300.000"
//   1234567 -> "1.234.567"
// Y parser inverso que devuelve solo digitos (para guardar el numero limpio).

export function fmtMiles(value) {
  if (value === '' || value == null) return '';
  const digitos = String(value).replace(/\D/g, '');
  if (!digitos) return '';
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function parseMiles(str) {
  if (!str) return '';
  return String(str).replace(/\D/g, '');
}
