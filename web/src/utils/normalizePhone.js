// utils/normalizePhone.js
// Normaliza telefono ecuatoriano al formato 593XXXXXXXXX (sin + ni separadores).
// Acepta variantes comunes:
//   '0987654321'        -> '593987654321'
//   '+593 98 765 4321'  -> '593987654321'
//   '593987654321'      -> '593987654321'
// Si no encaja, devuelve los digitos tal cual (mejor que vacio para que
// searchByPhone al menos intente match).

export function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/[\s\-()+]/g, '');
  if (digits.startsWith('0')) digits = '593' + digits.slice(1);
  return digits;
}
