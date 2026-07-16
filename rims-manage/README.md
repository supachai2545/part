# RIMS Manage — Netlify Edition

แดชบอร์ด RIMS Manage เวอร์ชันที่ปรับมาให้รันบน **Netlify** แทน Google Apps Script เดิม
โดยยังคงใช้ Google Sheet ชุดเดิมเป็นแหล่งข้อมูล แต่เปลี่ยนวิธีดึงข้อมูลจาก `google.script.run`
เป็น **Netlify Functions** ที่ดึง CSV แบบสาธารณะจากชีตแทน

## โครงสร้างไฟล์

```
rims-manage/
├── index.html                         # หน้าแดชบอร์ด (เดิมจากไฟล์ที่ส่งมา ปรับส่วนดึงข้อมูล)
├── netlify.toml                       # ตั้งค่า build/functions ของ Netlify
├── netlify/functions/
│   ├── dashboard-data.js              # แทน getDashboardData() — คืนนักวิจัย/โครงการ/ผู้ประสานงาน/ข่าว
│   ├── mou-data.js                    # แทน getMouData() — คืนข้อมูล MOU
│   └── _lib/sheetUtils.js             # ตัวช่วยร่วม: ดึง CSV จากชีต + parse + จับคู่คอลัมน์ (ตรรกะเดียวกับ extractDataRobust เดิม)
└── legacy-google-apps-script/Code.gs  # โค้ด Apps Script เดิม เก็บไว้อ้างอิง (ไม่ได้ใช้งานแล้ว)
```

## ⚠️ สิ่งที่ต้องทำก่อน deploy: แชร์ Google Sheet แบบสาธารณะ

เพราะ Netlify Function ไม่ได้ล็อกอินด้วยบัญชี Google เหมือน Apps Script เดิม
มันเรียกข้อมูลผ่านลิงก์ CSV แบบสาธารณะของ Google Sheet (`.../gviz/tq?tqx=out:csv`)
**ต้องตั้งค่าการแชร์ชีตเป็น "ทุกคนที่มีลิงก์ - ผู้ดู" (Anyone with the link – Viewer) ก่อน** ไม่เช่นนั้น Function จะดึงข้อมูลไม่ได้

วิธีตั้งค่า: เปิด Google Sheet → ปุ่ม **แชร์ (Share)** มุมขวาบน → เปลี่ยนเป็น "ทุกคนที่มีลิงก์" สิทธิ์ "ผู้ดู"

> หากไม่สะดวกเปิดสาธารณะทั้งไฟล์ ให้แจ้งกลับมาได้ — มีอีกแนวทางคือใช้ Google Service Account
> ผ่าน Sheets API (ต้องสร้างคีย์ลับและตั้งเป็น Environment Variable บน Netlify แทน)

## การ Deploy บน Netlify

1. Push โค้ดในโฟลเดอร์นี้ขึ้น GitHub (ทำแล้วในคอมมิตนี้)
2. เข้า [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
3. เลือก repo นี้ แล้วตั้งค่า:
   - **Base directory**: `rims-manage`
   - **Build command**: ปล่อยว่าง (ไม่มี build step)
   - **Publish directory**: `rims-manage` (หรือ `.` เมื่อกำหนด base directory แล้ว)
   - Netlify จะอ่านค่า functions directory จาก `netlify.toml` อัตโนมัติ
4. กด Deploy — เสร็จแล้วจะได้ URL เช่น `https://<ชื่อไซต์>.netlify.app`

### ตั้งค่า Spreadsheet ID ผ่าน Environment Variable (ไม่บังคับ)

ค่าเริ่มต้นของ `SPREADSHEET_ID` ฝังอยู่ใน `netlify/functions/_lib/sheetUtils.js` แล้ว
หากต้องการเปลี่ยนชีตในอนาคตโดยไม่ต้องแก้โค้ด ให้ไปที่ **Site settings → Environment variables**
บน Netlify แล้วเพิ่มตัวแปร:

```
RIMS_SPREADSHEET_ID = <รหัส Spreadsheet ใหม่>
```

## ทดสอบบนเครื่องตัวเอง (Local Dev)

ต้องมี [Netlify CLI](https://docs.netlify.com/cli/get-started/) เพื่อให้ `/.netlify/functions/*` ทำงานได้:

```bash
npm install -g netlify-cli
cd rims-manage
netlify dev
```

จะเปิดเว็บที่ `http://localhost:8888` พร้อมรัน Functions จริงคู่กัน

ถ้าเปิด `index.html` ตรงๆ (ดับเบิลคลิก ไม่มี Netlify Function ให้เรียก) หรือเปิดผ่าน static server
เฉยๆ โดยไม่มี Functions หน้าเว็บจะ fallback ไปแสดง **ข้อมูลจำลอง (Mock Data)** ให้อัตโนมัติ
เพื่อให้ยังเห็นหน้าตา UI ได้แม้ยังไม่ได้ต่อ backend จริง

## หมายเหตุการทดสอบ

โค้ดส่วน parse CSV และการจับคู่คอลัมน์ (`extractDataRobust`) ได้รันทดสอบด้วยข้อมูลจำลอง
(รวมกรณีมีจุลภาค/เครื่องหมายคำพูดในข้อความ และแถวว่าง) ผ่านแล้ว แต่ยังไม่ได้ทดสอบดึงข้อมูลจริงจาก
Google Sheet ของคุณ เพราะ environment นี้ไม่มีสิทธิ์เข้าถึงอินเทอร์เน็ตไปยัง `docs.google.com`
แนะนำให้ทดสอบอีกครั้งหลัง deploy จริงบน Netlify (ซึ่งเข้าถึงอินเทอร์เน็ตได้ตามปกติ)
