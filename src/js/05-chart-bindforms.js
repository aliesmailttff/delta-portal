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

  // تم إصلاح وربط معالج التعديل العام هنا بنجاح:
  $('#genericEditForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if(!editCtx) return;
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    editCtx.fields.forEach(([k,,t]) => { if(t==='number') d[k] = Number(d[k]); });
    try {
      await updateDoc(doc(db, editCtx.coll, editCtx.id), d);
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

