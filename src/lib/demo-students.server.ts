/**
 * Demo-only sample students. The shared demo account can populate one of its
 * classes with a handful of fake students so the teacher views (roster,
 * gradebook, leaderboard) look realistic. Real accounts never call this.
 */

const DEMO_STUDENTS = [
  { email: "demo.student.mia@stemhomeworkai.app", name: "Mia Chen" },
  { email: "demo.student.omar@stemhomeworkai.app", name: "Omar Haddad" },
  { email: "demo.student.lena@stemhomeworkai.app", name: "Lena Novak" },
  { email: "demo.student.jae@stemhomeworkai.app", name: "Jae-won Park" },
  { email: "demo.student.ana@stemhomeworkai.app", name: "Ana Ferreira" },
];

export async function seedDemoStudents(classId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let added = 0;
  for (const student of DEMO_STUDENTS) {
    let studentId: string | null = null;

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", student.email)
      .maybeSingle();
    studentId = existing?.id ?? null;

    if (!studentId) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: student.email,
        password: `Demo-${crypto.randomUUID()}`,
        email_confirm: true,
        user_metadata: { full_name: student.name, role: "student" },
      });
      if (error || !created.user) continue;
      studentId = created.user.id;
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: studentId, full_name: student.name, email: student.email });
    }

    const { data: member } = await supabaseAdmin
      .from("class_members")
      .select("id")
      .eq("class_id", classId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (member) continue;

    const { error: joinError } = await supabaseAdmin
      .from("class_members")
      .insert({ class_id: classId, student_id: studentId });
    if (!joinError) added += 1;
  }

  return { added, total: DEMO_STUDENTS.length };
}
