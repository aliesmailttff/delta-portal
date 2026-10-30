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
