// ยูทิลิตี้ร่วมสำหรับดึงข้อมูลจาก Google Sheet (ผ่าน gviz CSV export แบบสาธารณะ)
// และแปลงข้อมูลด้วยตรรกะเดียวกับ extractDataRobust ใน Code.gs เดิม

const SPREADSHEET_ID = process.env.RIMS_SPREADSHEET_ID || '1kzGil32hil6p9BB2LJIOYf21P6YJ7g5r2ZfrxHEjQVQ';

// แปลงข้อความ CSV เป็น array ของ array แถว/คอลัมน์ รองรับฟิลด์ที่ถูกครอบด้วย "" และมีจุลภาค/ขึ้นบรรทัดใหม่อยู่ภายใน
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];

        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
            } else {
                field += c;
            }
            continue;
        }

        if (c === '"') { inQuotes = true; continue; }
        if (c === ',') { row.push(field); field = ''; continue; }
        if (c === '\r') continue;
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
        field += c;
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

    return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

async function fetchSheetRows(sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`ไม่พบชีต "${sheetName}" หรือชีตไม่ได้แชร์แบบสาธารณะ (HTTP ${res.status})`);
    }

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    // ถ้า Google redirect ไปหน้า login/error จะได้ HTML กลับมาแทน CSV
    if (contentType.includes('text/html') || text.trim().startsWith('<')) {
        throw new Error(`เข้าถึงชีต "${sheetName}" ไม่ได้ กรุณาตั้งค่าการแชร์เป็น "ทุกคนที่มีลิงก์ - ผู้ดู" (Anyone with the link - Viewer)`);
    }

    return parseCSV(text);
}

// ตรรกะเดียวกับ extractDataRobust() ใน Code.gs: จับคู่ชื่อคอลัมน์แบบยืดหยุ่น (ตัดช่องว่าง/ตัวพิมพ์เล็กใหญ่)
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
            let val = (idx !== -1 && row[idx] !== undefined && row[idx] !== null) ? row[idx] : '';

            val = val.toString().trim();
            obj[colName] = val;

            if (val !== '') isEmptyRow = false;
        });

        if (!isEmptyRow) data.push(obj);
    }
    return data;
}

function jsonResponse(statusCode, body) {
    return {
        statusCode,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
        body: JSON.stringify(body),
    };
}

module.exports = { parseCSV, fetchSheetRows, extractDataRobust, jsonResponse };
