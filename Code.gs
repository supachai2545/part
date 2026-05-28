// ==========================================
// CONFIG — IDs ของ Google Sheets และโฟลเดอร์ Drive
// ==========================================
var SPREADSHEET_ID = "1GRfxTMCVqG98pJFJPYR44j9xOgx1Skyu2TUztbSy1ss";
var DEFAULT_FOLDER_ID = "1cJL3aNeSMS_1PuA-u6rZMTbhAb2EsD4-";

var ORIGINAL_FOLDER_MAP = {
  "P1":  "1zj_8OTascLGRYqIJ4zbfO3MiEG8tOT9K",
  "P2":  "1m9wxrJF5tMfvIg5Qv3GrTsNsOqbeYlBV",
  "P3":  "1Ul5S7bnwWf9lJEFlYEM5VkHR8D-2pDih",
  "P4":  "1mYJ6VBKLCBCKMp5gLSCyxsNbUt6RxV4Q",
  "RP1": "1Qx_nZvUruKB7wSy_lmyamYu8g11EZOhq",
  "RP2": "1FHsPL4-33H0n2ONZMsgm-F7RV2SaLU7f"
};

var MERGED_FOLDER_MAP = {
  "P1":  { img: "1n32NOm67363lSNDH3P5Ej4gOmIaJPSie", pdf: "1ptF5TiSUpGSJSd0JXzPZHUKmwIsRQSwd" },
  "P2":  { img: "13iHgQcsLYdu3bg6j1fHpNpZpfzsgX78Y", pdf: "1EfLLJocUiUYNIRxAw3aoiE2lmcMzarpM" },
  "P3":  { img: "1bD4Cz0NKXMz8Wmn3Hn_NbgRmFcLp7yH6", pdf: "1-RE_Xm6BZ9IeBUznpiRBXfxHYXQX0uFe" },
  "P4":  { img: "1bMU9VWI6K8JLE9RjZc7VtOH4cc-IXq-V", pdf: "1rMHscua-SAswWNij3ob-OB25PppVZ-jd" },
  "RP1": { img: "1xEEwYV6-9tY11AeHhF04mAZSTWo6vm5q", pdf: "10Cf2JyIQ9uHWoKoQNJbZfhBKBw2H7fka" },
  "RP2": { img: "1iyzokDEEMx7sS1aEfWCHgx19gT3mqAHb", pdf: "1gIkLjjXGpFIhqGhw39RSbEfklZlvGtfc" }
};

// ==========================================
// API ROUTING
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
    if (action === "uploadSingleFile") {
      result = uploadSingleFileAPI(payload);
    } else if (action === "saveDataSequential") {
      result = saveDataSequentialAPI(payload.data);
    } else if (action === "updateAdmin") {
      result = updateAdminStatus(payload.submissionId, payload.newStatus, payload.remark);
    } else if (action === "recordVisit") {
      result = recordVisitCount();
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error("ข้อผิดพลาดใน doPost: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// HELPER: ดึง prefix code ด้วย regex (แก้ U3)
// ==========================================
function getPrefixCode(subId) {
  var match = String(subId).trim().toUpperCase().match(/^(RP\d+|P\d+)/);
  return match ? match[1] : String(subId).trim().toUpperCase().substring(0, 2);
}

// ==========================================
// 1. API: รับไฟล์ทีละชิ้นมาเก็บลง Drive
// ==========================================
function uploadSingleFileAPI(payload) {
  var lock = LockService.getScriptLock();
  // [แก้ S2] แยก waitLock ออกมาเพื่อป้องกัน releaseLock() crash เมื่อ lock ไม่ถูก acquire
  try {
    lock.waitLock(15000);
  } catch (e) {
    return { status: "error", message: "เซิร์ฟเวอร์มีผู้ใช้งานหนาแน่น กรุณาลองใหม่อีกครั้ง" };
  }
  try {
    var subId = String(payload.submissionId).trim().toUpperCase();
    var prefixCode = getPrefixCode(subId); // [แก้ U3]
    var fileType = payload.fileType;

    var targetFolderId = DEFAULT_FOLDER_ID;
    if (fileType.includes("Original")) {
      targetFolderId = ORIGINAL_FOLDER_MAP[prefixCode] || DEFAULT_FOLDER_ID;
    } else if (fileType === "Merged_PDF") {
      targetFolderId = MERGED_FOLDER_MAP[prefixCode] ? MERGED_FOLDER_MAP[prefixCode].pdf : DEFAULT_FOLDER_ID;
    } else if (fileType === "Merged_JPG") {
      targetFolderId = MERGED_FOLDER_MAP[prefixCode] ? MERGED_FOLDER_MAP[prefixCode].img : DEFAULT_FOLDER_ID;
    }

    var folder = DriveApp.getFolderById(targetFolderId);
    // [แก้ m1] escape single quote ใน filename ก่อน search
    var safeFileName = payload.fileName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    var existingFiles = folder.searchFiles("title = '" + safeFileName + "'");
    while (existingFiles.hasNext()) { existingFiles.next().setTrashed(true); }

    var blob = Utilities.newBlob(Utilities.base64Decode(payload.fileBase64), payload.mimeType, payload.fileName);
    var savedFile = folder.createFile(blob);
    savedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { status: "success", fileUrl: savedFile.getUrl() };
  } catch (error) {
    return { status: "error", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 2. API: บันทึกข้อมูลลงชีต และส่งอีเมล
// ==========================================
function saveDataSequentialAPI(payloadArray) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { status: "error", message: "เซิร์ฟเวอร์มีผู้ใช้งานหนาแน่น กรุณาลองใหม่อีกครั้ง" }; }

  // [แก้ S1] เก็บข้อมูลเมลไว้ก่อน จะดาวน์โหลดไฟล์และส่งเมลหลังปล่อย lock แล้วเท่านั้น
  var emailQueue = [];

  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheets()[0];
    var allData = sheet.getDataRange().getValues();

    for (var p = 0; p < payloadArray.length; p++) {
      var data = payloadArray[p];
      var targetId = String(data.submissionId).trim().toLowerCase();
      var timeStamp = getThaiTimestamp();

      for (var i = 1; i < allData.length; i++) {
        if (String(allData[i][0]).trim().toLowerCase() !== targetId) continue;

        var row = i + 1;

        // [แก้ S3] อ่าน URL เดิมก่อนทำอะไรทั้งนั้น
        var oldPdfUrl = sheet.getRange(row, 13).getValue();
        var oldJpgUrl = sheet.getRange(row, 14).getValue();

        // [แก้ S3+S4] เขียน URL ใหม่ + metadata ด้วย 1 call ก่อนลบของเก่า
        sheet.getRange(row, 13, 1, 5).setValues([[
          data.fileUrls.mergedPdf || oldPdfUrl,
          data.fileUrls.mergedJpg || oldJpgUrl,
          timeStamp,
          data.pdpaStatus,
          data.ipAddress
        ]]);

        var currentStatus = allData[i][17] ? String(allData[i][17]).trim() : "";
        if (currentStatus === "Rejected" || currentStatus === "Requested") {
          sheet.getRange(row, 20).setValue("ส่งไฟล์แก้ไขแล้วเมื่อ: " + timeStamp);
        }

        // [แก้ S3] ลบไฟล์เดิมหลังจากบันทึก URL ใหม่สำเร็จแล้ว
        trashDriveFileByUrl(oldPdfUrl);
        trashDriveFileByUrl(oldJpgUrl);

        // [แก้ S1] เก็บข้อมูลสำหรับส่งเมล ไม่ดาวน์โหลดไฟล์ในช่วง lock
        if (data.email) {
          var prefix = allData[i][1] ? String(allData[i][1]).trim() : "";
          var nameOnly = allData[i][2] ? String(allData[i][2]).trim() : "";
          var surnameOnly = allData[i][3] ? String(allData[i][3]).trim() : "";
          var emailFullName = (prefix + nameOnly + " " + surnameOnly).replace(/\s+/g, " ").trim() || data.fullName;
          emailQueue.push({
            email: data.email,
            fullName: emailFullName,
            submissionInfo: {
              subId: data.submissionId,
              pdfName: data.submissionId + "_" + emailFullName + ".pdf",
              jpgName: data.submissionId + "_" + emailFullName + ".jpg",
              time: timeStamp
            },
            mergedPdfUrl: data.fileUrls.mergedPdf,
            mergedJpgUrl: data.fileUrls.mergedJpg
          });
        }
        break;
      }
    }

    SpreadsheetApp.flush();
    clearSheetCache();
  } catch (error) {
    console.error("เกิดข้อผิดพลาดใน saveDataSequentialAPI: " + error.toString());
    lock.releaseLock();
    return { status: "error", message: error.toString() };
  }

  // [แก้ S1] ปล่อย lock ก่อน แล้วค่อยดาวน์โหลดไฟล์และส่งเมล
  lock.releaseLock();

  for (var j = 0; j < emailQueue.length; j++) {
    var eq = emailQueue[j];
    var blobs = [];
    var pdfBlob = getBlobFromUrl(eq.mergedPdfUrl);
    var jpgBlob = getBlobFromUrl(eq.mergedJpgUrl);
    if (pdfBlob) blobs.push(pdfBlob);
    if (jpgBlob) blobs.push(jpgBlob);
    sendConsolidatedSuccessEmail(eq.email, eq.fullName, [eq.submissionInfo], blobs);
  }

  return { status: "success" };
}

// ==========================================
// บันทึกยอดเข้าชมเว็บไซต์ (แยกรายวัน)
// ==========================================
function recordVisitCount() {
  var lock = LockService.getScriptLock();
  // [แก้ S2] แยก waitLock ออกมา ป้องกัน releaseLock() crash
  try {
    lock.waitLock(5000);
  } catch (e) {
    return { status: "error", message: "ระบบไม่ว่าง" };
  }
  try {
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

    // [แก้ S5] อ่านเฉพาะแถวที่มีข้อมูล ไม่อ่านทั้งคอลัมน์
    var lastRow = sheet.getLastRow();
    var cValues = lastRow > 1 ? sheet.getRange(2, 3, lastRow - 1, 1).getValues() : [];
    var foundRow = -1;
    var lastFilledRow = 1;

    for (var i = 0; i < cValues.length; i++) {
      if (cValues[i][0] !== "") {
        lastFilledRow = i + 2; // array offset 0 + header row 1 + 1 = row i+2
        if (String(cValues[i][0]) === today) {
          foundRow = i + 2;
        }
      }
    }

    if (foundRow !== -1) {
      var currentCount = sheet.getRange(foundRow, 4).getValue();
      sheet.getRange(foundRow, 4).setValue((isNaN(currentCount) || currentCount === "" ? 0 : Number(currentCount)) + 1);
    } else {
      sheet.getRange(lastFilledRow + 1, 3).setValue(today);
      sheet.getRange(lastFilledRow + 1, 4).setValue(1);
    }

    return { status: "success" };
  } catch (error) {
    return { status: "error", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// CACHE SERVICE
// ==========================================
function getSheetDataCached() {
  var cache = CacheService.getScriptCache();
  var cachedData = cache.get("db_poster_data");
  if (cachedData) return JSON.parse(cachedData);

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  var filteredData = data.filter(function(row, index) { return index === 0 || row[0] !== ""; });

  try { cache.put("db_poster_data", JSON.stringify(filteredData), 60); } catch (e) {}
  return filteredData;
}

function clearSheetCache() { CacheService.getScriptCache().remove("db_poster_data"); }

// ==========================================
// ดึงข้อมูล Dashboard (แอดมิน)
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
// ค้นหาข้อมูล
// ==========================================
function cleanThaiText(text) {
  if (!text) return "";
  return String(text).replace(/[ะ-ฺ็-๎\-\s]/g, "").toLowerCase();
}

function searchData(query) {
  try {
    if (!query) return { status: "error", message: "กรุณาระบุคำค้นหา" };
    var originalQuery = String(query).trim();
    var queryClean = cleanThaiText(originalQuery);
    var queryEmail = originalQuery.toLowerCase();
    var queryPhone = originalQuery.replace(/\D/g, "");

    var data = getSheetDataCached();
    var results = [];

    var ss = null;
    var sheet = null;
    var titleRichTextValues = null;

    for (var i = 1; i < data.length; i++) {
      var id = String(data[i][0]).toLowerCase().trim();
      var fN = String(data[i][2]).trim();
      var lN = String(data[i][3]).trim();
      var email = String(data[i][5]).toLowerCase().trim();
      var phoneData = String(data[i][6]).replace(/\D/g, "");
      var fullNameClean = cleanThaiText(fN + lN);

      if ((id === queryClean) || (email === queryEmail) || (fullNameClean === queryClean) || (queryPhone.length >= 10 && phoneData === queryPhone)) {
        // เปิด sheet และโหลด rich text ของคอลัมน์ชื่อผลงานทั้งหมดครั้งเดียว
        if (!ss) {
          ss = SpreadsheetApp.openById(SPREADSHEET_ID);
          sheet = ss.getSheets()[0];
          var numRows = Math.max(data.length - 1, 1);
          titleRichTextValues = sheet.getRange(2, 9, numRows, 1).getRichTextValues();
        }

        var richText = titleRichTextValues[i - 1] ? titleRichTextValues[i - 1][0] : null;
        var formattedProjectTitle = getCellValueAsHtml(richText, String(data[i][8]));

        var pdfUrl = data[i][12] ? String(data[i][12]).trim() : "";
        var jpgUrl = data[i][13] ? String(data[i][13]).trim() : "";
        var adminStatus = data[i][17] ? String(data[i][17]).trim() : "";
        var adminRemark = data[i][18] ? String(data[i][18]).trim() : "";
        var editStatus = data[i][19] ? String(data[i][19]).trim() : "";
        var isUploaded = (pdfUrl !== "" && jpgUrl !== "");
        if ((adminStatus === "Rejected" || adminStatus === "Requested") && editStatus === "") {
          isUploaded = false;
        }

        var prefix = data[i][1] ? String(data[i][1]).trim() : "";
        results.push({
          submissionId: data[i][0],
          fullName: (prefix + fN + " " + lN).trim(),
          headerNames: data[i][4] ? String(data[i][4]).trim() : "",
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

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function trashDriveFileByUrl(url) {
  if (!url) return;
  try {
    var match = url.match(/\/file\/d\/(.*?)\//) || url.match(/id=(.*?)(&|$)/);
    if (match && match[1]) DriveApp.getFileById(match[1]).setTrashed(true);
  } catch (e) {
    console.error("trashDriveFileByUrl ล้มเหลว: " + e.toString());
  }
}

function getThaiTimestamp() {
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Asia/Bangkok"
  }).format(new Date());
}

function getBlobFromUrl(url) {
  if (!url) return null;
  try {
    var match = url.match(/\/file\/d\/(.*?)\//) || url.match(/id=(.*?)(&|$)/);
    if (match && match[1]) return DriveApp.getFileById(match[1]).getBlob();
  } catch (e) {
    console.error("getBlobFromUrl ล้มเหลว: " + e.toString());
  }
  return null;
}

// รับ richTextValue ที่ pre-load มาแล้ว แทนการอ่าน cell ซ้ำ
function getCellValueAsHtml(richText, plainFallback) {
  if (!richText) return plainFallback || "";
  var runs = richText.getRuns();
  if (runs.length <= 1) {
    if (runs.length === 1 && runs[0].getTextStyle().isItalic()) {
      return "<i>" + richText.getText() + "</i>";
    }
    return richText.getText() || plainFallback || "";
  }
  var htmlResult = "";
  for (var i = 0; i < runs.length; i++) {
    var run = runs[i];
    htmlResult += run.getTextStyle().isItalic() ? "<i>" + run.getText() + "</i>" : run.getText();
  }
  return htmlResult;
}

// ==========================================
// ส่งอีเมลยืนยันผลงาน
// ==========================================
function sendConsolidatedSuccessEmail(recipientEmail, fullName, submissionsInfo, blobs) {
  var submissionsHtml = "";
  var subIdList = [];

  for (var i = 0; i < submissionsInfo.length; i++) {
    var info = submissionsInfo[i];
    subIdList.push(info.subId);
    submissionsHtml += '<div style="margin:15px 0;padding:15px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;line-height:1.8;color:#334155;">'
      + '<strong>ผลงานรหัส:</strong> ' + info.subId + '<br/>'
      + '<strong>ไฟล์ที่อัปโหลด:</strong><br/>'
      + '<span style="color:#64748b;font-size:14px;">1. ' + (info.pdfName || "ไฟล์ PDF") + '</span><br/>'
      + '<span style="color:#64748b;font-size:14px;">2. ' + (info.jpgName || "ไฟล์ JPEG") + '</span><br/>'
      + '<strong>เวลาที่บันทึก:</strong> ' + info.time
      + '</div>';
  }

  var titleSubIds = subIdList.join(", ");
  if (titleSubIds.length > 40) titleSubIds = titleSubIds.substring(0, 40) + "...";
  var subject = "ยืนยันการรับไฟล์ผลงาน E-Poster รหัส " + titleSubIds;

  var htmlBody = '<div style="font-family:\'Sarabun\',Tahoma,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);background:#fff;">'
    + '<div style="background:#166534;padding:24px;text-align:center;"><h2 style="color:#fff;margin:0;font-size:20px;">ยืนยันการรับไฟล์ผลงาน E-Poster</h2></div>'
    + '<div style="padding:32px;">'
    + '<p style="font-size:16px;color:#334155;margin-top:0;">เรียน คุณ <strong>' + fullName + '</strong>,</p>'
    + '<p style="font-size:15px;color:#475569;line-height:1.6;">ระบบได้รับไฟล์ผลงานของท่านจำนวน <strong>' + submissionsInfo.length + '</strong> รายการ เรียบร้อยแล้ว โดยมีรายละเอียดดังนี้:</p>'
    + submissionsHtml
    + '<p style="font-size:14px;color:#475569;line-height:1.6;"><em>* ท่านสามารถตรวจสอบความถูกต้องของผลงานที่ประกอบส่วนหัวแล้วได้จากไฟล์แนบในอีเมลฉบับนี้</em></p>'
    + '<div style="margin-top:24px;padding:16px;background:#f0fdf4;border-left:4px solid #166534;border-radius:4px;">'
    + '<p style="margin:0;font-size:14px;color:#166534;"><strong>☎ ติดต่อสอบถามเพิ่มเติม: คุณศุภชัย หรือคุณวรรณวิภา</strong><br>โทร. 02 951 0000 ต่อ 99051, 99187</p></div>'
    + '<div style="text-align:center;margin-top:32px;margin-bottom:8px;">'
    + '<p style="margin:0;font-size:14px;color:#166534;font-style:italic;font-weight:600;">"From Lab to Life: Sciences for Healthy Longevity<br>จากห้องแล็บสู่ชีวิตจริง วิทยาศาสตร์เพื่อการมีสุขภาพยืนยาว"</p></div></div>'
    + '<div style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0;">'
    + '<p style="margin:0;font-size:12px;font-weight:bold;color:#64748b;">ระบบอีเมลอัตโนมัติ กรุณาอย่าตอบกลับ (Do not reply)</p>'
    + '<p style="margin:4px 0 0 0;font-size:12px;color:#94a3b8;">© กองแผนงานและวิชาการ กรมวิทยาศาสตร์การแพทย์</p></div></div>';

  try {
    GmailApp.sendEmail(recipientEmail, subject, "", {
      htmlBody: htmlBody,
      name: "ระบบรับผลงาน E-Poster",
      attachments: blobs
    });
  } catch (e) {
    // ถ้าไฟล์แนบรวมเกิน 25 MB ให้ลองส่งโดยไม่แนบไฟล์
    console.error("ส่งเมลพร้อมไฟล์แนบไม่ได้: " + e.toString() + " — ส่งโดยไม่แนบไฟล์แทน");
    try {
      GmailApp.sendEmail(recipientEmail, subject, "", {
        htmlBody: htmlBody,
        name: "ระบบรับผลงาน E-Poster"
      });
    } catch (e2) {
      console.error("ส่งเมลล้มเหลวทั้งสองวิธี: " + e2.toString());
    }
  }
}

// ==========================================
// อัปเดตสถานะผลงาน (แอดมิน)
// ==========================================
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
        clearSheetCache();
        return { status: "success" };
      }
    }
    return { status: "error", message: "ไม่พบรหัสผลงานในฐานข้อมูล" };
  } catch (error) {
    return { status: "error", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// อนุมัติสิทธิ์ (รันครั้งแรก)
// ==========================================
function authorize() {
  DriveApp.getRootFolder();
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), "ระบบตรวจรับสิทธิ์การทำงาน", "ระบบอนุมัติสิทธิ์การส่งเมลและบันทึกไฟล์เรียบร้อยแล้ว");
}
