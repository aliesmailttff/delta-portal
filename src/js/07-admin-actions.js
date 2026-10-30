async function saveAccountsData(e){
  e.preventDefault();
  const form = e.currentTarget;
  const d = Object.fromEntries(new FormData(form).entries());
  const mMode = form.maintenanceMode.checked;
  await setDoc(doc(db,'settings','payment_accounts'), { ...d, maintenanceMode: mMode });
  logAction('تحديث الحسابات', 'تم التحديث');
  showToast('تم الحفظ');
  await loadData();
}

async function createStudent(e){
  e.preventDefault();
  const form = e.currentTarget;
  const d = Object.fromEntries(new FormData(form).entries());
  const btn = form.querySelector('button[type="submit"]');
  if(btn) btn.disabled = true;
  if(cache.students.some(s => s.studentId === d.studentId)){
    showToast('الرقم الجامعي مسجل مسبقاً', 'error');
    if(btn) btn.disabled = false;
    return;
  }

  const fileInput = $('#studentPhotoInput');
  const proceed = async (imgUrl) => {
    const secApp = initializeApp(firebaseConfig, 'stu-'+Date.now());
    const secAuth = getAuth(secApp);
    try {
      const cred = await createUserWithEmailAndPassword(secAuth, d.email, d.password);
      await setDoc(doc(db,'users',cred.user.uid), { role:'student', name:d.name, email:d.email, mustChangePassword:true });
      
      await setDoc(doc(db,'students',cred.user.uid), {
        studentId:d.studentId, name:d.name, email:d.email,
        level:d.level, department:d.department,
        totalFees:Number(d.totalFees), paidAmount:0,
        photo: imgUrl
      });

      logAction('إضافة طالب', d.name);
      showToast('تم إنشاء الطالب');
      form.reset(); await loadData(); renderApp();
    } catch(err){
      showToast(authError(err), 'error');
    } finally {
      if(btn) btn.disabled = false;
      await signOut(secAuth).catch(()=>{});
      deleteApp(secApp);
    }
  };

  if(fileInput && fileInput.files[0]){
    const file = fileInput.files[0];
    if(file.size > 500000){ showToast('حجم الصورة كبير جداً (أقل من 500KB)', 'error'); if(btn) btn.disabled=false; return; }
    const reader = new FileReader();
    reader.onload = ev => proceed(ev.target.result);
    reader.readAsDataURL(file);
  } else {
    proceed('');
  }
}

async function createStaff(e){
  e.preventDefault();
  const form = e.currentTarget;
  const d = Object.fromEntries(new FormData(form).entries());
  const btn = form.querySelector('button[type="submit"]');
  if(btn) btn.disabled = true;
  const secApp = initializeApp(firebaseConfig, 'stf-'+Date.now());
  const secAuth = getAuth(secApp);
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, d.email, d.password);
    await setDoc(doc(db,'users',cred.user.uid), {
      role: d.role, name: d.name, email: d.email, createdAt: serverTimestamp()
    });
    logAction('إضافة مساعد', d.name);
    showToast('تم إضافة المساعد');
    form.reset(); await loadData(); renderApp();
  } catch(err){ showToast(authError(err), 'error'); }
  finally {
    if(btn) btn.disabled = false;
    await signOut(secAuth).catch(()=>{});
    deleteApp(secApp);
  }
}

async function saveAttendanceSession(e){
  e.preventDefault();
  const form=e.currentTarget,d=Object.fromEntries(new FormData(form).entries());
  const sessionId=String(Date.now()),expiresAt=Date.now()+Number(d.minutes||15)*60000;
  try{
    await setDoc(doc(db,'settings','active_attendance'),{code:String(d.code).trim(),sessionId,createdAt:serverTimestamp()});
    await setDoc(doc(db,'settings','attendance_public'),{sessionName:d.sessionName.trim(),sessionId,expiresAt});
    logAction('فتح حضور',d.sessionName); showToast('تم فتح الجلسة');
    await loadData(); renderApp();
  }catch(err){showToast(err.message,'error');}
}

async function verifyStudentAttendance(e){
  e.preventDefault();
  const form=e.currentTarget,d=Object.fromEntries(new FormData(form).entries()),box=$('#studentAttMsg');
  try{
    const pub=await getDoc(doc(db,'settings','attendance_public'));
    if(!pub.exists()||Date.now()>pub.data().expiresAt){box.innerHTML=msg('لا توجد جلسة حضور مفتوحة حالياً','error');return;}
    const a=pub.data(),s=cache.students[0];
    if(cache.attendance.some(x=>x.sessionId===a.sessionId&&x.studentUid===user.uid)){box.innerHTML=msg('سجلت حضورك مسبقًا','error');return;}
    await setDoc(doc(db,'attendance',a.sessionId+'_'+user.uid),{studentUid:user.uid,studentName:s.name,studentId:s.studentId,sessionName:a.sessionName,sessionId:a.sessionId,pin:String(d.pinCode).trim(),createdAt:serverTimestamp()});
    showToast('تم تسجيل الحضور'); form.reset(); await loadData(); renderApp();
  }catch(err){box.innerHTML=msg(err.code==='permission-denied'?'كود الحضور غير صحيح أو انتهت الجلسة':err.message,'error');}
}

async function saveResult(e){
  e.preventDefault();
  const form=e.currentTarget, d=Object.fromEntries(new FormData(form).entries());
  const s=cache.students.find(x=>x.uid===d.studentUid), sc=Number(d.score), cr=Number(d.credits);
  if(!s||!(sc>=0&&sc<=100)||!(cr>=1&&cr<=6)){ showToast('بيانات غير صحيحة','error'); return; }
  try{
    await addDoc(collection(db,'results'),{studentUid:s.uid,studentId:s.studentId,studentName:s.name,course:d.course.trim(),year:d.year.trim(),semester:d.semester,credits:cr,score:sc,createdAt:serverTimestamp()});
    logAction('رصد نتيجة',s.name+' - '+d.course); showToast('تم حفظ النتيجة'); await loadData(); renderApp();
  }catch(err){ showToast(authError(err),'error'); }
}

async function saveExam(e){
  e.preventDefault();
  const form = e.currentTarget;
  const d = Object.fromEntries(new FormData(form).entries());
  await addDoc(collection(db,'exams'), { ...d, createdAt:serverTimestamp() });
  logAction('إضافة امتحان', d.course);
  showToast('تم إضافة الامتحان');
  form.reset(); await loadData(); renderApp();
}

async function saveNews(e){
  e.preventDefault();
  const form = e.currentTarget;
  const d = Object.fromEntries(new FormData(form).entries());
  await addDoc(collection(db,'news'), { ...d, date:dateNow(), createdAt:serverTimestamp() });
  logAction('نشر خبر', d.title);
  showToast('تم النشر');
  form.reset(); await loadData(); renderApp();
}

