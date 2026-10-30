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
    return `<section class="card"><h2>رصد النتائج</h2><form id="resultForm" class="fields">
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
    return `<div class="headrow"><h2>نتائجي</h2><button style="background:var(--green);" onclick="printTranscript()"><i class="fas fa-file-pdf"></i> كشف الدرجات PDF</button></div>
      <div class="grid">${stat('المعدل التراكمي',tot.gpa.toFixed(2)+' / 4.0')}${stat('الساعات المسجلة',tot.credits)}${stat('الساعات المكتسبة',earned)}</div>`+
      (sems||'<section class="card muted">لا توجد نتائج.</section>')+(all.some(r=>!r.credits)?'<p class="muted">النتائج القديمة بدون ساعات تُحتسب 3 ساعات.</p>':'');
  }
  return null;
}

