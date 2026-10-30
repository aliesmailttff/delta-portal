window.printReceipt = function(id){
  const p = cache.payments.find(x=>x.id===id);
  if(!p) return;
  const el = $('#printable-receipt');
  el.innerHTML = `<div style="border:2px solid #174ea6;padding:24px;border-radius:12px;max-width:600px;margin:auto;color:#000;background:#fff">
    <div style="text-align:center;margin-bottom:10px;font-size:2rem;">🎓</div>
    <h2 style="text-align:center;margin:0;">معهد الدلتا العالي للحاسبات</h2>
    <p style="text-align:center;color:#555;margin:4px 0 16px;">إيصال سداد مصروفات دراسية</p>
    <table style="width:100%;border-collapse:collapse;color:#000;">
      <tr><th style="text-align:right;background:#eaf2ff;padding:8px;">رقم الإيصال</th><td style="padding:8px;">${esc(p.receiptNo)}</td></tr>
      <tr><th style="text-align:right;background:#eaf2ff;padding:8px;">التاريخ</th><td style="padding:8px;">${esc(p.date)}</td></tr>
      <tr><th style="text-align:right;background:#eaf2ff;padding:8px;">الطالب</th><td style="padding:8px;">${esc(p.studentName)} (${esc(p.studentId)})</td></tr>
      <tr><th style="text-align:right;background:#eaf2ff;padding:8px;">المبلغ</th><td style="padding:8px;">${money(p.amount)}</td></tr>
      <tr><th style="text-align:right;background:#eaf2ff;padding:8px;">الوسيلة</th><td style="padding:8px;">${esc(p.method)}</td></tr>
    </table>
    <div class="receipt-stamp">تم السداد</div>
  </div>`;
  window.print();
};

window.printFullFinancialStatement = function(){
  const s = cache.students[0] || {};
  const totalFees = Number(s.totalFees||0);
  const approved = cache.payments.filter(p=>p.status==='مقبول');
  const paid = approved.reduce((a,p)=>a+Number(p.amount||0),0);
  const el = $('#printable-receipt');
  el.innerHTML = `<div style="border:2px solid #174ea6;padding:24px;border-radius:12px;max-width:700px;margin:auto;color:#000;background:#fff">
    <div style="text-align:center;margin-bottom:10px;font-size:2rem;">🎓</div>
    <h2 style="text-align:center;margin:0;">معهد الدلتا العالي للحاسبات</h2>
    <p style="text-align:center;color:#555;margin:4px 0 16px;">كشف حساب مالي معتمد</p>
    <p><strong>الطالب:</strong> ${esc(s.name||'')} — <strong>الرقم:</strong> ${esc(s.studentId||'')}</p>
    <p><strong>الفرقة:</strong> ${esc(s.level||'')} — <strong>القسم:</strong> ${esc(s.department||'')}</p>
    <table style="width:100%;border-collapse:collapse;color:#000;margin-top:12px;">
      <thead><tr>
        <th style="background:#eaf2ff;padding:8px;text-align:right;">رقم الإيصال</th>
        <th style="background:#eaf2ff;padding:8px;text-align:right;">التاريخ</th>
        <th style="background:#eaf2ff;padding:8px;text-align:right;">الوسيلة</th>
        <th style="background:#eaf2ff;padding:8px;text-align:right;">المبلغ</th>
      </tr></thead>
      <tbody>
        ${approved.map(p=>`<tr>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${esc(p.receiptNo)}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${esc(p.date)}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${esc(p.method)}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;">${money(p.amount)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="margin-top:16px;padding:12px;background:#eaf2ff;border-radius:8px;">
      <p style="margin:4px 0;"><strong>الإجمالي:</strong> ${money(totalFees)}</p>
      <p style="margin:4px 0;"><strong>المدفوع:</strong> ${money(paid)}</p>
      <p style="margin:4px 0;"><strong>المتبقي:</strong> ${money(Math.max(0, totalFees-paid))}</p>
    </div>
    <div class="receipt-stamp">تم الاعتماد</div>
  </div>`;
  window.print();
};

async function deleteItem(coll, id){
  if(!confirm('تأكيد الحذف؟')) return;
  await deleteDoc(doc(db, coll, id));
  logAction('حذف', coll+':'+id);
  showToast('تم الحذف');
  await loadData(); renderApp();
}

async function deleteStudent(uid){
  if(!confirm('حذف الطالب؟')) return;
  await deleteDoc(doc(db,'students',uid));
  await deleteDoc(doc(db,'users',uid));
  logAction('حذف طالب', uid);
  showToast('تم الحذف');
  await loadData(); renderApp();
}

window.openEdit = (coll, id, fields) => {
  const item = coll==='students'
    ? cache.students.find(x=>x.uid===id)
    : cache[coll].find(x=>x.id===id);
  if(!item) return;
  editCtx = { coll, id, fields };
  $('#genericEditFields').innerHTML = fields.map(([k,l,t]) =>
    `<label>${l}</label><input name="${k}" type="${t||'text'}" value="${esc(item[k]??'')}" required style="margin-bottom:8px">`
  ).join('');
  $('#genericEditMsg').innerHTML = '';
  $('#genericEditModal').classList.add('active');
};

window.closeGenericEdit = () => $('#genericEditModal').classList.remove('active');

window.openEditStudentModal = id => openEdit('students', id, [
  ['name','الاسم'],['studentId','الرقم'],['level','الفرقة'],['totalFees','المصروفات','number']
]);
window.editResultModal = id => openEdit('results', id, [
  ['course','المادة'],['credits','الساعات','number'],['score','الدرجة','number']
]);
window.editExamModal = id => openEdit('exams', id, [
  ['course','المادة'],['date','التاريخ','date'],['time','الوقت','time'],['hall','القاعة']
]);
window.editNewsModal = id => openEdit('news', id, [
  ['title','العنوان'],['body','التفاصيل']
]);

window.simCoursesList = JSON.parse(localStorage.getItem('simCourses') || '[]');
function saveSim(){ localStorage.setItem('simCourses', JSON.stringify(window.simCoursesList)); }

window.addSimCourse = function(){
  const name = $('#simCourseName').value.trim();
  const score = Number($('#simCourseScore').value);
  const hours = Number($('#simCourseHours').value);
  
  if(!name || isNaN(score) || score < 0 || score > 100){
    showToast('أدخل اسم المادة ودرجة صحيحة بين 0 و 100', 'error'); return;
  }
  
  window.simCoursesList.push({ name, score, hours });
  saveSim();
  $('#simCourseName').value = ''; 
  $('#simCourseScore').value = '';
  renderSimTable();
};

window.removeSimCourse = function(idx){
  window.simCoursesList.splice(idx, 1); 
  saveSim(); 
  renderSimTable();
};

window.clearSimCourses = function(){
  if(!confirm('هل تريد مسح جميع المواد المتوقعة؟')) return;
  window.simCoursesList = []; 
  saveSim(); 
  renderSimTable();
};

function renderSimTable(){
  const wrap = $('#simTableWrap'); if(!wrap) return;
  if(window.simCoursesList.length === 0) {
    wrap.innerHTML = `<div class="notice" style="text-align:center;">لم تقم بإضافة أي مواد متوقعة بعد.</div>`;
  } else {
    wrap.innerHTML = table(['المادة','الدرجة','الساعات','التقدير','النقاط','إجراء'],
      window.simCoursesList.map((c,idx)=>`<tr>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${c.score}</td>
        <td>${c.hours} ساعة</td>
        <td>${grade(c.score)}</td>
        <td><b style="color:var(--blue);">${(pts(c.score) * c.hours).toFixed(1)}</b></td>
        <td><button class="danger" style="padding:4px 8px;font-size:.75rem;" onclick="removeSimCourse(${idx})"><i class="fas fa-trash"></i></button></td>
      </tr>`).join('')
    );
  }
  updateSimGPA();
}

function updateSimGPA(){
  const el = $('#simResultGPA'); 
  const hoursEl = $('#simHoursText');
  const barEl = $('#gpaProgressBar');
  const statusEl = $('#gpaStatusText');
  if(!el) return;

  let currentPoints = 0;
  let currentHours = 0;
  (cache.results || []).forEach(r => {
    const hrs = Number(r.creditHours || 3);
    currentPoints += pts(Number(r.score)) * hrs;
    currentHours += hrs;
  });

  let simPoints = 0;
  let simHours = 0;
  window.simCoursesList.forEach(c => {
    simPoints += pts(c.score) * c.hours;
    simHours += c.hours;
  });

  const totalPoints = currentPoints + simPoints;
  const totalHours = currentHours + simHours;
  const newGPA = totalHours > 0 ? (totalPoints / totalHours) : 0;
  
  el.innerText = newGPA.toFixed(2) + ' / 4.0';
  if(hoursEl) hoursEl.innerText = `+${simHours} ساعة جديدة`;

  if(barEl) {
    const percent = (newGPA / 4.0) * 100;
    barEl.style.width = percent + '%';
  }

  if(statusEl) {
    if(newGPA >= 3.7) { statusEl.innerText = '🌟 امتياز (Excellent)'; statusEl.style.color = 'var(--green);'; }
    else if(newGPA >= 3.0) { statusEl.innerText = '✅ جيد جداً (Very Good)'; statusEl.style.color = 'var(--blue);'; }
    else if(newGPA >= 2.0) { statusEl.innerText = '📘 جيد (Good)'; statusEl.style.color = 'var(--blue2);'; }
    else if(newGPA >= 1.0) { statusEl.innerText = '⚠️ مقبول (Pass)'; statusEl.style.color = '#f39c12'; }
    else { statusEl.innerText = '❌ راسب (Fail)'; statusEl.style.color = 'var(--red);'; }
  }
}

window.calculateMonthlyInstallment = function(remainingAmount) {
  const months = Number(document.getElementById('calcMonths').value) || 1;
  const monthly = Math.ceil(remainingAmount / months);
  const valElement = document.getElementById('monthlyInstallmentVal');
  if(valElement) {
    valElement.innerText = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(monthly);
  }
};

window.setPaymentFilter = function(s){ paymentFilterStatus = s; renderApp(); };
window.changeChatStudent = function(uid){ selectedChatStudentUid = uid; renderApp(); };

function startChatListener(){
  if(unsubChat) unsubChat();
  const area = $('#chatMessagesArea'); if(!area) return;
  const isStaff = ['admin','finance','academic'].includes(role);
  const targetUid = isStaff ? selectedChatStudentUid : user.uid;
  if(!targetUid){ area.innerHTML='<p class="muted" style="text-align:center;margin:auto;">ابحث عن الطالب واختره لعرض المحادثة.</p>'; return; }

  const q = query(collection(db,'chats',targetUid,'messages'), orderBy('createdAt','asc'));
  unsubChat = onSnapshot(q, snap => {
    area.innerHTML = snap.docs.map(d => {
      const m = d.data();
      const isMe = m.senderUid === user.uid;
      return `<div class="chat-bubble ${isMe?'outgoing':'incoming'}">
        <div style="font-size:.8rem;font-weight:bold;opacity:.8;">${esc(m.senderName)}</div>
        <div>${esc(m.body)}</div>
      </div>`;
    }).join('') || '<p class="muted" style="text-align:center;margin:auto;">لا توجد رسائل.</p>';
    area.scrollTop = area.scrollHeight;
  }, err => console.error(err));
}

async function sendChat(e){
  e.preventDefault();
  const form = e.currentTarget;
  const d = Object.fromEntries(new FormData(form).entries());
  const isStaff = ['admin','finance','academic'].includes(role);
  const targetUid = isStaff ? selectedChatStudentUid : user.uid;
  if(!targetUid || !d.body.trim()) return;
  try {
    await addDoc(collection(db,'chats',targetUid,'messages'), {
      senderUid: user.uid,
      senderName: profile.name || user.email,
      body: d.body.trim(),
      createdAt: serverTimestamp()
    });
    form.reset();
  } catch(err){ showToast(err.message, 'error'); }
}


