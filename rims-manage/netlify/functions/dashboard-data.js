// Netlify Function ทดแทน getDashboardData() ใน Code.gs เดิม
const { fetchSheetRows, extractDataRobust, jsonResponse } = require('./_lib/sheetUtils');

const SHEET_TABS = {
    researchers: 'ข้อมูลส่วนตัว',
    projects: 'ข้อมูลวิจัย',
    coordinators: 'ผู้ประสานงาน',
    news: 'ข่าวสาร',
};

const COLUMNS = {
    researchers: ['คำนำหน้า', 'ชื่อ - นามสกุล', 'วันเดือนปีเกิด', 'ปีเกิด', 'อายุ', 'e-mail', 'เบอร์โทรศัพท์', 'เบอร์โทรภายใน', 'หน่วยงาน', 'สถานะนักวิจัย', 'ปีที่บรรจุเข้าทำงาน', 'ประเภทบุคลากร', 'ตำแหน่งทางวิชาการ', 'สาขาความเชี่ยวชาญ', 'ความเชี่ยวชาญ', 'ระดับการศึกษาสูงสุด', 'ปีที่จบ', 'สาขาที่จบ', 'รหัสนักวิจัย', 'สถานะ'],
    projects: ['รหัสนักวิจัย', 'ชื่อผลงานวิจัย', 'ปีที่ดำเนินงาน', 'บทบาทหน้าที่', 'สัดส่วน %', 'ผลงานตีพิมพ์', 'วารสาร', 'ปีที่ตีพิมพ์', 'ลิงก์หลักฐาน'],
    coordinators: ['ชื่อ-นามสกุล', 'หน่วยงาน', 'เบอร์โทร', 'สถานะผู้ประสาน'],
    news: ['หัวข้อข่าว'],
};

exports.handler = async function () {
    try {
        const [researchersRaw, projectsRaw, coordinatorsRaw, newsRaw] = await Promise.all([
            fetchSheetRows(SHEET_TABS.researchers),
            fetchSheetRows(SHEET_TABS.projects),
            fetchSheetRows(SHEET_TABS.coordinators),
            fetchSheetRows(SHEET_TABS.news),
        ]);

        return jsonResponse(200, {
            success: true,
            researchers: extractDataRobust(researchersRaw, COLUMNS.researchers),
            projects: extractDataRobust(projectsRaw, COLUMNS.projects),
            coordinators: extractDataRobust(coordinatorsRaw, COLUMNS.coordinators),
            news: extractDataRobust(newsRaw, COLUMNS.news),
        });
    } catch (e) {
        return jsonResponse(200, { success: false, message: e.message || String(e) });
    }
};
