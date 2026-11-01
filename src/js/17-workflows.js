/* ---------- سير العمل والتنبيهات ---------- */
window.openNotification=async function(id,targetTab){
  const item=(cache.notifications||[]).find(n=>n.id===id);
  try{if(item&&!item.read)await updateDoc(doc(db,'notifications',id),{read:true});}
  catch(error){showToast(authError(error),'error');return;}
  activeTab=targetTab;localStorage.setItem('activeTab',activeTab);await loadData();renderApp();
};

window.markAllNotificationsRead=async function(){
  const unread=(cache.notifications||[]).filter(n=>!n.read);
  try{
    for(let i=0;i<unread.length;i+=450){
      const batch=writeBatch(db);unread.slice(i,i+450).forEach(n=>batch.update(doc(db,'notifications',n.id),{read:true}));await batch.commit();
    }
    cache.notifications=cache.notifications.map(n=>({...n,read:true}));renderApp();showToast('تم تعليم التنبيهات كمقروءة');
  }catch(error){showToast(authError(error),'error');}
};

async function saveChatAssignment(event){
  event.preventDefault();
  if(role!=='admin'||!selectedChatStudentUid)return;
  const data=Object.fromEntries(new FormData(event.currentTarget).entries());
  const assignee=cache.staff.find(st=>st.uid===data.assignedTo);
  if(data.assignedTo&&(!assignee||assignee.role!==data.assignedDepartment)){showToast('اختر مساعدًا تابعًا للقسم المحدد','error');return;}
  const student=cache.students.find(st=>st.uid===selectedChatStudentUid);
  try{
    await setDoc(doc(db,'chats',selectedChatStudentUid),{
      studentUid:selectedChatStudentUid,studentName:student?.name||'',
      assignedDepartment:data.assignedDepartment,assignedTo:data.assignedTo||'',
      assignedName:assignee?.name||assignee?.email||'',assignedBy:user.email,updatedAt:serverTimestamp(),
    },{merge:true});
    logAction('توجيه محادثة طالب',`${student?.name||selectedChatStudentUid} — ${data.assignedDepartment} — ${assignee?.name||'غير معيّن'}`);
    showToast('تم حفظ توجيه المحادثة');await loadData();renderApp();
  }catch(error){showToast(authError(error),'error');}
}
