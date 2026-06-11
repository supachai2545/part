# 🔔 คู่มือติดตั้งแจ้งเตือนผ่าน LINE OA

ระบบนี้จะส่งแจ้งเตือนเข้า LINE ของผู้นำเสนออัตโนมัติ 6 จังหวะ:

| จังหวะ | ข้อความ |
|--------|---------|
| ✅ เช็คอินสำเร็จ | "เช็กอินสำเร็จ ผลงาน: XXX — ระบบได้ Check-in ของท่านเรียบร้อยแล้ว กรุณามารอ ณ จุดนำเสนอ ก่อนเวลานำเสนออย่างน้อย 15 นาที" |
| ⏰ ก่อนนำเสนอ ~15 นาที | "เหลือเวลาอีก N นาที ก่อนถึงเวลานำเสนอ — กรุณามายังจุดรอนำเสนอ และรอเรียกตามลำดับคิวของท่าน" |
| 📜 หมดเวลานำเสนอ | "กรุณาติดต่อจุด Check-in เพื่อรับใบประกาศนียบัตร — กรุณาแสดงคูปองพร้อม QR Code ลงทะเบียนแก่เจ้าหน้าที่" |
| 🙏 รับใบประกาศสำเร็จ | "ขอบคุณที่ร่วมส่งผลงานนำเสนอ — ขอให้เดินทางโดยสวัสดิภาพ เจอกันการประชุมครั้งที่ 35" |

> 💡 ตอนนี้ระบบยังไม่ได้ลบ/แก้แอปเดิม — แจ้งเตือนผ่าน browser ของเดิมยังทำงานปกติ ระบบ LINE นี้เป็นของ **เพิ่มเติม**

---

## ภาพรวมการทำงาน

```
ผู้นำเสนอ              LINE OA (ของคุณ)         Supabase
    │                       │                      │
    │  1. เปิดหน้า LIFF      │                      │
    │  กรอกรหัสผลงาน ───────────────────────────►  เก็บ {userId ↔ รหัส}
    │                       │                      │
    │                       │   ◄── pg_cron รันทุก 1 นาที ──┤
    │   ◄── 2. ส่ง push ─────│   เช็กว่าใครถึงเวลาเตือน      │
    │   "อีก 10 นาที..."     │                      │
```

- **ผูก userId** → ใช้หน้า `line-register.html` (เปิดใน LINE = ได้ userId อัตโนมัติ)
- **ยิงแจ้งเตือน** → `line-setup.sql` (ทำงานในฐานข้อมูลล้วนๆ ไม่ต้องมีเซิร์ฟเวอร์แยก)

---

## ขั้นที่ 1 — สร้าง Messaging API Channel + เอา Token

1. เข้า **https://developers.line.biz/console/**
2. เลือก **Provider** (ถ้ายังไม่มี กด *Create a new provider*)
3. กด **Create a new channel** → เลือก **Messaging API**
   > ถ้ามี LINE OA อยู่แล้ว: เข้า **LINE OA Manager → Settings → Messaging API → Enable** ระบบจะสร้าง channel ให้และผูกกับ OA เดิมอัตโนมัติ
4. เข้าไปในแชนเนล → แท็บ **Messaging API**
5. หัวข้อ **Channel access token (long-lived)** → กด **Issue** → **คัดลอก token เก็บไว้** (ยาวๆ)

✅ ได้ **Channel Access Token** แล้ว (จะใช้ในขั้นที่ 5)

> ⚙️ ที่แท็บ **Messaging API** เลื่อนลงไปเปิด **Use webhook = ปิดได้** (เราใช้ LIFF ไม่ต้องพึ่ง webhook)
> และที่ **LINE OA Manager → Settings → Response settings** เปิด **"Chat"** ไว้ถ้าอยากให้เจ้าหน้าที่แชตตอบเองได้ด้วย

---

## ขั้นที่ 2 — เปิด Extensions ใน Supabase

1. เข้า **Supabase Dashboard → Database → Extensions**
2. เปิด (toggle ON): **`pg_cron`** และ **`pg_net`**

---

## ขั้นที่ 3 — รัน SQL ตั้งระบบ

1. เข้า **Supabase Dashboard → SQL Editor → New query**
2. เปิดไฟล์ **`line-setup.sql`** คัดลอกทั้งหมดมาวาง → กด **Run**
3. ควรขึ้น Success — ตอนนี้มีตาราง `line_links`, `line_notif_log` และ cron แล้ว

---

## ขั้นที่ 4 — สร้าง LIFF App (หน้าให้ผู้นำเสนอลงทะเบียน)

ก่อนอื่นต้องเอา `line-register.html` ขึ้นเว็บให้เป็น URL `https://...` ก่อน
(วางไว้ที่เดียวกับ `index.html` ได้เลย เช่น GitHub Pages / Netlify / โฮสต์เดิม)

1. กลับไป **LINE Developers Console → แชนเนลเดิม → แท็บ LIFF**
2. กด **Add** แล้วกรอก:
   - **LIFF app name**: `ลงทะเบียนแจ้งเตือน`
   - **Size**: `Full`
   - **Endpoint URL**: `https://เว็บคุณ/line-register.html`
   - **Scopes**: ติ๊ก `profile`, `openid`
3. กด **Add** → คัดลอก **LIFF ID** ที่ได้ (เช่น `2001234567-AbcdEfgh`)
4. เปิดไฟล์ `line-register.html` แก้บรรทัด:
   ```js
   var LIFF_ID = 'PUT-YOUR-LIFF-ID-HERE';   // ← วาง LIFF ID ตรงนี้
   ```
   แล้วอัปโหลดทับขึ้นเว็บอีกครั้ง

✅ ลิงก์สำหรับให้ผู้นำเสนอเปิดคือ: **`https://liff.line.me/{LIFF_ID}`**
(จะทำเป็น Rich Menu ปุ่มใน OA หรือ QR ก็ได้ — ใส่ `?code=RP1-001` ต่อท้ายเพื่อ prefill รหัสได้)

---

## ขั้นที่ 5 — ใส่ Token (ทำครั้งเดียว)

กลับไป **SQL Editor** รันคำสั่งนี้ (แทน `xxxx...` ด้วย token จริงจากขั้นที่ 1):

```sql
select vault.create_secret(
    'xxxxYOUR_CHANNEL_ACCESS_TOKENxxxx',
    'LINE_CHANNEL_TOKEN',
    'LINE Messaging API channel access token');
```

> 🔒 Token ถูกเก็บเข้ารหัสใน Vault ไม่โผล่ในโค้ดหน้าเว็บ ปลอดภัย

---

## ขั้นที่ 6 — ทดสอบ

1. เปิดลิงก์ LIFF ในมือถือ (ผ่าน LINE) → กรอกรหัสผลงานของคุณ → บันทึก
2. ใน SQL Editor ลองยิงเองทันที:
   ```sql
   select public.line_send_notifications();
   ```
3. ถ้าผูกไว้และเข้าเงื่อนไข (เช่นเช็คอินแล้ว) → ควรเด้งเข้า LINE ภายในไม่กี่วินาที
4. จากนั้น cron จะรันเองทุกนาที ไม่ต้องทำอะไรเพิ่ม

---

## 💰 ค่าใช้จ่าย

- ฟรี ~1,000 ข้อความ/เดือน
- งาน ~500 คน × 6 จังหวะ ≈ 3,000 ข้อความ → แนะนำ **Light plan ~599 บาท** เฉพาะเดือนจัดงาน แล้วลดกลับ Free ได้

---

## 🛠️ แก้ปัญหาเบื้องต้น

| อาการ | วิธีแก้ |
|-------|--------|
| ไม่เด้งเลย | เช็คว่าใส่ Token ใน Vault แล้ว (`select name from vault.secrets;`) |
| `function net.http_post does not exist` | ยังไม่เปิด `pg_net` (ขั้นที่ 2) |
| `cron` ไม่ทำงาน | ยังไม่เปิด `pg_cron` หรือ Supabase แพ็กเกจ Free อาจต้องอัปเป็น Pro เพื่อใช้ cron |
| หน้า LIFF ขึ้น error | ยังไม่ได้แก้ `LIFF_ID` หรือเปิดนอกแอป LINE |
| ส่งซ้ำ | ปกติกันซ้ำด้วยตาราง `line_notif_log` อยู่แล้ว — ล้างได้ด้วย `delete from line_notif_log;` |

ดูประวัติการยิง/สถานะได้ที่:
```sql
select * from net._http_response order by created desc limit 20;   -- ผลตอบกลับจาก LINE
select * from line_notif_log order by sent_at desc limit 20;       -- จังหวะที่ส่งไปแล้ว
```
