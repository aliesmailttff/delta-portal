/* ---------- أدوات الإدارة: البحث، الصيانة، الحسابات، QR ---------- */
function adminResultRows(records){
  const rows=records.map(r=>{
    const s=cache.students.find(x=>x.uid===r.studentUid);
    return `<tr><td>${esc(s?.name||r.studentName||'—')}<br><small>${esc(s?.studentId||r.studentId||'')}</small></td><td>${esc(r.course)}</td><td>${esc(r.year||'—')} ${esc(r.semester||'')}</td><td>${r.credits??'—'}</td><td>${Number(r.score)}</td><td>${grade(Number(r.score))}</td><td><div class="actions"><button class="secondary" onclick="editResultModal('${r.id}')"><i class="fas fa-edit"></i></button><button class="danger" data-delete="results" data-id="${r.id}"><i class="fas fa-trash"></i></button></div></td></tr>`;
  }).join('');
  return table(['الطالب','المادة','الفصل','الساعات','الدرجة','التقدير','إجراء'],rows);
}

window.searchAdminResults=function(value){
  const box=$('#adminResultsSearchResults')||$('#dashboardResultsSearchResults'); if(!box) return;
  const q=String(value||'').trim().toLocaleLowerCase();
  if(!q){box.innerHTML='اكتب اسم الطالب أو رقمه لعرض نتائجه.';return;}
  const matches=cache.students.filter(s=>String(s.name||'').toLocaleLowerCase().includes(q)||String(s.studentId||'').toLocaleLowerCase().includes(q));
  if(!matches.length){box.innerHTML='<p class="muted">لا يوجد طالب بهذا الاسم أو الرقم.</p>';return;}
  const ids=new Set(matches.map(s=>s.uid));
  const records=cache.results.filter(r=>ids.has(r.studentUid)||matches.some(s=>String(s.studentId)===String(r.studentId)));
  box.innerHTML=`<p class="muted">مطابقة ${matches.length} طالب. عدد النتائج: ${records.length}.</p>`+
    (records.length?adminResultRows(records):'<p class="muted">لا توجد نتائج مسجلة لهذا الطالب.</p>');
};

window.filterAdminChatStudents=function(value){
  const box=$('#adminChatStudentResults'); if(!box) return;
  const q=String(value||'').trim().toLocaleLowerCase();
  if(!q){box.innerHTML='اكتب اسم الطالب أو رقمه للبحث عن المحادثة.';return;}
  const matches=cache.students.filter(s=>String(s.name||'').toLocaleLowerCase().includes(q)||String(s.studentId||'').toLocaleLowerCase().includes(q)).slice(0,30);
  if(!matches.length){box.innerHTML='<p class="muted">لا يوجد طالب مطابق.</p>';return;}
  box.innerHTML=matches.map(s=>`<button type="button" class="chat-student-result ${s.uid===selectedChatStudentUid?'active':''}" data-chat-student="${esc(s.uid)}"><strong>${esc(s.name)}</strong><span>${esc(s.studentId||'')}</span></button>`).join('');
  box.querySelectorAll('[data-chat-student]').forEach(button=>button.addEventListener('click',()=>window.changeChatStudent(button.dataset.chatStudent)));
};

async function saveSiteMaintenance(e){
  e.preventDefault();
  if(role!=='admin'){showToast('هذه الإعدادات متاحة للمدير فقط','error');return;}
  const form=e.currentTarget;
  const maintenanceMode=form.elements.maintenanceMode.checked;
  const message=String(form.elements.message.value||'').trim().slice(0,240);
  try{
    const value={maintenanceMode,message,updatedAt:serverTimestamp()};
    await setDoc(doc(db,'settings','site_status'),value);
    cache.siteStatus={...value,updatedAt:new Date()};
    logAction('تغيير حالة الموقع',maintenanceMode?'تفعيل الصيانة':'إنهاء الصيانة');
    showToast(maintenanceMode?'تم تفعيل صيانة الموقع للطلاب':'تم فتح الموقع للطلاب');
  }catch(err){showToast(authError(err),'error');}
}

window.openStudentPasswordModal=function(uid){
  if(role!=='admin') return;
  const student=cache.students.find(s=>s.uid===uid); if(!student) return;
  document.querySelector('#studentPasswordModal')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div id="studentPasswordModal" class="modal-overlay active" role="dialog" aria-modal="true" aria-labelledby="studentPasswordTitle">
    <section class="modal-card"><h3 id="studentPasswordTitle"><i class="fas fa-key"></i> تغيير كلمة مرور الطالب</h3>
      <p><strong>${esc(student.name)}</strong> — ${esc(student.studentId)}</p>
      <form id="studentPasswordForm">
        <label>كلمة المرور الجديدة</label><input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required>
        <label style="margin-top:10px">تأكيد كلمة المرور</label><input name="confirmPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required>
        <div id="studentPasswordMsg" style="margin:10px 0"></div>
        <div class="actions"><button type="button" class="secondary" onclick="closeStudentPasswordModal()">إلغاء</button><button type="submit">تغيير كلمة المرور</button></div>
      </form>
    </section></div>`);
  $('#studentPasswordForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget,password=form.elements.password.value,confirmPassword=form.elements.confirmPassword.value;
    const box=$('#studentPasswordMsg'),button=form.querySelector('button[type="submit"]');
    if(password!==confirmPassword){box.innerHTML=msg('كلمتا المرور غير متطابقتين.','error');return;}
    button.disabled=true;
    try{
      await httpsCallable(functions,'resetStudentPassword')({studentUid:uid,newPassword:password});
      logAction('إعادة تعيين كلمة مرور طالب',String(student.studentId));
      closeStudentPasswordModal();
      showToast('تم تغيير كلمة المرور. سيُطلب من الطالب تحديثها عند دخوله.');
    }catch(err){box.innerHTML=msg(authError(err),'error');button.disabled=false;}
  });
};
window.closeStudentPasswordModal=()=>$('#studentPasswordModal')?.remove();

window.deleteSelectedStudentConversation=async function(){
  if(role!=='admin'||!selectedChatStudentUid) return;
  const student=cache.students.find(s=>s.uid===selectedChatStudentUid); if(!student) return;
  if(!confirm(`حذف سجل المحادثة مع ${student.name} للطرفين؟ لا يمكن التراجع عن الحذف.`)) return;
  try{
    if(unsubChat){unsubChat();unsubChat=null;}
    await httpsCallable(functions,'deleteStudentConversation')({studentUid:student.uid});
    logAction('حذف محادثة طالب',String(student.studentId));
    selectedChatStudentUid=null;
    showToast('تم حذف المحادثة للطرفين');
    renderApp();
  }catch(err){showToast(authError(err),'error');startChatListener();}
};

let attendanceQrTimer=null,attendanceQrBusy=false,attendanceQrSession=null;
window.stopAttendanceQrRefresh=function(){
  if(attendanceQrTimer){clearInterval(attendanceQrTimer);attendanceQrTimer=null;}
  attendanceQrSession=null;
};
window.startAttendanceQrRefresh=function(){
  const card=$('#attendanceQrCard');
  if(!card){stopAttendanceQrRefresh();return;}
  const sessionId=card.dataset.sessionId;
  if(attendanceQrSession===sessionId&&attendanceQrTimer) return;
  stopAttendanceQrRefresh(); attendanceQrSession=sessionId;
  refreshAttendanceQrCode();
  attendanceQrTimer=setInterval(refreshAttendanceQrCode,15000);
};
async function refreshAttendanceQrCode(){
  const card=$('#attendanceQrCard'),canvas=$('#attendanceQrCanvas'),message=$('#attendanceQrMessage');
  if(!card||!canvas||!message||attendanceQrBusy) return;
  if(Date.now()>=Number(card.dataset.expiresAt||0)){
    message.textContent='انتهت جلسة الحضور.';stopAttendanceQrRefresh();return;
  }
  if(!window.QRCode?.toCanvas){message.textContent='تعذر تحميل مولد رمز QR. أعد تحميل الصفحة.';return;}
  attendanceQrBusy=true;
  try{
    const {data}=await httpsCallable(functions,'refreshAttendanceQr')({sessionId:card.dataset.sessionId});
    const target=new URL(window.location.href);target.search='';target.hash='';target.searchParams.set('attendance',data.token);
    await new Promise((resolve,reject)=>QRCode.toCanvas(canvas,target.toString(),{width:240,margin:2,errorCorrectionLevel:'M'},error=>error?reject(error):resolve()));
    message.textContent=`رمز مؤقت يتجدد تلقائيًا. صالح حتى ${new Date(data.expiresAt).toLocaleTimeString('ar-EG')}.`;
  }catch(err){message.textContent=authError(err);}
  finally{attendanceQrBusy=false;}
}

window.closeAttendanceSession=async function(){
  if(!['admin','academic'].includes(role)||!cache.activeAttendance) return;
  try{
    await updateDoc(doc(db,'settings','attendance_public'),{expiresAt:Date.now()});
    cache.activeAttendance={...cache.activeAttendance,expiresAt:Date.now()};
    stopAttendanceQrRefresh();
    logAction('إيقاف حضور',cache.activeAttendance.sessionName||'');
    showToast('تم إيقاف جلسة الحضور');
    await loadData();renderApp();
  }catch(err){showToast(authError(err),'error');}
};

async function handleAttendanceQr(){
  const params=new URLSearchParams(window.location.search),token=params.get('attendance');
  if(!token||role!=='student') return;
  const cleanUrl=()=>history.replaceState({},document.title,window.location.pathname+window.location.hash);
  activeTab='myattendance';localStorage.setItem('activeTab',activeTab);
  try{
    const {data}=await httpsCallable(functions,'recordAttendanceFromQr')({token});
    showToast(data.alreadyRegistered?'الحضور مسجل مسبقًا لهذه المحاضرة.':'تم تسجيل حضورك بنجاح.');
    cleanUrl();
    await loadData();
  }catch(err){
    cleanUrl();
    showToast(authError(err),'error');
  }
}
