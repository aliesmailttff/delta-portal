import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';

const PEND = 'قيد المراجعة', OK = 'مقبول';
let env;
const db = uid => env.authenticatedContext(uid, { email: uid + '@x.com' }).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-delta', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const d = ctx.firestore(), w = (p, v) => setDoc(doc(d, p), v);
    await w('users/admin1', { role: 'admin', email: 'admin1@x.com' });
    await w('users/fin1', { role: 'finance' });
    await w('users/acad1', { role: 'academic' });
    await w('users/stu1', { role: 'student', mustChangePassword: true });
    await w('users/stu2', { role: 'student' });
    await w('students/stu1', { name: 'A', studentId: '1', level: 'L1', totalFees: 10000, paidAmount: 0 });
    await w('students/stu2', { name: 'B', studentId: '2', level: 'L2', totalFees: 10000, paidAmount: 0 });
    await w('courses/c1', { code: 'C1', credits: 3, level: 'L1', semester: 'S1' });
    await w('settings/registration', { open: true, year: '2025/2026', semester: 'S1', maxCredits: 18 });
    await w('settings/payment_accounts', { maintenanceMode: false });
    await w('settings/active_attendance', { code: '4321', sessionId: 's1' });
    await w('settings/attendance_public', { sessionName: 'م', sessionId: 's1', expiresAt: Date.now() + 600000 });
    await w('payments/p1', { studentUid: 'stu1', amount: 1000, status: PEND, receiptNo: 'R1' });
    await w('results/r1', { studentUid: 'stu1', course: 'x', score: 80 });
    await w('results/r2', { studentUid: 'stu2', course: 'x', score: 70 });
    await w('requests/q1', { studentUid: 'stu1', type: 'شهادة قيد', details: 'x', status: PEND });
  });
});

const pay = (o = {}) => ({ studentUid: 'stu1', amount: 500, status: PEND, method: 'InstaPay', receiptNo: 'R2', ...o });

test('غير المسجل لا يقرأ شيئاً', async () => {
  await assertFails(getDoc(doc(anon(), 'news/x')));
  await assertFails(getDoc(doc(anon(), 'students/stu1')));
});

test('users: الطالب لا يقرأ بيانات غيره، والأدمن يقرأ', async () => {
  await assertSucceeds(getDoc(doc(db('stu1'), 'users/stu1')));
  await assertFails(getDoc(doc(db('stu1'), 'users/stu2')));
  await assertSucceeds(getDoc(doc(db('admin1'), 'users/stu2')));
});
test('users: الأكاديمي ينشئ طالباً فقط، والأدمن ينشئ مساعداً', async () => {
  await assertSucceeds(setDoc(doc(db('acad1'), 'users/n1'), { role: 'student', name: 'n' }));
  await assertFails(setDoc(doc(db('acad1'), 'users/n2'), { role: 'finance', name: 'n' }));
  await assertSucceeds(setDoc(doc(db('admin1'), 'users/n3'), { role: 'finance', name: 'n' }));
  await assertFails(setDoc(doc(db('admin1'), 'users/n4'), { role: 'admin', name: 'n' }));
});
test('users: الطالب يلغي علامة تغيير كلمة المرور فقط ولا يرفع صلاحيته', async () => {
  await assertSucceeds(updateDoc(doc(db('stu1'), 'users/stu1'), { mustChangePassword: false }));
  await assertFails(updateDoc(doc(db('stu1'), 'users/stu1'), { role: 'admin' }));
  await assertFails(updateDoc(doc(db('stu1'), 'users/stu1'), { mustChangePassword: true }));
});

test('students: الطالب يقرأ ملفه فقط ولا يعدّله', async () => {
  await assertSucceeds(getDoc(doc(db('stu1'), 'students/stu1')));
  await assertFails(getDoc(doc(db('stu1'), 'students/stu2')));
  await assertFails(updateDoc(doc(db('stu1'), 'students/stu1'), { level: 'L4' }));
  await assertFails(updateDoc(doc(db('stu1'), 'students/stu1'), { paidAmount: 9999 }));
});
test('students: المالي يحدّث paidAmount فقط والأكاديمي يدير الملف', async () => {
  await assertSucceeds(updateDoc(doc(db('fin1'), 'students/stu1'), { paidAmount: 500 }));
  await assertFails(updateDoc(doc(db('fin1'), 'students/stu1'), { totalFees: 1 }));
  await assertSucceeds(updateDoc(doc(db('acad1'), 'students/stu1'), { level: 'L2' }));
  await assertFails(setDoc(doc(db('fin1'), 'students/s9'), { name: 'z' }));
});

test('payments: الطالب ينشئ إيصالاً معلقاً صحيحاً فقط', async () => {
  await assertSucceeds(addDoc(collection(db('stu1'), 'payments'), pay()));
  await assertFails(addDoc(collection(db('stu1'), 'payments'), pay({ status: OK })));
  await assertFails(addDoc(collection(db('stu1'), 'payments'), pay({ amount: 10001 })));
  await assertFails(addDoc(collection(db('stu1'), 'payments'), pay({ amount: -5 })));
  await assertFails(addDoc(collection(db('stu1'), 'payments'), pay({ amount: '500' })));
  await assertFails(addDoc(collection(db('stu1'), 'payments'), pay({ studentUid: 'stu2' })));
});
test('payments: وضع الصيانة يمنع الإنشاء', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'settings/payment_accounts'), { maintenanceMode: true }));
  await assertFails(addDoc(collection(db('stu1'), 'payments'), pay()));
});
test('payments: القراءة والاعتماد', async () => {
  await assertSucceeds(getDoc(doc(db('stu1'), 'payments/p1')));
  await assertFails(getDoc(doc(db('stu2'), 'payments/p1')));
  await assertFails(getDoc(doc(db('acad1'), 'payments/p1')));
  await assertSucceeds(updateDoc(doc(db('fin1'), 'payments/p1'), { status: OK, approvedBy: 'fin1@x.com' }));
  await assertFails(updateDoc(doc(db('fin1'), 'payments/p1'), { amount: 1 }));
  await assertFails(updateDoc(doc(db('stu1'), 'payments/p1'), { status: OK }));
  await assertFails(deleteDoc(doc(db('fin1'), 'payments/p1')));
  await assertSucceeds(deleteDoc(doc(db('admin1'), 'payments/p1')));
});
test('payments: الطالب يستعلم عن إيصالاته فقط', async () => {
  await assertSucceeds(getDocs(query(collection(db('stu1'), 'payments'), where('studentUid', '==', 'stu1'))));
  await assertFails(getDocs(collection(db('stu1'), 'payments')));
});

test('settings: كود الحضور السري مخفي عن الطالب', async () => {
  await assertFails(getDoc(doc(db('stu1'), 'settings/active_attendance')));
  await assertSucceeds(getDoc(doc(db('acad1'), 'settings/active_attendance')));
  await assertSucceeds(getDoc(doc(db('stu1'), 'settings/attendance_public')));
});
test('settings: من يكتب ماذا', async () => {
  await assertSucceeds(setDoc(doc(db('fin1'), 'settings/payment_accounts'), { vodafone: '1' }));
  await assertFails(setDoc(doc(db('acad1'), 'settings/payment_accounts'), { vodafone: '1' }));
  await assertSucceeds(setDoc(doc(db('acad1'), 'settings/attendance_public'), { sessionId: 's2', expiresAt: 1 }));
  await assertFails(setDoc(doc(db('fin1'), 'settings/registration'), { open: true }));
  await assertFails(setDoc(doc(db('stu1'), 'settings/registration'), { open: true }));
});

const att = (o = {}) => ({ studentUid: 'stu1', sessionId: 's1', pin: '4321', ...o });
test('attendance: كود صحيح وجلسة مفتوحة', async () => {
  await assertSucceeds(setDoc(doc(db('stu1'), 'attendance/s1_stu1'), att()));
});
test('attendance: كود خاطئ، معرّف غير مطابق، تسجيل لطالب آخر، جلسة منتهية، تكرار', async () => {
  await assertFails(setDoc(doc(db('stu1'), 'attendance/s1_stu1'), att({ pin: '0000' })));
  await assertFails(setDoc(doc(db('stu1'), 'attendance/zzz'), att()));
  await assertFails(setDoc(doc(db('stu1'), 'attendance/s1_stu2'), att({ studentUid: 'stu2' })));
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'settings/attendance_public'), { expiresAt: Date.now() - 1000 }));
  await assertFails(setDoc(doc(db('stu1'), 'attendance/s1_stu1'), att()));
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'settings/attendance_public'), { expiresAt: Date.now() + 600000 }));
  await assertSucceeds(setDoc(doc(db('stu1'), 'attendance/s1_stu1'), att()));
  await assertFails(setDoc(doc(db('stu1'), 'attendance/s1_stu1'), att()));
});

test('chats: الطالب في محادثته فقط، ولا ينتحل مرسلاً', async () => {
  const m = (o = {}) => ({ senderUid: 'stu1', senderName: 'A', body: 'مرحبا', createdAt: serverTimestamp(), ...o });
  await assertSucceeds(addDoc(collection(db('stu1'), 'chats/stu1/messages'), m()));
  await assertFails(addDoc(collection(db('stu1'), 'chats/stu2/messages'), m()));
  await assertFails(addDoc(collection(db('stu1'), 'chats/stu1/messages'), m({ senderUid: 'acad1' })));
  await assertFails(addDoc(collection(db('stu1'), 'chats/stu1/messages'), m({ body: 'x'.repeat(1001) })));
  await assertFails(addDoc(collection(db('stu1'), 'chats/stu1/messages'), m({ body: '' })));
  await assertSucceeds(addDoc(collection(db('acad1'), 'chats/stu1/messages'), m({ senderUid: 'acad1' })));
  await assertFails(getDocs(collection(db('stu2'), 'chats/stu1/messages')));
});

test('audit_logs: لا تزوير ولا تعديل، والقراءة للأدمن والمالي', async () => {
  const col = u => collection(db(u), 'audit_logs');
  await assertSucceeds(addDoc(col('stu1'), { adminEmail: 'stu1@x.com', action: 'a' }));
  await assertFails(addDoc(col('stu1'), { adminEmail: 'admin1@x.com', action: 'a' }));
  await assertSucceeds(getDocs(col('fin1')));
  await assertFails(getDocs(col('acad1')));
  await assertFails(getDocs(col('stu1')));
});

test('results: الطالب يقرأ نتائجه فقط، والأكاديمي يكتب', async () => {
  await assertSucceeds(getDoc(doc(db('stu1'), 'results/r1')));
  await assertFails(getDoc(doc(db('stu1'), 'results/r2')));
  await assertFails(setDoc(doc(db('stu1'), 'results/r1'), { score: 100 }));
  await assertSucceeds(updateDoc(doc(db('acad1'), 'results/r1'), { score: 90 }));
  await assertFails(updateDoc(doc(db('fin1'), 'results/r1'), { score: 90 }));
});

const req = (o = {}) => ({ studentUid: 'stu1', type: 'شهادة قيد', details: 'x', status: PEND, ...o });
test('requests: إنشاء الطالب ومعالجة الأكاديمي', async () => {
  await assertSucceeds(addDoc(collection(db('stu1'), 'requests'), req()));
  await assertFails(addDoc(collection(db('stu1'), 'requests'), req({ type: 'نوع غريب' })));
  await assertFails(addDoc(collection(db('stu1'), 'requests'), req({ status: 'تم القبول' })));
  await assertFails(addDoc(collection(db('stu1'), 'requests'), req({ studentUid: 'stu2' })));
  await assertSucceeds(updateDoc(doc(db('acad1'), 'requests/q1'), { status: 'تم القبول', reply: 'تم' }));
  await assertFails(updateDoc(doc(db('acad1'), 'requests/q1'), { details: 'غيّرت' }));
  await assertFails(updateDoc(doc(db('stu1'), 'requests/q1'), { status: 'تم القبول' }));
  await assertFails(getDoc(doc(db('stu2'), 'requests/q1')));
});

const reg = (o = {}) => ({ studentUid: 'stu1', courseId: 'c1', credits: 3, year: '2025/2026', semester: 'S1', ...o });
const RID = 'stu1_c1_20252026_0';
test('registrations: تسجيل صحيح', async () => {
  await assertSucceeds(setDoc(doc(db('stu1'), 'registrations/' + RID), reg()));
});
test('registrations: مرفوضات', async () => {
  await assertFails(setDoc(doc(db('stu1'), 'registrations/' + RID), reg({ credits: 1 })));
  await assertFails(setDoc(doc(db('stu1'), 'registrations/' + RID), reg({ semester: 'S2' })));
  await assertFails(setDoc(doc(db('stu1'), 'registrations/stu2_c1_x'), reg({ studentUid: 'stu2' })));
  await assertFails(setDoc(doc(db('stu2'), 'registrations/stu2_c1_x'), reg({ studentUid: 'stu2' })));
  await assertFails(setDoc(doc(db('stu1'), 'registrations/' + RID), reg({ courseId: 'nope' })));
});
test('registrations: التسجيل المغلق يمنع الإضافة والإلغاء', async () => {
  await assertSucceeds(setDoc(doc(db('stu1'), 'registrations/' + RID), reg()));
  await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'settings/registration'), { open: false }));
  await assertFails(deleteDoc(doc(db('stu1'), 'registrations/' + RID)));
  await assertFails(setDoc(doc(db('stu1'), 'registrations/stu1_c1_b'), reg()));
  await assertSucceeds(deleteDoc(doc(db('acad1'), 'registrations/' + RID)));
});

test('أي مجموعة غير معرّفة مرفوضة', async () => {
  await assertFails(setDoc(doc(db('admin1'), 'whatever/x'), { a: 1 }));
  await assertFails(getDoc(doc(db('admin1'), 'whatever/x')));
});
