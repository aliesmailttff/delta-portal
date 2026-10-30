const STAFF_PERMISSION_GROUPS={
  finance:[['payments','المدفوعات'],['accounts','حسابات الدفع'],['logs','سجل النشاط'],['chat','محادثات الطلاب']],
  academic:[['students','الطلاب'],['results','النتائج'],['exams','الامتحانات'],['library','المكتبة'],['attendance','الحضور'],['schedule','الجدول'],['requests','الطلبات'],['courses','المواد والتسجيل'],['news','الأخبار'],['chat','محادثات الطلاب']]
};
function defaultStaffPermissions(staffRole){return (STAFF_PERMISSION_GROUPS[staffRole]||[]).map(([id])=>id);}
function hasModuleAccess(module){return role==='admin'||!Array.isArray(profile?.permissions)||profile.permissions.includes(module);}

function exportXlsx(filename,headers,rows,sheetName='التقرير'){
  if(!window.XLSX){showToast('تعذر تحميل مكتبة Excel','error');return;}
  const sheet=XLSX.utils.aoa_to_sheet([headers,...rows]);
  sheet['!cols']=headers.map((_,i)=>({wch:Math.min(34,Math.max(14,...rows.slice(0,100).map(row=>String(row[i]??'').length)))}));
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,sheetName.slice(0,31));XLSX.writeFile(workbook,filename);
  showToast('تم تنزيل تقرير Excel');
}
function exportResultsExcel(scope='mine'){
  const isMine=scope==='mine',records=isMine?cache.results:cache.results;
  if(!isMine&&!['admin','academic'].includes(role)){showToast('ليس لديك صلاحية تصدير النتائج','error');return;}
  const student=cache.students?.[0]||{};
  const headers=['الرقم الجامعي','اسم الطالب','المادة','السنة','الفصل','الساعات','الدرجة','التقدير'];
  const rows=records.map(r=>{
    const s=isMine?student:cache.students.find(x=>x.uid===r.studentUid)||{};
    return [s.studentId||r.studentId||'',s.name||r.studentName||'',r.course||'',r.year||'',r.semester||'',Number(r.credits)||3,Number(r.score)||0,grade(Number(r.score))];
  });
  exportXlsx(`results-${isMine?(student.studentId||'student'):'all'}-${dateNow()}.xlsx`,headers,rows,'النتائج');
}
function exportFinanceExcel(scope='mine'){
  const isMine=scope==='mine';
  if(!isMine&&!['admin','finance'].includes(role)){showToast('ليس لديك صلاحية تصدير المصروفات','error');return;}
  const payments=isMine?cache.payments.filter(p=>p.studentUid===user.uid):cache.payments;
  const headers=['رقم الإيصال','الرقم الجامعي','اسم الطالب','التاريخ','وسيلة الدفع','المبلغ','الرقم المرجعي','الحالة'];
  const rows=payments.map(p=>[p.receiptNo||'',p.studentId||'',p.studentName||'',p.date||'',p.method||'',Number(p.amount)||0,p.trxId||'',p.status||'']);
  exportXlsx(`finance-${isMine?'student':'admin'}-${dateNow()}.xlsx`,headers,rows,'المصروفات');
}
function printReport(title,headers,rows){
  const w=window.open('','_blank');if(!w){showToast('اسمح بفتح النافذة لطباعة التقرير','error');return;}
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px Tahoma,Arial;padding:24px;color:#172033}h1{text-align:center;font-size:22px}p{color:#586579}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #ccd5e1;padding:8px;text-align:right}th{background:#eef3f9}button{padding:9px 18px;margin:16px 0}@media print{button{display:none}}</style><h1>${esc(title)}</h1><p>تاريخ الإصدار: ${new Date().toLocaleDateString('ar-EG')}</p><button onclick="window.print()">طباعة أو حفظ PDF</button><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></html>`);
  w.document.close();
}
function printResultsReport(scope='mine'){
  const mine=scope==='mine',student=cache.students?.[0]||{};
  if(!mine&&!['admin','academic'].includes(role)){showToast('ليس لديك صلاحية طباعة النتائج','error');return;}
  const headers=['الرقم الجامعي','اسم الطالب','المادة','السنة','الفصل','الساعات','الدرجة','التقدير'];
  const rows=cache.results.map(r=>{const s=mine?student:cache.students.find(x=>x.uid===r.studentUid)||{};return [s.studentId||r.studentId||'',s.name||r.studentName||'',r.course||'',r.year||'',r.semester||'',Number(r.credits)||3,Number(r.score)||0,grade(Number(r.score))];});
  printReport('كشف النتائج',headers,rows);
}
function printFinanceReport(scope='mine'){
  const mine=scope==='mine';if(!mine&&!['admin','finance'].includes(role)){showToast('ليس لديك صلاحية طباعة المصروفات','error');return;}
  const rows=(mine?cache.payments.filter(p=>p.studentUid===user.uid):cache.payments).map(p=>[p.receiptNo||'',p.studentId||'',p.studentName||'',p.date||'',p.method||'',money(p.amount),p.trxId||'',p.status||'']);
  printReport('كشف المصروفات والمدفوعات',['رقم الإيصال','الرقم الجامعي','اسم الطالب','التاريخ','وسيلة الدفع','المبلغ','الرقم المرجعي','الحالة'],rows);
}
function myAttendanceReport(){
  const student=cache.students?.[0]||{},sessions=(cache.activeAttendance?.sessions||[]).filter(s=>s.course&&s.level===student.level&&Number(s.expiresAt||0)<=Date.now()&&s.status!=='cancelled');
  const attendanceIds=new Set((cache.attendance||[]).filter(a=>a.studentUid===user.uid).map(a=>a.sessionId));
  return {headers:['المادة','الفرقة','المحاضرة','التاريخ','الحالة'],rows:sessions.map(s=>[s.course,s.level,s.sessionName,new Date(Number(s.createdAt||s.expiresAt)).toLocaleString('ar-EG'),attendanceIds.has(s.sessionId)?'حاضر':'غائب'])};
}
function exportMyAttendanceExcel(){const {headers,rows}=myAttendanceReport();if(!rows.length){showToast('لا يوجد سجل حضور للتصدير','error');return;}exportXlsx(`attendance-${cache.students?.[0]?.studentId||'student'}-${dateNow()}.xlsx`,headers,rows,'الحضور');}
function printMyAttendanceReport(){const {headers,rows}=myAttendanceReport();if(!rows.length){showToast('لا يوجد سجل حضور للطباعة','error');return;}printReport('سجل الحضور والغياب',headers,rows);}

window.editStaffPermissions=function(uid){
  if(role!=='admin')return;
  const staff=cache.staff.find(x=>x.uid===uid);if(!staff||!STAFF_PERMISSION_GROUPS[staff.role])return;
  const allowed=STAFF_PERMISSION_GROUPS[staff.role],selected=Array.isArray(staff.permissions)?staff.permissions:defaultStaffPermissions(staff.role);
  document.querySelector('#staffPermissionsModal')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div id="staffPermissionsModal" class="modal-overlay active" role="dialog" aria-modal="true"><section class="modal-card"><h3>صلاحيات ${esc(staff.name||staff.email)}</h3><p class="muted">حدد الأقسام التي يستطيع هذا المساعد فتحها. لتطبيق المنع على مستوى قاعدة البيانات، يجب نشر قواعد Firestore المحدّثة مع الموقع.</p><form id="staffPermissionsForm">${allowed.map(([id,label])=>`<label class="permission-option"><input type="checkbox" name="permission" value="${id}" ${selected.includes(id)?'checked':''}> ${label}</label>`).join('')}<div class="actions" style="margin-top:16px"><button type="button" class="secondary" onclick="document.querySelector('#staffPermissionsModal')?.remove()">إلغاء</button><button type="submit">حفظ الصلاحيات</button></div></form></section></div>`);
  $('#staffPermissionsForm').addEventListener('submit',async e=>{
    e.preventDefault();const permissions=[...e.currentTarget.querySelectorAll('[name=permission]:checked')].map(x=>x.value);
    const button=e.currentTarget.querySelector('button[type=submit]');button.disabled=true;
    try{await updateDoc(doc(db,'users',uid),{permissions});logAction('تعديل صلاحيات مساعد',staff.email);staff.permissions=permissions;$('#staffPermissionsModal')?.remove();showToast('تم تحديث الصلاحيات');if(uid===user.uid){profile.permissions=permissions;const tabs=getValidTabsForRole(role);if(!tabs.includes(activeTab))activeTab='dashboard';renderApp();}}
    catch(err){button.disabled=false;showToast(authError(err),'error');}
  });
};

async function changeOwnPassword(e){
  e.preventDefault();const form=e.currentTarget,d=Object.fromEntries(new FormData(form).entries()),box=$('#ownPasswordMsg'),button=form.querySelector('button[type=submit]');
  if(d.newPassword!==d.confirmPassword){box.innerHTML=msg('كلمتا المرور الجديدتان غير متطابقتين.','error');return;}
  if(d.newPassword.length<8){box.innerHTML=msg('استخدم كلمة مرور من 8 أحرف على الأقل.','error');return;}
  button.disabled=true;
  try{
    const credential=EmailAuthProvider.credential(user.email,d.currentPassword);
    await reauthenticateWithCredential(user,credential);
    await updatePassword(user,d.newPassword);
    await logAction('تغيير كلمة المرور','تم تغيير كلمة المرور من الحساب الشخصي');
    alert('تم تغيير كلمة المرور. سجّل الدخول مجددًا باستخدام كلمة المرور الجديدة.');
    await signOut(auth);
  }catch(err){box.innerHTML=msg(authError(err),'error');button.disabled=false;}
}
