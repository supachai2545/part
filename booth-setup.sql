-- ============================================================================
--  ระบบลงทะเบียนผู้ประจำบูธเครือข่าย — ตั้งฐานข้อมูล Supabase
--  วิธีใช้: เปิด Supabase Dashboard → SQL Editor → New query → วางทั้งไฟล์ → Run
--  (ใช้คู่กับ booth-register.html / booth-admin.html / booth-qr.html)
-- ============================================================================

-- ── ตารางเก็บผู้ประจำบูธ ──────────────────────────────────────────────────
create table if not exists public.booth_staff (
    id          bigint generated always as identity primary key,
    booth_id    text        not null,        -- รหัสบูธ (ตรงกับ id ใน booth-config.js)
    name        text        not null,        -- ชื่อ-นามสกุล
    org         text,                         -- หน่วยงาน/เครือข่าย (ถ้ามี)
    phone       text,                         -- เบอร์โทร (ถ้ามี)
    created_at  timestamptz default now()
);

create index if not exists idx_booth_staff_booth on public.booth_staff (booth_id);

-- ── เปิด RLS + อนุญาตให้หน้าเว็บ (anon key) เพิ่ม/อ่านได้ ────────────────────
alter table public.booth_staff enable row level security;

drop policy if exists "booth_staff anon read"   on public.booth_staff;
drop policy if exists "booth_staff anon insert" on public.booth_staff;

create policy "booth_staff anon read"   on public.booth_staff
    for select to anon using (true);

create policy "booth_staff anon insert" on public.booth_staff
    for insert to anon with check (true);

-- (ทางเลือก) ถ้าต้องการให้ลบ/แก้ผ่านหน้าเว็บได้ด้วย ให้เปิดบรรทัดล่างนี้
-- create policy "booth_staff anon write" on public.booth_staff
--     for all to anon using (true) with check (true);

-- ============================================================================
--  เสร็จแล้ว! หน้าเว็บจะสลับจาก “โหมดทดลอง” มาเก็บข้อมูลที่นี่อัตโนมัติ
--
--  ดูข้อมูลทั้งหมด:        select * from public.booth_staff order by created_at;
--  นับผู้ลงทะเบียนต่อบูธ:  select booth_id, count(*) from public.booth_staff group by booth_id order by booth_id;
--  ล้างข้อมูลก่อนเริ่มงานจริง / รีเซ็ต:   delete from public.booth_staff;
-- ============================================================================
