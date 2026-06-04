// 1. ID ของ Google Sheets (อัปเดตเป็นลิงก์ใหม่สำหรับทดสอบ)
var SPREADSHEET_ID = "1GRfxTMCVqG98pJFJPYR44j9xOgx1Skyu2TUztbSy1ss";

// 2. ID ของโฟลเดอร์หลัก (สำรองไว้กรณีฉุกเฉิน)
var DEFAULT_FOLDER_ID = "1cJL3aNeSMS_1PuA-u6rZMTbhAb2EsD4-";

// 3. โฟลเดอร์ สำหรับเก็บไฟล์ "ต้นฉบับ"
var ORIGINAL_FOLDER_MAP = {
  "P1": "1zj_8OTascLGRYqIJ4zbfO3MiEG8tOT9K",
  "P2": "1m9wxrJF5tMfvIg5Qv3GrTsNsOqbeYlBV",
  "P3": "1Ul5S7bnwWf9lJEFlYEM5VkHR8D-2pDih",
  "P4": "1mYJ6VBKLCBCKMp5gLSCyxsNbUt6RxV4Q",
  "RP1": "1Qx_nZvUruKB7wSy_lmyamYu8g11EZOhq",
  "RP2": "1FHsPL4-33H0n2ONZMsgm-F7RV2SaLU7f"
};

// 4. โฟลเดอร์ สำหรับเก็บไฟล์ "รวมร่างแล้ว"
var MERGED_FOLDER_MAP = {
  "P1": { img: "1n32NOm67363lSNDH3P5Ej4gOmIaJPSie", pdf: "1ptF5TiSUpGSJSd0JXzPZHUKmwIsRQSwd" },
  "P2": { img: "13iHgQcsLYdu3bg6j1fHpNpZpfzsgX78Y", pdf: "1EfLLJocUiUYNIRxAw3aoiE2lmcMzarpM" },
  "P3": { img: "1bD4Cz0NKXMz8Wmn3Hn_NbgRmFcLp7yH6", pdf: "1-RE_Xm6BZ9IeBUznpiRBXfxHYXQX0uFe" },
  "P4": { img: "1bMU9VWI6K8JLE9RjZc7VtOH4cc-IXq-V", pdf: "1rMHscua-SAswWNij3og-OB25PppVZ-jd" },
  "RP1": { img: "1xEEwYV6-9tY11AeHhF04mAZSTWo6vm5q", pdf: "10Cf2JyIQ9uHWoKoQNJbZfhBKBw2H7fka" },
  "RP2": { img: "1iyzokDEEMx7sS1aEfWCHgx19gT3mqAHb", pdf: "1gIkLjjXGpFIhqGhw39RSbEfklZlvGtfc" }
};

// ==========================================
// 🌐 API ROUTING (doGet & doPost)
// ==========================================
function doGet(e) {
  var action = e.parameter.action;
  var result = { status: "error", message: "Invalid Action" };

  if (action === "search") {
    result = searchData(e.parameter.query);
  } else if (action === "getAdminData") {
    result = { status: "success", data: getPosterData() };
  }

  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var result = { status: "error", message: "Invalid Action" };

    // 🌟 ระบบเพิ่ม API ใหม่สำหรับการทยอยส่งไฟล์ทีละชิ้น
    if (action === "uploadSingleFile") {
      result = uploadSingleFileAPI(payload);
    } else if (action === "saveDataSequential") {
      result = saveDataSequentialAPI(payload.data);
    } else if (action === "saveData") {
      result = saveMultipleData(payload.data); // โค้ดเดิมสำรองไว้
    } else if (action === "sendSummaryEmail") {
      result = sendDeferredSummaryEmail(payload.email, payload.submissionIds);
    } else if (action === "updateAdmin") {
      result = updateAdminStatus(payload.submissionId, payload.newStatus, payload.remark);
    } else if (action === "recordVisit") {
      result = recordVisitCount();
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    console.error("ข้อผิดพลาดใน doPost: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 🌟 1. API: รับไฟล์ทีละชิ้นมาเก็บลง Drive ตามรหัส
// ✅ แก้: เอา Global Lock ออก — ไฟล์แต่ละชิ้นไปคนละโฟลเดอร์/คนละชื่อ
//        ไม่มี shared resource จึงให้อัปพร้อมกันได้ (สูงสุด ~30 คน)
// ==========================================
function uploadSingleFileAPI(payload) {
  try {
    var subId = String(payload.submissionId).trim().toUpperCase();
    var prefixCode = subId.substring(0, 3).includes("RP") ? subId.substring(0, 3) : subId.substring(0, 2);
    var fileType = payload.fileType; // 'Merged_PDF', 'Merged_JPG', 'Original_PDF', 'Original_JPG'

    // คำนวณหาโฟลเดอร์ปลายทาง
    var targetFolderId = DEFAULT_FOLDER_ID;
    if (fileType.includes("Original")) {
      targetFolderId = ORIGINAL_FOLDER_MAP[prefixCode] || DEFAULT_FOLDER_ID;
    } else if (fileType === "Merged_PDF") {
      targetFolderId = MERGED_FOLDER_MAP[prefixCode] ? MERGED_FOLDER_MAP[prefixCode].pdf : DEFAULT_FOLDER_ID;
    } else if (fileType === "Merged_JPG") {
      targetFolderId = MERGED_FOLDER_MAP[prefixCode] ? MERGED_FOLDER_MAP[prefixCode].img : DEFAULT_FOLDER_ID;
    }

    var folder = DriveApp.getFolderById(targetFolderId);

    // ลบไฟล์เดิมถ้าชื่อซ้ำ
    var existingFiles = folder.searchFiles("title = '" + payload.fileName + "'");
    while (existingFiles.hasNext()) { existingFiles.next().setTrashed(true); }

    // สร้างไฟล์ใหม่
    var blob = Utilities.newBlob(Utilities.base64Decode(payload.fileBase64), payload.mimeType, payload.fileName);
    var savedFile = folder.createFile(blob);
    savedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { status: "success", fileUrl: savedFile.getUrl() };
  } catch (error) {
    return { status: "error", message: error.toString() };
  }
}

// ==========================================
// 🌟 2. API: บันทึกข้อมูลลงชีต และส่งอีเมลเมื่อได้ไฟล์ครบแล้ว
// ✅ แก้: ปลดล็อกทันทีหลังเขียนชีตเสร็จ แล้วค่อยส่งอีเมล (นอกล็อก)
//        ลดเวลาถือ Global Lock ลงมาก ไม่ให้คิวคนอื่นค้างตอนส่งเมล
// ==========================================
function saveDataSequentialAPI(payloadArray) {
  var emailJobs = []; // เก็บงานส่งเมลไว้ทำหลังปลดล็อก

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { status: "error", message: "เซิร์ฟเวอร์มีผู้ใช้งานหนาแน่น กรุณาลองใหม่อีกครั้ง" }; }

  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheets()[0];
    var allData = sheet.getDataRange().getValues();

    for (var p = 0; p < payloadArray.length; p++) {
      var data = payloadArray[p];
      var targetId = String(data.submissionId).trim().toLowerCase();
      var timeStamp = getThaiTimestamp();

      for (var i = 1; i < allData.length; i++) {
        if (String(allData[i][0]).trim().toLowerCase() === targetId) {
          var row = i + 1;

          // ลบไฟล์ URL เดิมที่มีอยู่ในชีต
          var oldPdfUrl = sheet.getRange(row, 13).getValue();
          var oldJpgUrl = sheet.getRange(row, 14).getValue();
          trashDriveFileByUrl(oldPdfUrl); trashDriveFileByUrl(oldJpgUrl);

          // ใส่ URL ใหม่ที่อัปโหลดสำเร็จแล้ว
          if (data.fileUrls.mergedPdf) sheet.getRange(row, 13).setValue(data.fileUrls.mergedPdf);
          if (data.fileUrls.mergedJpg) sheet.getRange(row, 14).setValue(data.fileUrls.mergedJpg);

          sheet.getRange(row, 15).setValue(timeStamp);
          sheet.getRange(row, 16).setValue(data.pdpaStatus);
          sheet.getRange(row, 17).setValue(data.ipAddress);

          var currentStatus = allData[i][17] ? String(allData[i][17]).trim() : "";
          if (currentStatus === "Rejected" || currentStatus === "Requested") {
            sheet.getRange(row, 20).setValue("ส่งไฟล์แก้ไขแล้วเมื่อ: " + timeStamp);
          }

          // 🌟 เตรียมข้อมูลส่งเมล แต่ยังไม่ส่งตอนนี้ (เก็บไว้ส่งหลังปลดล็อก)
          if (data.email) {
            var prefix = allData[i][1] ? String(allData[i][1]).trim() : "";
            var nameOnly = allData[i][2] ? String(allData[i][2]).trim() : "";
            var surnameOnly = allData[i][3] ? String(allData[i][3]).trim() : "";
            var emailFullName = (prefix + nameOnly + " " + surnameOnly).trim() || data.fullName;
            emailFullName = emailFullName.replace(/\s+/g, ' ');

            emailJobs.push({
              email: data.email,
              fullName: emailFullName,
              info: {
                subId: data.submissionId,
                pdfName: data.submissionId + "_" + emailFullName + ".pdf",
                jpgName: data.submissionId + "_" + emailFullName + ".jpg",
                time: timeStamp
              },
              pdfUrl: data.fileUrls.mergedPdf,
              jpgUrl: data.fileUrls.mergedJpg
            });
          }
          break; // จบการทำงานของแถวนี้
        }
      }
    }

    SpreadsheetApp.flush();
    clearSheetCache();
  } catch (error) {
    console.error("เกิดข้อผิดพลาดใน saveDataSequentialAPI: " + error.toString());
    lock.releaseLock();
    return { status: "error", message: error.toString() };
  }

  lock.releaseLock(); // 🔓 ปลดล็อกทันทีหลังเขียนชีตเสร็จ — ปล่อยให้คนถัดไปทำงานได้เลย

  // 📧 ส่งอีเมลหลังปลดล็อกแล้ว (ไม่บล็อกคิวคนอื่น) — ถ้าเมลพังก็ไม่กระทบการบันทึก
  for (var k = 0; k < emailJobs.length; k++) {
    try {
      var job = emailJobs[k];
      var blobs = [];
      var pdfBlob = getBlobFromUrl(job.pdfUrl);
      var jpgBlob = getBlobFromUrl(job.jpgUrl);
      if (pdfBlob) blobs.push(pdfBlob);
      if (jpgBlob) blobs.push(jpgBlob);
      sendConsolidatedSuccessEmail(job.email, job.fullName, [job.info], blobs);
    } catch (e) {
      console.error("ส่งเมลไม่สำเร็จ: " + e.toString());
    }
  }

  return { status: "success" };
}


// ==========================================
// 👁️ ฟังก์ชันบันทึกยอดเข้าชมเว็บไซต์ (แยกรายวันอัตโนมัติ)
// ==========================================
function recordVisitCount() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheetName = "การเข้าสู่ระบบ";
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange("A1").setValue("จำนวนผู้ที่เข้ามาดูเว็บ (ยอดเดิม)").setFontWeight("bold");
      sheet.getRange("A2").setValue(0);
    }

    if (sheet.getRange("C1").getValue() === "") {
      sheet.getRange("C1").setValue("วันที่เข้าชม").setFontWeight("bold").setBackground("#e2e8f0");
      sheet.getRange("D1").setValue("จำนวนครั้ง (รายวัน)").setFontWeight("bold").setBackground("#e2e8f0");
    }

    var today = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");
    var cValues = sheet.getRange("C:C").getValues();
    var foundRow = -1;
    var lastRowC = 1;

    for (var i = 1; i < cValues.length; i++) {
      if (cValues[i][0] !== "") {
        lastRowC = i + 1;
        if (String(cValues[i][0]) === today || Utilities.formatDate(new Date(cValues[i][0]), "Asia/Bangkok", "dd/MM/yyyy") === today) {
          foundRow = i + 1;
        }
      }
    }

    if (foundRow !== -1) {
      var currentCount = sheet.getRange(foundRow, 4).getValue();
      if (isNaN(currentCount) || currentCount === "") currentCount = 0;
      sheet.getRange(foundRow, 4).setValue(Number(currentCount) + 1);
    } else {
      var nextRow = lastRowC + 1;
      sheet.getRange(nextRow, 3).setValue(today);
      sheet.getRange(nextRow, 4).setValue(1);
    }

    return { status: "success" };
  } catch (error) {
    return { status: "error", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// ⚡ ระบบ CACHE SERVICE
// ==========================================
function getSheetDataCached() {
  var cache = CacheService.getScriptCache();
  var cachedData = cache.get("db_poster_data");
  if (cachedData) return JSON.parse(cachedData);

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  var filteredData = data.filter(function(row, index) { return index === 0 || row[0] !== ""; });

  try { cache.put("db_poster_data", JSON.stringify(filteredData), 60); } catch(e) {}
  return filteredData;
}

function clearSheetCache() { CacheService.getScriptCache().remove("db_poster_data"); }

// ==========================================
// 📊 ฟังก์ชันดึงข้อมูล Dashboard (แอดมิน)
// ==========================================
function getPosterData() {
  try {
    var data = getSheetDataCached();
    var results = [];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      var id = String(data[i][0]).trim();
      var prefix = data[i][1] ? String(data[i][1]).trim() : "";
      var name = data[i][2] ? String(data[i][2]).trim() : "";
      var surname = data[i][3] ? String(data[i][3]).trim() : "";
      results.push({
        submissionId: id,
        fullName: (prefix + name + " " + surname).trim(),
        headerNames: data[i][4] ? String(data[i][4]).trim() : "",
        email: data[i][5] ? String(data[i][5]).trim() : "",
        organization: data[i][7] ? String(data[i][7]).trim() : "-",
        projectTitle: data[i][8] ? String(data[i][8]).trim() : "-",
        category: data[i][10] ? String(data[i][10]).trim() : (data[i][9] ? String(data[i][9]).trim() : ""),
        pdfUrl: data[i][12] ? String(data[i][12]).trim() : "",
        jpgUrl: data[i][13] ? String(data[i][13]).trim() : "",
        adminStatus: data[i][17] ? String(data[i][17]).trim() : "",
        adminRemark: data[i][18] ? String(data[i][18]).trim() : "",
        editStatus: data[i][19] ? String(data[i][19]).trim() : ""
      });
    }
    return results;
  } catch (error) { throw new Error(error.toString()); }
}

// ==========================================
// 🔍 ฟังก์ชันค้นหาข้อมูล
// ==========================================
function cleanThaiText(text) {
  if(!text) return "";
  return String(text).replace(/[ะ-ฺ็-๎\-\s]/g, '').toLowerCase();
}

function searchData(query) {
  try {
    if (!query) return { status: "error", message: "กรุณาระบุคำค้นหา" };
    var originalQuery = String(query).trim();
    var queryClean = cleanThaiText(originalQuery);
    var queryEmail = originalQuery.toLowerCase();
    var queryPhone = originalQuery.replace(/\D/g, '');

    var data = getSheetDataCached();
    var results = [];

    var ss = null;
    var sheet = null;

    for (var i = 1; i < data.length; i++) {
      var id = String(data[i][0]).toLowerCase().trim();
      var fN = String(data[i][2]).trim();
      var lN = String(data[i][3]).trim();

      var email = String(data[i][5]).toLowerCase().trim();
      var phoneData = String(data[i][6]).replace(/\D/g, '');

      var fullNameClean = cleanThaiText(fN + lN);

      if ((id === queryClean) || (email === queryEmail) || (fullNameClean === queryClean) || (queryPhone.length >= 10 && phoneData === queryPhone)) {

        if (!ss) {
          ss = SpreadsheetApp.openById(SPREADSHEET_ID);
          sheet = ss.getSheets()[0];
        }
        var titleCell = sheet.getRange(i + 1, 9);
        var formattedProjectTitle = getCellValueAsHtml(titleCell);

        var headerNames = data[i][4] ? String(data[i][4]).trim() : "";
        var pdfUrl = data[i][12] ? String(data[i][12]).trim() : "";
        var jpgUrl = data[i][13] ? String(data[i][13]).trim() : "";
        var isUploaded = (pdfUrl !== "" && jpgUrl !== "");

        var adminStatus = data[i][17] ? String(data[i][17]).trim() : "";
        var adminRemark = data[i][18] ? String(data[i][18]).trim() : "";
        var editStatus = data[i][19] ? String(data[i][19]).trim() : "";

        if ((adminStatus === "Rejected" || adminStatus === "Requested") && editStatus === "") {
           isUploaded = false;
        }

        var prefix = data[i][1] ? String(data[i][1]).trim() : "";

        results.push({
          submissionId: data[i][0],
          fullName: (prefix + fN + " " + lN).trim(),
          headerNames: headerNames,
          projectTitle: formattedProjectTitle,
          domain: data[i][9] ? String(data[i][9]).trim() : "",
          branch: data[i][10] ? String(data[i][10]).trim() : "",
          organization: data[i][7],
          email: data[i][5],
          phone: data[i][6],
          fileUrl: isUploaded ? "uploaded" : "",
          adminStatus: adminStatus,
          adminRemark: adminRemark,
          editStatus: editStatus
        });
      }
    }
    if (results.length > 0) return { status: "success", data: results };
    return { status: "not_found", message: "ไม่พบข้อมูล กรุณาตรวจสอบการสะกดชื่อ-นามสกุล, อีเมล หรือเบอร์โทรให้ถูกต้อง" };
  } catch (error) { return { status: "error", message: error.toString() }; }
}

function trashDriveFileByUrl(url) {
  if (!url) return;
  try {
    var match = url.match(/\/file\/d\/(.*?)\//) || url.match(/id=(.*?)(&|$)/);
    if (match && match[1]) DriveApp.getFileById(match[1]).setTrashed(true);
  } catch (e) {}
}

function getThaiTimestamp() {
  var now = new Date();
  var thaiFormatter = new Intl.DateTimeFormat('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });
  return thaiFormatter.format(now);
}

// ==========================================
// 💾 บันทึกข้อมูลแบบเดิม (สำรองไว้กรณีอื่นๆ)
// ==========================================
function saveMultipleData(payloadArray) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { status: "error", message: "เซิร์ฟเวอร์มีผู้ใช้งานหนาแน่น กรุณาลองใหม่อีกครั้ง" }; }

  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheets()[0];
    var allData = sheet.getDataRange().getValues();

    for (var p = 0; p < payloadArray.length; p++) {
      var data = payloadArray[p];
      var mergedPdfUrl = ""; var mergedJpgUrl = "";
      var mergedBlobs = [];

      var upperId = String(data.submissionId).trim().toUpperCase();
      var prefixCode = upperId.substring(0, 3).includes("RP") ? upperId.substring(0, 3) : upperId.substring(0, 2);
      var cleanName = String(data.fullName).trim();
      var pdfNameForEmail = ""; var jpgNameForEmail = "";

      if (data.originalFiles && data.originalFiles.length > 0) {
        var originalTargetFolderId = ORIGINAL_FOLDER_MAP[prefixCode] || DEFAULT_FOLDER_ID;
        var originalFolder = DriveApp.getFolderById(originalTargetFolderId);

        for (var f = 0; f < data.originalFiles.length; f++) {
          var origF = data.originalFiles[f];
          var origName = upperId + "_ต้นฉบับ_" + cleanName + "." + origF.fileExtension;

          var existingOrigFiles = originalFolder.searchFiles("title = '" + origName + "'");
          while (existingOrigFiles.hasNext()) { existingOrigFiles.next().setTrashed(true); }

          var origBlob = Utilities.newBlob(Utilities.base64Decode(origF.fileBase64), origF.mimeType, origName);
          originalFolder.createFile(origBlob);

          if(origF.fileType === "PDF") pdfNameForEmail = origF.fileName;
          if(origF.fileType === "JPG") jpgNameForEmail = origF.fileName;
        }
      }

      if (data.mergedFiles && data.mergedFiles.length > 0) {
        var mergedFolderConfig = MERGED_FOLDER_MAP[prefixCode];
        var pdfFolderId = mergedFolderConfig ? mergedFolderConfig.pdf : DEFAULT_FOLDER_ID;
        var imgFolderId = mergedFolderConfig ? mergedFolderConfig.img : DEFAULT_FOLDER_ID;
        var pdfFolder = DriveApp.getFolderById(pdfFolderId);
        var imgFolder = DriveApp.getFolderById(imgFolderId);

        for (var f = 0; f < data.mergedFiles.length; f++) {
          var mergF = data.mergedFiles[f];
          var mergName = upperId + "_" + cleanName + "." + mergF.fileExtension;
          var targetFolder = (mergF.fileType === "PDF") ? pdfFolder : imgFolder;

          var existingMergedFiles = targetFolder.searchFiles("title = '" + mergName + "'");
          while (existingMergedFiles.hasNext()) { existingMergedFiles.next().setTrashed(true); }

          var mergBlob = Utilities.newBlob(Utilities.base64Decode(mergF.fileBase64), mergF.mimeType, mergName);
          mergedBlobs.push(mergBlob);
          var file = targetFolder.createFile(mergBlob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

          if (mergF.fileType === "PDF") mergedPdfUrl = file.getUrl();
          if (mergF.fileType === "JPG") mergedJpgUrl = file.getUrl();
        }
      }

      var targetId = String(data.submissionId).trim().toLowerCase();
      var timeStamp = getThaiTimestamp();

      for (var i = 1; i < allData.length; i++) {
        if (String(allData[i][0]).trim().toLowerCase() === targetId) {
          var row = i + 1;

          var oldPdfUrl = sheet.getRange(row, 13).getValue();
          var oldJpgUrl = sheet.getRange(row, 14).getValue();
          trashDriveFileByUrl(oldPdfUrl); trashDriveFileByUrl(oldJpgUrl);

          if (mergedPdfUrl !== "") sheet.getRange(row, 13).setValue(mergedPdfUrl);
          if (mergedJpgUrl !== "") sheet.getRange(row, 14).setValue(mergedJpgUrl);

          sheet.getRange(row, 15).setValue(timeStamp);
          sheet.getRange(row, 16).setValue(data.pdpaStatus);
          sheet.getRange(row, 17).setValue(data.ipAddress);

          var currentStatus = allData[i][17] ? String(allData[i][17]).trim() : "";
          if (currentStatus === "Rejected" || currentStatus === "Requested") {
            sheet.getRange(row, 20).setValue("ส่งไฟล์แก้ไขแล้วเมื่อ: " + timeStamp);
          }

          if (data.email) {
             var nameOnly = allData[i][2] ? String(allData[i][2]).trim() : "";
             var surnameOnly = allData[i][3] ? String(allData[i][3]).trim() : "";
             var emailFullName = (nameOnly + " " + surnameOnly).trim() || data.fullName;

             var singleSubmissionInfo = [{
                 subId: data.submissionId,
                 pdfName: pdfNameForEmail,
                 jpgName: jpgNameForEmail,
                 time: timeStamp
             }];

             sendConsolidatedSuccessEmail(data.email, emailFullName, singleSubmissionInfo, mergedBlobs);
          }
          break;
        }
      }
    }

    SpreadsheetApp.flush();
    clearSheetCache();
    return { status: "success" };
  } catch (error) {
    console.error("เกิดข้อผิดพลาดใน saveMultipleData: " + error.toString());
    return { status: "error", message: error.toString() };
  } finally { lock.releaseLock(); }
}

// 🌟 ฟังก์ชันส่งอีเมล
function sendConsolidatedSuccessEmail(recipientEmail, fullName, submissionsInfo, blobs) {
  var submissionsHtml = "";
  var subIdList = [];

  for (var i = 0; i < submissionsInfo.length; i++) {
    var info = submissionsInfo[i];
    subIdList.push(info.subId);
    submissionsHtml += `<div style="margin: 15px 0; padding: 15px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc; line-height: 1.8; color: #334155;">
      <strong>ผลงานรหัส:</strong> ${info.subId}<br/>
      <strong>ไฟล์ที่อัปโหลด:</strong><br/>
      <span style="color: #64748b; font-size: 14px;">1. ${info.pdfName || 'ไฟล์ PDF'}</span><br/>
      <span style="color: #64748b; font-size: 14px;">2. ${info.jpgName || 'ไฟล์ JPEG'}</span><br/>
      <strong>เวลาที่บันทึก:</strong> ${info.time}
    </div>`;
  }

  var titleSubIds = subIdList.join(", ");
  if (titleSubIds.length > 40) titleSubIds = titleSubIds.substring(0, 40) + "...";

  var htmlBody = `<div style="font-family: 'Sarabun', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); background-color: #ffffff;"><div style="background-color: #166534; padding: 24px; text-align: center;"><h2 style="color: #ffffff; margin: 0; font-size: 20px;">ยืนยันการรับไฟล์ผลงาน E-Poster</h2></div><div style="padding: 32px;"><p style="font-size: 16px; color: #334155; margin-top: 0;">เรียน คุณ <strong>${fullName}</strong>,</p><p style="font-size: 15px; color: #475569; line-height: 1.6;">ระบบได้รับไฟล์ผลงานของท่านจำนวน <strong>${submissionsInfo.length}</strong> รายการ เรียบร้อยแล้ว โดยมีรายละเอียดดังนี้:</p>

  ${submissionsHtml}

  <p style="font-size: 14px; color: #475569; line-height: 1.6;"><em>* ท่านสามารถตรวจสอบความถูกต้องของผลงานทั้งหมดที่ประกอบส่วนหัวเรียบร้อยแล้ว ได้จากไฟล์แนบในอีเมลฉบับนี้</em></p><div style="margin-top: 24px; padding: 16px; background-color: #f0fdf4; border-left: 4px solid #166534; border-radius: 4px;"><p style="margin: 0; font-size: 14px; color: #166534;"><strong>☎ ติดต่อสอบถามเพิ่มเติม:คุณศุภชัยหรือคุณวรรณวิภา</strong><br>โทร. 02 951 0000 ต่อ 99051, 99187</p></div><div style="text-align: center; margin-top: 32px; margin-bottom: 8px;"><p style="margin: 0; font-size: 14px; color: #166534; font-style: italic; font-weight: 600;">“From Lab to Life: Sciences for Healthy Longevity<br>จากห้องแล็บสู่ชีวิตจริง วิทยาศาสตร์เพื่อการมีสุขภาพยืนยาว”</p></div></div><div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;"><p style="margin: 0; font-size: 12px; font-weight: bold; color: #64748b;">ระบบอีเมลอัตโนมัติ กรุณาอย่าตอบกลับ (Do not reply)</p><p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">© กองแผนงานและวิชาการ กรมวิทยาศาสตร์การแพทย์</p></div></div>`;

  try {
    GmailApp.sendEmail(recipientEmail, "ยืนยันการรับไฟล์ผลงาน E-Poster รหัส " + titleSubIds, "", { htmlBody: htmlBody, name: "ระบบรับผลงาน E-Poster", attachments: blobs });
  } catch (e) {
    console.error("เกิดข้อผิดพลาดในการส่งอีเมลผ่าน GmailApp: " + e.toString());
  }
}

function updateAdminStatus(submissionId, newStatus, remark) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { status: "error", message: "ระบบไม่ว่าง" }; }
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheets()[0];
    var data = sheet.getDataRange().getValues();
    var targetId = String(submissionId).trim().toLowerCase();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === targetId) {
        var row = i + 1;
        sheet.getRange(row, 18).setValue(newStatus);
        sheet.getRange(row, 19).setValue(remark);
        if (newStatus === "Approved") sheet.getRange(row, 20).clearContent();
        clearSheetCache(); return { status: "success" };
      }
    }
    return { status: "error", message: "ไม่พบรหัสผลงานในฐานข้อมูล" };
  } catch (error) { return { status: "error", message: error.toString() }; } finally { lock.releaseLock(); }
}

function getCellValueAsHtml(cell) {
  var richText = cell.getRichTextValue();
  if (!richText) {
    return cell.getDisplayValue();
  }

  var runs = richText.getRuns();
  if (runs.length <= 1) {
    if (runs.length === 1 && runs[0].getTextStyle().isItalic()) {
      return "<i>" + richText.getText() + "</i>";
    }
    return richText.getText();
  }

  var htmlResult = "";
  for (var i = 0; i < runs.length; i++) {
    var run = runs[i];
    var runText = run.getText();
    var style = run.getTextStyle();

    if (style.isItalic()) {
      htmlResult += "<i>" + runText + "</i>";
    } else {
      htmlResult += runText;
    }
  }
  return htmlResult;
}

function sendDeferredSummaryEmail(recipientEmail, submissionIds) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheets()[0];
    var allData = sheet.getDataRange().getValues();

    var fullName = "";
    var submissionsInfo = [];
    var blobs = [];

    var targetIds = submissionIds.map(function(id) { return String(id).trim().toLowerCase(); });

    for (var i = 1; i < allData.length; i++) {
      var rowId = String(allData[i][0]).trim().toLowerCase();
      if (targetIds.indexOf(rowId) !== -1) {
        var id = allData[i][0];
        var nameOnly = allData[i][2] ? String(allData[i][2]).trim() : "";
        var surnameOnly = allData[i][3] ? String(allData[i][3]).trim() : "";

        if (!fullName) {
          var prefix = allData[i][1] ? String(allData[i][1]).trim() : "";
          fullName = (prefix + nameOnly + " " + surnameOnly).trim();
        }

        var pdfUrl = allData[i][12] ? String(allData[i][12]).trim() : "";
        var jpgUrl = allData[i][13] ? String(allData[i][13]).trim() : "";
        var timeStamp = allData[i][14] ? String(allData[i][14]).trim() : getThaiTimestamp();

        var pdfBlob = getBlobFromUrl(pdfUrl);
        var jpgBlob = getBlobFromUrl(jpgUrl);

        if (pdfBlob) blobs.push(pdfBlob);
        if (jpgBlob) blobs.push(jpgBlob);

        submissionsInfo.push({
          subId: id,
          pdfName: pdfBlob ? pdfBlob.getName() : "ไฟล์ PDF ส่วนหัวสำเร็จ",
          jpgName: jpgBlob ? jpgBlob.getName() : "ไฟล์ JPEG ส่วนหัวสำเร็จ",
          time: timeStamp
        });
      }
    }

    if (submissionsInfo.length > 0) {
      sendConsolidatedSuccessEmail(recipientEmail, fullName, submissionsInfo, blobs);
      return { status: "success" };
    } else {
      console.warn("ไม่พบข้อมูลรหัสผลงานที่ต้องการส่งเมลในชีตหลัก");
      return { status: "error", message: "ไม่พบข้อมูลรหัสผลงานที่ระบุในฐานข้อมูลเพื่อส่งอีเมล" };
    }
  } catch (error) {
    console.error("ข้อผิดพลาดใน sendDeferredSummaryEmail: " + error.toString());
    return { status: "error", message: "ข้อผิดพลาดระบบส่งเมล: " + error.toString() };
  }
}

// ฟังก์ชันช่วยดึงไฟล์แนบจาก Google Drive ออกมาเป็น Blob
function getBlobFromUrl(url) {
  if (!url) return null;
  try {
    var match = url.match(/\/file\/d\/(.*?)\//) || url.match(/id=(.*?)(&|$)/);
    if (match && match[1]) {
      return DriveApp.getFileById(match[1]).getBlob();
    }
  } catch (e) {
    console.error("เกิดข้อผิดพลาดขณะพยายามอ่านไฟล์ Blob จากไดรฟ์: " + e.toString());
  }
  return null;
}

function authorize() {
  DriveApp.getRootFolder();
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), "ระบบตรวจรับสิทธิ์การทำงาน", "ระบบอนุมัติสิทธิ์การส่งเมลและบันทึกไฟล์เรียบร้อยแล้ว");
}
