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

function exportAttendanceReport(){
  if(!['admin','academic'].includes(role)){showToast('ليس لديك صلاحية تصدير التقرير','error');return;}
  const courseFilter=$('#attendanceExportCourse')?.value||'';
  const levelFilter=$('#attendanceExportLevel')?.value||'';
  const sessions=(cache.activeAttendance?.sessions||[]).filter(s=>s.course&&Number(s.expiresAt||0)<=Date.now()&&s.status!=='cancelled'&&(!courseFilter||s.course===courseFilter)&&(!levelFilter||s.level===levelFilter));
  if(!sessions.length){showToast('لا توجد جلسات مكتملة للفلاتر المحددة','error');return;}
  const attendanceBySession=new Map((cache.attendance||[]).map(a=>[`${a.sessionId}:${a.studentUid}`,a]));
  const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
  const lines=[['اسم الطالب','الرقم الجامعي','المادة','الفرقة','المحاضرة','التاريخ','الحالة']];
  for(const session of sessions){
    const students=(cache.students||[]).filter(s=>s.level===session.level);
    for(const student of students){
      const attendance=attendanceBySession.get(`${session.sessionId}:${student.uid}`);
      const date=attendance?.createdAt?.toDate?.()||new Date(Number(session.createdAt||session.expiresAt));
      lines.push([student.name,student.studentId,session.course,session.level,session.sessionName,date.toLocaleString('ar-EG'),attendance?'حاضر':'غائب']);
    }
  }
  if(lines.length===1){showToast('لا يوجد طلاب مطابقون للفرقة المحددة','error');return;}
  const csv='\uFEFF'+lines.map(row=>row.map(quote).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`attendance-report-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  showToast(`تم تجهيز التقرير (${lines.length-1} سجل)`);
}
