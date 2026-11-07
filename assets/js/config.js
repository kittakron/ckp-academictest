// =====================================================================
// ตั้งค่าการเชื่อมต่อ Supabase — แก้ 2 ค่านี้เท่านั้น
//
// หาได้ที่ Supabase Dashboard > Project Settings > API
//   SUPABASE_URL       = Project URL
//   SUPABASE_ANON_KEY  = anon / public key  (เป็นคีย์สาธารณะ ใส่ในหน้าเว็บได้ ปลอดภัยเพราะมี RLS คุมอยู่)
//
// ห้ามใช้ "service_role" key ในไฟล์นี้เด็ดขาด
//
// ถ้า deploy ผ่าน GitHub Actions ที่แนบมา สามารถไม่แก้ไฟล์นี้ แล้วไปตั้งค่าที่
// GitHub repo > Settings > Secrets and variables > Actions แทนได้ (ดู README)
// =====================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY"
};
