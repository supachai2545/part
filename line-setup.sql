-- ============================================================================
--  Smart E-Queue × LINE OA — ระบบแจ้งเตือนอัตโนมัติผ่าน LINE Messaging API
--  วิธีใช้: เปิด Supabase Dashboard → SQL Editor → วางทั้งไฟล์นี้ → Run
--  (อ่านคู่มือเต็มใน LINE_SETUP.md)
-- ============================================================================

-- ── 0) เปิด Extensions ที่จำเป็น ────────────────────────────────────────────
--    pg_cron = ตั้งเวลาให้รันทุกนาที | pg_net = ยิง HTTP ออกไปหา LINE
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- vault (เก็บ token แบบเข้ารหัส) มีมาให้แล้วบน Supabase

-- ── 1) ตารางผูก LINE userId ↔ รหัสผลงาน ────────────────────────────────────
create table if not exists public.line_links (
    id            bigint generated always as identity primary key,
    line_user_id  text not null,
    code          text not null,          -- = รหัสผลงาน (เก็บเป็น ASCII เพื่อเลี่ยงปัญหา PostgREST)
    display_name  text,
    created_at    timestamptz default now(),
    unique (line_user_id, code)
);
create index if not exists idx_line_links_code on public.line_links (code);

-- เปิด RLS + อนุญาตให้หน้า LIFF (anon key) เพิ่ม/อ่าน/ลบ ของตัวเองได้
alter table public.line_links enable row level security;
drop policy if exists "links anon all" on public.line_links;
create policy "links anon all" on public.line_links
    for all to anon using (true) with check (true);

-- ── 2) ตารางกันส่งซ้ำ (1 ผลงาน 1 จังหวะ ส่งได้ครั้งเดียว) ──────────────────
create table if not exists public.line_notif_log (
    code     text not null,
    stage    text not null,   -- checkin | lead30 | lead15 | lead3 | ended | reward
    sent_at  timestamptz default now(),
    primary key (code, stage)
);

-- ── 3) ฟังก์ชันช่วยส่ง: เคลม log ก่อน ถ้าใหม่จริงค่อยยิง LINE ────────────────
create or replace function public.line_try_send(
    p_uid text, p_code text, p_stage text, p_text text, p_token text)
returns void
language plpgsql
security definer
set search_path = public, net
as $fn$
begin
    if p_uid is null or p_token is null then return; end if;

    -- เคลมสิทธิ์ส่ง (กันซ้ำแบบ atomic)
    insert into public.line_notif_log(code, stage) values (p_code, p_stage)
    on conflict (code, stage) do nothing;
    if not found then return; end if;     -- เคยส่งไปแล้ว → ข้าม

    perform net.http_post(
        url     := 'https://api.line.me/v2/bot/message/push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || p_token),
        body    := jsonb_build_object(
            'to', p_uid,
            'messages', jsonb_build_array(
                jsonb_build_object('type','text','text', p_text)))
    );
end;
$fn$;

-- ── 4) ฟังก์ชันหลัก: วนทุกผลงานที่มีคนผูก LINE แล้วเช็ก 4 จังหวะ ─────────────
create or replace function public.line_send_notifications()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $fn$
declare
    v_token   text;
    v_now     timestamp := now() at time zone 'Asia/Bangkok';
    v_start   timestamp;
    v_end     timestamp;
    v_diff    int;
    v_m       text[];
    r         record;
begin
    select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'LINE_CHANNEL_TOKEN' limit 1;
    if v_token is null then
        raise notice 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_TOKEN ใน Vault';
        return;
    end if;

    for r in
        select w."รหัสผลงาน"      as code,
               w."เวลาการนำเสนอ"  as start_str,
               w."หมดการนำเสนอ"   as end_str,
               w."Checkin"        as checkin,
               w."รับประกาศ"      as reward,
               w."ลำดับคิว"       as queue_no,
               l.line_user_id     as uid
        from public.eposter_works w
        join public.line_links l on l.code = w."รหัสผลงาน"
    loop
        v_start := null; v_end := null;
        v_m := regexp_match(r.start_str::text, '(\d{1,2})[.:](\d{2})');
        if v_m is not null then
            v_start := (to_char(v_now,'YYYY-MM-DD') || ' ' || v_m[1] || ':' || v_m[2])::timestamp;
        end if;
        v_m := regexp_match(r.end_str::text, '(\d{1,2})[.:](\d{2})');
        if v_m is not null then
            v_end := (to_char(v_now,'YYYY-MM-DD') || ' ' || v_m[1] || ':' || v_m[2])::timestamp;
        end if;

        -- (1) เช็คอินสำเร็จ
        if r.checkin = 'Y' then
            perform public.line_try_send(r.uid, r.code, 'checkin',
                '✅ Check-in สำเร็จ ผลงาน: ' || r.code || E'\n' ||
                'ระบบ ได้Check-in ของท่านเรียบร้อยแล้ว' || E'\n' ||
                'กรุณามารอ ณ จุดนำเสนอ ก่อนเวลานำเสนออย่างน้อย 15 นาที',
                v_token);
        end if;

        -- (2) แจ้งเตือนก่อนนำเสนอ ~15 นาที (fire ที่ช่วง 14-16 นาที)
        if v_start is not null and coalesce(r.reward,'') <> 'Y' then
            v_diff := round(extract(epoch from (v_start - v_now)) / 60)::int;
            if v_diff between 14 and 16 then
                perform public.line_try_send(r.uid, r.code, 'lead15',
                    '⏰ ผลงาน: ' || r.code || ' เหลือเวลาอีก ' || v_diff || ' นาที ก่อนถึงเวลานำเสนอ' || E'\n' ||
                    'กรุณามายังจุดรอนำเสนอ และรอเรียกตามลำดับคิวของท่าน' || E'\n' ||
                    'คิวของท่านคือ คิวที่ ' || coalesce(r.queue_no::text,'?') ||
                    ' เวลาการนำเสนอ ' || coalesce(r.start_str,'-') || ' - ' || coalesce(r.end_str,'-') || ' น.',
                    v_token);
            end if;
        end if;

        -- (3) หมดเวลานำเสนอ → แจ้งรับใบประกาศ
        if v_end is not null and r.checkin = 'Y'
           and coalesce(r.reward,'') <> 'Y' and v_now > v_end then
            perform public.line_try_send(r.uid, r.code, 'ended',
                '📜 ผลงาน: ' || r.code || E'\n' ||
                'กรุณาติดต่อจุด Check-in เพื่อรับใบประกาศนียบัตร' || E'\n' ||
                'และแสดงคูปองพร้อม QR Code ลงทะเบียนแก่เจ้าหน้าที่',
                v_token);
        end if;

        -- (4) รับใบประกาศสำเร็จ → ขอบคุณและอำลา
        if r.reward = 'Y' then
            perform public.line_try_send(r.uid, r.code, 'reward',
                '🙏 ขอบคุณที่ร่วมส่งผลงานและที่เป็นส่วนหนึ่งของการประชุมวิชาการวิทยาศาสตร์การแพทย์ ครั้งที่ 34' || E'\n' ||
                'ขอให้เดินทางโดยสวัสดิภาพ และหวังเป็นอย่างยิ่งว่าจะได้พบกันอีกในการประชุมวิชาการวิทยาศาสตร์การแพทย์ ครั้งที่ 35',
                v_token);
        end if;
    end loop;
end;
$fn$;

-- ── 5) ตั้ง cron ให้รันทุก 1 นาที ──────────────────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname = 'line-notify';
select cron.schedule('line-notify', '* * * * *',
    $cron$ select public.line_send_notifications(); $cron$);

-- ============================================================================
--  เสร็จแล้ว! เหลือแค่ใส่ Token (ทำครั้งเดียว — แทน xxxx ด้วย token จริง):
--
--    select vault.create_secret(
--        'xxxxYOUR_CHANNEL_ACCESS_TOKENxxxx',
--        'LINE_CHANNEL_TOKEN',
--        'LINE Messaging API channel access token');
--
--  ทดสอบยิงเองได้ทันที:  select public.line_send_notifications();
--
--  ล้างการจำ LINE ของผู้ใช้ทั้งหมด (ก่อนงาน / reset):
--    delete from public.line_links;
--    delete from public.line_notif_log;
-- ============================================================================
