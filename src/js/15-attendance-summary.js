function renderStudentAttendanceSummary(){
  const student=cache.students?.[0]||{};
  const level=student.level||'';
  const threshold=Number(cache.activeAttendance?.absenceAlertPercent)||25;
  const sessions=(cache.activeAttendance?.sessions||[]).filter(s=>
    s.course&&s.level===level&&Number(s.expiresAt||0)<=Date.now()&&s.status!=='cancelled'
  );
  if(!sessions.length) return `<section class="card"><h3>ملخص الحضور والغياب</h3><p class="muted">سيظهر الملخص بعد انتهاء جلسات حضور مسجلة لمادتك وفرقتك. لا تتضمن السجلات السابقة بيانات الجلسات التي لم يحضرها الطالب.</p></section>`;
  const presentIds=new Set((cache.attendance||[]).filter(a=>a.studentUid===user.uid).map(a=>a.sessionId));
  const byCourse=new Map();
  for(const session of sessions){
    const row=byCourse.get(session.course)||{total:0,present:0};
    row.total++;
    if(presentIds.has(session.sessionId)) row.present++;
    byCourse.set(session.course,row);
  }
  const rows=[...byCourse.entries()].sort(([a],[b])=>a.localeCompare(b,'ar')).map(([course,row])=>{
    const absent=row.total-row.present,percent=Math.round(absent/row.total*100);
    const alert=absent>0&&percent>=threshold?` <span class="pill" style="background:#fee2e2;color:#991b1b">تنبيه غياب</span>`:'';
    return `<tr><td>${esc(course)}${alert}</td><td>${row.total}</td><td>${row.present}</td><td>${absent}</td><td>${percent}%</td></tr>`;
  }).join('');
  return `<section class="card"><h3>ملخص الحضور والغياب حسب المادة</h3><p class="muted">يظهر التنبيه عند بلوغ الغياب ${threshold}% أو أكثر.</p>${table(['المادة','الجلسات','حضور','غياب','نسبة الغياب'],rows)}</section>`;
}
