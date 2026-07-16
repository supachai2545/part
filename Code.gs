// =========================================================
// CONFIG
// =========================================================

const SHEET_ID   = '16vppki0rcys88oJp2snDXVMUls5Q1Hw12o4ZvXk5Hug';
const SHEET_NAME = 'รายชื่อผลงาน'; // ⚠️ อย่าลืมเช็คชื่อแท็บ (Tab) ด้านล่างซ้ายของชีตให้เป็นคำว่า "รายชื่อผลงาน" ด้วยนะครับ

// โฟลเดอร์ต้นฉบับ (รวมไฟล์ PDF และรูปภาพไว้ในโฟลเดอร์เดียวกัน)
const ORIGINAL_FOLDER_MAP = {
  "P1": "1zj_8OTascLGRYqIJ4zbfO3MiEG8tOT9K",
  "P2": "1m9wxrJF5tMfvIg5Qv3GrTsNsOqbeYlBV",
  "P3": "1Ul5S7bnwWf9lJEFlYEM5VkHR8D-2pDih",
  "P4": "1mYJ6VBKLCBCKMp5gLSCyxsNbUt6RxV4Q",
  "RP1": "1Qx_nZvUruKB7wSy_lmyamYu8g11EZOhq",
  "RP2": "1FHsPL4-33H0n2ONZMsgm-F7RV2SaLU7f"
};

// โฟลเดอร์ผลลัพธ์ (merged files) — อัปเดตให้บันทึกลงโฟลเดอร์ใหม่ทั้งหมด
const OUTPUT_FOLDER_MAP = {
  "P1":  { pdf: "1niZv73fPrWJy4XS3tAOkvc0iGJTCjhIM", img: "1dckF23J3tWLaHuX8-S_ywGKbaxaKZlLR" },
  "P2":  { pdf: "1JDKRyJvDL8WAvPmDslpwTTx3KCkee1gf", img: "13cnlfwg8grL3oCLOyEVIsUk8xZ14FIn0" },
  "P3":  { pdf: "1bdV3UgLS3jrHS4XGf2RX3Hs5lH3zEpsE", img: "1pSw-SI92CluW7mBIqF2T5mQxoDLqi2A8" },
  "P4":  { pdf: "19DTkmiqMxeR7kUfdd7kXDa15gNNykb6f", img: "1l4J0v1D_CzPZu1XzMVUcuHhGmEPnhVdz" },
  "RP1": { pdf: "1hS1i11r9IqHl_d-MODLEE_I9g-Gjk8c4", img: "1F8UzBsWKGHGLuN-FzOx_ZP2QGcgYn34x" },
  "RP2": { pdf: "1H5jgSRr24nxcRYigNqpK6UGjuhSUn0lI", img: "167NnJRTMRh4wbsGBhyzPfJnPecyha1CA" }
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
      case 'listFolderFiles':
        result = handleListFolderFiles(e.parameter.prefix);
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
  const match = submissionId.toString().trim().match(/^([A-Za-z]+\d*)/);
  return match ? match[1].toUpperCase() : null;
}

// =========================================================
// HELPER: แปลง Rich Text ให้เป็นแท็ก HTML
// (ดึงตัวหนา, ตัวเอียง, ขีดเส้นใต้ จาก Sheet มาด้วย)
// =========================================================
function richTextToHTML(richTextValue) {
  if (!richTextValue) return '';
  const text = richTextValue.getText();
  if (!text) return '';

  const runs = richTextValue.getRuns();
  let html = '';

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const runText = run.getText();
    if (!runText) continue;

    const style = run.getTextStyle();
    let formattedText = runText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    if (style.isItalic())    formattedText = `<i>${formattedText}</i>`;
    if (style.isBold())      formattedText = `<b>${formattedText}</b>`;
    if (style.isUnderline()) formattedText = `<u>${formattedText}</u>`;

    html += formattedText;
  }

  return html;
}

// =========================================================
// HELPER: แปลงแถว Sheet → object
// (รองรับ richRow เพื่อดึงสไตล์ข้อความ)
// =========================================================
function rowToWork(row, richRow) {
  const prefixName = row[1] ? row[1].toString().trim() : '';
  const firstName  = row[2] ? row[2].toString().trim() : '';
  const lastName   = row[3] ? row[3].toString().trim() : '';
  const fullName   = [prefixName, firstName, lastName].filter(Boolean).join('');

  let headerHTML = '';
  if (richRow && richRow[4] && richRow[4].getText() !== '') {
    headerHTML = richTextToHTML(richRow[4]);
  } else {
    headerHTML = row[4] ? row[4].toString().trim() : fullName;
  }
  if (!headerHTML) headerHTML = fullName;

  let titleHTML = '';
  if (richRow && richRow[8] && richRow[8].getText() !== '') {
    titleHTML = richTextToHTML(richRow[8]);
  } else {
    titleHTML = row[8] ? row[8].toString().trim() : '';
  }

  return {
    submissionId : row[0].toString().trim(),
    prefixName   : prefixName,
    firstName    : firstName,
    lastName     : lastName,
    fullName     : fullName,
    headerNames  : headerHTML,
    email        : row[5] ? row[5].toString().trim() : '',
    phone        : row[6] ? row[6].toString().trim() : '',
    department   : row[7] ? row[7].toString().trim() : '',
    projectTitle : titleHTML,
    domain       : row[9] ? row[9].toString().trim() : '',
    branch       : row[10] ? row[10].toString().trim() : ''
  };
}

// =========================================================
// ACTION: batchGetAllWorks
// =========================================================
function handleBatchGetAllWorks() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) return { status: 'error', message: `ไม่พบชีต: ${SHEET_NAME}` };

  const range    = sheet.getDataRange();
  const data     = range.getValues();
  const richData = range.getRichTextValues();

  const works = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().trim() !== '') {
      works.push(rowToWork(data[i], richData[i]));
    }
  }

  return { status: 'success', count: works.length, data: works };
}

// =========================================================
// ACTION: getWorkById
// =========================================================
function handleGetWorkById(submissionId) {
  if (!submissionId) return { status: 'error', message: 'ต้องระบุ submissionId' };

  const sheet    = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const range    = sheet.getDataRange();
  const data     = range.getValues();
  const richData = range.getRichTextValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0].toString().trim() === submissionId.trim()) {
      return { status: 'success', data: rowToWork(data[i], richData[i]) };
    }
  }

  return { status: 'error', message: `ไม่พบ ${submissionId} ใน Sheet "${SHEET_NAME}"` };
}

// =========================================================
// ACTION: getOriginalFiles
// ดึงไฟล์ต้นฉบับ PDF + JPG จากโฟลเดอร์เดียวกัน
// =========================================================
function handleGetOriginalFiles(submissionId) {
  if (!submissionId) return { status: 'error', message: 'ต้องระบุ submissionId' };

  submissionId = submissionId.toString().trim();

  const prefix = getPrefixFromId(submissionId);
  if (!prefix) return { status: 'error', message: `แยก prefix ไม่ได้จาก: ${submissionId}` };

  const folderId = ORIGINAL_FOLDER_MAP[prefix];
  if (!folderId) return { status: 'error', message: `ไม่พบโฟลเดอร์ต้นฉบับสำหรับ prefix: ${prefix}` };

  const folder = DriveApp.getFolderById(folderId);
  const iter   = folder.getFiles();
  const exactIdRegex = new RegExp(submissionId + "(?!\\d)", "i");

  let pdfFile = null;
  let jpgFile = null;

  while (iter.hasNext()) {
    const f = iter.next();
    if (f.isTrashed()) continue;

    const fileName = f.getName();
    const mimeType = f.getMimeType();

    if (exactIdRegex.test(fileName) && fileName.includes('ต้นฉบับ')) {
      if (mimeType === MimeType.PDF || fileName.toLowerCase().endsWith('.pdf')) {
        pdfFile = f;
      } else if (mimeType.includes('image') || fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg') || fileName.toLowerCase().endsWith('.png')) {
        jpgFile = f;
      }
    }

    if (pdfFile && jpgFile) break;
  }

  if (!pdfFile) {
    return { status: 'error', message: `ไม่พบ PDF (รหัส ${submissionId} และมีคำว่า "ต้นฉบับ") ในโฟลเดอร์ต้นฉบับของ ${prefix}` };
  }
  if (!jpgFile) {
    return { status: 'error', message: `ไม่พบ JPG/PNG (รหัส ${submissionId} และมีคำว่า "ต้นฉบับ") ในโฟลเดอร์ต้นฉบับของ ${prefix}` };
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
// ACTION: listFolderFiles  (debug)
// =========================================================
function handleListFolderFiles(prefix) {
  if (!prefix) return { status: 'error', message: 'ต้องระบุ prefix' };
  prefix = prefix.toUpperCase();
  const folderId = ORIGINAL_FOLDER_MAP[prefix];
  if (!folderId) return { status: 'error', message: `ไม่พบโฟลเดอร์ต้นฉบับสำหรับ prefix: ${prefix}` };

  const folder = DriveApp.getFolderById(folderId);
  const iter   = folder.getFiles();
  const files  = [];
  while (iter.hasNext() && files.length < 40) {
    const f = iter.next();
    files.push({ name: f.getName(), mime: f.getMimeType(), id: f.getId() });
  }

  return {
    status : 'success',
    prefix,
    folder : { folderId, label: 'Original Folder', count: files.length, files }
  };
}

// =========================================================
// ACTION: batchUploadFile
// รับไฟล์ merged จากหน้าเว็บ จัดรูปแบบชื่อไฟล์ใหม่ และเซฟลง Drive
// =========================================================
function handleBatchUploadFile(payload) {
  const { submissionId, fileType, fileBase64, mimeType } = payload;

  if (!fileBase64)   return { status: 'error', message: 'ไม่มีข้อมูล fileBase64' };
  if (!submissionId) return { status: 'error', message: 'ไม่มี submissionId' };

  const prefix = getPrefixFromId(submissionId);
  if (!prefix) return { status: 'error', message: `แยก prefix ไม่ได้จาก: ${submissionId}` };

  const folders = OUTPUT_FOLDER_MAP[prefix];
  if (!folders) return { status: 'error', message: `ไม่พบโฟลเดอร์ output สำหรับ prefix: ${prefix}` };

  let folderId;
  let ext = '';
  if (fileType === 'Merged_PDF') {
    folderId = folders.pdf;
    ext = '.pdf';
  } else if (fileType === 'Merged_JPG') {
    folderId = folders.img;
    ext = '.jpg';
  } else {
    return { status: 'error', message: `fileType ไม่ถูกต้อง: ${fileType} (ต้องเป็น Merged_PDF หรือ Merged_JPG)` };
  }

  // สร้างชื่อไฟล์: รหัสผลงาน_คำนำหน้าชื่อ_นามสกุล
  let finalFileName = payload.fileName || `merged_${submissionId}${ext}`;
  const workResult = handleGetWorkById(submissionId);
  if (workResult.status === 'success') {
    const w = workResult.data;
    finalFileName = `${w.submissionId}_${w.prefixName}${w.firstName}_${w.lastName}${ext}`;
  }

  const folder = DriveApp.getFolderById(folderId);

  // ลบไฟล์ชื่อซ้ำ
  const existing = folder.getFilesByName(finalFileName);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }

  // สร้างไฟล์ใหม่
  const bytes   = Utilities.base64Decode(fileBase64);
  const blob    = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', finalFileName);
  const newFile = folder.createFile(blob);
  newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    status  : 'success',
    fileName: finalFileName,
    fileUrl : newFile.getUrl(),
    fileId  : newFile.getId()
  };
}
