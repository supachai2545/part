// Netlify Function ทดแทน getMouData() ใน Code.gs เดิม
const { fetchSheetRows, extractDataRobust, jsonResponse } = require('./_lib/sheetUtils');

const SHEET_NAME = 'MOU';

const COLUMNS = ['รหัส MOU', 'ชื่อบันทึก', 'หน่วยงานคู่จัดทำ MOU', 'หน่วยงานที่รับผิดชอบ', 'สถานะ', 'ระยะเวลาเริ่มต้น', 'ระยะเวลาสิ้นสุด', 'ผู้รับผิดชอบ/ผู้ประสาน', 'ติดต่อ', 'ประเภทองค์กร', 'ประเภท', 'วัตถุประสงค์', 'ด้านการศึกษาและวิจัย', 'สนับสนุน/พัฒนา การใช้เครื่องมือและห้องปฏิบัติการในการดำเนินงาน', 'ด้านการพัฒาระบบประกันคุณภาพห้องปฏิบัติการ', 'ด้านวิชาการและพัฒนาบุคลากร', 'หมายเหตุ', 'MOUจริง', 'ความก้าวหน้าMOU'];

exports.handler = async function () {
    try {
        const raw = await fetchSheetRows(SHEET_NAME);
        return jsonResponse(200, { success: true, data: extractDataRobust(raw, COLUMNS) });
    } catch (e) {
        return jsonResponse(200, { success: false, error: e.message || String(e) });
    }
};
