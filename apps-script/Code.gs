const FIRESTORE_PROJECT_ID = "black-hulling-462522-j2";
const FIRESTORE_DATABASE_ID = "ntr-boldcf";
const FIRESTORE_COLLECTION = "facturacion_consolidada";
const SHEETS_TO_PROCESS = [
  "ACH",
  "Neurona",
  "Redeban",
  "Credibanco",
  "Efecty",
  "Servibanca",
  "Deceval",
  "Apple",
  "Mastercard"
];

function consolidarYExportarFirebase() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const token = ScriptApp.getOAuthToken();
  let processed = 0;
  let skipped = 0;

  SHEETS_TO_PROCESS.forEach((sheetName) => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      skipped++;
      console.log(`Se omitió la hoja inexistente: ${sheetName}`);
      return;
    }

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      skipped++;
      return;
    }

    const columns = findColumns(data[0]);
    if (columns.fecha < 0) {
      throw new Error(`No se encontró una columna de fecha en la hoja "${sheetName}".`);
    }

    const occurrences = new Map();
    for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      const rawDate = row[columns.fecha];
      if (rawDate === "" || rawDate === null || rawDate === undefined) {
        continue;
      }

      const fecha = formatDate(rawDate, sheetName, rowIndex + 1);
      const factura = cellText(valueAt(row, columns.factura));
      const identity = factura
        ? [sheetName, fecha, factura].join("|")
        : [sheetName, fecha, rowIndex + 1].join("|");
      const occurrence = (occurrences.get(identity) || 0) + 1;
      occurrences.set(identity, occurrence);
      const documentId = `fact_${sha256(`${identity}|${occurrence}`)}`;

      const fields = {
        Proveedor: { stringValue: sheetName },
        Fecha: { stringValue: fecha },
        No_Factura: { stringValue: factura },
        Concepto: { stringValue: cellText(valueAt(row, columns.concepto)) },
        Canal: { stringValue: cellText(valueAt(row, columns.canal)) },
        Tipo_Registro: { stringValue: cellText(valueAt(row, columns.tipo)) },
        CECO: { stringValue: cellText(valueAt(row, columns.ceco)) },
        Valor: { doubleValue: parseAmount(valueAt(row, columns.valor), sheetName, rowIndex + 1) }
      };

      writeDocument(documentId, fields, token, sheetName, rowIndex + 1);
      processed++;
    }
  });

  const summary = `Carga completada. Documentos creados o actualizados: ${processed}. Hojas omitidas: ${skipped}.`;
  console.log(summary);
  return summary;
}

function findColumns(headerRow) {
  const headers = headerRow.map(normalizeHeader);
  return {
    fecha: headers.findIndex((header) => header.includes("fecha")),
    factura: headers.findIndex((header) => header.includes("factura") && !header.includes("fecha")),
    concepto: headers.findIndex((header) =>
      ["concepto", "descripcion", "servicio"].includes(header) || header.includes("detalle")
    ),
    canal: headers.findIndex((header) => header === "canal"),
    tipo: headers.findIndex((header) => header === "tipo de registro"),
    ceco: headers.findIndex((header) => header === "ceco"),
    valor: headers.findIndex((header) =>
      ["valor total", "total", "total factura", "valor"].includes(header)
    )
  };
}

function normalizeHeader(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function valueAt(row, columnIndex) {
  return columnIndex < 0 ? "" : row[columnIndex];
}

function cellText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function formatDate(value, sheetName, rowNumber) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  const text = cellText(value);
  if (!text) {
    throw new Error(`Fecha vacía en la hoja "${sheetName}", fila ${rowNumber}.`);
  }
  return text;
}

function parseAmount(value, sheetName, rowNumber) {
  if (value === "" || value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }
    throw new Error(`Valor no numérico en la hoja "${sheetName}", fila ${rowNumber}.`);
  }

  let text = cellText(value).replace(/[^\d,.-]/g, "");
  if (!text) {
    throw new Error(`Valor no numérico en la hoja "${sheetName}", fila ${rowNumber}.`);
  }

  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    text = text.split(thousandsSeparator).join("");
    if (decimalSeparator === ",") {
      text = text.replace(",", ".");
    }
  } else if (comma >= 0) {
    text = text.replace(",", ".");
  }

  const amount = Number(text);
  if (!Number.isFinite(amount)) {
    throw new Error(`Valor no numérico en la hoja "${sheetName}", fila ${rowNumber}.`);
  }
  return amount;
}

function sha256(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  ).map((byte) => ((byte + 256) % 256).toString(16).padStart(2, "0")).join("");
}

function writeDocument(documentId, fields, token, sheetName, rowNumber) {
  const url = [
    "https://firestore.googleapis.com/v1/projects",
    encodeURIComponent(FIRESTORE_PROJECT_ID),
    "databases",
    encodeURIComponent(FIRESTORE_DATABASE_ID),
    "documents",
    encodeURIComponent(FIRESTORE_COLLECTION),
    encodeURIComponent(documentId)
  ].join("/");
  const response = UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify({ fields }),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(
      `Firestore respondió HTTP ${status} para "${sheetName}", fila ${rowNumber}: ${response.getContentText()}`
    );
  }
}
