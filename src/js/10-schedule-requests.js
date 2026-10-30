/* ---------- الجدول الأسبوعي + طلبات الطلاب (تظلمات وشهادات) ---------- */
const DAYS=['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'];
const LEVELS=['الفرقة الأولى','الفرقة الثانية','الفرقة الثالثة','الفرقة الرابعة'];
const REQ_TYPES=['تظلم من نتيجة','شهادة قيد','إفادة التحاق','كشف درجات رسمي','أخرى'];
async function loadExtra(){
  const staff=['admin','finance','academic'].includes(role);
  const sc=await safe(getDocs(collection(db,'schedule')),none);
  cache.schedule=sc.docs.map(d=>({id:d.id,...d.data()}));
  const rq=await safe(getDocs(staff?collection(db,'requests'):query(collection(db,'requests'),where('studentUid','==',user.uid))),none);
  cache.requests=rq.docs.map(d=>({id:d.id,...d.data()}));
  const cs=await safe(getDocs(collection(db,'courses')),none); cache.courses=cs.docs.map(d=>({id:d.id,...d.data()}));
  const rg=await safe(getDoc(doc(db,'settings','registration')),none); cache.regSettings=rg.exists()?rg.data():{};
  const rr=await safe(getDocs(staff?collection(db,'registrations'):query(collection(db,'registrations'),where('studentUid','==',user.uid))),none); cache.registrations=rr.docs.map(d=>({id:d.id,...d.data()}));
}
function reqBadge(){const n=(cache.requests||[]).filter(r=>r.status==='قيد المراجعة').length;return n?` <span style="background:#c0392b;color:#fff;padding:1px 6px;border-radius:99px;font-size:.75rem;">${n}</span>`:'';}
function reqPill(t){const c=t==='قيد المراجعة'?['#fef3c7','#92400e']:t==='مرفوض'?['#fee2e2','#991b1b']:['#d1fae5','#065f46'];return `<span class="pill" style="background:${c[0]};color:${c[1]};">${esc(t)}</span>`;}
function extraViews(html){
  const staff=role==='admin'||role==='academic', st=cache.students[0]||{};
  if(activeTab==='schedule'&&staff){
    const lv=LEVELS.map(l=>`<option>${l}</option>`).join(''),dy=DAYS.map(d=>`<option>${d}</option>`).join('');
    const rows=(cache.schedule||[]).slice().sort((a,b)=>String(a.level).localeCompare(b.level)||DAYS.indexOf(a.day)-DAYS.indexOf(b.day)||String(a.start).localeCompare(String(b.start)))
      .map(x=>`<tr><td>${esc(x.level)}</td><td>${esc(x.day)}</td><td>${esc(x.start)} - ${esc(x.end)}</td><td>${esc(x.course)}</td><td>${esc(x.hall)}</td><td>${esc(x.instructor||'—')}</td><td><button class="danger" data-delete="schedule" data-id="${x.id}"><i class="fas fa-trash"></i></button></td></tr>`).join('');
    return `<section class="card"><h2><i class="fas fa-calendar-week" style="color:var(--blue)"></i> إضافة محاضرة للجدول الأسبوعي</h2>
      <form id="scheduleForm" class="fields"><div><label>الفرقة</label><select name="level">${lv}</select></div><div><label>اليوم</label><select name="day">${dy}</select></div>
      <div><label>من</label><input name="start" type="time" required></div><div><label>إلى</label><input name="end" type="time" required></div>
      <div><label>المادة</label><input name="course" required></div><div><label>القاعة</label><input name="hall" required></div>
      <div><label>المحاضر</label><input name="instructor"></div><button style="margin-top:10px;">إضافة</button></form></section>
      <section class="card"><h3>الجدول الحالي</h3>${table(['الفرقة','اليوم','الوقت','المادة','القاعة','المحاضر','إجراء'],rows)}</section>`;
  }
  if(activeTab==='myschedule'&&role==='student'){
    const mine=(cache.schedule||[]).filter(x=>x.level===st.level);
    const cards=DAYS.map(d=>{const it=mine.filter(x=>x.day===d).sort((a,b)=>String(a.start).localeCompare(String(b.start)));
      return it.length?`<section class="card"><h3>${d}</h3>${table(['الوقت','المادة','القاعة','المحاضر'],it.map(x=>`<tr><td>${esc(x.start)} - ${esc(x.end)}</td><td><b>${esc(x.course)}</b></td><td>${esc(x.hall)}</td><td>${esc(x.instructor||'—')}</td></tr>`).join(''))}</section>`:'';}).join('');
    return `<h2>جدول محاضراتي — ${esc(st.level||'')}</h2>`+(cards||'<section class="card muted">لم يُعلن الجدول بعد.</section>');
  }
  if(activeTab==='requests'&&staff){
    const rows=(cache.requests||[]).slice().sort((a,b)=>(a.status==='قيد المراجعة'?0:1)-(b.status==='قيد المراجعة'?0:1))
      .map(r=>`<tr><td><b>${esc(r.studentName)}</b><br><small class="muted">${esc(r.studentId)}</small></td><td>${esc(r.type)}</td><td>${esc(r.details)}</td><td>${reqPill(r.status)}</td><td>${esc(r.reply||'—')}</td>
      <td>${r.status==='قيد المراجعة'?`<div class="actions"><button style="background:var(--green);padding:5px 10px;font-size:.8rem;" onclick="setRequestStatus('${r.id}','تم القبول')">قبول</button><button class="secondary" style="padding:5px 10px;font-size:.8rem;" onclick="setRequestStatus('${r.id}','جاهز للاستلام')">جاهز</button><button class="danger" style="padding:5px 10px;font-size:.8rem;" onclick="setRequestStatus('${r.id}','مرفوض')">رفض</button></div>`:'—'}</td></tr>`).join('');
    return `<section class="card"><h2><i class="fas fa-inbox" style="color:var(--blue)"></i> طلبات الطلاب (تظلمات وشهادات)</h2>${table(['الطالب','النوع','التفاصيل','الحالة','الرد','إجراء'],rows)}</section>`;
  }
  if(activeTab==='myrequests'&&role==='student'){
    const rows=(cache.requests||[]).slice().sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))
      .map(r=>`<tr><td>${esc(r.type)}</td><td>${esc(r.details)}</td><td>${reqPill(r.status)}</td><td>${esc(r.reply||'—')}</td></tr>`).join('');
    return `<section class="card"><h2><i class="fas fa-file-signature" style="color:var(--blue)"></i> تقديم طلب جديد</h2>
      <form id="requestForm"><label>نوع الطلب</label><select name="type" style="margin-bottom:10px;">${REQ_TYPES.map(t=>`<option>${t}</option>`).join('')}</select>
      <label>التفاصيل (للتظلم: اسم المادة وسبب التظلم)</label><textarea name="details" rows="3" maxlength="1000" required style="margin-bottom:10px;"></textarea><button>إرسال الطلب</button></form></section>
      <section class="card"><h3>طلباتي السابقة</h3>${table(['النوع','التفاصيل','الحالة','رد الإدارة'],rows)}</section>`;
  }
  const rv=resultsViews(staff,st); if(rv!==null) return rv;
  const cv=courseViews(staff,st); if(cv!==null) return cv;
  return html;
}
async function addSchedule(e){
  e.preventDefault(); const f=e.currentTarget,d=Object.fromEntries(new FormData(f).entries());
  try{ await addDoc(collection(db,'schedule'),{level:d.level,day:d.day,start:d.start,end:d.end,course:d.course.trim(),hall:d.hall.trim(),instructor:(d.instructor||'').trim(),createdAt:serverTimestamp()});
    logAction('إضافة محاضرة',d.course); showToast('تمت الإضافة'); await loadData(); renderApp();
  }catch(err){ showToast(authError(err),'error'); }
}
async function sendRequest(e){
  e.preventDefault(); const f=e.currentTarget,d=Object.fromEntries(new FormData(f).entries()),s=cache.students[0];
  if(!s) return;
  try{ await addDoc(collection(db,'requests'),{studentUid:user.uid,studentId:s.studentId,studentName:s.name,type:d.type,details:d.details.trim(),status:'قيد المراجعة',reply:'',createdAt:serverTimestamp()});
    showToast('تم إرسال طلبك'); await loadData(); renderApp();
  }catch(err){ showToast(authError(err),'error'); }
}
window.setRequestStatus=async(id,status)=>{
  const r=cache.requests.find(x=>x.id===id); if(!r) return;
  const reply=prompt('ملاحظة للطالب (اختياري):',''); if(reply===null) return;
  try{ await updateDoc(doc(db,'requests',id),{status,reply:reply.trim(),handledBy:user.email,handledAt:serverTimestamp()});
    logAction('معالجة طلب',`${r.type} - ${r.studentName} - ${status}`); showToast('تم التحديث'); await loadData(); renderApp();
  }catch(err){ showToast(authError(err),'error'); }
};

