function renderView(){
  const v = $('#view'); if(!v) return;
  const isStaff = ['admin','finance','academic'].includes(role);
  let html = '';

  if(activeTab==='dashboard' && isStaff){
    const totalPaid = cache.payments.filter(p=>p.status==='مقبول').reduce((a,p)=>a+Number(p.amount||0),0);
    const pending = cache.payments.filter(p=>p.status==='قيد المراجعة').length;
    const shortcuts = role==='finance'
      ? [['payments','مراجعة المدفوعات','fa-wallet'],['accounts','حسابات الدفع','fa-university'],['chat','رسائل الطلاب','fa-comments']]
      : [['students','إدارة الطلاب','fa-users'],['results','النتائج','fa-chart-bar'],['requests','طلبات الطلاب','fa-inbox']];
    let banner = '';
    if(pending>0 && (role==='admin'||role==='finance')){
      banner = `<div class="dashboard-alert"><span class="alert-icon"><i class="fas fa-bell"></i></span><div><strong>تحتاج إلى مراجعة</strong><p>${pending} إيصال دفع بانتظار الاعتماد.</p></div><button data-go="payments">فتح المدفوعات <i class="fas fa-arrow-left"></i></button></div>`;
    }
    html = `${banner}
      <div class="dashboard-stats">
        <article class="dashboard-stat"><div class="dashboard-stat-icon blue"><i class="fas fa-user-graduate"></i></div><div><span>إجمالي الطلاب</span><strong>${cache.students.length}</strong><small>ملفات الطلاب المسجلة</small></div></article>
        <article class="dashboard-stat"><div class="dashboard-stat-icon violet"><i class="fas fa-chart-line"></i></div><div><span>النتائج المسجلة</span><strong>${cache.results.length}</strong><small>سجلات النتائج الأكاديمية</small></div></article>
        <article class="dashboard-stat"><div class="dashboard-stat-icon amber"><i class="fas fa-receipt"></i></div><div><span>إيصالات قيد المراجعة</span><strong>${pending}</strong><small>تتطلب متابعة</small></div></article>
        <article class="dashboard-stat"><div class="dashboard-stat-icon green"><i class="fas fa-coins"></i></div><div><span>إجمالي التحصيلات</span><strong>${money(totalPaid)}</strong><small>المدفوعات المعتمدة</small></div></article>
      </div>
      <div class="dashboard-content-grid">
        <section class="card dashboard-chart-card"><div class="section-heading"><div><span class="section-kicker">ملخص مالي</span><h3>توزيع المدفوعات</h3></div><span class="section-icon"><i class="fas fa-chart-pie"></i></span></div><div class="dashboard-chart-wrap"><canvas id="paymentMethodsChart"></canvas></div></section>
        <section class="card dashboard-shortcuts"><div class="section-heading"><div><span class="section-kicker">وصول سريع</span><h3>اختصارات العمل</h3></div></div><div class="shortcut-list">${shortcuts.map(([id,label,icon])=>`<button type="button" class="shortcut-link" data-go="${id}"><span class="shortcut-icon"><i class="fas ${icon}"></i></span><span>${label}</span><i class="fas fa-chevron-left shortcut-arrow"></i></button>`).join('')}</div></section>
      </div>`;
  }
  else if(activeTab==='library' && isStaff){
    html = `<section class="card">
      <h2><i class="fas fa-file-pdf" style="color:var(--red);"></i> رفع ملف PDF جديد</h2>
      <form id="libForm" class="fields">
        <div><label>المادة</label><input name="course" required></div>
        <div><label>العنوان</label><input name="title" required></div>
        <div><label>ملف PDF</label><input type="file" id="pdfFileInput" accept="application/pdf" required style="padding:7px;"></div>
        <div><label>الفرقة</label>
          <select name="level">
            <option>كل الفرق</option><option>الفرقة الأولى</option>
            <option>الفرقة الثانية</option><option>الفرقة الثالثة</option><option>الفرقة الرابعة</option>
          </select>
        </div>
        <button style="grid-column:1/-1;margin-top:10px;background:var(--green);">رفع الملف</button>
      </form>
      <div id="libMsg" style="margin-top:10px;"></div>
    </section>
    <section class="card">
      <h3>ملفات المكتبة</h3>
      ${table(['المادة','العنوان','الفرقة','الإجراء'], cache.library.map(l=>`<tr>
        <td>${esc(l.course)}</td><td><strong>${esc(l.title)}</strong></td>
        <td><span class="pill">${esc(l.level)}</span></td>
        <td><div class="actions">
          <button class="secondary" onclick="viewPdfFile('${l.id}')"><i class="fas fa-eye"></i> عرض</button>
          <button class="danger" data-delete="library" data-id="${l.id}"><i class="fas fa-trash"></i></button>
        </div></td>
      </tr>`).join(''))}
    </section>`;
  }
  else if(activeTab==='attendance' && isStaff){
    html = `<section class="card">
      <h2><i class="fas fa-qrcode" style="color:var(--blue);"></i> فتح جلسة حضور</h2>
      <form id="attForm" class="fields">
        <div><label>اسم المحاضرة</label><input name="sessionName" required></div>
        <div><label>كود الجلسة (PIN)</label><input name="code" value="${Math.floor(1000+Math.random()*9000)}" required></div>
        <div><label>مدة الجلسة (دقيقة)</label><input name="minutes" type="number" min="1" max="180" value="15" required></div>
        <button style="grid-column:1/-1;margin-top:10px;background:var(--green);">فتح جلسة</button>
      </form>
      <div id="attMsg" style="margin-top:10px;"></div>
    </section>
    <section class="card">
      <h3>سجل الحضور</h3>
      ${table(['الطالب','الرقم','المحاضرة','الوقت'], cache.attendance.map(a=>`<tr>
        <td>${esc(a.studentName)}</td><td><code>${esc(a.studentId)}</code></td>
        <td>${esc(a.sessionName)}</td>
        <td><small class="muted">${a.createdAt?.toDate ? a.createdAt.toDate().toLocaleTimeString('ar-EG') : '—'}</small></td>
      </tr>`).join(''))}
    </section>`;
  }
  else if(activeTab==='staff' && role==='admin'){
    html = `<section class="card">
      <h2><i class="fas fa-user-shield" style="color:var(--blue);"></i> إضافة مساعد</h2>
      <form id="staffForm" class="fields">
        <div><label>الاسم</label><input name="name" required></div>
        <div><label>البريد</label><input name="email" type="email" required></div>
        <div><label>كلمة المرور</label><input name="password" type="password" minlength="6" required></div>
        <div><label>الصلاحية</label>
          <select name="role" required>
            <option value="finance">مساعد مالي</option>
            <option value="academic">مساعد أكاديمي</option>
          </select>
        </div>
        <button type="submit" style="grid-column:1/-1;margin-top:10px;">إنشاء الحساب</button>
      </form>
      <div id="staffMsg" style="margin-top:10px;"></div>
    </section>
    <section class="card">
      <h3>المساعدون</h3>
      ${table(['الاسم','البريد','الصلاحية'], cache.staff.map(st=>`<tr>
        <td><strong>${esc(st.name)}</strong></td><td>${esc(st.email)}</td>
        <td><span class="pill">${st.role==='admin'?'Super Admin':st.role==='finance'?'مالي':'أكاديمي'}</span></td>
      </tr>`).join(''))}
    </section>`;
  }
  else if(activeTab==='accounts' && (role==='admin'||role==='finance')){
    const s = cache.settings || {};
    html = `<section class="card">
      <h2>إعدادات الحسابات</h2>
      <form id="accountsForm" class="fields">
        <div><label>فودافون كاش</label><input name="vodafone" value="${esc(s.vodafone||'')}" required></div>
        <div><label>إنستاباي</label><input name="instapay" value="${esc(s.instapay||'')}" required></div>
        <div><label>كود فوري</label><input name="fawryCode" value="${esc(s.fawryCode||'')}" required></div>
        <div><label>الحساب البنكي</label><input name="bankAccount" value="${esc(s.bankAccount||'')}" required></div>
        <div style="grid-column:1/-1;background:#fff3cd;padding:15px;border-radius:10px;border:1px solid #ffeeba;margin-top:10px;">
          <label style="color:#856404;font-size:1rem;">
            <input type="checkbox" name="maintenanceMode" ${s.maintenanceMode?'checked':''}>
            <i class="fas fa-tools"></i> وضع الصيانة (إغلاق بوابة الدفع)
          </label>
        </div>
        <button type="submit" style="grid-column:1/-1;margin-top:10px;background:var(--green);">حفظ</button>
      </form>
      <div id="accountsMsg" style="margin-top:10px;"></div>
    </section>`;
  }
  else if(activeTab==='logs' && (role==='admin'||role==='finance')){
    html = `<section class="card">
      <h2><i class="fas fa-history" style="color:var(--blue);"></i> سجل النشاطات</h2>
      ${table(['الوقت','المسؤول','الإجراء','التفاصيل'], cache.logs.map(l=>`<tr>
        <td><small class="muted">${l.createdAt?.toDate ? l.createdAt.toDate().toLocaleString('ar-EG') : '—'}</small></td>
        <td><strong>${esc(l.adminEmail||'—')}</strong></td>
        <td><span class="pill">${esc(l.action)}</span></td>
        <td>${esc(l.details)}</td>
      </tr>`).join(''))}
    </section>`;
  }
  else if(activeTab==='students' && (role==='admin'||role==='academic')){
    html = `<section class="card">
      <h2>إضافة طالب</h2>
      <form id="studentForm" class="fields">
        <div><label>الاسم</label><input name="name" required></div>
        <div><label>الرقم الجامعي</label><input name="studentId" required></div>
        <div><label>البريد</label><input name="email" type="email" required></div>
        <div><label>كلمة المرور</label><input name="password" type="password" minlength="6" required></div>
        <div><label>الفرقة</label>
          <select name="level">
            <option>الفرقة الأولى</option><option>الفرقة الثانية</option>
            <option>الفرقة الثالثة</option><option>الفرقة الرابعة</option>
          </select>
        </div>
        <div><label>القسم</label><input name="department" value="نظم المعلومات"></div>
        <div><label>المصروفات</label><input name="totalFees" type="number" min="0" value="18000" required></div>
        <div><label>صورة الطالب (للكارنيه)</label><input type="file" id="studentPhotoInput" accept="image/*" style="padding:7px;"></div>
        <button type="submit" style="grid-column:1/-1;margin-top:10px;">إنشاء الحساب</button>
      </form>
      <div id="studentMsg" style="margin-top:10px;"></div>
    </section>
    <section class="card">
      <div class="headrow" style="margin-bottom:15px;">
        <h3>الطلاب</h3>
        <div class="actions">
          <button style="background:var(--green);" onclick="exportStudentsToCSV()">
            <i class="fas fa-file-excel"></i> تصدير CSV
          </button>
        </div>
      </div>
      <div style="background:var(--pale);padding:12px;border-radius:10px;margin-bottom:15px;">
        <label style="font-weight:bold;color:var(--blue);"><i class="fas fa-file-upload"></i> استيراد من Excel:</label>
        <input type="file" accept=".xlsx,.xls" onchange="importStudentsFromExcel(event)" style="margin-top:5px;background:#fff;padding:6px;">
      </div>
      <div class="fields" style="margin-bottom:15px;">
        <div><label>بحث:</label><input type="text" id="studentSearchInput" onkeyup="filterStudentsTable()"></div>
        <div><label>الفرقة:</label>
          <select id="levelFilterSelect" onchange="filterStudentsTable()">
            <option value="">كل الفرق</option>
            <option>الفرقة الأولى</option><option>الفرقة الثانية</option>
            <option>الفرقة الثالثة</option><option>الفرقة الرابعة</option>
          </select>
        </div>
      </div>
      <div id="studentsTableWrap">${renderStudentsRows(cache.students)}</div>
    </section>`;
  }
  else if(activeTab==='results' && (role==='admin'||role==='academic')){
    html = `<section class="card">
      <h2>رصد النتائج</h2>
      <form id="resultForm" class="fields">
        <div><label>الطالب</label>
          <select name="studentUid" required>${cache.students.map(s=>`<option value="${s.uid}">${esc(s.studentId)} — ${esc(s.name)}</option>`).join('')}</select>
        </div>
        <div><label>المادة</label><input name="course" required></div>
        <div><label>الدرجة</label><input name="score" type="number" min="0" max="100" required></div>
        <button ${cache.students.length?'':'disabled'} style="margin-top:10px;">حفظ</button>
      </form>
      <div id="resultMsg" style="margin-top:10px;"></div>
    </section>
    <section class="card">
      <h3>النتائج المسجلة</h3>
      ${table(['الطالب','المادة','الدرجة','التقدير','إجراء'], cache.results.map(r=>{
        const s = cache.students.find(x=>x.uid===r.studentUid);
        return `<tr>
          <td>${esc(s?.name||r.studentName||'—')}</td>
          <td>${esc(r.course)}</td><td>${Number(r.score)}</td><td>${grade(Number(r.score))}</td>
          <td><div class="actions">
            <button class="secondary" onclick="editResultModal('${r.id}')"><i class="fas fa-edit"></i></button>
            <button class="danger" data-delete="results" data-id="${r.id}"><i class="fas fa-trash"></i></button>
          </div></td>
        </tr>`;
      }).join(''))}
    </section>`;
  }
  else if(activeTab==='exams' && (role==='admin'||role==='academic')){
    html = `<section class="card">
      <h2>إضافة امتحان</h2>
      <form id="examForm" class="fields">
        <div><label>الفرقة</label>
          <select name="level">
            <option>الفرقة الأولى</option><option>الفرقة الثانية</option>
            <option>الفرقة الثالثة</option><option>الفرقة الرابعة</option>
          </select>
        </div>
        <div><label>المادة</label><input name="course" required></div>
        <div><label>التاريخ</label><input name="date" type="date" required></div>
        <div><label>الساعة</label><input name="time" type="time" required></div>
        <div><label>القاعة</label><input name="hall" required></div>
        <button style="margin-top:10px;">إضافة</button>
      </form>
      <div id="examMsg" style="margin-top:10px;"></div>
    </section>
    <section class="card">
      <h3>الامتحانات</h3>
      ${table(['الفرقة','المادة','التاريخ','الوقت','القاعة','إجراء'], cache.exams.map(e=>`<tr>
        <td>${esc(e.level)}</td><td>${esc(e.course)}</td><td>${esc(e.date)}</td>
        <td>${esc(e.time)}</td><td>${esc(e.hall)}</td>
        <td><div class="actions">
          <button class="secondary" onclick="editExamModal('${e.id}')"><i class="fas fa-edit"></i></button>
          <button class="danger" data-delete="exams" data-id="${e.id}"><i class="fas fa-trash"></i></button>
        </div></td>
      </tr>`).join(''))}
    </section>`;
  }
  else if(activeTab==='news' && (role==='admin'||role==='academic')){
    html = `<section class="card">
      <h2>نشر خبر</h2>
      <form id="newsForm">
        <label>العنوان</label><input name="title" required style="margin-bottom:10px;">
        <label>التفاصيل</label><textarea name="body" rows="3" required style="margin-bottom:10px;"></textarea>
        <button type="submit">نشر</button>
      </form>
      <div id="newsMsg" style="margin-top:10px;"></div>
    </section>` + newsCards(true);
  }
  else if(activeTab==='payments' && (role==='admin'||role==='finance')){
    const filtered = cache.payments.filter(p => {
      if(paymentFilterStatus==='pending') return p.status === 'قيد المراجعة';
      if(paymentFilterStatus==='approved') return p.status === 'مقبول';
      return true;
    });
    html = `<section class="card">
      <div class="headrow">
        <h2>مراجعة المدفوعات</h2>
        <div class="actions">
          <button class="${paymentFilterStatus==='all'?'':'secondary'}" onclick="setPaymentFilter('all')">الكل</button>
          <button class="${paymentFilterStatus==='pending'?'':'secondary'}" onclick="setPaymentFilter('pending')">المعلقة</button>
          <button class="${paymentFilterStatus==='approved'?'':'secondary'}" onclick="setPaymentFilter('approved')">المعتمدة</button>
        </div>
      </div>
      ${table(['الإيصال','الطالب','الوسيلة','المبلغ','المرجع','الاسكرين','الحالة','إجراء'], filtered.map(p=>{
        const statusBadge = p.status==='مقبول'
          ? `<span class="pill" style="background:#d1fae5;color:#065f46;">مقبول ✅</span>`
          : p.status==='مرفوض' ? `<span class="pill" style="background:#fee2e2;color:#991b1b;" title="${esc(p.rejectReason||'')}">مرفوض ❌</span>`
          : `<span class="pill" style="background:#fef3c7;color:#92400e;">معلق ⏳</span>`;
        const actionBtn = p.status==='قيد المراجعة'
          ? `<button style="background:var(--green);padding:5px 10px;font-size:.8rem;" onclick="approvePayment('${p.id}','${p.studentUid}',${p.amount})">اعتماد</button> <button class="danger" style="padding:5px 10px;font-size:.8rem;" onclick="rejectPayment('${p.id}')">رفض</button>`
          : p.status==='مقبول' ? `<button class="secondary" style="padding:5px 10px;font-size:.8rem;" onclick="printReceipt('${p.id}')">إيصال</button>` : '—';
        const imgBtn = p.screenshot
          ? `<button class="secondary" style="padding:4px 8px;font-size:.75rem;" onclick="viewScreenshot('${p.id}')">عرض</button>`
          : '—';
        return `<tr>
          <td><code>${esc(p.receiptNo)}</code></td>
          <td><strong>${esc(p.studentName)}</strong></td>
          <td><span class="pill">${esc(p.method)}</span></td>
          <td style="color:var(--green);font-weight:700;">${money(p.amount)}</td>
          <td><code>${esc(p.trxId||'—')}</code></td>
          <td>${imgBtn}</td>
          <td>${statusBadge}</td>
          <td>${actionBtn}</td>
        </tr>`;
      }).join(''))}
    </section>`;
  }
  else if(activeTab==='home' && role==='student'){
    const s = cache.students[0] || {};
    const totalFees = Number(s.totalFees || 18000);
    const approvedPayments = cache.payments.filter(p=>p.studentUid===user.uid && p.status==='مقبول');
    const paidAmount = approvedPayments.reduce((a,p)=>a+Number(p.amount||0),0);
    
    const pendingPayments = cache.payments.filter(p=>p.studentUid===user.uid && p.status==='قيد المراجعة');
    const pendingTotal = pendingPayments.reduce((a,p)=>a+Number(p.amount||0),0);
    
    const remaining = Math.max(0, totalFees - paidAmount);
    const maxPayable = Math.max(0, remaining - pendingTotal);
    const st = cache.settings || {};
    const progress = Math.min(100, Math.round((paidAmount / (totalFees || 1)) * 100));

    const formHTML = st.maintenanceMode
      ? `<div class="notice error" style="text-align:center;padding:20px;"><i class="fas fa-tools"></i> بوابة الدفع مغلقة مؤقتًا للصيانة</div>`
      : (maxPayable <= 0 
          ? `<div class="notice success" style="text-align:center;padding:20px;font-size:1.1rem;font-weight:bold;">
               <i class="fas fa-check-circle" style="font-size:2rem;margin-bottom:10px;"></i><br>
               شكراً لك! لقد قمت بسداد المصروفات بالكامل أو المبالغ المتبقية قيد المراجعة.
             </div>`
          : `<form id="studentPaymentForm" style="max-width:600px;margin:0 auto;text-align:right;">
              <div class="fields" style="margin-bottom:15px;">
                <div>
                  <label>وسيلة الدفع:</label>
                  <select id="payMethodSelect" name="method" required>
                    <option value="InstaPay">إنستاباي (InstaPay)</option>
                    <option value="VodafoneCash">فودافون كاش</option>
                    <option value="Fawry">فوري</option>
                    
                  </select>
                </div>
                <div>
                  <label>المبلغ المراد دفعه (الحد الأقصى: ${money(maxPayable)}):</label>
                  <input id="payAmountInput" name="payAmount" type="number" min="1" max="${maxPayable}" value="${maxPayable}" required>
                  <div style="display:flex; gap:5px; margin-top:8px;">
                    <button type="button" class="secondary" style="padding:4px; font-size:0.75rem; flex:1;" onclick="setPayAmount(${maxPayable * 0.25})">25%</button>
                    <button type="button" class="secondary" style="padding:4px; font-size:0.75rem; flex:1;" onclick="setPayAmount(${maxPayable * 0.5})">50%</button>
                    <button type="button" class="secondary" style="padding:4px; font-size:0.75rem; flex:1;" onclick="setPayAmount(${maxPayable})">الكل</button>
                  </div>
                </div>
              </div>

              <div id="method-InstaPay" class="pay-method-box active"><p><i class="fas fa-info-circle"></i> يرجى التحويل إلى حساب إنستاباي: <b>${esc(st.instapay)||'<span class="muted">لم يُحدَّد بعد — تواصل مع الإدارة</span>'}</b></p></div>
              <div id="method-VodafoneCash" class="pay-method-box"><p><i class="fas fa-info-circle"></i> يرجى التحويل إلى رقم فودافون كاش: <b>${esc(st.vodafone)||'<span class="muted">لم يُحدَّد بعد — تواصل مع الإدارة</span>'}</b></p></div>
              <div id="method-Fawry" class="pay-method-box"><p><i class="fas fa-info-circle"></i> يرجى استخدام كود فوري التالي: <b>${esc(st.fawryCode)||'<span class="muted">لم يُحدَّد بعد — تواصل مع الإدارة</span>'}</b></p></div>
              

              <div class="fields" style="margin-top:15px;">
                <div><label>الرقم المرجعي للعملية (TRX):</label><input name="trxId" placeholder="مثال: TRX-12345"></div>
                <div><label>صورة إيصال السداد:</label><input type="file" id="receiptImgFile" accept="image/*"></div>
              </div>
              
              <button style="width:100%;background:var(--green);margin-top:20px;padding:12px;font-size:1.1rem;">
                <i class="fas fa-paper-plane"></i> إرسال الإيصال للمراجعة
              </button>
            </form><div id="paymentMsg" style="margin-top:10px;"></div>`);

    html = `<h2>أهلاً بك يا ${esc(s.name||profile.name||'الطالب')} 👋</h2>
    
      <div class="grid" style="margin-bottom:20px;">
        <div class="stat" style="border-right:4px solid var(--blue);">
          <span>إجمالي المصروفات</span><b>${money(totalFees)}</b>
        </div>
        <div class="stat" style="border-right:4px solid var(--green);">
          <span>المبلغ المدفوع</span><b style="color:var(--green);">${money(paidAmount)}</b>
        </div>
        <div class="stat" style="border-right:4px solid var(--red);">
          <span>المتبقي (المتأخرات)</span><b style="color:var(--red);">${money(remaining)}</b>
        </div>
        <div class="stat" style="border-right:4px solid var(--muted);">
          <span>مبالغ قيد المراجعة</span><b style="color:var(--muted);">${money(pendingTotal)}</b>
        </div>
      </div>

      <section class="card">
        <div class="headrow" style="margin-bottom:10px;">
          <strong>نسبة سداد المصروفات:</strong>
          <span style="color:var(--blue);font-weight:bold;font-size:1.2rem;">${progress}%</span>
        </div>
        <div class="progress-bar-container"><div class="progress-bar-fill" style="width:${progress}%;"></div></div>
      </section>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:15px; margin-bottom:20px;">
        <section class="card" style="background:var(--pale); border:1px solid var(--blue2);">
          <h3><i class="fas fa-calculator" style="color:var(--blue);"></i> حاسبة تقسيط المصروفات</h3>
          <p class="muted small">تريد تقسيط المبلغ المتبقي؟ احسب القسط الشهري المتوقع:</p>
          <div class="fields">
            <div><label>المبلغ المتبقي:</label><input type="text" value="${money(remaining)}" readonly></div>
            <div><label>عدد الأشهر للتقسيط:</label><input type="number" id="calcMonths" min="1" max="12" value="3" oninput="calculateMonthlyInstallment(${remaining})"></div>
          </div>
          <div id="calcResultMsg" style="margin-top:15px; font-size:1.2rem; font-weight:bold; text-align:center; background:#fff; padding:10px; border-radius:10px;">
            القسط الشهري: <span style="color:var(--blue);" id="monthlyInstallmentVal">${money(remaining / 3)}</span>
          </div>
        </section>

        <section class="card">
          <h3><i class="fas fa-id-card" style="color:var(--blue);"></i> البيانات الأكاديمية</h3>
          <div style="margin-top:15px;">
            <p><strong>الرقم الجامعي:</strong> <span class="pill">${esc(s.studentId||'—')}</span></p>
            <p><strong>الفرقة الدراسية:</strong> ${esc(s.level||'—')}</p>
            <p><strong>القسم:</strong> ${esc(s.department||'—')}</p>
            <p><strong>البريد الإلكتروني:</strong> <span class="muted">${esc(s.email||user.email)}</span></p>
          </div>
        </section>
      </div>

      <section class="card" style="border-top:4px solid var(--green);">
        <h3 style="color:var(--green);"><i class="fas fa-wallet"></i> بوابة الدفع الإلكتروني</h3>
        ${formHTML}
      </section>

      <section class="card">
        <div class="headrow" style="margin-bottom:15px;">
          <h3>سجل الإيصالات والمدفوعات</h3>
          <button class="secondary" onclick="printFullFinancialStatement()">
            <i class="fas fa-file-pdf"></i> تحميل كشف حساب
          </button>
        </div>
        ${table(['رقم الإيصال', 'التاريخ', 'الوسيلة', 'المبلغ', 'الحالة', 'الإجراء'], cache.payments.map(p=>{
          let statusBadge = '';
          if(p.status === 'مقبول') statusBadge = '<span class="pill" style="background:#d1fae5;color:#065f46;">معتمد ✅</span>';
          else if(p.status === 'مرفوض') statusBadge = '<span class="pill" style="background:#feeceb;color:#c0392b;">مرفوض ❌</span>';
          else statusBadge = '<span class="pill" style="background:#fef3c7;color:#92400e;">قيد المراجعة ⏳</span>';

          return `<tr>
            <td><code>${esc(p.receiptNo)}</code></td>
            <td><small class="muted">${esc(p.date)}</small></td>
            <td><span class="pill">${esc(p.method)}</span></td>
            <td style="font-weight:bold;">${money(p.amount)}</td>
            <td>${statusBadge}</td>
            <td>${p.status==='مقبول' ? `<button class="secondary" style="padding:4px 8px;font-size:.75rem;" onclick="printReceipt('${p.id}')"><i class="fas fa-print"></i> طباعة</button>` : '—'}</td>
          </tr>`;
        }).join(''))}
      </section>`;
  }
  else if(activeTab==='gpasimulator' && role==='student'){
    const currentResults = cache.results || [];
    let currentPoints = 0;
    let currentHours = 0;
    currentResults.forEach(r => {
      const hrs = Number(r.creditHours || 3);
      currentPoints += pts(Number(r.score)) * hrs;
      currentHours += hrs;
    });
    const currentGPA = currentHours > 0 ? (currentPoints / currentHours).toFixed(2) : '0.00';

    html = `<section class="card">
      <div class="headrow">
        <h2><i class="fas fa-chart-line" style="color:var(--blue);"></i> محاكي المعدل التراكمي (GPA)</h2>
        <button class="secondary" onclick="clearSimCourses()"><i class="fas fa-trash"></i> مسح المواد المتوقعة</button>
      </div>
      <p class="muted">أضف المواد التي ستدرسها هذا الفصل لمعرفة التأثير المتوقع على معدلك التراكمي.</p>

      <div class="grid" style="margin:20px 0;">
        <div class="stat" style="background:#fff; border:1px solid var(--line); text-align:center;">
          <span>المعدل الحالي (من النتائج)</span>
          <b style="color:var(--blue); font-size:2rem;">${currentGPA}</b>
          <small class="muted">${currentHours} ساعة معتمدة</small>
        </div>
        <div class="stat" style="background:var(--pale); border:1px solid var(--blue2); text-align:center;">
          <span>المعدل المتوقع (بعد الإضافة)</span>
          <b id="simResultGPA" style="color:var(--green); font-size:2rem;">${currentGPA}</b>
          <small class="muted" id="simHoursText">0 ساعة جديدة</small>
        </div>
      </div>

      <div style="background:var(--bg); padding:15px; border-radius:12px; border:1px solid var(--line); margin-bottom:20px;">
        <h4 style="margin-top:0;">إضافة مادة متوقعة:</h4>
        <div class="fields">
          <div><label>اسم المادة:</label><input type="text" id="simCourseName" placeholder="مثال: الذكاء الاصطناعي"></div>
          <div><label>الدرجة المتوقعة (0-100):</label><input type="number" id="simCourseScore" min="0" max="100" placeholder="90"></div>
          <div><label>عدد الساعات المعتمدة:</label>
            <select id="simCourseHours">
              <option value="1">1 ساعة</option>
              <option value="2">2 ساعات</option>
              <option value="3" selected>3 ساعات</option>
              <option value="4">4 ساعات</option>
            </select>
          </div>
          <div style="display:flex; align-items:end;">
            <button onclick="addSimCourse()" style="width:100%; background:var(--green);">
              <i class="fas fa-plus"></i> إضافة
            </button>
          </div>
        </div>
      </div>

      <h4>المواد المتوقعة:</h4>
      <div id="simTableWrap"></div>

      <div style="margin-top:20px; padding:20px; background:var(--bg); border-radius:12px; text-align:center;">
        <h4 style="margin-top:0;">تقييم المعدل المتوقع:</h4>
        <div class="progress-bar-container" style="height:24px;">
          <div id="gpaProgressBar" class="progress-bar-fill" style="width:0%; background:linear-gradient(90deg, #c0392b, #f39c12, #16845b);"></div>
        </div>
        <p id="gpaStatusText" style="font-weight:bold; font-size:1.2rem; margin-top:10px;">—</p>
      </div>
    </section>`;
  }
  else if(activeTab==='mylibrary' && role==='student'){
    const s = cache.students[0] || {};
    const myLibs = cache.library.filter(l => l.level==='كل الفرق' || l.level===s.level);
    html = `<section class="card">
      <h2><i class="fas fa-file-pdf" style="color:var(--red);"></i> المكتبة</h2>
      ${table(['المادة','العنوان','عرض'], myLibs.map(l=>`<tr>
        <td>${esc(l.course)}</td><td><b>${esc(l.title)}</b></td>
        <td><button class="secondary" onclick="viewPdfFile('${l.id}')"><i class="fas fa-eye"></i> عرض</button></td>
      </tr>`).join(''))}
    </section>`;
  }
  else if(activeTab==='myattendance' && role==='student'){
    html = `<section class="card">
      <h2><i class="fas fa-user-check" style="color:var(--blue);"></i> تسجيل الحضور</h2>
      <form id="studentAttForm" class="fields" style="max-width:400px;margin-bottom:20px;">
        <div><label>كود الحضور (PIN):</label><input name="pinCode" placeholder="كود المحاضر" required></div>
        <button style="background:var(--green);">تسجيل</button>
      </form>
      <div id="studentAttMsg"></div>
      <h3>سجل الحضور</h3>
      ${table(['المحاضرة','الوقت'], cache.attendance.filter(a=>a.studentUid===user.uid).map(a=>`<tr>
        <td>${esc(a.sessionName)}</td>
        <td>${a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString('ar-EG') : '—'}</td>
      </tr>`).join(''))}
    </section>`;
  }
  else if(activeTab==='myresults' && role==='student'){
    html = `<section class="card">
      <div class="headrow" style="margin-bottom:15px;">
        <h2>نتائجي</h2>
        <button style="background:var(--green);" onclick="downloadOfficialTranscript()">
          <i class="fas fa-file-pdf"></i> كشف الدرجات PDF
        </button>
      </div>
      ${table(['المادة','الدرجة','التقدير'], cache.results.map(r=>`<tr>
        <td>${esc(r.course)}</td><td>${Number(r.score)} / 100</td><td>${grade(Number(r.score))}</td>
      </tr>`).join(''))}
    </section>`;
  }
  else if(activeTab==='myexams' && role==='student'){
    const s = cache.students[0] || {};
    html = `<section class="card">
      <div class="headrow"><h2>جدول الامتحانات</h2><button class="secondary" onclick="exportExamsICS()"><i class="fas fa-calendar-plus"></i> إضافة للتقويم</button></div>
      ${table(['المادة','التاريخ','الوقت','القاعة'], cache.exams
        .filter(e=>!e.level || e.level===s.level)
        .map(e=>`<tr><td>${esc(e.course)}</td><td>${esc(e.date)}</td><td>${esc(e.time)}</td><td>${esc(e.hall)}</td></tr>`).join(''))}
    </section>`;
  }
  else if(activeTab==='mynews' && role==='student'){
    html = newsCards(false);
  }
  else if(activeTab==='chat'){
    if(isStaff){
      if(!selectedChatStudentUid && cache.students.length>0) selectedChatStudentUid = cache.students[0].uid;
      const activeStu = cache.students.find(s=>s.uid===selectedChatStudentUid);
      html = `<section class="card">
        <h2><i class="fas fa-comments" style="color:var(--blue);"></i> محادثات الطلاب</h2>
        <div class="fields" style="margin-bottom:15px;">
          <div><label>الطالب:</label>
            <select id="adminChatStudentSelect" onchange="changeChatStudent(this.value)">
              ${cache.students.map(s=>`<option value="${s.uid}" ${s.uid===selectedChatStudentUid?'selected':''}>${esc(s.studentId)} — ${esc(s.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="chatbox-container">
          <div style="background:var(--pale);padding:10px 15px;font-weight:bold;border-bottom:1px solid var(--line);">${esc(activeStu?.name||'')}</div>
          <div id="chatMessagesArea" class="chat-messages-area"></div>
          <form id="chatForm" style="display:flex;padding:10px;background:var(--card);border-top:1px solid var(--line);gap:10px;">
            <input name="body" required placeholder="اكتب رسالتك..." style="flex:1;margin:0;">
            <button style="background:var(--green);"><i class="fas fa-paper-plane"></i></button>
          </form>
        </div>
      </section>`;
    } else {
      html = `<section class="card">
        <h2><i class="fas fa-headset" style="color:var(--blue);"></i> التواصل مع الشؤون</h2>
        <div class="chatbox-container">
          <div style="background:var(--pale);padding:10px 15px;font-weight:bold;border-bottom:1px solid var(--line);">محادثة رسمية</div>
          <div id="chatMessagesArea" class="chat-messages-area"></div>
          <form id="chatForm" style="display:flex;padding:10px;background:var(--card);border-top:1px solid var(--line);gap:10px;">
            <input name="body" required placeholder="اكتب رسالتك..." style="flex:1;margin:0;">
            <button style="background:var(--green);"><i class="fas fa-paper-plane"></i></button>
          </form>
        </div>
      </section>`;
    }
  }

  html = extraViews(html);
  v.innerHTML = html;
  bindForms();
  if(isStaff && activeTab==='dashboard') renderChart();
  if(activeTab==='chat') startChatListener();
  if(activeTab==='gpasimulator') renderSimTable();
}

