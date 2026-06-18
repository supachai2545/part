/* ============================================================================
 *  ตั้งค่าระบบลงทะเบียนผู้ประจำบูธเครือข่าย  (แก้ที่ไฟล์เดียว — ใช้ได้ทุกหน้า)
 *  ใช้ร่วมกับ: booth-register.html · booth-admin.html · booth-qr.html
 * ========================================================================== */
window.BOOTH_CONFIG = {

  /* ── ชื่องาน (โชว์บนหัวเว็บ) ───────────────────────────────────────────── */
  EVENT_NAME: 'งานเครือข่ายความร่วมมือ',

  /* ── ผู้ประจำบูธต่อ 1 บูธ (ใช้คิดว่า “ครบ” กี่คน) ────────────────────────── */
  STAFF_PER_BOOTH: 2,

  /* ── การเชื่อมต่อฐานข้อมูล Supabase ──────────────────────────────────────
   *  ใช้โปรเจกต์เดิมได้เลย หรือเปลี่ยนเป็นของใหม่ก็ได้
   *  (ก่อนใช้งานจริง อย่าลืมรัน booth-setup.sql ใน SQL Editor ของ Supabase)
   *  ระหว่างที่ยังไม่ได้ตั้งฐานข้อมูล ระบบจะใช้ “โหมดทดลอง” เก็บในเครื่องให้ก่อน
   */
  SUPABASE_URL: 'https://jdujdpqihtknelmpqxhy.supabase.co',
  SUPABASE_KEY: 'sb_publishable_vqJAxA1o7ukOKtI4LIZflg_rCIL7XGu',
  TABLE: 'booth_staff',

  /* ── รายชื่อบูธ ───────────────────────────────────────────────────────────
   *  id  = รหัสบูธ ต้องไม่ซ้ำ (ค่านี้จะอยู่ใน QR เป็น ...register.html?b=<id>)
   *  name = ชื่อบูธที่โชว์   ·   org = ชื่อหน่วยงาน/เครือข่าย (ใส่หรือเว้นว่างก็ได้)
   *  เพิ่ม/ลบบูธได้ตามจริง — แค่ก๊อปบรรทัดแล้วแก้
   */
  BOOTHS: [
    { id: '1', name: 'บูธเครือข่าย 1', org: '' },
    { id: '2', name: 'บูธเครือข่าย 2', org: '' },
    { id: '3', name: 'บูธเครือข่าย 3', org: '' },
    { id: '4', name: 'บูธเครือข่าย 4', org: '' },
    { id: '5', name: 'บูธเครือข่าย 5', org: '' },
    { id: '6', name: 'บูธเครือข่าย 6', org: '' },
    { id: '7', name: 'บูธเครือข่าย 7', org: '' },
    { id: '8', name: 'บูธเครือข่าย 8', org: '' },
  ],
};

/* ── ตัวช่วย (ไม่ต้องแก้) ──────────────────────────────────────────────────── */
window.BOOTH_CONFIG.getBooth = function (id) {
  return this.BOOTHS.find(b => String(b.id) === String(id)) || null;
};

window.BOOTH_CONFIG.PALETTE = [
  { grad: 'from-indigo-500 to-violet-500',  ring: 'ring-indigo-300',  text: 'text-indigo-600',  soft: 'bg-indigo-50',  dot: 'bg-indigo-500'  },
  { grad: 'from-emerald-500 to-teal-500',   ring: 'ring-emerald-300', text: 'text-emerald-600', soft: 'bg-emerald-50', dot: 'bg-emerald-500' },
  { grad: 'from-rose-500 to-pink-500',      ring: 'ring-rose-300',    text: 'text-rose-600',    soft: 'bg-rose-50',    dot: 'bg-rose-500'    },
  { grad: 'from-amber-500 to-orange-500',   ring: 'ring-amber-300',   text: 'text-amber-600',   soft: 'bg-amber-50',   dot: 'bg-amber-500'   },
  { grad: 'from-sky-500 to-cyan-500',       ring: 'ring-sky-300',     text: 'text-sky-600',     soft: 'bg-sky-50',     dot: 'bg-sky-500'     },
  { grad: 'from-fuchsia-500 to-purple-500', ring: 'ring-fuchsia-300', text: 'text-fuchsia-600', soft: 'bg-fuchsia-50', dot: 'bg-fuchsia-500' },
  { grad: 'from-lime-500 to-green-500',     ring: 'ring-lime-300',    text: 'text-lime-600',    soft: 'bg-lime-50',    dot: 'bg-lime-500'    },
  { grad: 'from-blue-500 to-indigo-500',    ring: 'ring-blue-300',    text: 'text-blue-600',    soft: 'bg-blue-50',    dot: 'bg-blue-500'    },
];

window.BOOTH_CONFIG.colorOf = function (id) {
  const i = this.BOOTHS.findIndex(b => String(b.id) === String(id));
  return this.PALETTE[(i < 0 ? 0 : i) % this.PALETTE.length];
};
