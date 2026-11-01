const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

admin.initializeApp();
const db = admin.firestore();
const notices = db.collection('notifications');

async function notifyStudent(uid, id, title, message, kind, targetTab) {
  if (!uid) return;
  try {
    await notices.doc(id).create({
      studentUid: uid, title, message, kind, targetTab,
      read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (error.code !== 6 && error.code !== 'already-exists') throw error;
  }
}

exports.notifyRequestUpdates = onDocumentUpdated('requests/{requestId}', async event => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!before || !after || (before.status === after.status && before.reply === after.reply)) return;
  const status = after.status || 'تم تحديث الطلب';
  await notifyStudent(after.studentUid, `request_${event.params.requestId}_${event.data.after.updateTime.toMillis()}`,
    'تحديث على طلبك', `${after.trackingNo || ''} — ${status}${after.reply ? `: ${after.reply}` : ''}`, 'request', 'myrequests');
});

exports.notifyPaymentUpdates = onDocumentUpdated('payments/{paymentId}', async event => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!before || !after || before.status === after.status) return;
  await notifyStudent(after.studentUid, `payment_${event.params.paymentId}_${event.data.after.updateTime.toMillis()}`,
    'تحديث على إيصال المصروفات', `الإيصال ${after.receiptNo || ''}: ${after.status}${after.rejectReason ? ` — ${after.rejectReason}` : ''}`, 'payment', 'home');
});

exports.notifyNewResults = onDocumentCreated('results/{resultId}', async event => {
  const result = event.data?.data();
  if (!result) return;
  await notifyStudent(result.studentUid, `result_${event.params.resultId}`, 'تمت إضافة نتيجة',
    `${result.course || 'مادة'} — ${Number(result.score || 0)} من 100`, 'result', 'myresults');
});

exports.notifyChangedResults = onDocumentUpdated('results/{resultId}', async event => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!before || !after || before.score === after.score) return;
  await notifyStudent(after.studentUid, `result_${event.params.resultId}_${event.data.after.updateTime.toMillis()}`,
    'تم تحديث نتيجة', `${after.course || 'مادة'} — ${Number(after.score || 0)} من 100`, 'result', 'myresults');
});

async function notifyScheduleStudents(scheduleId, after) {
  const students = await db.collection('students').where('level', '==', after.level).get();
  await Promise.all(students.docs.map(student => notifyStudent(student.id, `schedule_${scheduleId}_${student.id}`,
    'تم نشر محاضرة في جدولك', `${after.course || 'محاضرة'} — ${after.day || ''} ${after.start || ''}`, 'schedule', 'myschedule')));
}

exports.notifyPublishedSchedule = onDocumentUpdated('schedule/{scheduleId}', async event => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!before || !after || before.status === 'منشور' || after.status !== 'منشور') return;
  await notifyScheduleStudents(event.params.scheduleId, after);
});

exports.notifyNewPublishedSchedule = onDocumentCreated('schedule/{scheduleId}', async event => {
  const schedule = event.data?.data();
  if (schedule?.status === 'منشور') await notifyScheduleStudents(event.params.scheduleId, schedule);
});

exports.monthlyPaymentReminders = onSchedule({ schedule: '0 9 1 * *', timeZone: 'Africa/Cairo' }, async () => {
  const month = new Date().toISOString().slice(0, 7);
  const [students, pendingPayments] = await Promise.all([
    db.collection('students').get(),
    db.collection('payments').where('status', '==', 'قيد المراجعة').get(),
  ]);
  const pendingByStudent = new Map();
  pendingPayments.docs.forEach(payment => {
    const data = payment.data();
    pendingByStudent.set(data.studentUid, (pendingByStudent.get(data.studentUid) || 0) + Number(data.amount || 0));
  });
  await Promise.all(students.docs.map(student => {
    const data = student.data();
    const remaining = Math.max(0, Number(data.totalFees || 0) - Number(data.paidAmount || 0) - (pendingByStudent.get(student.id) || 0));
    if (!remaining) return Promise.resolve();
    return notifyStudent(student.id, `fee_${month}_${student.id}`, 'تذكير بالمصروفات الدراسية',
      `المتبقي بعد احتساب الإيصالات قيد المراجعة: ${remaining.toLocaleString('ar-EG')} ج.م. راجع لوحة المصروفات لأي تحديث.`, 'payment', 'home');
  }));
});

exports.notifyAbsenceThreshold = onDocumentUpdated('settings/attendance_public', async event => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!after) return;
  const oldSessions = Array.isArray(before?.sessions) ? before.sessions : [];
  const sessions = Array.isArray(after.sessions) ? after.sessions : [];
  const justClosed = sessions.filter(session => session.status === 'completed'
    && !oldSessions.some(old => old.sessionId === session.sessionId && old.status === 'completed'));
  for (const session of justClosed) {
    const related = sessions.filter(item => item.status === 'completed' && item.course === session.course && item.level === session.level);
    if (!related.length) continue;
    const [students, attendance] = await Promise.all([
      db.collection('students').where('level', '==', session.level).get(),
      db.collection('attendance').where('course', '==', session.course).where('level', '==', session.level).get(),
    ]);
    const present = new Set(attendance.docs.map(snap => `${snap.data().sessionId}:${snap.data().studentUid}`));
    const threshold = Number(after.absenceAlertPercent || 25);
    await Promise.all(students.docs.map(student => {
      const misses = related.filter(item => !present.has(`${item.sessionId}:${student.id}`)).length;
      const percent = Math.round(misses / related.length * 100);
      if (percent < threshold) return Promise.resolve();
      return notifyStudent(student.id, `absence_${session.sessionId}_${student.id}`, 'تنبيه بخصوص الغياب',
        `وصلت نسبة غيابك في ${session.course} إلى ${percent}% (حد التنبيه ${threshold}%).`, 'attendance', 'myattendance');
    }));
  }
});

exports.completeExpiredAttendanceSessions = onSchedule({ schedule: 'every 15 minutes', timeZone: 'Africa/Cairo' }, async () => {
  const ref = db.collection('settings').doc('attendance_public');
  const snap = await ref.get();
  if (!snap.exists) return;
  const now = Date.now(), data = snap.data();
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  let changed = false;
  const updated = sessions.map(session => {
    if (session.status === 'open' && Number(session.expiresAt || 0) <= now) {
      changed = true;
      return { ...session, status: 'completed', closedAt: Number(session.expiresAt || now) };
    }
    return session;
  });
  if (changed) await ref.update({ sessions: updated });
});

exports.notifyPortalMaintenance = onDocumentUpdated('settings/site_status', async event => {
  const before = event.data?.before.data(), after = event.data?.after.data();
  if (!before || !after || before.maintenanceMode === after.maintenanceMode || after.maintenanceMode === true) return;
  const students = await db.collection('students').get();
  const stamp = event.data.after.updateTime.toMillis();
  await Promise.all(students.docs.map(student => notifyStudent(student.id, `maintenance_${stamp}_${student.id}`,
    'عادت البوابة للعمل', 'انتهت أعمال الصيانة ويمكنك استخدام خدمات الموقع الآن.', 'system', 'home')));
});

async function requireRole(request, roles) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'سجّل الدخول أولًا.');
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists || !roles.includes(snap.data().role)) {
    throw new HttpsError('permission-denied', 'لا تملك صلاحية هذه العملية.');
  }
  return { uid, profile: snap.data() };
}

async function requirePermission(request, permission) {
  const uid=request.auth?.uid;
  if(!uid)throw new HttpsError('unauthenticated','سجّل الدخول أولًا.');
  const snap=await db.collection('users').doc(uid).get();
  if(!snap.exists)throw new HttpsError('permission-denied','لا تملك صلاحية هذه العملية.');
  const profile=snap.data(),role=profile.role;
  const defaults={
    finance:['students','payments','accounts','requests','requests_finance','logs','chat'],
    academic:['students','students_create','students_edit','students_delete','results','exams','library','attendance','schedule','requests','requests_academic','courses','news','chat'],
  };
  const permissions=Array.isArray(profile.permissions)?profile.permissions:(defaults[role]||[]);
  if(role!=='admin'&&!permissions.includes(permission))throw new HttpsError('permission-denied','لا تملك صلاحية هذه العملية.');
  return {uid,profile};
}

function requiredString(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new HttpsError('invalid-argument', `قيمة ${label} غير صالحة.`);
  }
  return value.trim();
}

exports.resetStudentPassword = onCall(async request => {
  await requireRole(request, ['admin']);
  const studentUid = requiredString(request.data?.studentUid, 'الطالب');
  const password = request.data?.newPassword;
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new HttpsError('invalid-argument', 'كلمة المرور يجب أن تكون من 8 إلى 128 حرفًا.');
  }

  const [userRef, studentRef] = [db.collection('users').doc(studentUid), db.collection('students').doc(studentUid)];
  const [userSnap, studentSnap] = await Promise.all([userRef.get(), studentRef.get()]);
  if (!userSnap.exists || userSnap.data().role !== 'student' || !studentSnap.exists) {
    throw new HttpsError('not-found', 'حساب الطالب غير موجود.');
  }
  await admin.auth().updateUser(studentUid, { password });
  await userRef.set({ mustChangePassword: true, passwordUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { updated: true };
});

exports.deleteStudentConversation = onCall(async request => {
  await requireRole(request, ['admin']);
  const studentUid = requiredString(request.data?.studentUid, 'الطالب');
  const student = await db.collection('users').doc(studentUid).get();
  if (!student.exists || student.data().role !== 'student') {
    throw new HttpsError('not-found', 'حساب الطالب غير موجود.');
  }
  const messages = db.collection('chats').doc(studentUid).collection('messages');
  await db.recursiveDelete(messages);
  await db.collection('chats').doc(studentUid).delete().catch(() => {});
  return { deleted: true };
});

exports.refreshAttendanceQr = onCall(async request => {
  await requirePermission(request, 'attendance');
  const sessionId = requiredString(request.data?.sessionId, 'الجلسة');
  const publicSession = await db.collection('settings').doc('attendance_public').get();
  if (!publicSession.exists || publicSession.data().sessionId !== sessionId) {
    throw new HttpsError('failed-precondition', 'جلسة الحضور لم تعد نشطة.');
  }
  const endsAt = Number(publicSession.data().expiresAt || 0);
  const now = Date.now();
  if (endsAt <= now) throw new HttpsError('failed-precondition', 'انتهت جلسة الحضور.');

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Math.min(now + 60000, endsAt);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenCollection = db.collection('attendance_qr_tokens');
  const batch = db.batch();
  batch.set(tokenCollection.doc(tokenHash), { sessionId, expiresAt });
  const previousTokens = await tokenCollection.where('expiresAt', '<=', now).limit(450).get();
  previousTokens.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  return { token, expiresAt };
});

exports.recordAttendanceFromQr = onCall(async request => {
  const { uid } = await requireRole(request, ['student']);
  const token = requiredString(request.data?.token, 'رمز الحضور', 160);
  const publicRef = db.collection('settings').doc('attendance_public');
  const siteStatusRef = db.collection('settings').doc('site_status');
  const userRef = db.collection('students').doc(uid);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = Date.now();

  return db.runTransaction(async transaction => {
    const publicSnap = await transaction.get(publicRef);
    const siteStatusSnap = await transaction.get(siteStatusRef);
    if (siteStatusSnap.exists && siteStatusSnap.data().maintenanceMode === true) {
      throw new HttpsError('unavailable', 'الموقع في حالة صيانة، أعد المحاولة بعد فتحه.');
    }
    if (!publicSnap.exists) throw new HttpsError('failed-precondition', 'لا توجد جلسة حضور مفتوحة.');
    const session = publicSnap.data();
    const sessionId = String(session.sessionId || '');
    if (!sessionId || Number(session.expiresAt || 0) <= now) {
      throw new HttpsError('failed-precondition', 'انتهت جلسة الحضور.');
    }
    const tokenRef = db.collection('attendance_qr_tokens').doc(tokenHash);
    const attendanceRef = db.collection('attendance').doc(`${sessionId}_${uid}`);
    const [tokenSnap, studentSnap, attendanceSnap] = await Promise.all([
      transaction.get(tokenRef), transaction.get(userRef), transaction.get(attendanceRef),
    ]);
    if (!tokenSnap.exists || tokenSnap.data().sessionId !== sessionId || Number(tokenSnap.data().expiresAt || 0) <= now) {
      throw new HttpsError('failed-precondition', 'انتهت صلاحية رمز الحضور. امسح الرمز الحالي مرة أخرى.');
    }
    if (!studentSnap.exists) throw new HttpsError('not-found', 'ملف الطالب غير موجود.');
    if (attendanceSnap.exists) return { alreadyRegistered: true };

    const student = studentSnap.data();
    transaction.create(attendanceRef, {
      studentUid: uid,
      studentName: student.name || '',
      studentId: student.studentId || '',
      sessionName: session.sessionName || 'محاضرة',
      course: session.course || '',
      level: session.level || '',
      sessionId,
      method: 'qr',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { alreadyRegistered: false };
  });
});
