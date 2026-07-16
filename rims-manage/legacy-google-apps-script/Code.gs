/**
 * RIMS Manage - Executive Strategic Backend
 *
 * เก็บไว้เป็นข้อมูลอ้างอิงเท่านั้น — เวอร์ชัน Netlify ใช้
 * netlify/functions/dashboard-data.js และ netlify/functions/mou-data.js แทนไฟล์นี้แล้ว
 */

// รหัส Spreadsheet ล่าสุด
const SPREADSHEET_ID = '1kzGil32hil6p9BB2LJIOYf21P6YJ7g5r2ZfrxHEjQVQ';

function getSystemLink() {
  return 'https://moph.link/RIMS';
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('RIMS Manage')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getDashboardData() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    const personalRaw = getSheetDataSafe(ss, 'ข้อมูลส่วนตัว');
    const researchRaw = getSheetDataSafe(ss, 'ข้อมูลวิจัย');
    const coordRaw = getSheetDataSafe(ss, 'ผู้ประสานงาน');
    const newsRaw = getSheetDataSafe(ss, 'ข่าวสาร');

    const personalCols = ['คำนำหน้า', 'ชื่อ - นามสกุล', 'วันเดือนปีเกิด', 'ปีเกิด', 'อายุ', 'e-mail', 'เบอร์โทรศัพท์', 'เบอร์โทรภายใน', 'หน่วยงาน', 'สถานะนักวิจัย', 'ปีที่บรรจุเข้าทำงาน', 'ประเภทบุคลากร', 'ตำแหน่งทางวิชาการ', 'สาขาความเชี่ยวชาญ', 'ความเชี่ยวชาญ', 'ระดับการศึกษาสูงสุด', 'ปีที่จบ', 'สาขาที่จบ', 'รหัสนักวิจัย', 'สถานะ'];
    const researchCols = ['รหัสนักวิจัย', 'ชื่อผลงานวิจัย', 'ปีที่ดำเนินงาน', 'บทบาทหน้าที่', 'สัดส่วน %', 'ผลงานตีพิมพ์', 'วารสาร', 'ปีที่ตีพิมพ์', 'ลิงก์หลักฐาน'];
    const coordCols = ['ชื่อ-นามสกุล', 'หน่วยงาน', 'เบอร์โทร', 'สถานะผู้ประสาน'];
    const newsCols = ['หัวข้อข่าว'];

    return JSON.stringify({
      success: true,
      researchers: extractDataRobust(personalRaw, personalCols),
      projects: extractDataRobust(researchRaw, researchCols),
      coordinators: extractDataRobust(coordRaw, coordCols),
      news: extractDataRobust(newsRaw, newsCols)
    });

  } catch (e) {
    return JSON.stringify({ success: false, message: e.toString() });
  }
}

function getMouData() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const mouRaw = getSheetDataSafe(ss, 'MOU');

    const mouCols = ['รหัส MOU', 'ชื่อบันทึก', 'หน่วยงานคู่จัดทำ MOU', 'หน่วยงานที่รับผิดชอบ', 'สถานะ', 'ระยะเวลาเริ่มต้น', 'ระยะเวลาสิ้นสุด', 'ผู้รับผิดชอบ/ผู้ประสาน', 'ติดต่อ', 'ประเภทองค์กร', 'ประเภท', 'วัตถุประสงค์', 'ด้านการศึกษาและวิจัย', 'สนับสนุน/พัฒนา การใช้เครื่องมือและห้องปฏิบัติการในการดำเนินงาน', 'ด้านการพัฒาระบบประกันคุณภาพห้องปฏิบัติการ', 'ด้านวิชาการและพัฒนาบุคลากร', 'หมายเหตุ', 'MOUจริง', 'ความก้าวหน้าMOU'];

    return { success: true, data: extractDataRobust(mouRaw, mouCols) };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function getSheetDataSafe(ss, sheetName) {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    return sheet.getDataRange().getDisplayValues();
}

function extractDataRobust(raw, expectedColumns) {
  if (!raw || raw.length < 2) return [];

  const sheetHeaders = raw[0].map(h => h.toString().replace(/[\s\n]+/g, '').toLowerCase());
  const colIndices = {};

  expectedColumns.forEach(colName => {
    const cleanColName = colName.replace(/[\s\n]+/g, '').toLowerCase();
    const idx = sheetHeaders.findIndex(h => h === cleanColName || h.includes(cleanColName));
    colIndices[colName] = idx;
  });

  const data = [];
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    const obj = {};
    let isEmptyRow = true;

    expectedColumns.forEach(colName => {
      const idx = colIndices[colName];
      let val = (idx !== -1 && row[idx] !== undefined && row[idx] !== null) ? row[idx] : "";

      val = val.toString().trim();
      obj[colName] = val;

      if (val !== "") isEmptyRow = false;
    });

    if (!isEmptyRow) data.push(obj);
  }
  return data;
}
