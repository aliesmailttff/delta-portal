const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

admin.initializeApp();
const db = admin.firestore();

async function requireRole(request, roles) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'سجّل الدخول أولًا.');
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists || !roles.includes(snap.data().role)) {
    throw new HttpsError('permission-denied', 'لا تملك صلاحية هذه العملية.');
  }
  return { uid, profile: snap.data() };
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
  await requireRole(request, ['admin', 'academic']);
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
      sessionId,
      method: 'qr',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { alreadyRegistered: false };
  });
});
