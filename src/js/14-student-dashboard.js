/* ---------- لوحة متابعة الطالب والتنبيهات ---------- */
const DASHBOARD_WEEK_DAYS=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

function dashboardValueDate(value){
  if(value?.toDate) return value.toDate();
  if(value instanceof Date) return value;
  if(!value) return null;
  const d=new Date(value);
  return Number.isNaN(d.getTime())?null:d;
}

function dashboardDateTime(dateValue,timeValue='00:00'){
  const date=String(dateValue||'').trim(), time=String(timeValue||'00:00').trim();
  const m=date.match(/^(\d{4})-(\d{2})-(\d{2})$/), t=time.match(/^(\d{1,2}):(\d{2})/);
  if(m){
    const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),t?Number(t[1]):0,t?Number(t[2]):0);
    return Number.isNaN(d.getTime())?null:d;
  }
  return dashboardValueDate(date);
}

function dashboardDateLabel(date){
  return date?date.toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'}):'';
}

function studentNextLecture(student){
  const now=new Date(), matches=(cache.schedule||[]).filter(x=>x.level===student.level);
  const events=matches.map(item=>{
    const day=DASHBOARD_WEEK_DAYS.indexOf(item.day);
    const tm=String(item.start||'').match(/^(\d{1,2}):(\d{2})/);
    if(day<0||!tm) return null;
    let offset=(day-now.getDay()+7)%7;
    let when=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset,Number(tm[1]),Number(tm[2]));
    if(when<=now){offset+=7;when=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset,Number(tm[1]),Number(tm[2]));}
    return {item,when};
  }).filter(Boolean).sort((a,b)=>a.when-b.when);
  return events[0]||null;
}

function studentNextExam(student){
  const now=new Date();
  return (cache.exams||[]).filter(x=>!x.level||x.level==='كل الفرق'||x.level===student.level)
    .map(item=>({item,when:dashboardDateTime(item.date,item.time)}))
    .filter(x=>x.when&&x.when>=now)
    .sort((a,b)=>a.when-b.when)[0]||null;
}

function studentDashboardNotice(icon,title,detail,tab,tone='blue'){
  return `<button type="button" class="student-notice ${tone}" data-go="${tab}">
    <span class="student-notice-icon"><i class="fas ${icon}" aria-hidden="true"></i></span>
    <span class="student-notice-copy"><strong>${esc(title)}</strong><small>${esc(detail)}</small></span>
    <i class="fas fa-chevron-left student-notice-arrow" aria-hidden="true"></i>
  </button>`;
}

function studentDashboardView(student,financial){
  const nextLecture=studentNextLecture(student);
  const nextExam=studentNextExam(student);
  const latestResult=(cache.results||[]).slice().sort((a,b)=>(dashboardValueDate(b.createdAt)?.getTime()||0)-(dashboardValueDate(a.createdAt)?.getTime()||0))[0];
  const latestNews=(cache.news||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))[0];
  const requestUpdates=(cache.requests||[]).filter(r=>r.status&&r.status!=='قيد المراجعة')
    .sort((a,b)=>(dashboardValueDate(b.handledAt||b.createdAt)?.getTime()||0)-(dashboardValueDate(a.handledAt||a.createdAt)?.getTime()||0)).slice(0,2);
  const rejectedPayments=(cache.payments||[]).filter(p=>p.status==='مرفوض').length;
  const pendingPayments=(cache.payments||[]).filter(p=>p.status==='قيد المراجعة').length;
  const lectureLabel=nextLecture?`${nextLecture.item.course||'محاضرة'} — ${nextLecture.when.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}`:'لم يُعلن الجدول بعد';
  const examLabel=nextExam?`${nextExam.item.course||'امتحان'} — ${dashboardDateLabel(nextExam.when)}`:'لا توجد امتحانات قادمة معلنة';
  const resultLabel=latestResult?`${latestResult.course||'مادة'} — ${Number(latestResult.score)} / 100`:'لا توجد نتيجة مسجلة بعد';
  const notices=[];
  if(requestUpdates.length) notices.push(studentDashboardNotice('fa-file-signature','تحديث على طلبك',`${requestUpdates[0].type||'طلب'}: ${requestUpdates[0].status}${requestUpdates[0].reply?` — ${requestUpdates[0].reply}`:''}`,'myrequests','violet'));
  if(rejectedPayments) notices.push(studentDashboardNotice('fa-circle-exclamation','إيصال يحتاج إلى مراجعة',`يوجد ${rejectedPayments} إيصال مرفوض. افتح سجل المدفوعات لمعرفة التفاصيل.`,'home','amber'));
  if(pendingPayments) notices.push(studentDashboardNotice('fa-hourglass-half','إيصال قيد المراجعة',`لديك ${pendingPayments} إيصال بانتظار اعتماد الإدارة.`,'home','blue'));
  if(nextExam) notices.push(studentDashboardNotice('fa-calendar-check','موعد الامتحان القادم',examLabel,'myexams','red'));
  if(nextLecture) notices.push(studentDashboardNotice('fa-calendar-day','محاضرتك القادمة',`${nextLecture.item.course||'محاضرة'} — ${dashboardDateLabel(nextLecture.when)}، ${nextLecture.item.start||''} — ${nextLecture.item.hall||'القاعة غير محددة'}`,'myschedule','green'));
  if(latestResult) notices.push(studentDashboardNotice('fa-chart-line','آخر نتيجة مسجلة',resultLabel,'myresults','violet'));
  if(latestNews) notices.push(studentDashboardNotice('fa-bullhorn','آخر إعلان',latestNews.title||'خبر جديد','mynews','blue'));
  const noticeContent=notices.length?notices.slice(0,5).join(''):'<p class="muted student-notices-empty">لا توجد تنبيهات جديدة حاليًا. ستظهر هنا تحديثات النتائج والطلبات والمواعيد.</p>';
  return `<section class="student-dashboard-welcome">
      <div><span class="section-kicker">لوحة متابعة الطالب</span><h2>أهلاً بك يا ${esc(student.name||profile.name||'الطالب')} 👋</h2><p>ملخص سريع لمواعيدك ونتائجك ومتابعاتك.</p></div>
      <span class="student-dashboard-mark"><i class="fas fa-graduation-cap" aria-hidden="true"></i></span>
    </section>
    <div class="student-dashboard-grid">
      <button type="button" class="student-dashboard-card" data-go="myschedule"><span class="student-dashboard-icon green"><i class="fas fa-calendar-day"></i></span><span class="student-dashboard-label">أقرب محاضرة</span><strong>${esc(lectureLabel)}</strong><small>${nextLecture?esc(dashboardDateLabel(nextLecture.when)):'عرض الجدول الأسبوعي'}</small></button>
      <button type="button" class="student-dashboard-card" data-go="myexams"><span class="student-dashboard-icon red"><i class="fas fa-calendar-check"></i></span><span class="student-dashboard-label">الامتحان القادم</span><strong>${esc(examLabel)}</strong><small>${nextExam?esc(nextExam.item.time||''):'عرض جدول الامتحانات'}</small></button>
      <button type="button" class="student-dashboard-card" data-go="myresults"><span class="student-dashboard-icon violet"><i class="fas fa-chart-line"></i></span><span class="student-dashboard-label">آخر نتيجة</span><strong>${esc(resultLabel)}</strong><small>${latestResult?esc(grade(Number(latestResult.score))):'عرض النتائج'}</small></button>
      <button type="button" class="student-dashboard-card" data-go="home"><span class="student-dashboard-icon amber"><i class="fas fa-wallet"></i></span><span class="student-dashboard-label">المتبقي من المصروفات</span><strong>${money(financial.remaining)}</strong><small>${financial.pendingTotal?`${money(financial.pendingTotal)} قيد المراجعة`:`إجمالي المصروفات ${money(financial.totalFees)}`}</small></button>
    </div>
    <section class="card student-notices-card"><div class="section-heading"><div><span class="section-kicker">آخر التحديثات</span><h3><i class="fas fa-bell" style="color:var(--blue)"></i> تنبيهات ومتابعات</h3></div><span class="pill">${notices.length} تحديث</span></div><div class="student-notices-list">${noticeContent}</div></section>`;
}
