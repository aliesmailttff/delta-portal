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
