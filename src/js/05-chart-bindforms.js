function renderChart(){
  const ctx = document.getElementById('paymentMethodsChart');
  if(!ctx) return;
  if(typeof Chart === 'undefined'){
    ctx.parentElement.innerHTML = '<p class="muted" style="text-align:center;">تعذر تحميل الرسوم</p>';
    return;
  }
  if(activeChart) activeChart.destroy();
  const counts = { InstaPay:0, VodafoneCash:0, Fawry:0, Visa:0 };
  cache.payments.forEach(p => {
    const m = (p.method||'').trim();
    if(counts[m] !== undefined) counts[m] += Number(p.amount||0);
  });
  activeChart = new Chart(ctx, {
    type:'doughnut',
    data: {
      labels:['إنستاباي','فودافون كاش','فوري','فيزا'],
      datasets:[{ data:[counts.InstaPay, counts.VodafoneCash, counts.Fawry, counts.Visa],
        backgroundColor:['#174ea6','#c0392b','#16845b','#2563eb'] }]
    },
    options:{ responsive:true, plugins:{ legend:{ position:'bottom' } } }
  });
}

function bindForms(){
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{
    activeTab = b.dataset.go;
    localStorage.setItem('activeTab', activeTab);
    renderApp();
  });

  const paySelect = $('#payMethodSelect');
  if(paySelect){
    paySelect.onchange = () => {
      document.querySelectorAll('.pay-method-box').forEach(el=>el.classList.remove('active'));
      const t = $('#method-'+paySelect.value);
      if(t) t.classList.add('active');
    };
  }

  $('#accountsForm')?.addEventListener('submit', saveAccountsData);
  $('#siteMaintenanceForm')?.addEventListener('submit', saveSiteMaintenance);
  $('#studentForm')?.addEventListener('submit', createStudent);
  $('#staffForm')?.addEventListener('submit', createStaff);
  $('#libForm')?.addEventListener('submit', saveLibraryPdfFile);
  $('#attForm')?.addEventListener('submit', saveAttendanceSession);
  if(['admin','finance','academic'].includes(role)) $('#ownPasswordForm')?.addEventListener('submit', changeOwnPassword);
  $('#attendanceThresholdForm')?.addEventListener('submit', saveAttendanceThreshold);
  $('#attendanceExportBtn')?.addEventListener('click', exportAttendanceReport);
  $('#studentAttForm')?.addEventListener('submit', verifyStudentAttendance);
  $('#resultForm')?.addEventListener('submit', saveResult);
  $('#examForm')?.addEventListener('submit', saveExam);
  $('#scheduleForm')?.addEventListener('submit', addSchedule);
  $('#requestForm')?.addEventListener('submit', sendRequest);
  $('#courseForm')?.addEventListener('submit', addCourse);
  $('#regSettingsForm')?.addEventListener('submit', saveRegSettings);
  $('#newsForm')?.addEventListener('submit', saveNews);
  $('#studentPaymentForm')?.addEventListener('submit', triggerPaymentOtp);
  $('#chatForm')?.addEventListener('submit', sendChat);
  $('#chatAssignmentForm')?.addEventListener('submit', saveChatAssignment);

  // تم إصلاح وربط معالج التعديل العام هنا بنجاح:
  $('#genericEditForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if(!editCtx) return;
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    editCtx.fields.forEach(([k,,t]) => { if(t==='number') d[k] = Number(d[k]); });
    try {
      if(editCtx.coll==='payments'){
        if(!hasModuleAccess('payments_edit'))throw new Error('ليس لديك صلاحية تعديل المدفوعات.');
        if(!(Number(d.amount)>0))throw new Error('يجب أن يكون مبلغ العملية أكبر من صفر.');
        await runTransaction(db,async tx=>{
          const paymentRef=doc(db,'payments',editCtx.id),paymentSnap=await tx.get(paymentRef);
          if(!paymentSnap.exists())throw new Error('عملية الدفع غير موجودة.');
          const oldPayment=paymentSnap.data(),nextAmount=Number(d.amount);
          if(oldPayment.status==='مقبول'){
            const studentRef=doc(db,'students',oldPayment.studentUid),studentSnap=await tx.get(studentRef);
            if(!studentSnap.exists())throw new Error('ملف الطالب غير موجود.');
            const paid=Number(studentSnap.data().paidAmount||0)+nextAmount-Number(oldPayment.amount||0);
            if(paid<0)throw new Error('التعديل سيجعل رصيد المدفوعات سالبًا.');
            tx.update(studentRef,{paidAmount:paid});
          }
          tx.update(paymentRef,d);
        });
      }else await updateDoc(doc(db, editCtx.coll, editCtx.id), d);
      logAction('تعديل بيانات',`${editCtx.coll}:${editCtx.id}`);
      closeGenericEdit();
      showToast('تم التعديل بنجاح');
      await loadData(); renderApp();
    } catch(err){ showToast(err.message, 'error'); }
  });
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-delete],[data-delete-student]');
  if(!b) return;
  if(b.dataset.deleteStudent) deleteStudent(b.dataset.deleteStudent);
  else deleteItem(b.dataset.delete, b.dataset.id);
});

window.setPayAmount = function(val) {
  const input = document.getElementById('payAmountInput');
  if(input) {
    input.value = Math.floor(val);
    input.focus();
  }
};

