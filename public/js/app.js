// ملف مُولَّد من src/js بواسطة build.mjs — لا تعدّله يدوياً
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
         createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword,
         EmailAuthProvider, reauthenticateWithCredential }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc,
         updateDoc, deleteDoc, query, where, orderBy, serverTimestamp,
         onSnapshot, runTransaction, deleteField, writeBatch }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { firebaseConfig, isFirebaseConfigured } from '../firebase-config.js';

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
window.$ = $;
const appRoot = $('#app');

let auth, db, functions, user=null, profile=null, role=null;
let activeTab = localStorage.getItem('activeTab') || 'dashboard';
let cache = { students:[], news:[], exams:[], results:[], payments:[], settings:{},
              siteStatus:{}, activeAttendance:null, logs:[], staff:[], library:[], attendance:[] };
let pendingPaymentData = null;
let paymentFilterStatus = 'all';
let selectedChatStudentUid = null;
let editCtx = null;
let unsubChat = null;
let unsubSiteStatus = null;

const esc = v => String(v??'').replace(/[&<>"']/g, c => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
));
const money = n => Number(n||0).toLocaleString('ar-EG')+' ج.م';
const dateNow = () => new Date().toLocaleDateString('en-CA');
const grade = n => n>=90?'امتياز': n>=80?'جيد جداً': n>=65?'جيد': n>=50?'مقبول':'راسب';
const pts = s => s>=90?4.0:s>=85?3.7:s>=80?3.3:s>=75?3.0:s>=70?2.7:s>=65?2.4:s>=60?2.0:s>=50?1.0:0.0;
const msg = (t, type='notice') => `<div class="notice ${type==='error'?'error':type==='success'?'success':''}">${esc(t)}</div>`;

window.showToast = function(text, type='success') {
  const c = $('#toastContainer'); if(!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas fa-${type==='success'?'check-circle':'exclamation-circle'}"></i> <span>${esc(text)}</span>`;
  c.appendChild(t);
  setTimeout(()=>t.remove(), 3500);
};

function showFatal(text){
  appRoot.innerHTML = `<section class="card loginbox">
    <h2>إعداد المنصة</h2>${msg(text,'error')}
    <button onclick="location.reload()" style="margin-top:12px;width:100%;">إعادة المحاولة</button>
  </section>`;
}

const safe = async (p, fb) => { try { return await p; } catch(e){ console.warn(e); return fb; } };
const none = { docs: [], exists: () => false };

/* ---------- Init Firebase ---------- */
if(!isFirebaseConfigured()){
  showFatal('لم يتم ربط Firebase بعد. تأكد من تعبئة firebase-config.js');
} else {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, 'us-central1');

    unsubSiteStatus = onSnapshot(doc(db,'settings','site_status'), snap => {
      const previous = !!cache.siteStatus?.maintenanceMode;
      cache.siteStatus = snap.exists() ? snap.data() : {maintenanceMode:false};
      const enabled = !!cache.siteStatus.maintenanceMode;
      if(!user && previous !== enabled) renderLogin();
      if(role==='student' && previous !== enabled){
        if(enabled) renderMaintenanceScreen();
        else if($('#maintenanceScreen')) loadData().then(renderApp).catch(()=>renderApp());
      }
    }, err => console.warn('تعذر متابعة حالة الموقع', err));

    onAuthStateChanged(auth, async u => {
      user = u;
      if(!u){
        stopAttendanceQrRefresh();
        profile = null; role = null;
        renderLogin();
        return;
      }
      try {
        const snap = await getDoc(doc(db,'users',u.uid));
        if(!snap.exists()){
          await signOut(auth);
          showFatal('الحساب لا يملك ملف صلاحيات في قاعدة البيانات.');
          return;
        }
        profile = snap.data();
        role = profile.role;
        const siteStatusSnap = await getDoc(doc(db,'settings','site_status'));
        cache.siteStatus = siteStatusSnap.exists() ? siteStatusSnap.data() : {maintenanceMode:false};
        if(role==='student' && cache.siteStatus.maintenanceMode){
          renderMaintenanceScreen();
          return;
        }
        await loadData();
        if(['admin','academic'].includes(role)) cache.students.filter(x=>'password' in x).forEach(x=>updateDoc(doc(db,'students',x.uid),{password:deleteField()}).catch(()=>{}));
        if(profile.mustChangePassword){ showForcePasswordChange(); return; }
        await handleAttendanceQr();
        const validTabs = getValidTabsForRole(role);
        if(!validTabs.includes(activeTab)) activeTab = validTabs[0];
        renderApp();
      } catch(e) {
        showFatal('تعذر تحميل بيانات الحساب: '+e.message);
      }
    });
  } catch(e) {
    showFatal('خطأ في تهيئة Firebase: '+e.message);
  }
}

/* ---------- PWA ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  });
}

/* ---------- Theme ---------- */
(function initTheme(){
  const hour = new Date().getHours();
  const isNight = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const saved = localStorage.getItem('theme');
  if(saved) document.body.dataset.theme = saved;
  else if(isNight){ document.body.dataset.theme = 'dark'; }
})();

window.toggleDarkMode = function(){
  const cur = document.body.dataset.theme;
  const next = cur === 'dark' ? 'light' : 'dark';
  if(next === 'dark') document.body.dataset.theme = 'dark';
  else delete document.body.dataset.theme;
  localStorage.setItem('theme', document.body.dataset.theme || 'light');
  const btn = $('#themeBtnText'); if(btn) btn.textContent = next==='dark' ? 'فاتح' : 'داكن';
};

window.toggleHighContrast = function(){
  const cur = document.body.dataset.theme;
  const next = cur === 'high-contrast' ? 'light' : 'high-contrast';
  if(next === 'high-contrast') document.body.dataset.theme = 'high-contrast';
  else delete document.body.dataset.theme;
  localStorage.setItem('theme', document.body.dataset.theme || 'light');
};

/* ---------- Permissions ---------- */
function getValidTabsForRole(r){
  let tabs=r==='admin'?['dashboard','students','results','exams','library','attendance','schedule','requests','courses','news','payments','accounts','staff','logs','chat','security']
    :r==='finance'?['dashboard','payments','accounts','logs','chat','security']
    :r==='academic'?['dashboard','students','results','exams','library','attendance','schedule','requests','courses','news','chat','security']
    :['home','gpasimulator','mylibrary','myattendance','myresults','myexams','myschedule','myregistration','myrequests','mynews','chat','security'];
  if(r!=='admin'&&Array.isArray(profile?.permissions)) tabs=tabs.filter(id=>['dashboard','security'].includes(id)||profile.permissions.includes(id));
  return tabs;
}

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
    <p class="muted" style="margin-top:14px;margin-bottom:8px">للعودة إلى حساب الإدارة، سجّل الخروج من الحساب الحالي ثم أدخل بيانات المدير.</p>
    <button class="secondary" type="button" onclick="exitMaintenanceToLogin()"><i class="fas fa-right-from-bracket"></i> تسجيل الخروج والعودة للدخول</button>
  </section>`;
}

window.exitMaintenanceToLogin = async function(){
  try {
    await signOut(auth);
  } catch(err) {
    showToast(authError(err),'error');
  }
};

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
    ['home','الرئيسية'],['gpasimulator','محاكي GPA'],
    ['mylibrary','المكتبة PDF'],['myattendance','سجل الحضور'],
    ['myresults','نتيجتي'],['myexams','الامتحانات'],
    ['myschedule','جدولي'],['myregistration','تسجيل المواد'],['myrequests','طلباتي'],['mynews','الأخبار'],['chat','التواصل'],['security','الأمان']
  ];
  if(role==='admin') items.push(['security','الأمان']);
  if(role==='finance'||role==='academic') items.push(['security','الأمان']);
  if(Array.isArray(profile?.permissions)&&role!=='admin') items=items.filter(([id])=>['dashboard','security'].includes(id)||profile.permissions.includes(id));
  if(!items.some(i=>i[0]===activeTab)){
    activeTab = items[0][0];
    localStorage.setItem('activeTab', activeTab);
  }
  return items;
}

function navIcon(id){
  const icons={dashboard:'fa-tachometer-alt',students:'fa-users',results:'fa-chart-bar',exams:'fa-calendar-check',library:'fa-book-open',attendance:'fa-clipboard-check',schedule:'fa-calendar-alt',requests:'fa-inbox',courses:'fa-book',news:'fa-bullhorn',payments:'fa-wallet',accounts:'fa-university',staff:'fa-user-cog',logs:'fa-shield-alt',chat:'fa-comments',home:'fa-home',gpasimulator:'fa-calculator',mylibrary:'fa-file-pdf',myattendance:'fa-clipboard-list',myresults:'fa-chart-line',myexams:'fa-calendar-check',myschedule:'fa-calendar-alt',myregistration:'fa-edit',myrequests:'fa-paper-plane',mynews:'fa-newspaper',security:'fa-lock'};
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

function renderView(){
  const v = $('#view'); if(!v) return;
  const isStaff = ['admin','finance','academic'].includes(role);
  let html = '';

  if(activeTab==='security'){
    html = `<section class="card"><h2><i class="fas fa-shield-halved" style="color:var(--blue)"></i> أمان الحساب</h2><p class="muted">آخر دخول مسجل: ${esc(user?.metadata?.lastSignInTime?new Date(user.metadata.lastSignInTime).toLocaleString('ar-EG'):'غير متاح')}</p><form id="ownPasswordForm" class="fields" style="max-width:640px"><div><label>كلمة المرور الحالية</label><input type="password" name="currentPassword" autocomplete="current-password" required></div><div><label>كلمة المرور الجديدة</label><input type="password" name="newPassword" minlength="8" maxlength="128" autocomplete="new-password" required></div><div><label>تأكيد كلمة المرور الجديدة</label><input type="password" name="confirmPassword" minlength="8" maxlength="128" autocomplete="new-password" required></div><button type="submit">تغيير كلمة المرور وإنهاء الجلسات الأخرى</button></form><div id="ownPasswordMsg" style="margin-top:10px"></div><p class="muted small">يتطلب التغيير تأكيد كلمة المرور الحالية. بعد نجاحه ستنتهي الجلسات القديمة، وسيُطلب منك تسجيل الدخول مجددًا.</p></section>`;
  }
  else if(activeTab==='dashboard' && isStaff){
    const totalPaid = cache.payments.filter(p=>p.status==='مقبول').reduce((a,p)=>a+Number(p.amount||0),0);
    const pending = cache.payments.filter(p=>p.status==='قيد المراجعة').length;
    const shortcuts = role==='finance'
      ? [['payments','مراجعة المدفوعات','fa-wallet'],['accounts','حسابات الدفع','fa-university'],['chat','رسائل الطلاب','fa-comments']]
      : [['students','إدارة الطلاب','fa-users'],['results','النتائج','fa-chart-bar'],['requests','طلبات الطلاب','fa-inbox']];
    const visibleShortcuts=shortcuts.filter(([id])=>hasModuleAccess(id));
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
        <section class="card dashboard-shortcuts"><div class="section-heading"><div><span class="section-kicker">وصول سريع</span><h3>اختصارات العمل</h3></div></div><div class="shortcut-list">${visibleShortcuts.map(([id,label,icon])=>`<button type="button" class="shortcut-link" data-go="${id}"><span class="shortcut-icon"><i class="fas ${icon}"></i></span><span>${label}</span><i class="fas fa-chevron-left shortcut-arrow"></i></button>`).join('')}</div></section>
      </div>
      <section class="card"><div class="section-heading"><div><span class="section-kicker">التقارير والإدارة</span><h3>وصول سريع للتقارير</h3></div></div><div class="actions">${['admin','academic'].includes(role)&&hasModuleAccess('results')?'<button type="button" class="secondary" data-go="results"><i class="fas fa-chart-bar"></i> النتائج</button>':''}${['admin','academic'].includes(role)&&hasModuleAccess('attendance')?'<button type="button" class="secondary" data-go="attendance"><i class="fas fa-clipboard-check"></i> الحضور والغياب</button>':''}${['admin','finance'].includes(role)&&hasModuleAccess('payments')?'<button type="button" class="secondary" data-go="payments"><i class="fas fa-wallet"></i> تقارير المصروفات</button>':''}${role==='admin'?'<button type="button" class="secondary" data-go="logs"><i class="fas fa-shield-alt"></i> سجل التدقيق</button>':''}</div></section>
      ${['admin','academic'].includes(role)&&hasModuleAccess('results')?`<section class="card dashboard-results-search"><h3><i class="fas fa-magnifying-glass"></i> البحث عن نتيجة طالب</h3><label for="dashboardResultsSearch">ابحث بالاسم أو الرقم الجامعي</label><input id="dashboardResultsSearch" type="search" autocomplete="off" placeholder="اكتب الاسم أو الرقم الجامعي" oninput="searchAdminResults(this.value)"><div id="dashboardResultsSearchResults" class="muted" style="margin-top:12px;">اكتب اسم الطالب أو رقمه لعرض نتائجه.</div></section>`:''}`;
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
    const courseChoices=[...new Set([...(cache.courses||[]).map(x=>x.name),...(cache.schedule||[]).map(x=>x.course)].filter(Boolean))];
    const sessionRows=(cache.activeAttendance?.sessions||[]).filter(x=>Number(x.expiresAt||0)<=Date.now()&&x.course)
      .slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).map(x=>{
        const enrolled=cache.students.filter(s=>s.level===x.level).length;
        const present=cache.attendance.filter(a=>a.sessionId===x.sessionId).length;
        return `<tr><td>${esc(x.course)}</td><td>${esc(x.level)}</td><td>${esc(x.sessionName)}</td><td>${present} / ${enrolled}</td><td>${Math.max(0,enrolled-present)}</td><td>${new Date(Number(x.createdAt||x.expiresAt)).toLocaleDateString('ar-EG')}</td></tr>`;
      }).join('');
    html = `<section class="card">
      <h2><i class="fas fa-qrcode" style="color:var(--blue);"></i> فتح جلسة حضور</h2>
      <form id="attForm" class="fields">
        <div><label>اسم المحاضرة</label><input name="sessionName" required></div>
        <div><label>المادة</label><input name="course" list="attendanceCourseList" required><datalist id="attendanceCourseList">${courseChoices.map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist></div>
        <div><label>الفرقة</label><select name="level">${LEVELS.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
        <div><label>كود الجلسة (PIN)</label><input name="code" value="${Math.floor(1000+Math.random()*9000)}" required></div>
        <div><label>مدة الجلسة (دقيقة)</label><input name="minutes" type="number" min="1" max="180" value="15" required></div>
        <button style="grid-column:1/-1;margin-top:10px;background:var(--green);">فتح جلسة</button>
      </form>
      <div id="attMsg" style="margin-top:10px;"></div>
      ${cache.activeAttendance && Date.now()<Number(cache.activeAttendance.expiresAt||0) ? `<section id="attendanceQrCard" class="attendance-qr-card" data-session-id="${esc(cache.activeAttendance.sessionId)}" data-expires-at="${Number(cache.activeAttendance.expiresAt)}">
        <div><span class="section-kicker">حضور المحاضرة</span><h3>${esc(cache.activeAttendance.sessionName||'جلسة حضور')}</h3><p class="muted">يتغير الرمز تلقائيًا. وجّه الطلاب لمسحه بكاميرا الهاتف.</p></div>
        <div class="attendance-qr-content"><canvas id="attendanceQrCanvas" width="240" height="240" aria-label="رمز تسجيل الحضور"></canvas><div id="attendanceQrMessage" class="muted">جارٍ تجهيز رمز الحضور…</div></div>
        <button type="button" class="danger" onclick="closeAttendanceSession()"><i class="fas fa-stop"></i> إيقاف الجلسة</button>
      </section>` : ''}
    </section>
    <section class="card"><h3>ملخص الجلسات المسجلة</h3><p class="muted">الغياب يُحسب من الجلسات التي انتهت بعد تفعيل تسجيل المادة والفرقة.</p>
      ${table(['المادة','الفرقة','المحاضرة','الحضور','الغياب','التاريخ'],sessionRows)}</section>
    <section class="card"><h3>حد تنبيه الغياب</h3><form id="attendanceThresholdForm" class="fields" style="max-width:480px"><div><label>تنبيه عند وصول نسبة الغياب إلى</label><input type="number" name="absenceAlertPercent" min="1" max="100" value="${Number(cache.activeAttendance?.absenceAlertPercent)||25}" required></div><button type="submit">حفظ النسبة</button></form></section>
    <section class="card"><h3>تصدير تقرير الحضور</h3><p class="muted">ينشئ كشفًا بحالة كل طالب في كل جلسة مكتملة. Excel ينزّل ملفًا، وPDF يفتح نافذة الطباعة.</p><div class="fields"><div><label>المادة</label><select id="attendanceExportCourse"><option value="">كل المواد</option>${[...new Set((cache.activeAttendance?.sessions||[]).map(s=>s.course).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar')).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></div><div><label>الفرقة</label><select id="attendanceExportLevel"><option value="">كل الفرق</option>${LEVELS.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div><div class="actions"><button type="button" id="attendanceExportBtn">تنزيل Excel</button><button type="button" class="secondary" onclick="printAttendanceReport()">PDF / طباعة</button></div></div></section>
    <section class="card">
      <h3>سجل الحضور</h3>
      ${table(['الطالب','الرقم','المادة','المحاضرة','الوقت'], cache.attendance.map(a=>`<tr>
        <td>${esc(a.studentName)}</td><td><code>${esc(a.studentId)}</code></td>
        <td>${esc(a.course||'—')}</td><td>${esc(a.sessionName)}</td>
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
      ${table(['الاسم','البريد','الصلاحية','إجراء'], cache.staff.map(st=>`<tr>
        <td><strong>${esc(st.name)}</strong></td><td>${esc(st.email)}</td>
        <td><span class="pill">${st.role==='admin'?'Super Admin':st.role==='finance'?'مالي':'أكاديمي'}</span></td>
        <td>${st.role==='admin'?'—':`<button type="button" class="secondary" onclick="editStaffPermissions('${st.uid}')"><i class="fas fa-user-lock"></i> تحديد الصلاحيات</button>`}</td>
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
    </section>${role==='admin'?`<section class="card">
      <h3><i class="fas fa-screwdriver-wrench" style="color:var(--blue);"></i> صيانة الموقع للطلاب</h3>
      <p class="muted">عند التفعيل، يرى الطلاب رسالة الصيانة وتتوقف عنهم صفحات وبيانات البوابة. يظل دخول الإدارة والمساعدين متاحًا.</p>
      <form id="siteMaintenanceForm" class="fields">
        <label class="maintenance-toggle"><input type="checkbox" name="maintenanceMode" ${cache.siteStatus?.maintenanceMode?'checked':''}> تفعيل وضع الصيانة</label>
        <div style="grid-column:1/-1"><label>الرسالة التي تظهر للطلاب</label><input name="message" maxlength="240" value="${esc(cache.siteStatus?.message||'نعمل على تحديث الموقع. يرجى المحاولة مرة أخرى لاحقًا.')}"></div>
        <button type="submit">حفظ حالة الموقع</button>
      </form><div id="siteMaintenanceMsg"></div>
    </section>`:''}`;
  }
  else if(activeTab==='logs' && (role==='admin'||role==='finance')){
    html = `<section class="card">
        <h2><i class="fas fa-history" style="color:var(--blue);"></i> سجل النشاطات</h2><p class="muted">استخدم البحث أعلى الجدول لتصفية السجل حسب المستخدم أو الإجراء أو التفاصيل.</p>
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
        <label style="font-weight:bold;color:var(--blue);"><i class="fas fa-file-upload"></i> استيراد الطلاب من Excel:</label>
        <p class="muted" style="margin:6px 0;">يقبل أسماء الأعمدة العربية أو الإنجليزية: الاسم، الرقم الجامعي، البريد، كلمة المرور، الفرقة، القسم، المصروفات، وصورة الطالب (اختياري كرابط مباشر). يمكن ترك البريد فارغًا ليُنشأ من الرقم الجامعي، وكلمة المرور الفارغة تُنشأ تلقائيًا.</p>
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
          <button type="button" class="secondary" onclick="exportFinanceExcel('all')">Excel</button><button type="button" class="secondary" onclick="printFinanceReport('all')">PDF</button>
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

    html = `${studentDashboardView(s,{totalFees,paidAmount,remaining,pendingTotal})}
      <h2 class="student-section-title">ملفي والمصروفات</h2>
    
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
          <div class="actions"><button class="secondary" onclick="printFullFinancialStatement()"><i class="fas fa-file-pdf"></i> تحميل كشف حساب</button><button class="secondary" onclick="exportFinanceExcel('mine')"><i class="fas fa-file-excel"></i> Excel</button></div>
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
      <div class="headrow"><h2><i class="fas fa-user-check" style="color:var(--blue);"></i> تسجيل الحضور</h2><div class="actions"><button type="button" class="secondary" onclick="exportMyAttendanceExcel()">Excel</button><button type="button" class="secondary" onclick="printMyAttendanceReport()">PDF / طباعة</button></div></div>
      <p class="muted">امسح رمز QR المعروض في المحاضرة بكاميرا الهاتف لتسجيل حضورك تلقائيًا. يمكنك استخدام كود المحاضر عند الحاجة.</p>
      <form id="studentAttForm" class="fields" style="max-width:400px;margin-bottom:20px;">
        <div><label>كود الحضور (PIN):</label><input name="pinCode" placeholder="كود المحاضر" required></div>
        <button style="background:var(--green);">تسجيل</button>
      </form>
      <div id="studentAttMsg"></div>
      ${renderStudentAttendanceSummary()}
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
      const activeStu = cache.students.find(s=>s.uid===selectedChatStudentUid);
      html = `<section class="card">
        <h2><i class="fas fa-comments" style="color:var(--blue);"></i> محادثات الطلاب</h2>
        <div class="fields" style="margin-bottom:15px;">
          <div><label for="adminChatSearch">ابحث عن الطالب بالاسم أو الرقم الجامعي</label><input id="adminChatSearch" type="search" autocomplete="off" placeholder="اكتب اسم الطالب أو رقمه" oninput="filterAdminChatStudents(this.value)"></div>
        </div>
        <div id="adminChatStudentResults" class="chat-student-results">اكتب اسم الطالب أو رقمه للبحث عن المحادثة.</div>
        <div class="chatbox-container">
          <div class="chat-conversation-heading"><strong>${esc(activeStu?.name||'اختر طالبًا لعرض المحادثة')}</strong>${activeStu?`<span>${esc(activeStu.studentId||'')}</span>`:''}${activeStu&&role==='admin'?`<button type="button" class="danger" onclick="deleteSelectedStudentConversation()"><i class="fas fa-trash"></i> حذف المحادثة للطرفين</button>`:''}</div>
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
  if(activeTab==='attendance' && isStaff) startAttendanceQrRefresh();
  else stopAttendanceQrRefresh();
}

/* ---------- Students Table ---------- */
function renderStudentsRows(list){
  return table(['الرقم','الاسم','الفرقة','المصروفات','إجراء'], list.map(s=>`<tr>
    <td>${esc(s.studentId)}</td><td>${esc(s.name)}</td><td>${esc(s.level)}</td>
    <td>${money(s.totalFees)}</td>
    <td><div class="actions">
      <button class="secondary" onclick="showStudentCard('${s.uid}')" style="background:#e0f2fe; color:#0369a1;"><i class="fas fa-id-card"></i> كارنيه</button>
      <button class="secondary" onclick="openEditStudentModal('${s.uid}')"><i class="fas fa-edit"></i></button>
      ${role==='admin'?`<button class="secondary" onclick="openStudentPasswordModal('${s.uid}')"><i class="fas fa-key"></i> كلمة المرور</button>`:''}
      <button class="danger" data-delete-student="${s.uid}"><i class="fas fa-trash"></i></button>
    </div></td>
  </tr>`).join(''));
}

/* ---------- Student ID Card (كارنيه الطالب) ---------- */
window.showStudentCard = function(uid) {
  const s = cache.students.find(x => x.uid === uid);
  if(!s) return;

  const html = `
    <div id="cardModal" class="modal-overlay active" onclick="if(event.target===this) this.classList.remove('active')" style="backdrop-filter: blur(5px);">
      <div class="modal-card" style="max-width:400px; padding:0; overflow:hidden; border-radius:20px; text-align:right;">
        <div style="background:linear-gradient(135deg, var(--blue), var(--blue2)); padding:20px; color:#fff; position:relative; text-align:center;">
          <div style="position:absolute; top:15px; left:15px; cursor:pointer; background:#ffffff30; padding:5px 10px; border-radius:8px;" onclick="document.getElementById('cardModal').remove()">
            <i class="fas fa-times"></i>
          </div>
          <div style="font-size:2.5rem; margin-bottom:5px;">🎓</div>
          <h3 style="margin:0; font-size:1.1rem;">معهد الدلتا العالي للحاسبات</h3>
          <p style="margin:0; font-size:0.8rem; opacity:0.8;">بطاقة هوية طالب (Student ID)</p>
        </div>
        <div style="padding:20px; background:#fff;">
          <div style="text-align:center; margin-top:-40px; margin-bottom:15px;">
            <div style="width:100px; height:100px; border-radius:50%; background:var(--bg); border:4px solid #fff; box-shadow:0 4px 10px rgba(0,0,0,0.1); display:inline-flex; align-items:center; justify-content:center; overflow:hidden;">
              ${s.photo ? `<img src="${s.photo}" style="width:100%; height:100%; object-fit:cover;">` : `<i class="fas fa-user" style="font-size:3rem; color:var(--muted);"></i>`}
            </div>
          </div>
          <div style="text-align:center; margin-bottom:15px;">
            <h2 style="margin:0 0 5px 0; color:var(--ink); font-size:1.3rem;">${esc(s.name)}</h2>
            <span class="pill" style="font-size:0.9rem; padding:5px 15px;">${esc(s.level)} - ${esc(s.department)}</span>
          </div>
          <table style="width:100%; font-size:0.9rem; border-collapse:collapse; margin-bottom:15px;">
            <tr>
              <td style="padding:6px; color:var(--muted); border-bottom:1px solid var(--line);">الرقم الجامعي:</td>
              <td style="padding:6px; font-weight:bold; border-bottom:1px solid var(--line); text-align:left;">${esc(s.studentId)}</td>
            </tr>
            <tr>
              <td style="padding:6px; color:var(--muted); border-bottom:1px solid var(--line);">الرقم المرجعي (UID):</td>
              <td style="padding:6px; font-family:monospace; font-weight:bold; border-bottom:1px solid var(--line); text-align:left; direction:ltr;">${s.uid}</td>
            </tr>
          </table>
          <div style="text-align:center; padding:10px; background:#f8fafc; border:1px dashed var(--line); border-radius:10px; margin-bottom:15px;">
            <svg id="studentBarcode" style="max-width:100%;"></svg>
            <p style="margin:5px 0 0 0; font-size:0.75rem; color:var(--muted); font-family:monospace;">${esc(s.studentId)}</p>
          </div>
          <div style="text-align:center; background:var(--pale); color:var(--muted); padding:8px; border-radius:8px; font-size:.8rem;">كلمة المرور سرية ولا تُعرض. لتغييرها استخدم «نسيت كلمة المرور» في شاشة الدخول.</div>
        </div>
        <div style="padding:15px; background:var(--bg); display:flex; gap:10px; border-top:1px solid var(--line);">
          <button class="secondary" style="flex:1;" onclick="window.print()"><i class="fas fa-print"></i> طباعة الكارنيه</button>
          <button style="flex:1; background:var(--green);" onclick="document.getElementById('cardModal').remove()"><i class="fas fa-check"></i> إغلاق</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => {
    if(window.JsBarcode) {
      JsBarcode("#studentBarcode", s.studentId, {
        format: "CODE128",
        lineColor: "#000",
        width: 2,
        height: 50,
        displayValue: false
      });
    }
  }, 100);
};

window.filterStudentsTable = function(){
  const q = $('#studentSearchInput')?.value.toLowerCase() || '';
  const lvl = $('#levelFilterSelect')?.value || '';
  const filtered = cache.students.filter(s =>
    ((s.name||'').toLowerCase().includes(q) || (s.studentId||'').toLowerCase().includes(q)) &&
    (!lvl || s.level === lvl)
  );
  $('#studentsTableWrap').innerHTML = renderStudentsRows(filtered);
};

window.exportStudentsToCSV = function(){
  let csv = "الرقم الجامعي,الاسم,البريد,الفرقة,المصروفات\n";
  cache.students.forEach(s => {
    csv += `"${s.studentId}","${s.name}","${s.email||''}","${s.level}","${s.totalFees}"\n`;
  });
  const blob = new Blob(["\ufeff"+csv], { type:'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'طلاب_الدلتا.csv';
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

const genPw=()=>{const pools=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghijkmnopqrstuvwxyz','23456789','!@#$%&*'],pool=pools.join(''),pick=s=>s[crypto.getRandomValues(new Uint32Array(1))[0]%s.length],a=[...pools.map(pick),...Array.from({length:12},()=>pick(pool))];for(let i=a.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a.join('')};
async function createStudentAccount(d,pw){
  const secApp=initializeApp(firebaseConfig,'imp-'+Date.now()+Math.random()),secAuth=getAuth(secApp);
  try{
    const c=await createUserWithEmailAndPassword(secAuth,d.email,pw);
    await setDoc(doc(db,'users',c.user.uid),{role:'student',name:d.name,email:d.email,mustChangePassword:true});
    await setDoc(doc(db,'students',c.user.uid),{studentId:d.studentId,name:d.name,email:d.email,level:d.level,department:d.department,totalFees:d.totalFees,paidAmount:0,photo:d.photo||'',createdAt:serverTimestamp()});
  }finally{ await signOut(secAuth).catch(()=>{}); deleteApp(secApp); }
}
window.importStudentsFromExcel=function(event){
  const file=event.target.files[0]; if(!file) return;
  const normKey=value=>String(value??'').trim().toLowerCase().normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[\s_\-()]+/g,'');
  const reader=new FileReader();
  reader.onload=async ev=>{
    let rows; try{
      const wb=XLSX.read(new Uint8Array(ev.target.result),{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]];
      const grid=XLSX.utils.sheet_to_json(ws,{header:1,defval:''}),headers=grid[0]||[];
      const photoColumn=headers.findIndex(h=>['photo','صورةالطالب','صورةالطالبلكرنية','رابطالصورة'].includes(normKey(h)));
      rows=grid.slice(1).map((cells,index)=>{
        const row=Object.fromEntries(headers.map((header,col)=>[header,cells[col]??'']));
        if(photoColumn>=0){
          const key=headers[photoColumn],cell=ws[XLSX.utils.encode_cell({r:index+1,c:photoColumn})];
          if(!row[key]&&cell?.l?.Target) row[key]=cell.l.Target;
        }
        return row;
      }).filter(row=>Object.values(row).some(value=>String(value??'').trim()!==''));
    }
    catch(err){ showToast('خطأ في قراءة الملف','error'); event.target.value=''; return; }
    if(rows.length>200){ showToast('الحد الأقصى 200 طالب في الملف الواحد','error'); event.target.value=''; return; }
    let ok=0,skip=0,fail=0; const creds=[['studentId','email','tempPassword']];
    const getField=(row,aliases)=>{const wanted=new Set(aliases.map(normKey));const key=Object.keys(row).find(k=>wanted.has(normKey(k)));return key===undefined?'':row[key];};
    const seenIds=new Set(cache.students.map(s=>String(s.studentId)));
    const previewIds=new Set(seenIds);let validPreview=0;
    for(const r of rows){
      const id=String(getField(r,['studentId','student_id','id','الرقم الجامعي','رقم الطالب','رقم ID'])||'').trim();
      const name=String(getField(r,['name','الاسم','اسم الطالب'])||'').trim();
      const email=String(getField(r,['email','البريد','البريد الإلكتروني'])||`${id}@al.es.net`).trim();
      const feesRaw=getField(r,['totalFees','fees','المصروفات','إجمالي المصروفات']),fees=feesRaw===''?15000:Number(feesRaw);
      if(id&&name&&/^\S+@\S+\.\S+$/.test(email)&&!previewIds.has(id)&&Number.isFinite(fees)&&fees>=0){validPreview++;previewIds.add(id);}
    }
    if(!validPreview){showToast('لم يتم العثور على صفوف صالحة للاستيراد','error');event.target.value='';return;}
    if(!confirm(`معاينة الاستيراد:\nعدد الصفوف: ${rows.length}\nصفوف صالحة مبدئيًا: ${validPreview}\nسيتم تجاوز الصفوف الناقصة أو المكررة. هل تريد المتابعة؟`)){event.target.value='';return;}
    for(const r of rows){
      const studentId=String(getField(r,['studentId','student_id','id','الرقم الجامعي','رقم الطالب','رقم ID'])||'').trim();
      const fees=getField(r,['totalFees','fees','المصروفات','إجمالي المصروفات']);
      const d={studentId,name:String(getField(r,['name','الاسم','اسم الطالب'])||'').trim(),email:String(getField(r,['email','البريد','البريد الإلكتروني'])||`${studentId}@al.es.net`).trim(),level:String(getField(r,['level','الفرقة','السنة الدراسية'])||'الفرقة الأولى').trim(),department:String(getField(r,['department','القسم','التخصص'])||'نظم المعلومات').trim(),totalFees:fees===''?15000:Number(fees),photo:String(getField(r,['photo','صورة الطالب','صورة الطالب (للكرنية)','رابط الصورة'])||'').trim()};
      const importedPassword=String(getField(r,['password','tempPassword','كلمة المرور','كلمة السر'])||'').trim();
      if(!d.studentId||!d.name||!/^\S+@\S+\.\S+$/.test(d.email)||seenIds.has(d.studentId)||!Number.isFinite(d.totalFees)||d.totalFees<0){ skip++; continue; }
      if(d.photo.length>700000|| (d.photo&&!/^(https:\/\/|data:image\/(?:jpeg|png|webp);base64,)/i.test(d.photo))){skip++;continue;}
      seenIds.add(d.studentId);
      const pw=importedPassword||genPw();
      try{ await createStudentAccount(d,pw); creds.push([d.studentId,d.email,pw]); ok++; showToast(`جاري الإنشاء... ${ok}`); }catch(err){ fail++; }
    }
    if(ok){ const blob=new Blob(["\ufeff"+creds.map(c=>c.join(',')).join('\n')],{type:'text/csv;charset=utf-8;'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='كلمات_المرور_المؤقتة.csv'; document.body.appendChild(a); a.click(); a.remove(); }
    logAction('استيراد طلاب',`${ok} طالب`);
    alert(`تم إنشاء ${ok} حساب. تخطي ${skip} (بيانات ناقصة أو إيميل غير صحيح أو رقم مكرر). فشل ${fail}.\n${ok?'تم تنزيل ملف كلمات المرور المؤقتة: سلّمها للطلاب ثم احذف الملف. كل طالب سيُطلب منه تغييرها عند أول دخول.':''}`);
    event.target.value=''; await loadData(); renderApp();
  };
  reader.readAsArrayBuffer(file);
};

window.downloadOfficialTranscript = function(){
  if(!window.jspdf){ showToast('مكتبة PDF غير محمّلة', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const s = cache.students[0] || {};
  doc.text("Delta Higher Institute for Computers", 105, 20, { align: 'center' });
  doc.text("Official Academic Transcript", 105, 28, { align: 'center' });
  doc.text(`Student Name: ${s.name || ''}`, 20, 45);
  doc.text(`Student ID: ${s.studentId || ''}`, 20, 55);
  doc.text(`Level: ${s.level || ''}`, 20, 65);
  let y = 80;
  doc.text("Course Name", 20, y);
  doc.text("Score", 120, y);
  doc.text("Grade", 160, y);
  cache.results.forEach(r => {
    y += 10;
    doc.text(String(r.course), 20, y);
    doc.text(String(r.score)+" / 100", 120, y);
    doc.text(String(grade(r.score)), 160, y);
  });
  doc.save(`Transcript_${s.studentId || 'Student'}.pdf`);
  showToast('تم تحميل كشف الدرجات');
};

function newsCards(admin){
  const sorted = cache.news.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  if(!sorted.length) return `<section class="card muted">لا توجد أخبار.</section>`;
  return sorted.map(n=>`<section class="card">
    <div class="headrow"><h3>${esc(n.title)}</h3><span class="pill">${esc(n.date||'')}</span></div>
    <p>${esc(n.body)}</p>
    ${admin?`<div class="actions" style="margin-top:10px;">
      <button class="secondary" onclick="editNewsModal('${n.id}')"><i class="fas fa-edit"></i> تعديل</button>
      <button class="danger" data-delete="news" data-id="${n.id}"><i class="fas fa-trash"></i></button>
    </div>`:''}
  </section>`).join('');
}

async function logAction(action, details){
  try {
    await addDoc(collection(db,'audit_logs'), {
      adminEmail: user?.email || 'النظام',
      action, details, createdAt: serverTimestamp()
    });
  } catch {}
}

let activeChart = null;
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
  $('#ownPasswordForm')?.addEventListener('submit', changeOwnPassword);
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
  const now=Date.now(),expiresAt=now+Number(d.minutes||15)*60000;
  const sessionId=`${now}-${Math.random().toString(36).slice(2,8)}`;
  const sessionName=String(d.sessionName||'').trim(),course=String(d.course||'').trim(),level=String(d.level||'').trim();
  if(!sessionName||!course||!level){showToast('أدخل اسم المحاضرة والمادة والفرقة','error');return;}
  if(cache.activeAttendance&&Number(cache.activeAttendance.expiresAt||0)>now){showToast('أوقف جلسة الحضور الحالية أولاً','error');return;}
  try{
    const priorSessions=Array.isArray(cache.activeAttendance?.sessions)?cache.activeAttendance.sessions:[];
    const session={sessionId,sessionName,course,level,createdAt:now,expiresAt,status:'open'};
    const publicData={sessionName,course,level,sessionId,expiresAt,absenceAlertPercent:Number(cache.activeAttendance?.absenceAlertPercent)||25,sessions:[...priorSessions,session].slice(-1000)};
    const batch=writeBatch(db);
    batch.set(doc(db,'settings','active_attendance'),{code:String(d.code).trim(),sessionId,createdAt:serverTimestamp()});
    batch.set(doc(db,'settings','attendance_public'),publicData);
    await batch.commit();
    cache.activeAttendance=publicData;
    logAction('فتح حضور',`${course} — ${level}`); showToast('تم فتح الجلسة');
    await loadData(); renderApp();
  }catch(err){showToast(err.message,'error');}
}

async function saveAttendanceThreshold(e){
  e.preventDefault();
  const percent=Number(new FormData(e.currentTarget).get('absenceAlertPercent'));
  if(!(percent>=1&&percent<=100)){showToast('أدخل نسبة بين 1 و100','error');return;}
  try{
    await setDoc(doc(db,'settings','attendance_public'),{absenceAlertPercent:percent},{merge:true});
    cache.activeAttendance={...(cache.activeAttendance||{}),absenceAlertPercent:percent};
    showToast('تم حفظ حد تنبيه الغياب');renderApp();
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
    await setDoc(doc(db,'attendance',a.sessionId+'_'+user.uid),{studentUid:user.uid,studentName:s.name,studentId:s.studentId,sessionName:a.sessionName,course:a.course||'',level:a.level||'',sessionId:a.sessionId,pin:String(d.pinCode).trim(),createdAt:serverTimestamp()});
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


/* ---------- تحسينات: تغيير كلمة المرور الإجباري، خمول، اتصال، تقويم ---------- */
function showForcePasswordChange(){
  $('#headerActions').innerHTML='<button class="secondary" onclick="signOut_()">تسجيل الخروج</button>';
  $('#app').innerHTML=`<section class="card loginbox"><h2><i class="fas fa-key"></i> تغيير كلمة المرور</h2>
    <p class="muted">أهلاً بك. لأسباب أمنية لازم تختار كلمة مرور جديدة قبل المتابعة (8 أحرف على الأقل).</p>
    <form id="pwForm"><label>كلمة المرور الجديدة</label><input id="pw1" type="password" minlength="8" required autocomplete="new-password">
    <label style="margin-top:10px;">تأكيد كلمة المرور</label><input id="pw2" type="password" minlength="8" required autocomplete="new-password">
    <div id="pwMsg" style="margin-top:10px;"></div><button style="width:100%;margin-top:14px;">حفظ ومتابعة</button></form></section>`;
  $('#pwForm').onsubmit=async e=>{
    e.preventDefault(); const a=$('#pw1').value,b=$('#pw2').value,box=$('#pwMsg');
    if(a!==b){box.innerHTML=msg('كلمتا المرور غير متطابقتين','error');return}
    try{
      await updatePassword(user,a);
      await updateDoc(doc(db,'users',user.uid),{mustChangePassword:false});
      profile.mustChangePassword=false; showToast('تم تغيير كلمة المرور'); await loadData(); await handleAttendanceQr(); renderApp();
    }catch(err){
      box.innerHTML=msg(err.code==='auth/requires-recent-login'?'انتهت صلاحية الجلسة، سجّل الدخول من جديد ثم أعد المحاولة':err.code==='auth/weak-password'?'كلمة المرور ضعيفة':err.message,'error');
    }
  };
}
window.signOut_=()=>signOut(auth);

let idleTimer; const IDLE_MS=15*60*1000;
function resetIdle(){ clearTimeout(idleTimer); if(user) idleTimer=setTimeout(()=>{ showToast('تم تسجيل الخروج لعدم النشاط','error'); signOut(auth); },IDLE_MS); }
['click','keydown','touchstart','mousemove'].forEach(ev=>document.addEventListener(ev,resetIdle,{passive:true}));

function netBanner(){
  let b=$('#netBanner');
  if(!b){ b=document.createElement('div'); b.id='netBanner'; b.textContent='لا يوجد اتصال بالإنترنت — قد لا تكون البيانات محدّثة';
    b.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#c0392b;color:#fff;text-align:center;padding:6px;z-index:10001;font-weight:700;display:none'; document.body.appendChild(b); }
  b.style.display=navigator.onLine?'none':'block';
}
addEventListener('online',netBanner); addEventListener('offline',netBanner); netBanner();

window.exportExamsICS=()=>{
  const s=cache.students[0]||{}, ex=cache.exams.filter(e=>!e.level||e.level===s.level);
  if(!ex.length){ showToast('لا توجد امتحانات للتصدير','error'); return; }
  const pad=n=>String(n).padStart(2,'0'), q=t=>String(t||'').replace(/([,;\\])/g,'\\$1').replace(/\n/g,'\\n');
  const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
  const ev=ex.map((e,i)=>{
    const [y,m,d]=String(e.date).split('-').map(Number), [hh,mm]=String(e.time||'09:00').split(':').map(Number);
    return ['BEGIN:VEVENT',`UID:delta-exam-${e.id||i}@delta-portal`,`DTSTAMP:${stamp}`,
      `DTSTART:${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`,`DTEND:${y}${pad(m)}${pad(d)}T${pad((hh+2)%24)}${pad(mm)}00`,
      `SUMMARY:${q('امتحان '+e.course)}`,`LOCATION:${q(e.hall)}`,'END:VEVENT'].join('\r\n');
  });
  const blob=new Blob(['BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Delta//Exams//AR\r\n'+ev.join('\r\n')+'\r\nEND:VCALENDAR'],{type:'text/calendar;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='exams.ics'; document.body.appendChild(a); a.click(); a.remove();
};

/* ---------- الجدول الأسبوعي + طلبات الطلاب (تظلمات وشهادات) ---------- */
const DAYS=['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة'];
const LEVELS=['الفرقة الأولى','الفرقة الثانية','الفرقة الثالثة','الفرقة الرابعة'];
const REQ_TYPES=['تظلم من نتيجة','شهادة قيد','إفادة التحاق','كشف درجات رسمي','استفسار مالي','أخرى'];
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
function reqPill(t){const c=t==='قيد المراجعة'||t==='قيد التنفيذ'?['#fef3c7','#92400e']:t==='مرفوض'?['#fee2e2','#991b1b']:['#d1fae5','#065f46'];return `<span class="pill" style="background:${c[0]};color:${c[1]};">${esc(t)}</span>`;}
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
      .map(r=>`<tr><td><code>${esc(r.trackingNo||'REQ-'+r.id.toUpperCase())}</code></td><td><b>${esc(r.studentName)}</b><br><small class="muted">${esc(r.studentId)}</small></td><td>${esc(r.customType||r.type)}</td><td>${esc(r.details)}</td><td>${reqPill(r.status)}</td><td>${esc(r.reply||'—')}</td>
      <td>${['مرفوض','جاهز للاستلام','تم القبول'].includes(r.status)?'—':`<div class="actions"><button class="secondary" style="padding:5px 10px;font-size:.8rem;" onclick="setRequestStatus('${r.id}','قيد التنفيذ')">قيد التنفيذ</button><button style="background:var(--green);padding:5px 10px;font-size:.8rem;" onclick="setRequestStatus('${r.id}','تم القبول')">قبول</button><button class="secondary" style="padding:5px 10px;font-size:.8rem;" onclick="setRequestStatus('${r.id}','جاهز للاستلام')">جاهز</button><button class="danger" style="padding:5px 10px;font-size:.8rem;" onclick="setRequestStatus('${r.id}','مرفوض')">رفض</button></div>`}</td></tr>`).join('');
    return `<section class="card"><h2><i class="fas fa-inbox" style="color:var(--blue)"></i> الطلبات الإلكترونية</h2>${table(['رقم المتابعة','الطالب','النوع','التفاصيل','الحالة','الرد','إجراء'],rows)}</section>`;
  }
  if(activeTab==='myrequests'&&role==='student'){
    const rows=(cache.requests||[]).slice().sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))
      .map(r=>`<tr><td><code>${esc(r.trackingNo||'REQ-'+r.id.toUpperCase())}</code></td><td>${esc(r.customType||r.type)}</td><td>${esc(r.details)}</td><td>${reqPill(r.status)}</td><td>${esc(r.reply||'—')}</td><td>${r.handledAt?.toDate?r.handledAt.toDate().toLocaleDateString('ar-EG'):'—'}</td></tr>`).join('');
    return `<section class="card"><h2><i class="fas fa-file-signature" style="color:var(--blue)"></i> تقديم طلب جديد</h2>
      <form id="requestForm"><label>نوع الطلب</label><select name="type" style="margin-bottom:10px;">${REQ_TYPES.map(t=>`<option>${t}</option>`).join('')}</select>
      <label>التفاصيل (للتظلم: اسم المادة وسبب التظلم)</label><textarea name="details" rows="3" maxlength="1000" required style="margin-bottom:10px;"></textarea><button>إرسال الطلب</button></form></section>
      <section class="card"><h3>طلباتي السابقة</h3>${table(['رقم المتابعة','النوع','التفاصيل','الحالة','رد الإدارة','تاريخ التحديث'],rows)}</section>`;
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
  try{ const requestRef=doc(collection(db,'requests')),trackingNo='REQ-'+requestRef.id.toUpperCase(),customType=d.type==='استفسار مالي'?d.type:'';
    await setDoc(requestRef,{trackingNo,studentUid:user.uid,studentId:s.studentId,studentName:s.name,type:customType?'أخرى':d.type,customType,details:d.details.trim(),status:'قيد المراجعة',reply:'',createdAt:serverTimestamp()});
    showToast(`تم إرسال الطلب — رقم المتابعة: ${trackingNo}`); await loadData(); renderApp();
  }catch(err){ showToast(authError(err),'error'); }
}
window.setRequestStatus=async(id,status)=>{
  const r=cache.requests.find(x=>x.id===id); if(!r) return;
  const reply=prompt('ملاحظة للطالب (اختياري):',''); if(reply===null) return;
  try{ await updateDoc(doc(db,'requests',id),{status,reply:reply.trim(),handledBy:user.email,handledAt:serverTimestamp()});
    logAction('معالجة طلب',`${r.type} - ${r.studentName} - ${status}`); showToast('تم التحديث'); await loadData(); renderApp();
  }catch(err){ showToast(authError(err),'error'); }
};

/* ---------- نتائج بفصول وساعات معتمدة + رفع Excel + كشف درجات ---------- */
const SEMS=['الفصل الأول','الفصل الثاني','الفصل الصيفي'];
const gp=sc=>sc>=90?4:sc>=85?3.7:sc>=80?3.3:sc>=75?3:sc>=70?2.7:sc>=65?2.4:sc>=60?2:sc>=50?1:0;
function calcGpa(list){let q=0,c=0;list.forEach(r=>{const cr=Number(r.credits)||3;q+=gp(Number(r.score))*cr;c+=cr});return {gpa:c?q/c:0,credits:c};}
function groupSem(list){const g={};list.forEach(r=>{const k=(r.year||'—')+'|'+(r.semester||'غير محدد');(g[k]=g[k]||[]).push(r)});return Object.keys(g).sort().map(k=>({year:k.split('|')[0],semester:k.split('|')[1],items:g[k]}));}
function acYear(){const d=new Date(),y=d.getMonth()>=8?d.getFullYear():d.getFullYear()-1;return `${y}/${y+1}`;}
let gradesQueue=[];
function gradesView(){
  const ok=gradesQueue.filter(r=>!r.err).length;
  if(!gradesQueue.length) return '';
  return `<p>تمت قراءة ${gradesQueue.length} صف: <b class="ok" style="color:var(--green)">${ok} صالح</b> — <b style="color:var(--red)">${gradesQueue.length-ok} به أخطاء</b></p>`+
   table(['صف','الرقم الجامعي','المادة','السنة/الفصل','الساعات','الدرجة','الحالة'],gradesQueue.map(r=>`<tr><td>${r.n}</td><td>${esc(r.sid)}</td><td>${esc(r.course)}</td><td>${esc(r.year)} ${esc(r.semester)}</td><td>${r.credits}</td><td>${r.score}</td><td style="color:${r.err?'var(--red)':'var(--green)'}">${esc(r.err||'جاهز')}</td></tr>`).join(''))+
   `<p>${ok?`<button onclick="applyGrades()">اعتماد ${ok} درجة</button> `:''}<button class="secondary" onclick="gradesQueue=[];$('#gradesPreview').innerHTML=''">إلغاء</button></p>`;
}
window.previewGradesExcel=inp=>{
  const f=inp.files[0]; if(!f) return; const rd=new FileReader();
  rd.onload=e=>{ try{
    const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''}).slice(1).filter(r=>r.some(c=>String(c).trim()!==''));
    const seen=new Set();
    gradesQueue=rows.map((r,i)=>{
      const o={n:i+2,sid:String(r[0]).trim(),course:String(r[1]).trim(),year:String(r[2]).trim(),semester:String(r[3]).trim(),credits:Number(r[4]),score:Number(r[5]),raw:String(r[5]).trim()};
      o.stu=cache.students.find(x=>String(x.studentId)===o.sid);
      if(!o.stu) o.err='رقم جامعي غير مسجل';
      else if(!o.course||!o.year) o.err='المادة أو السنة فارغة';
      else if(!SEMS.includes(o.semester)) o.err='الفصل غير صحيح';
      else if(!(o.credits>=1&&o.credits<=6)) o.err='الساعات من 1 إلى 6';
      else if(o.raw===''||!(o.score>=0&&o.score<=100)) o.err='الدرجة من 0 إلى 100';
      else{ const k=[o.sid,o.course,o.year,o.semester].join('|'); if(seen.has(k)) o.err='مكرر في الملف'; seen.add(k); }
      return o; });
    $('#gradesPreview').innerHTML=gradesView();
  }catch(err){ showToast('تعذر قراءة الملف','error'); } inp.value=''; };
  rd.readAsArrayBuffer(f);
};
window.applyGrades=async()=>{
  let add=0,upd=0,fail=0;
  for(const r of gradesQueue.filter(x=>!x.err)){
    const ex=cache.results.find(x=>x.studentUid===r.stu.uid&&x.course===r.course&&x.year===r.year&&x.semester===r.semester);
    try{
      if(ex){ await updateDoc(doc(db,'results',ex.id),{score:r.score,credits:r.credits}); upd++; }
      else{ await addDoc(collection(db,'results'),{studentUid:r.stu.uid,studentId:r.stu.studentId,studentName:r.stu.name,course:r.course,year:r.year,semester:r.semester,credits:r.credits,score:r.score,createdAt:serverTimestamp()}); add++; }
    }catch(err){ fail++; }
  }
  logAction('رفع درجات Excel',`إضافة ${add} / تحديث ${upd}`); gradesQueue=[];
  showToast(`تم: إضافة ${add} وتحديث ${upd}${fail?` (فشل ${fail})`:''}`); await loadData(); renderApp();
};
window.printTranscript=()=>{
  const s=cache.students[0]||{}, all=cache.results, tot=calcGpa(all);
  let el=$('#printable-receipt'); if(!el){ el=document.createElement('div'); el.id='printable-receipt'; document.body.appendChild(el); }
  const blocks=groupSem(all).map(g=>{const c=calcGpa(g.items);
    return `<h4 style="margin:14px 0 4px">${esc(g.year)} — ${esc(g.semester)}</h4><table style="width:100%;min-width:0;border-collapse:collapse" border="1" cellpadding="5"><tr><th>المادة</th><th>الساعات</th><th>الدرجة</th><th>التقدير</th><th>النقاط</th></tr>${g.items.map(r=>`<tr><td>${esc(r.course)}</td><td>${Number(r.credits)||3}</td><td>${Number(r.score)}</td><td>${grade(Number(r.score))}</td><td>${gp(Number(r.score)).toFixed(1)}</td></tr>`).join('')}</table><p>معدل الفصل: <b>${c.gpa.toFixed(2)}</b> — ساعات: ${c.credits}</p>`;}).join('');
  el.innerHTML=`<div style="color:#000;background:#fff;padding:24px;font-family:Cairo,Tahoma,sans-serif;max-width:760px;margin:auto"><h2 style="text-align:center;color:#174ea6;margin:0">معهد الدلتا العالي للحاسبات</h2><h3 style="text-align:center">كشف درجات</h3><p>الاسم: <b>${esc(s.name)}</b> — الرقم الجامعي: <b>${esc(s.studentId)}</b><br>الفرقة: ${esc(s.level)} — القسم: ${esc(s.department)}</p>${blocks||'<p>لا توجد نتائج.</p>'}<h3>المعدل التراكمي: ${tot.gpa.toFixed(2)} / 4.0 — إجمالي الساعات: ${tot.credits}</h3><p style="font-size:.8rem;color:#555">نسخة إلكترونية للاطلاع صادرة بتاريخ ${new Date().toLocaleDateString('en-CA')}، وليست كشفاً رسمياً بدون ختم إدارة الشؤون الأكاديمية.</p></div>`;
  window.print();
};
function resultsViews(staff,st){
  if(activeTab==='results'&&staff){
    return `<section class="card"><div class="headrow"><h2>رصد النتائج</h2><div class="actions"><button type="button" class="secondary" onclick="exportResultsExcel('all')">Excel</button><button type="button" class="secondary" onclick="printResultsReport('all')">PDF</button></div></div><form id="resultForm" class="fields">
      <div><label>الطالب</label><select name="studentUid" required>${cache.students.map(s=>`<option value="${s.uid}">${esc(s.studentId)} — ${esc(s.name)}</option>`).join('')}</select></div>
      <div><label>المادة</label><input name="course" required></div>
      <div><label>السنة الدراسية</label><input name="year" value="${acYear()}" required></div>
      <div><label>الفصل</label><select name="semester">${SEMS.map(x=>`<option>${x}</option>`).join('')}</select></div>
      <div><label>الساعات المعتمدة</label><input name="credits" type="number" min="1" max="6" value="3" required></div>
      <div><label>الدرجة</label><input name="score" type="number" min="0" max="100" required></div>
      <button ${cache.students.length?'':'disabled'} style="margin-top:10px;">حفظ</button></form></section>
      <section class="card"><h3><i class="fas fa-file-excel"></i> رفع درجات من Excel</h3><p class="muted">الصف الأول عناوين، والأعمدة بالترتيب: الرقم الجامعي | المادة | السنة (2025/2026) | الفصل (الفصل الأول/الفصل الثاني/الفصل الصيفي) | الساعات | الدرجة</p>
      <input type="file" accept=".xlsx,.xls,.csv" onchange="previewGradesExcel(this)"><div id="gradesPreview" style="margin-top:10px;">${gradesView()}</div></section>
      <section class="card"><h3>البحث عن نتيجة طالب</h3><label for="adminResultsSearch">ابحث باسم الطالب أو الرقم الجامعي</label>
        <input id="adminResultsSearch" type="search" autocomplete="off" placeholder="اكتب الاسم أو الرقم الجامعي" oninput="searchAdminResults(this.value)">
        <div id="adminResultsSearchResults" class="muted" style="margin-top:12px;">اكتب اسم الطالب أو رقمه لعرض نتائجه.</div>
      </section>`;
  }
  if(activeTab==='myresults'&&role==='student'){
    const all=cache.results, tot=calcGpa(all), earned=all.filter(r=>Number(r.score)>=50).reduce((a,r)=>a+(Number(r.credits)||3),0);
    const sems=groupSem(all).map(g=>{const c=calcGpa(g.items);
      return `<section class="card"><div class="headrow"><h3>${esc(g.year)} — ${esc(g.semester)}</h3><span class="pill">معدل الفصل ${c.gpa.toFixed(2)}</span></div>${table(['المادة','الساعات','الدرجة','التقدير','النقاط'],g.items.map(r=>`<tr><td>${esc(r.course)}</td><td>${Number(r.credits)||3}</td><td>${Number(r.score)} / 100</td><td>${grade(Number(r.score))}</td><td>${gp(Number(r.score)).toFixed(1)}</td></tr>`).join(''))}</section>`;}).join('');
    return `<div class="headrow"><h2>نتائجي</h2><div class="actions"><button style="background:var(--green);" onclick="printTranscript()"><i class="fas fa-file-pdf"></i> كشف الدرجات PDF</button><button class="secondary" onclick="exportResultsExcel('mine')"><i class="fas fa-file-excel"></i> Excel</button></div></div>
      <div class="grid">${stat('المعدل التراكمي',tot.gpa.toFixed(2)+' / 4.0')}${stat('الساعات المسجلة',tot.credits)}${stat('الساعات المكتسبة',earned)}</div>`+
      (sems||'<section class="card muted">لا توجد نتائج.</section>')+(all.some(r=>!r.credits)?'<p class="muted">النتائج القديمة بدون ساعات تُحتسب 3 ساعات.</p>':'');
  }
  return null;
}

/* ---------- المواد وتسجيل الطلاب ---------- */
function regState(){const r=cache.regSettings||{};return {open:!!r.open,year:r.year||acYear(),semester:r.semester||SEMS[0],max:Number(r.maxCredits)||18};}
const openPill=o=>o?'<span class="pill" style="background:#d1fae5;color:#065f46;">مفتوح</span>':'<span class="pill" style="background:#fee2e2;color:#991b1b;">مغلق</span>';
function courseViews(staff,st){
  const rs=regState(), regs=cache.registrations||[], crs=cache.courses||[];
  if(activeTab==='courses'&&staff){
    const cnt=id=>regs.filter(x=>x.courseId===id&&x.year===rs.year&&x.semester===rs.semester).length;
    const rows=crs.slice().sort((a,b)=>String(a.level).localeCompare(b.level)||String(a.code).localeCompare(b.code)).map(c=>`<tr><td><code>${esc(c.code)}</code></td><td>${esc(c.name)}</td><td>${esc(c.level)}</td><td>${esc(c.semester)}</td><td>${c.credits}</td><td>${cnt(c.id)}</td><td><button class="danger" data-delete="courses" data-id="${c.id}"><i class="fas fa-trash"></i></button></td></tr>`).join('');
    return `<section class="card"><h2>التسجيل حالياً: ${openPill(rs.open)}</h2><form id="regSettingsForm" class="fields">
      <div><label>السنة الدراسية</label><input name="year" value="${esc(rs.year)}" required></div>
      <div><label>الفصل</label><select name="semester">${SEMS.map(x=>`<option ${x===rs.semester?'selected':''}>${x}</option>`).join('')}</select></div>
      <div><label>الحد الأقصى للساعات</label><input name="maxCredits" type="number" min="1" max="30" value="${rs.max}" required></div>
      <div><label><input type="checkbox" name="open" ${rs.open?'checked':''} style="width:auto"> فتح التسجيل للطلاب</label></div>
      <button style="margin-top:10px;">حفظ الإعدادات</button></form></section>
      <section class="card"><h3>إضافة مادة</h3><form id="courseForm" class="fields">
      <div><label>الكود</label><input name="code" required></div><div><label>اسم المادة</label><input name="name" required></div>
      <div><label>الساعات</label><input name="credits" type="number" min="1" max="6" value="3" required></div>
      <div><label>الفرقة</label><select name="level">${LEVELS.map(x=>`<option>${x}</option>`).join('')}</select></div>
      <div><label>الفصل</label><select name="semester">${SEMS.map(x=>`<option>${x}</option>`).join('')}</select></div>
      <button style="margin-top:10px;">إضافة</button></form></section>
      <section class="card"><div class="headrow"><h3>المواد (المسجلون في ${esc(rs.year)} ${esc(rs.semester)})</h3><button class="secondary" onclick="exportRegCSV()"><i class="fas fa-file-excel"></i> تصدير التسجيلات</button></div>${table(['الكود','المادة','الفرقة','الفصل','الساعات','المسجلون','إجراء'],rows)}</section>`;
  }
  if(activeTab==='myregistration'&&role==='student'){
    const mine=regs.filter(x=>x.year===rs.year&&x.semester===rs.semester), used=mine.reduce((a,x)=>a+Number(x.credits||0),0);
    const passed=new Set((cache.results||[]).filter(r=>Number(r.score)>=50).map(r=>String(r.course).trim().toLowerCase()));
    const avail=crs.filter(c=>c.level===st.level&&c.semester===rs.semester&&!mine.some(x=>x.courseId===c.id));
    const rowsA=avail.map(c=>{const done=passed.has(String(c.name).trim().toLowerCase());return `<tr><td><code>${esc(c.code)}</code></td><td>${esc(c.name)}</td><td>${c.credits}</td><td>${done?'<span class="muted">ناجح فيها</span>':rs.open?`<button style="padding:5px 10px;font-size:.8rem;" onclick="registerCourse('${c.id}')">تسجيل</button>`:'—'}</td></tr>`;}).join('');
    const rowsM=mine.map(x=>`<tr><td><code>${esc(x.courseCode)}</code></td><td>${esc(x.courseName)}</td><td>${x.credits}</td><td>${rs.open?`<button class="danger" style="padding:5px 10px;font-size:.8rem;" onclick="dropCourse('${x.id}')">إلغاء</button>`:'—'}</td></tr>`).join('');
    return `<h2>تسجيل المواد — ${esc(rs.year)} ${esc(rs.semester)} ${openPill(rs.open)}</h2>${rs.open?'':msg('التسجيل مغلق حالياً.','error')}
      <div class="grid">${stat('ساعاتي المسجلة',used+' / '+rs.max)}${stat('عدد المواد',mine.length)}</div>
      <section class="card"><h3>موادي المسجلة</h3>${table(['الكود','المادة','الساعات','إجراء'],rowsM)}</section>
      <section class="card"><h3>المواد المتاحة لفرقتك (${esc(st.level||'')})</h3>${table(['الكود','المادة','الساعات','إجراء'],rowsA)}</section>`;
  }
  return null;
}
async function saveRegSettings(e){
  e.preventDefault(); const f=e.currentTarget,d=Object.fromEntries(new FormData(f).entries());
  try{ await setDoc(doc(db,'settings','registration'),{open:!!f.open.checked,year:d.year.trim(),semester:d.semester,maxCredits:Number(d.maxCredits)});
    logAction('إعدادات التسجيل',`${d.year} ${d.semester} ${f.open.checked?'مفتوح':'مغلق'}`); showToast('تم الحفظ'); await loadData(); renderApp();
  }catch(err){ showToast(authError(err),'error'); }
}
async function addCourse(e){
  e.preventDefault(); const d=Object.fromEntries(new FormData(e.currentTarget).entries()), cr=Number(d.credits);
  if(!(cr>=1&&cr<=6)){ showToast('الساعات من 1 إلى 6','error'); return; }
  if((cache.courses||[]).some(c=>String(c.code).toLowerCase()===d.code.trim().toLowerCase()&&c.level===d.level&&c.semester===d.semester)){ showToast('الكود مضاف من قبل لنفس الفرقة والفصل','error'); return; }
  try{ await addDoc(collection(db,'courses'),{code:d.code.trim(),name:d.name.trim(),credits:cr,level:d.level,semester:d.semester,createdAt:serverTimestamp()});
    logAction('إضافة مادة',d.name); showToast('تمت الإضافة'); await loadData(); renderApp();
  }catch(err){ showToast(authError(err),'error'); }
}
window.registerCourse=async cid=>{
  const rs=regState(), st=cache.students[0], c=(cache.courses||[]).find(x=>x.id===cid); if(!st||!c) return;
  if(!rs.open){ showToast('التسجيل مغلق','error'); return; }
  if(c.level!==st.level||c.semester!==rs.semester){ showToast('المادة غير متاحة لك','error'); return; }
  const used=cache.registrations.filter(x=>x.year===rs.year&&x.semester===rs.semester).reduce((a,x)=>a+Number(x.credits||0),0);
  if(used+Number(c.credits)>rs.max){ showToast(`تجاوز الحد الأقصى للساعات (${rs.max})`,'error'); return; }
  const id=`${user.uid}_${cid}_${rs.year.replace(/\W/g,'')}_${SEMS.indexOf(rs.semester)}`;
  try{ await setDoc(doc(db,'registrations',id),{studentUid:user.uid,studentId:st.studentId,studentName:st.name,courseId:cid,courseCode:c.code,courseName:c.name,credits:Number(c.credits),year:rs.year,semester:rs.semester,createdAt:serverTimestamp()});
    showToast('تم التسجيل'); await loadData(); renderApp();
  }catch(err){ showToast(authError(err),'error'); }
};
window.dropCourse=async id=>{
  if(!confirm('إلغاء تسجيل المادة؟')) return;
  try{ await deleteDoc(doc(db,'registrations',id)); showToast('تم الإلغاء'); await loadData(); renderApp(); }catch(err){ showToast(authError(err),'error'); }
};
window.exportRegCSV=()=>{
  const rs=regState(), q=v=>`"${String(v??'').replace(/"/g,'""').replace(/^([=+\-@])/,"'$1")}"`;
  const rows=[['الرقم الجامعي','الاسم','كود المادة','المادة','الساعات','السنة','الفصل']].concat((cache.registrations||[]).filter(x=>x.year===rs.year&&x.semester===rs.semester).map(x=>[x.studentId,x.studentName,x.courseCode,x.courseName,x.credits,x.year,x.semester]));
  const blob=new Blob(["\ufeff"+rows.map(r=>r.map(q).join(',')).join('\n')],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='تسجيلات_المواد.csv'; document.body.appendChild(a); a.click(); a.remove();
};
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
    const closedAt=Date.now(),sessionId=cache.activeAttendance.sessionId;
    const sessions=(cache.activeAttendance.sessions||[]).map(s=>s.sessionId===sessionId?{...s,status:'completed',expiresAt:closedAt,closedAt}:s);
    await updateDoc(doc(db,'settings','attendance_public'),{expiresAt:closedAt,sessions});
    cache.activeAttendance={...cache.activeAttendance,expiresAt:closedAt,sessions};
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
/* ---------- لوحة متابعة الطالب والتنبيهات ---------- */
const DASHBOARD_WEEK_DAYS=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

function dashboardValueDate(value){
  if(value?.toDate) return value.toDate();
  if(value instanceof Date) return value;
  if(!value) return null;
  const d=new Date(value);
  return Number.isNaN(d.getTime())?null:d;
}

function dashboardDateTime(dateValue,timeValue='00:00'){
  const date=String(dateValue||'').trim(), time=String(timeValue||'00:00').trim();
  const m=date.match(/^(\d{4})-(\d{2})-(\d{2})$/), t=time.match(/^(\d{1,2}):(\d{2})/);
  if(m){
    const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),t?Number(t[1]):0,t?Number(t[2]):0);
    return Number.isNaN(d.getTime())?null:d;
  }
  return dashboardValueDate(date);
}

function dashboardDateLabel(date){
  return date?date.toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'}):'';
}

function studentNextLecture(student){
  const now=new Date(), matches=(cache.schedule||[]).filter(x=>x.level===student.level);
  const events=matches.map(item=>{
    const day=DASHBOARD_WEEK_DAYS.indexOf(item.day);
    const tm=String(item.start||'').match(/^(\d{1,2}):(\d{2})/);
    if(day<0||!tm) return null;
    let offset=(day-now.getDay()+7)%7;
    let when=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset,Number(tm[1]),Number(tm[2]));
    if(when<=now){offset+=7;when=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset,Number(tm[1]),Number(tm[2]));}
    return {item,when};
  }).filter(Boolean).sort((a,b)=>a.when-b.when);
  return events[0]||null;
}

function studentNextExam(student){
  const now=new Date();
  return (cache.exams||[]).filter(x=>!x.level||x.level==='كل الفرق'||x.level===student.level)
    .map(item=>({item,when:dashboardDateTime(item.date,item.time)}))
    .filter(x=>x.when&&x.when>=now)
    .sort((a,b)=>a.when-b.when)[0]||null;
}

function studentDashboardNotice(icon,title,detail,tab,tone='blue'){
  return `<button type="button" class="student-notice ${tone}" data-go="${tab}">
    <span class="student-notice-icon"><i class="fas ${icon}" aria-hidden="true"></i></span>
    <span class="student-notice-copy"><strong>${esc(title)}</strong><small>${esc(detail)}</small></span>
    <i class="fas fa-chevron-left student-notice-arrow" aria-hidden="true"></i>
  </button>`;
}

function studentDashboardView(student,financial){
  const nextLecture=studentNextLecture(student);
  const nextExam=studentNextExam(student);
  const latestResult=(cache.results||[]).slice().sort((a,b)=>(dashboardValueDate(b.createdAt)?.getTime()||0)-(dashboardValueDate(a.createdAt)?.getTime()||0))[0];
  const latestNews=(cache.news||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))[0];
  const requestUpdates=(cache.requests||[]).filter(r=>r.status&&r.status!=='قيد المراجعة')
    .sort((a,b)=>(dashboardValueDate(b.handledAt||b.createdAt)?.getTime()||0)-(dashboardValueDate(a.handledAt||a.createdAt)?.getTime()||0)).slice(0,2);
  const rejectedPayments=(cache.payments||[]).filter(p=>p.status==='مرفوض').length;
  const pendingPayments=(cache.payments||[]).filter(p=>p.status==='قيد المراجعة').length;
  const lectureLabel=nextLecture?`${nextLecture.item.course||'محاضرة'} — ${nextLecture.when.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}`:'لم يُعلن الجدول بعد';
  const examLabel=nextExam?`${nextExam.item.course||'امتحان'} — ${dashboardDateLabel(nextExam.when)}`:'لا توجد امتحانات قادمة معلنة';
  const resultLabel=latestResult?`${latestResult.course||'مادة'} — ${Number(latestResult.score)} / 100`:'لا توجد نتيجة مسجلة بعد';
  const notices=[];
  if(requestUpdates.length) notices.push(studentDashboardNotice('fa-file-signature','تحديث على طلبك',`${requestUpdates[0].type||'طلب'}: ${requestUpdates[0].status}${requestUpdates[0].reply?` — ${requestUpdates[0].reply}`:''}`,'myrequests','violet'));
  if(rejectedPayments) notices.push(studentDashboardNotice('fa-circle-exclamation','إيصال يحتاج إلى مراجعة',`يوجد ${rejectedPayments} إيصال مرفوض. افتح سجل المدفوعات لمعرفة التفاصيل.`,'home','amber'));
  if(pendingPayments) notices.push(studentDashboardNotice('fa-hourglass-half','إيصال قيد المراجعة',`لديك ${pendingPayments} إيصال بانتظار اعتماد الإدارة.`,'home','blue'));
  if(nextExam) notices.push(studentDashboardNotice('fa-calendar-check','موعد الامتحان القادم',examLabel,'myexams','red'));
  if(nextLecture) notices.push(studentDashboardNotice('fa-calendar-day','محاضرتك القادمة',`${nextLecture.item.course||'محاضرة'} — ${dashboardDateLabel(nextLecture.when)}، ${nextLecture.item.start||''} — ${nextLecture.item.hall||'القاعة غير محددة'}`,'myschedule','green'));
  if(latestResult) notices.push(studentDashboardNotice('fa-chart-line','آخر نتيجة مسجلة',resultLabel,'myresults','violet'));
  if(latestNews) notices.push(studentDashboardNotice('fa-bullhorn','آخر إعلان',latestNews.title||'خبر جديد','mynews','blue'));
  const noticeContent=notices.length?notices.slice(0,5).join(''):'<p class="muted student-notices-empty">لا توجد تنبيهات جديدة حاليًا. ستظهر هنا تحديثات النتائج والطلبات والمواعيد.</p>';
  return `<section class="student-dashboard-welcome">
      <div><span class="section-kicker">لوحة متابعة الطالب</span><h2>أهلاً بك يا ${esc(student.name||profile.name||'الطالب')} 👋</h2><p>ملخص سريع لمواعيدك ونتائجك ومتابعاتك.</p></div>
      <span class="student-dashboard-mark"><i class="fas fa-graduation-cap" aria-hidden="true"></i></span>
    </section>
    <div class="student-dashboard-grid">
      <button type="button" class="student-dashboard-card" data-go="myschedule"><span class="student-dashboard-icon green"><i class="fas fa-calendar-day"></i></span><span class="student-dashboard-label">أقرب محاضرة</span><strong>${esc(lectureLabel)}</strong><small>${nextLecture?esc(dashboardDateLabel(nextLecture.when)):'عرض الجدول الأسبوعي'}</small></button>
      <button type="button" class="student-dashboard-card" data-go="myexams"><span class="student-dashboard-icon red"><i class="fas fa-calendar-check"></i></span><span class="student-dashboard-label">الامتحان القادم</span><strong>${esc(examLabel)}</strong><small>${nextExam?esc(nextExam.item.time||''):'عرض جدول الامتحانات'}</small></button>
      <button type="button" class="student-dashboard-card" data-go="myresults"><span class="student-dashboard-icon violet"><i class="fas fa-chart-line"></i></span><span class="student-dashboard-label">آخر نتيجة</span><strong>${esc(resultLabel)}</strong><small>${latestResult?esc(grade(Number(latestResult.score))):'عرض النتائج'}</small></button>
      <button type="button" class="student-dashboard-card" data-go="home"><span class="student-dashboard-icon amber"><i class="fas fa-wallet"></i></span><span class="student-dashboard-label">المتبقي من المصروفات</span><strong>${money(financial.remaining)}</strong><small>${financial.pendingTotal?`${money(financial.pendingTotal)} قيد المراجعة`:`إجمالي المصروفات ${money(financial.totalFees)}`}</small></button>
    </div>
    <section class="card student-notices-card"><div class="section-heading"><div><span class="section-kicker">آخر التحديثات</span><h3><i class="fas fa-bell" style="color:var(--blue)"></i> تنبيهات ومتابعات</h3></div><span class="pill">${notices.length} تحديث</span></div><div class="student-notices-list">${noticeContent}</div></section>`;
}
function renderStudentAttendanceSummary(){
  const student=cache.students?.[0]||{};
  const level=student.level||'';
  const threshold=Number(cache.activeAttendance?.absenceAlertPercent)||25;
  const sessions=(cache.activeAttendance?.sessions||[]).filter(s=>
    s.course&&s.level===level&&Number(s.expiresAt||0)<=Date.now()&&s.status!=='cancelled'
  );
  if(!sessions.length) return `<section class="card"><h3>ملخص الحضور والغياب</h3><p class="muted">سيظهر الملخص بعد انتهاء جلسات حضور مسجلة لمادتك وفرقتك. لا تتضمن السجلات السابقة بيانات الجلسات التي لم يحضرها الطالب.</p></section>`;
  const presentIds=new Set((cache.attendance||[]).filter(a=>a.studentUid===user.uid).map(a=>a.sessionId));
  const byCourse=new Map();
  for(const session of sessions){
    const row=byCourse.get(session.course)||{total:0,present:0};
    row.total++;
    if(presentIds.has(session.sessionId)) row.present++;
    byCourse.set(session.course,row);
  }
  const rows=[...byCourse.entries()].sort(([a],[b])=>a.localeCompare(b,'ar')).map(([course,row])=>{
    const absent=row.total-row.present,percent=Math.round(absent/row.total*100);
    const alert=absent>0&&percent>=threshold?` <span class="pill" style="background:#fee2e2;color:#991b1b">تنبيه غياب</span>`:'';
    return `<tr><td>${esc(course)}${alert}</td><td>${row.total}</td><td>${row.present}</td><td>${absent}</td><td>${percent}%</td></tr>`;
  }).join('');
  return `<section class="card"><h3>ملخص الحضور والغياب حسب المادة</h3><p class="muted">يظهر التنبيه عند بلوغ الغياب ${threshold}% أو أكثر.</p>${table(['المادة','الجلسات','حضور','غياب','نسبة الغياب'],rows)}</section>`;
}

function buildAttendanceReport(){
  const courseFilter=$('#attendanceExportCourse')?.value||'';
  const levelFilter=$('#attendanceExportLevel')?.value||'';
  const sessions=(cache.activeAttendance?.sessions||[]).filter(s=>s.course&&Number(s.expiresAt||0)<=Date.now()&&s.status!=='cancelled'&&(!courseFilter||s.course===courseFilter)&&(!levelFilter||s.level===levelFilter));
  if(!sessions.length)return {headers:[],rows:[]};
  const attendanceBySession=new Map((cache.attendance||[]).map(a=>[`${a.sessionId}:${a.studentUid}`,a]));
  const headers=['اسم الطالب','الرقم الجامعي','المادة','الفرقة','المحاضرة','التاريخ','الحالة'],rows=[];
  for(const session of sessions){
    const students=(cache.students||[]).filter(s=>s.level===session.level);
    for(const student of students){
      const attendance=attendanceBySession.get(`${session.sessionId}:${student.uid}`);
      const date=attendance?.createdAt?.toDate?.()||new Date(Number(session.createdAt||session.expiresAt));
      rows.push([student.name,student.studentId,session.course,session.level,session.sessionName,date.toLocaleString('ar-EG'),attendance?'حاضر':'غائب']);
    }
  }
  return {headers,rows};
}
function exportAttendanceReport(){
  if(!['admin','academic'].includes(role)){showToast('ليس لديك صلاحية تصدير التقرير','error');return;}
  const {headers,rows}=buildAttendanceReport();
  if(!rows.length){showToast('لا توجد جلسات أو طلاب للفلاتر المحددة','error');return;}
  exportXlsx(`attendance-report-${new Date().toISOString().slice(0,10)}.xlsx`,headers,rows,'الحضور والغياب');
}
function printAttendanceReport(){
  if(!['admin','academic'].includes(role)){showToast('ليس لديك صلاحية طباعة التقرير','error');return;}
  const {headers,rows}=buildAttendanceReport();
  if(!rows.length){showToast('لا توجد جلسات أو طلاب للفلاتر المحددة','error');return;}
  printReport('تقرير الحضور والغياب',headers,rows);
}
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
