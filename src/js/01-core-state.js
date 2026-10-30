import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
         createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc,
         updateDoc, deleteDoc, query, where, orderBy, serverTimestamp,
         onSnapshot, runTransaction, deleteField }
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
  if(r==='admin') return ['dashboard','students','results','exams','library','attendance','schedule','requests','courses','news','payments','accounts','staff','logs','chat'];
  if(r==='finance') return ['dashboard','payments','accounts','logs','chat'];
  if(r==='academic') return ['dashboard','students','results','exams','library','attendance','schedule','requests','courses','news','chat'];
  return ['home','gpasimulator','mylibrary','myattendance','myresults','myexams','myschedule','myregistration','myrequests','mynews','chat'];
}

