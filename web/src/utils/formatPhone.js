// utils/formatPhone.js
// Convierte el formato canonico 593XXXXXXXXX al formato local ecuatoriano
// 0XXXXXXXXX para mostrar en pantalla. El storage en Firestore queda en
// formato canonico (lo requiere searchByPhone con normalizePhone).
// Si el numero no encaja en el formato esperado, devuelve la cadena tal cual.

export function formatPhoneForDisplay(raw) {
  if (!raw) return '';
  const s = String(raw);
  if (s.startsWith('593') && s.length === 12) {
    return '0' + s.slice(3);
  }
  return s;
}
