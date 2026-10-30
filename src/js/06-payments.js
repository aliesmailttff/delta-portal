function compressImage(file){return new Promise((res,rej)=>{const r=new FileReader();r.onerror=rej;r.onload=()=>{const i=new Image();i.onerror=rej;i.onload=()=>{const k=Math.min(1,900/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.7))};i.src=r.result};r.readAsDataURL(file)})}
async function triggerPaymentOtp(e){
  e.preventDefault();
  const form=e.currentTarget,btn=e.submitter,d=Object.fromEntries(new FormData(form).entries());
  const amt=Number(d.payAmount),s=cache.students[0];
  const sum=st=>cache.payments.filter(p=>p.status===st).reduce((a,p)=>a+Number(p.amount||0),0);
  const max=Math.max(0,Number(s?.totalFees||0)-sum('مقبول')-sum('قيد المراجعة'));
  const file=$('#receiptImgFile')?.files[0];
  if(!s||!(amt>0)||amt>max){showToast('المبلغ غير صالح أو يتجاوز المتبقي (شامل الإيصالات المعلقة)','error');return;}
  if(!String(d.trxId||'').trim()&&!file){showToast('أدخل الرقم المرجعي أو أرفق صورة الإيصال','error');return;}
  if(!confirm('إرسال إيصال سداد بمبلغ '+money(amt)+' للمراجعة؟'))return;
  if(btn)btn.disabled=true;
  try{
    const img=file?await compressImage(file):'';
    await addDoc(collection(db,'payments'),{studentUid:user.uid,studentId:s.studentId,studentName:s.name,amount:amt,method:d.method,trxId:String(d.trxId||'').trim(),screenshot:img,status:'قيد المراجعة',receiptNo:'REC-'+Date.now().toString().slice(-8),date:dateNow(),createdAt:serverTimestamp()});
    logAction('طلب دفع',s.name+' - '+money(amt)); showToast('تم إرسال الإيصال، بانتظار المراجعة'); await loadData(); renderApp();
  }catch(err){showToast(err.message,'error'); if(btn)btn.disabled=false;}
}
window.rejectPayment=async id=>{
  const p=cache.payments.find(x=>x.id===id); if(!p||p.status!=='قيد المراجعة') return;
  const why=prompt('سبب الرفض؟'); if(!why) return;
  try{ await updateDoc(doc(db,'payments',id),{status:'مرفوض',rejectReason:why.trim(),approvedBy:user.email,approvedAt:serverTimestamp()});
    logAction('رفض إيصال',p.receiptNo+' - '+why); showToast('تم الرفض'); await loadData(); renderApp();
  }catch(err){showToast(err.message,'error');}
};

window.approvePayment = async function(paymentId, studentUid, amount){
  if(!confirm('اعتماد هذا الإيصال؟')) return;
  try {
    await runTransaction(db, async (tx) => {
      const pRef = doc(db,'payments',paymentId);
      const pSnap = await tx.get(pRef);
      if(!pSnap.exists()) throw new Error('الإيصال غير موجود');
      if(pSnap.data().status !== 'قيد المراجعة') throw new Error('الإيصال ليس قيد المراجعة (معتمد أو مرفوض مسبقاً)');

      const sRef = doc(db,'students',pSnap.data().studentUid);
      const sSnap = await tx.get(sRef);
      if(!sSnap.exists()) throw new Error('الطالب غير موجود');

      tx.update(pRef, { status:'مقبول', approvedBy:user.email, approvedAt:serverTimestamp() });
      tx.update(sRef, { paidAmount: Number(sSnap.data().paidAmount||0) + Number(pSnap.data().amount) });
    });
    logAction('اعتماد سداد', money(amount));
    showToast('تم الاعتماد');
    await loadData(); renderApp();
  } catch(err){ showToast(err.message, 'error'); }
};

window.viewScreenshot = function(id){
  const p = cache.payments.find(x=>x.id===id);
  if(!p || !p.screenshot) return;
  $('#screenshotContainer').innerHTML = `<img src="${esc(p.screenshot)}" style="width:100%;border-radius:8px;">`;
  $('#screenshotModal').classList.add('active');
};

window.viewPdfFile = async function(id){
  const l = cache.library.find(x=>x.id===id);
  if(!l || !l.fileData){ showToast('الملف غير متاح', 'error'); return; }
  try {
    const blob = await (await fetch(l.fileData)).blob();
    window.open(URL.createObjectURL(blob), '_blank');
  } catch { showToast('تعذر عرض الملف', 'error'); }
};

async function saveLibraryPdfFile(e){
  e.preventDefault();
  const form = e.currentTarget;
  const d = Object.fromEntries(new FormData(form).entries());
  const fileInput = $('#pdfFileInput');
  if(!fileInput.files[0]){ showToast('اختر ملف PDF', 'error'); return; }
  const file = fileInput.files[0];
  if(file.size > 700000){ showToast('حجم PDF كبير (أقل من 700KB)', 'error'); return; }

  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      await addDoc(collection(db,'library'), {
        course: d.course.trim(), title: d.title.trim(), level: d.level,
        fileData: ev.target.result, createdAt: serverTimestamp()
      });
      logAction('رفع PDF', d.title);
      showToast('تم الرفع');
      form.reset(); await loadData(); renderApp();
    } catch(err){ showToast('فشل: '+err.message, 'error'); }
  };
  reader.readAsDataURL(file);
}

