/* ---------- Login ---------- */
function renderLogin(){
  $('#headerActions').innerHTML = '';
  appRoot.innerHTML = `<section class="card loginbox">
    ${cache.siteStatus?.maintenanceMode ? `<div class="maintenance-banner"><i class="fas fa-screwdriver-wrench"></i><div><strong>الموقع في حالة صيانة</strong><p>${esc(cache.siteStatus.message||'الخدمات الطلابية متوقفة مؤقتًا. حاول مرة أخرى لاحقًا.')}</p></div></div>` : ''}
    <h2>تسجيل الدخول</h2>
    <p class="muted">استخدم البريد الإلكتروني وكلمة المرور.</p>
    <form id="loginForm">
      <label>البريد الإلكتروني</label>
      <input id="email" type="email" required autocomplete="username" placeholder="student@example.com">
      <label style="margin-top:10px;">كلمة المرور</label>
      <input id="password" type="password" required autocomplete="current-password">
      <div id="loginError" style="margin-top:10px;"></div>
      <button type="submit" style="width:100%;margin-top:14px;">دخول آمن</button>
      <div style="text-align:center;margin-top:12px;">
        <a href="#" onclick="forgotPassword();return false;" style="font-size:.85rem;color:var(--blue);text-decoration:underline;">نسيت كلمة المرور؟</a>
      </div>
    </form>
  </section>`;

  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    if(btn) btn.disabled = true;
    $('#loginError').innerHTML = '';
    try {
      await signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#password').value);
    } catch(err) {
      $('#loginError').innerHTML = msg(authError(err), 'error');
    } finally {
      if(btn) btn.disabled = false;
    }
  };
}

function renderMaintenanceScreen(){
  $('#headerActions').innerHTML = '';
  appRoot.innerHTML = `<section id="maintenanceScreen" class="card maintenance-screen" role="status">
    <div class="maintenance-icon"><i class="fas fa-screwdriver-wrench"></i></div>
    <span class="section-kicker">بوابة الطالب</span>
    <h2>الموقع في حالة صيانة</h2>
    <p>${esc(cache.siteStatus?.message||'نعمل على تحديث الموقع. يرجى المحاولة مرة أخرى لاحقًا.')}</p>
    <button class="secondary" type="button" onclick="location.reload()"><i class="fas fa-rotate"></i> إعادة المحاولة</button>
  </section>`;
}

window.forgotPassword = async function(){
  const email = prompt('أدخل بريدك الإلكتروني:');
  if(!email) return;
  try {
    await sendPasswordResetEmail(auth, email.trim());
    showToast('تم إرسال رابط الاستعادة إلى بريدك.');
  } catch(err){ showToast(authError(err),'error'); }
};

function authError(e){
  return ({
    'auth/invalid-credential':'البريد أو كلمة المرور غير صحيحة.',
    'auth/too-many-requests':'محاولات كثيرة، انتظر قليلًا.',
    'auth/network-request-failed':'تحقق من اتصال الإنترنت.',
    'auth/invalid-email':'صيغة البريد غير صحيحة.',
    'auth/email-already-in-use':'البريد مستخدم مسبقًا.',
    'auth/weak-password':'كلمة المرور ضعيفة (6 أحرف على الأقل).',
    'permission-denied':'لا تملك صلاحية هذه العملية.',
    'functions/unauthenticated':'سجّل الدخول ثم أعد المحاولة.',
    'functions/permission-denied':'لا تملك صلاحية هذه العملية.',
    'functions/not-found':'حساب الطالب غير موجود.',
    'functions/failed-precondition':'انتهت جلسة الحضور أو لم تعد نشطة.',
    'functions/unavailable':'الخدمة غير متاحة أثناء الصيانة. حاول لاحقًا.'
  })[e.code] || e.message || 'حدث خطأ.';
}

/* ---------- Data Loader ---------- */
async function loadData(){
  await loadExtra();
  const newsP = safe(getDocs(collection(db,'news')), none);
  const examsP = safe(getDocs(collection(db,'exams')), none);
  const libP   = safe(getDocs(collection(db,'library')), none);
  const attP   = safe(getDocs(collection(db,'attendance')), none);

  try {
    const setSnap = await getDoc(doc(db,'settings','payment_accounts'));
    cache.settings = setSnap.exists()
      ? setSnap.data()
      : { vodafone:'', instapay:'', fawryCode:'', bankAccount:'', maintenanceMode:false };
  } catch { cache.settings = {}; }

  const activeAttendance = await safe(getDoc(doc(db,'settings','attendance_public')), none);
  cache.activeAttendance = activeAttendance.exists() ? activeAttendance.data() : null;

  const isStaffUser = ['admin','finance','academic'].includes(role);

  if(isStaffUser){
    const [ss, ns, es, libs, atts, rs, ps, ls, stfSnap] = await Promise.all([
      safe(getDocs(collection(db,'students')), none),
      newsP, examsP, libP, attP,
      safe(getDocs(collection(db,'results')), none),
      safe(getDocs(collection(db,'payments')), none),
      safe(getDocs(query(collection(db,'audit_logs'), orderBy('createdAt','desc'))), none),
      safe(getDocs(query(collection(db,'users'), where('role','in',['admin','finance','academic']))), none)
    ]);
    cache.students   = ss.docs.map(d=>({uid:d.id, ...d.data()}));
    cache.results    = rs.docs.map(d=>({id:d.id, ...d.data()}));
    cache.payments   = ps.docs.map(d=>({id:d.id, ...d.data()}));
    cache.news       = ns.docs.map(d=>({id:d.id, ...d.data()}));
    cache.exams      = es.docs.map(d=>({id:d.id, ...d.data()}));
    cache.library    = libs.docs.map(d=>({id:d.id, ...d.data()}));
    cache.attendance = atts.docs.map(d=>({id:d.id, ...d.data()}));
    cache.logs       = ls.docs.map(d=>({id:d.id, ...d.data()}));
    cache.staff      = stfSnap.docs.map(d=>({uid:d.id, ...d.data()}));
  } else {
    const [ss, ns, es, libs, atts, rs, ps] = await Promise.all([
      safe(getDoc(doc(db,'students',user.uid)), { exists:()=>false }),
      newsP, examsP, libP,
      safe(getDocs(query(collection(db,'attendance'), where('studentUid','==',user.uid))), none),
      safe(getDocs(query(collection(db,'results'), where('studentUid','==',user.uid))), none),
      safe(getDocs(query(collection(db,'payments'), where('studentUid','==',user.uid))), none)
    ]);
    cache.students   = ss.exists() ? [{uid:ss.id, ...ss.data()}] : [];
    cache.results    = rs.docs.map(d=>({id:d.id, ...d.data()}));
    cache.payments   = ps.docs.map(d=>({id:d.id, ...d.data()}));
    cache.news       = ns.docs.map(d=>({id:d.id, ...d.data()}));
    cache.exams      = es.docs.map(d=>({id:d.id, ...d.data()}));
    cache.library    = libs.docs.map(d=>({id:d.id, ...d.data()}));
    cache.attendance = atts.docs.map(d=>({id:d.id, ...d.data()}));
  }
}

/* ---------- Nav ---------- */
function getNavItems(){
  const pendingCount = cache.payments.filter(p=>p.status==='قيد المراجعة').length;
  const badge = pendingCount>0 ? ` <span style="background:#c0392b;color:#fff;padding:1px 6px;border-radius:99px;font-size:.75rem;">${pendingCount}</span>` : '';
  let items = [];
  if(role==='admin') items = [
    ['dashboard','الرئيسية'],['students','الطلاب'],['results','النتائج'],
    ['exams','الامتحانات'],['library','المكتبة'],['attendance','الحضور'],
    ['schedule','الجدول'],['requests',`الطلبات${reqBadge()}`],['courses','المواد والتسجيل'],['news','الأخبار'],['payments',`المدفوعات${badge}`],['accounts','الحسابات'],
    ['staff','المساعدين'],['logs','سجل الأمان'],['chat','شؤون الطلاب']
  ];
  else if(role==='finance') items = [
    ['dashboard','الرئيسية'],['payments',`المدفوعات${badge}`],
    ['accounts','الحسابات'],['logs','سجل الأمان'],['chat','شؤون الطلاب']
  ];
  else if(role==='academic') items = [
    ['dashboard','الرئيسية'],['students','الطلاب'],['results','النتائج'],
    ['exams','الامتحانات'],['library','المكتبة'],['attendance','الحضور'],
    ['schedule','الجدول'],['requests',`الطلبات${reqBadge()}`],['courses','المواد والتسجيل'],['news','الأخبار'],['chat','شؤون الطلاب']
  ];
  else items = [
    ['home','ملفي والمصروفات'],['gpasimulator','محاكي GPA'],
    ['mylibrary','المكتبة PDF'],['myattendance','سجل الحضور'],
    ['myresults','نتيجتي'],['myexams','الامتحانات'],
    ['myschedule','جدولي'],['myregistration','تسجيل المواد'],['myrequests','طلباتي'],['mynews','الأخبار'],['chat','التواصل']
  ];
  if(!items.some(i=>i[0]===activeTab)){
    activeTab = items[0][0];
    localStorage.setItem('activeTab', activeTab);
  }
  return items;
}

function navIcon(id){
  const icons={dashboard:'fa-tachometer-alt',students:'fa-users',results:'fa-chart-bar',exams:'fa-calendar-check',library:'fa-book-open',attendance:'fa-clipboard-check',schedule:'fa-calendar-alt',requests:'fa-inbox',courses:'fa-book',news:'fa-bullhorn',payments:'fa-wallet',accounts:'fa-university',staff:'fa-user-cog',logs:'fa-shield-alt',chat:'fa-comments',home:'fa-home',gpasimulator:'fa-calculator',mylibrary:'fa-file-pdf',myattendance:'fa-clipboard-list',myresults:'fa-chart-line',myexams:'fa-calendar-check',myschedule:'fa-calendar-alt',myregistration:'fa-edit',myrequests:'fa-paper-plane',mynews:'fa-newspaper'};
  return icons[id]||'fa-circle';
}

function nav(){
  const items=getNavItems();
  const p=profile||{};
  const roleLabel=role==='admin'?'مدير النظام':role==='finance'?'الشؤون المالية':role==='academic'?'الشؤون الأكاديمية':'طالب';
  const displayName=p.name||user.email;
  const initial=String(displayName||'د').trim().charAt(0)||'د';
  return `<aside class="app-sidebar" aria-label="القائمة الرئيسية">
    <div class="sidebar-brand">
      <div class="sidebar-logo"><i class="fas fa-graduation-cap"></i></div>
      <div><strong>دلتا</strong><span>بوابة الخدمات</span></div>
    </div>
    <div class="sidebar-caption">التنقل الرئيسي</div>
    <nav class="tabs side-nav">${items.map(([id,label])=>`<button type="button" class="${activeTab===id?'active':''}" data-tab="${id}"><i class="fas ${navIcon(id)}" aria-hidden="true"></i><span class="nav-item-label">${label}</span></button>`).join('')}</nav>
    <div class="sidebar-account"><div class="sidebar-avatar">${esc(initial)}</div><div class="sidebar-account-copy"><strong>${esc(displayName)}</strong><span>${roleLabel}</span></div></div>
  </aside>`;
}

function renderApp(){
  const p = profile || {};
  const roleLabel = role==='admin'?'(Super Admin)':role==='finance'?'(مالي)':role==='academic'?'(أكاديمي)':'';
  $('#headerActions').innerHTML = `<button class="secondary" id="logout" style="padding:7px 12px;font-size:.82rem;"><i class="fas fa-sign-out-alt"></i> خروج</button>`;
  $('#logout').onclick = async () => {
    if(unsubChat) { unsubChat(); unsubChat=null; }
    stopAttendanceQrRefresh();
    localStorage.removeItem('activeTab');
    await signOut(auth);
  };
  
  const tBtn = $('#themeBtnText');
  if(tBtn) tBtn.textContent = document.body.dataset.theme === 'dark' ? 'فاتح' : 'داكن';

  const displayName=esc(p.name||user.email);
  appRoot.innerHTML = `<div class="app-layout">${nav()}<section class="app-main">
    <div class="app-page-heading"><div><span class="page-eyebrow">بوابة الخدمات الأكاديمية ${roleLabel}</span><h2>أهلًا بعودتك، ${displayName}</h2><p>كل خدماتك ومتابعاتك في مكان واحد.</p></div><div class="secure-status"><i class="fas fa-shield-alt"></i><span>جلسة آمنة</span></div></div>
    <div id="view"></div>
  </section></div>`;
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    if(unsubChat){ unsubChat(); unsubChat=null; }
    activeTab = b.dataset.tab;
    localStorage.setItem('activeTab', activeTab);
    renderApp();
  });
  renderView();
}

function stat(label,val){ return `<div class="stat"><span>${label}</span><b>${val}</b></div>`; }
let tblSeq=0;
function table(headers,rows){
  const PAGE=25, id='tb'+(++tblSeq);
  const parts=rows?String(rows).split(/(?=<tr[\s>])/).filter(x=>x.trim()):[];
  const big=parts.length>PAGE;
  const body=!rows?`<tr><td colspan="${headers.length}" class="muted">لا توجد بيانات</td></tr>`
    :big?parts.map((p,k)=>k>=PAGE?p.replace(/^<tr/,'<tr data-extra="1" style="display:none"'):p).join(''):rows;
  const tools=parts.length>10?`<input type="search" placeholder="بحث في الجدول..." oninput="tblFilter('${id}',this.value)" style="max-width:260px;margin-bottom:8px;">`:'';
  const more=big?`<div style="text-align:center;margin-top:8px;"><button type="button" class="secondary" onclick="tblMore('${id}',this)">عرض المزيد (${parts.length-PAGE})</button></div>`:'';
  return `<div id="${id}">${tools}<div class="tablewrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>${more}</div>`;
}
window.tblMore=(id,b)=>{document.querySelectorAll(`#${id} tr[data-extra]`).forEach(r=>{r.style.display='';r.removeAttribute('data-extra')});b.parentElement.remove();};
window.tblFilter=(id,q)=>{q=q.trim().toLowerCase();document.querySelectorAll(`#${id} tbody tr`).forEach(r=>{r.style.display=(!q||r.textContent.toLowerCase().includes(q))?'':'none';if(q)r.removeAttribute('data-extra');});};

