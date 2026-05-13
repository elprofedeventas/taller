// services/excel.js
// Import y export Excel para WAPs Nueva Orbita.
// Patron estandar v2.2+

import * as XLSX from 'xlsx';

export async function readExcelFile(file, { sheetName, headerRow = 1 } = {}) {
  if (!file) throw new Error('Archivo requerido');
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Solo se aceptan archivos .xlsx');
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const targetSheet = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheet];
  if (!sheet) throw new Error('Hoja no encontrada: ' + targetSheet);

  const rows = XLSX.utils.sheet_to_json(sheet, {
    raw: false,
    defval: '',
    range: headerRow - 1
  });

  return rows;
}

export function mapExcelToFirestore(rows, columnMap, { transforms = {}, validators = {} } = {}) {
  const errors = [];
  const mapped = [];

  rows.forEach((row, idx) => {
    const doc = {};
    let rowValid = true;

    for (const [excelCol, firestoreField] of Object.entries(columnMap)) {
      let value = row[excelCol];

      if (transforms[firestoreField]) {
        try {
          value = transforms[firestoreField](value, row);
        } catch (e) {
          errors.push({ row: idx + 1, field: firestoreField, error: e.message });
          rowValid = false;
          continue;
        }
      }

      if (validators[firestoreField]) {
        if (!validators[firestoreField](value, row)) {
          errors.push({
            row: idx + 1,
            field: firestoreField,
            error: 'Valor invalido: ' + value
          });
          rowValid = false;
          continue;
        }
      }

      doc[firestoreField] = value;
    }

    if (rowValid) mapped.push(doc);
  });

  return { mapped, errors };
}

export function exportToExcel(collections, filename) {
  const workbook = XLSX.utils.book_new();

  for (const [sheetName, docs] of Object.entries(collections)) {
    if (!Array.isArray(docs) || docs.length === 0) {
      const sheet = XLSX.utils.aoa_to_sheet([['Sin datos']]);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
      continue;
    }

    const cleaned = docs.map(doc => {
      const { actorId, actorRole, ...rest } = doc;
      return rest;
    });

    const sheet = XLSX.utils.json_to_sheet(cleaned);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }

  const safeFilename = filename.replace(/[^a-z0-9-_]/gi, '_');
  XLSX.writeFile(workbook, safeFilename + '.xlsx');
}
