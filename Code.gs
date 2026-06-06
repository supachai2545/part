// =========================================================
// CONFIG
// =========================================================

const SHEET_ID   = '1P9WjAYFELFbXJ0l5So01w0HSTJFUyzXx_Gi_c8DGI5I';
const SHEET_NAME = 'รายชื่อผลงาน';

// โฟลเดอร์ต้นฉบับ แยกตาม prefix และประเภทไฟล์ (img/pdf)
const ORIGINAL_FOLDER_MAP = {
  "P1":  { img: "1n32NOm67363lSNDH3P5Ej4gOmIaJPSie", pdf: "1ptF5TiSUpGSJSd0JXzPZHUKmwIsRQSwd" },
  "P2":  { img: "13iHgQcsLYdu3bg6j1fHpNpZpfzsgX78Y", pdf: "1EfLLJocUiUYNIRxAw3aoiE2lmcMzarpM" },
  "P3":  { img: "1bD4Cz0NKXMz8Wmn3Hn_NbgRmFcLp7yH6", pdf: "1-RE_Xm6BZ9IeBUznpiRBXfxHYXQX0uFe" },
  "P4":  { img: "1bMU9VWI6K8JLE9RjZc7VtOH4cc-IXq-V", pdf: "1rMHscua-SAswWNij3og-OB25PppVZ-jd" },
  "RP1": { img: "1xEEwYV6-9tY11AeHhF04mAZSTWo6vm5q", pdf: "10Cf2JyIQ9uHWoKoQNJbZfhBKBw2H7fka" },
  "RP2": { img: "1iyzokDEEMx7sS1aEfWCHgx19gT3mqAHb", pdf: "1gIkLjjXGpFIhqGhw39RSbEfklZlvGtfc" }
};

// โฟลเดอร์ผลลัพธ์ (merged files) — แยกตาม prefix เช่นกัน
const OUTPUT_FOLDER_MAP = {
  "P1":  { img: "1n32NOm67363lSNDH3P5Ej4gOmIaJPSie", pdf: "1ptF5TiSUpGSJSd0JXzPZHUKmwIsRQSwd" },
  "P2":  { img: "13iHgQcsLYdu3bg6j1fHpNpZpfzsgX78Y", pdf: "1EfLLJocUiUYNIRxAw3aoiE2lmcMzarpM" },
  "P3":  { img: "1bD4Cz0NKXMz8Wmn3Hn_NbgRmFcLp7yH6", pdf: "1-RE_Xm6BZ9IeBUznpiRBXfxHYXQX0uFe" },
  "P4":  { img: "1bMU9VWI6K8JLE9RjZc7VtOH4cc-IXq-V", pdf: "1rMHscua-SAswWNij3og-OB25PppVZ-jd" },
  "RP1": { img: "1xEEwYV6-9tY11AeHhF04mAZSTWo6vm5q", pdf: "10Cf2JyIQ9uHWoKoQNJbZfhBKBw2H7fka" },
  "RP2": { img: "1iyzokDEEMx7sS1aEfWCHgx19gT3mqAHb", pdf: "1gIkLjjXGpFIhqGhw39RSbEfklZlvGtfc" }
};

// =========================================================
// ROUTING
// =========================================================

function doGet(e) {
  const action = e.parameter.action || '';
  let result;
  try {
    switch (action) {
      case 'batchGetAllWorks':
        result = handleBatchGetAllWorks();
        break;
      case 'getOriginalFiles':
        result = handleGetOriginalFiles(e.parameter.submissionId);
        break;
      case 'getWorkById':
        result = handleGetWorkById(e.parameter.submissionId);
        break;
      default:
        result = { status: 'error', message: 'Unknown GET action: ' + action };
    }
  } catch (err) {
    result = { status: 'error', message: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ status: 'error', message: 'Invalid JSON: ' + err.message });
  }

  let result;
  try {
    switch (payload.action) {
      case 'batchUploadFile':
        result = handleBatchUploadFile(payload);
        break;
      default:
        result = { status: 'error', message: 'Unknown POST action: ' + payload.action };
    }
  } catch (err) {
    result = { status: 'error', message: err.message };
  }
  return respond(result);
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =========================================================
// HELPER: แยก prefix จากรหัสผลงาน
// "RP2-58" → "RP2",  "P1-001" → "P1"
// =========================================================
function getPrefixFromId(submissionId) {
  // จับกลุ่มตัวอักษร + ตัวเลขก่อน "-"
  const match = submissionId.toString().trim().match(/^([A-Za-z]+\d*)/);
  return match ? match[1].toUpperCase() : null;
}

// =========================================================
// HELPER: สร้าง fullName จากคอลัมน์
// =========================================================
function buildFullName(row) {
  const prefix    = row[1] ? row[1].toString().trim() : '';
  const firstName = row[2] ? row[2].toString().trim() : '';
  const lastName  = row[3] ? row[3].toString().trim() : '';
  return [prefix, firstName, lastName].filter(Boolean).join('');
}

// =========================================================
// HELPER: แปลงแถว Sheet → object
// คอลัมน์ (0-indexed):
//  0  รหัสผลงาน
//  1  คำนำหน้า
//  2  ชื่อ
//  3  นามสกุล
//  4  หัวโปสเตอร์   → headerNames
//  5  อีเมลส่วนตัว
//  6  เบอร์โทรศัพท์ส่วนตัว
//  7  ชื่อหน่วยงาน
//  8  ชื่อผลงาน      → projectTitle
//  9  ด้านของบทคัดย่อ → domain
// 10  สาขา
// =========================================================
function rowToWork(row) {
  const fullName = buildFullName(row);
  return {
    submissionId : row[0].toString().trim(),
    fullName     : fullName,
    headerNames  : row[4] ? row[4].toString().trim() : fullName,
    email        : row[5] ? row[5].toString().trim() : '',
    phone        : row[6] ? row[6].toString().trim() : '',
    department   : row[7] ? row[7].toString().trim() : '',
    projectTitle : row[8] ? row[8].toString().trim() : '',
    domain       : row[9] ? row[9].toString().trim() : '',
    branch       : row[10] ? row[10].toString().trim() : ''
  };
}

// =========================================================
// ACTION: batchGetAllWorks
// อ่านทุกแถวจาก Sheet แล้วส่งกลับ
// =========================================================
function handleBatchGetAllWorks() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) return { status: 'error', message: `ไม่พบชีต: ${SHEET_NAME}` };

  const data  = sheet.getDataRange().getValues();
  const works = data.slice(1) // ข้ามแถวหัว
    .filter(r => r[0] && r[0].toString().trim() !== '')
    .map(rowToWork);

  return { status: 'success', count: works.length, data: works };
}

// =========================================================
// ACTION: getWorkById
// ดึงข้อมูล 1 ชิ้น (ใช้ตอนทดสอบ)
// =========================================================
function handleGetWorkById(submissionId) {
  if (!submissionId) return { status: 'error', message: 'ต้องระบุ submissionId' };

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const data  = sheet.getDataRange().getValues();
  const row   = data.slice(1).find(r => r[0].toString().trim() === submissionId.trim());

  if (!row) return { status: 'error', message: `ไม่พบ ${submissionId} ใน Sheet "${SHEET_NAME}"` };
  return { status: 'success', data: rowToWork(row) };
}

// =========================================================
// ACTION: getOriginalFiles
// ดึงไฟล์ต้นฉบับ PDF + JPG จากโฟลเดอร์ img/pdf แยกตาม prefix
// ค้นหาด้วย "${submissionId}_ต้นฉบับ_" เพื่อไม่ให้ชนกับไฟล์ merged
// =========================================================
function handleGetOriginalFiles(submissionId) {
  if (!submissionId) return { status: 'error', message: 'ต้องระบุ submissionId' };

  const prefix = getPrefixFromId(submissionId);
  if (!prefix) return { status: 'error', message: `แยก prefix ไม่ได้จาก: ${submissionId}` };

  const folders = ORIGINAL_FOLDER_MAP[prefix];
  if (!folders) return { status: 'error', message: `ไม่พบโฟลเดอร์สำหรับ prefix: ${prefix}` };

  const pdfFolder = DriveApp.getFolderById(folders.pdf);
  const imgFolder = DriveApp.getFolderById(folders.img);

  // ค้นหาด้วย submissionId อย่างเดียว (ASCII) เพื่อหลีกเลี่ยง encoding ภาษาไทยใน query
  // แล้วกรองเอาเฉพาะไฟล์ที่ชื่อมี '_ต้นฉบับ_' ใน GAS code
  const pdfIter = pdfFolder.searchFiles(
    `title contains '${submissionId}' and mimeType = 'application/pdf' and trashed = false`
  );
  const jpgIter = imgFolder.searchFiles(
    `title contains '${submissionId}' and (mimeType = 'image/jpeg' or mimeType = 'image/jpg') and trashed = false`
  );

  let pdfFile = null;
  while (pdfIter.hasNext()) {
    const f = pdfIter.next();
    if (f.getName().indexOf('_ต้นฉบับ_') !== -1) { pdfFile = f; break; }
  }
  let jpgFile = null;
  while (jpgIter.hasNext()) {
    const f = jpgIter.next();
    if (f.getName().indexOf('_ต้นฉบับ_') !== -1) { jpgFile = f; break; }
  }

  if (!pdfFile) {
    return { status: 'error', message: `ไม่พบ PDF ต้นฉบับ (${submissionId}_ต้นฉบับ_*.pdf) ในโฟลเดอร์ PDF ของ ${prefix}` };
  }
  if (!jpgFile) {
    return { status: 'error', message: `ไม่พบ JPG ต้นฉบับ (${submissionId}_ต้นฉบับ_*.jpg) ในโฟลเดอร์ IMG ของ ${prefix}` };
  }

  return {
    status    : 'success',
    pdfName   : pdfFile.getName(),
    jpgName   : jpgFile.getName(),
    pdfBase64 : Utilities.base64Encode(pdfFile.getBlob().getBytes()),
    jpgBase64 : Utilities.base64Encode(jpgFile.getBlob().getBytes())
  };
}

// =========================================================
// ACTION: batchUploadFile
// รับไฟล์ merged จาก browser แล้วเซฟลง Drive
// - Merged_PDF → OUTPUT_FOLDER_PDF
// - Merged_JPG → OUTPUT_FOLDER_JPG
// ถ้ามีชื่อซ้ำ → trash อันเก่าก่อนแล้วสร้างใหม่
// =========================================================
function handleBatchUploadFile(payload) {
  const { submissionId, fileType, fileBase64, mimeType, fileName } = payload;

  if (!fileBase64)    return { status: 'error', message: 'ไม่มีข้อมูล fileBase64' };
  if (!fileName)      return { status: 'error', message: 'ไม่มี fileName' };
  if (!submissionId)  return { status: 'error', message: 'ไม่มี submissionId' };

  const prefix = getPrefixFromId(submissionId);
  if (!prefix) return { status: 'error', message: `แยก prefix ไม่ได้จาก: ${submissionId}` };

  const folders = OUTPUT_FOLDER_MAP[prefix];
  if (!folders) return { status: 'error', message: `ไม่พบโฟลเดอร์ output สำหรับ prefix: ${prefix}` };

  let folderId;
  if (fileType === 'Merged_PDF') {
    folderId = folders.pdf;
  } else if (fileType === 'Merged_JPG') {
    folderId = folders.img;
  } else {
    return { status: 'error', message: `fileType ไม่ถูกต้อง: ${fileType} (ต้องเป็น Merged_PDF หรือ Merged_JPG)` };
  }

  const folder = DriveApp.getFolderById(folderId);

  // ลบไฟล์ชื่อซ้ำ
  const existing = folder.getFilesByName(fileName);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }

  // สร้างไฟล์ใหม่
  const bytes   = Utilities.base64Decode(fileBase64);
  const blob    = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', fileName);
  const newFile = folder.createFile(blob);
  newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    status  : 'success',
    fileName: fileName,
    fileUrl : newFile.getUrl(),
    fileId  : newFile.getId()
  };
}
