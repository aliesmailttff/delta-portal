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

