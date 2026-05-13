// scripts/generate-pin-hash.js
//
// Genera hash + salt para crear manualmente el primer usuario owner
// en Firestore Console del proyecto del cliente.
//
// Uso:
//   1. Editar la constante PIN abajo con el PIN deseado del owner.
//   2. node scripts/generate-pin-hash.js
//   3. Copiar Salt y Hash impresos.
//   4. En Firestore Console del proyecto del cliente:
//      coleccion 'users' -> nuevo documento -> pegar campos.

const crypto = require('crypto');

const PIN = '1111';  // CAMBIAR antes de ejecutar

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.createHash('sha256').update(PIN + ':' + salt).digest('hex');

console.log('');
console.log('=== Pega estos valores en Firestore Console ===');
console.log('Coleccion: users');
console.log('Documento (auto-generar ID):');
console.log('  name:    Alfredo (o nombre real del owner)');
console.log('  role:    owner');
console.log('  active:  true (boolean)');
console.log('  pinSalt: ' + salt);
console.log('  pinHash: ' + hash);
console.log('  createdAt: (server timestamp)');
console.log('');
console.log('PIN configurado: ' + PIN);
console.log('Cambiar el PIN despues de bootstrap si es necesario.');
