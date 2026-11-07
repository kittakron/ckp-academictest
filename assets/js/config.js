// =====================================================================
// ตั้งค่าการเชื่อมต่อ Supabase — แก้ 2 ค่านี้เท่านั้น
//
// หาได้ที่ Supabase Dashboard > Project Settings > API
//   SUPABASE_URL       = Project URL
//   SUPABASE_ANON_KEY  = anon / public key  (เป็นคีย์สาธารณะ ใส่ในหน้าเว็บได้ ปลอดภัยเพราะมี RLS คุมอยู่)
//
// ห้ามใช้ secret key (คีย์สิทธิ์สูง) ในไฟล์นี้เด็ดขาด
//
// ถ้า deploy ผ่าน GitHub Actions ที่แนบมา สามารถไม่แก้ไฟล์นี้ แล้วไปตั้งค่าที่
// GitHub repo > Settings > Secrets and variables > Actions แทนได้ (ดู README)
// =====================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://hnwntrfaywlxlcjjqyck.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_9q_0f876VxmuMj9Dz2uSsg_qKxr9z9B"
};
