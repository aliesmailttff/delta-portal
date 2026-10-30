# هيكل المشروع

    public/
      index.html          هيكل الصفحة فقط (4KB)
      css/app.css         كل التنسيقات
      js/app.js           ملف مُولَّد، لا تعدّله يدوياً
      sw.js, manifest.json, firebase-config.js, icon-*.png
    src/js/               الكود المصدري مقسّم بالمواضيع (يتجمّع بالترتيب الرقمي)
      01-core-state       الاستيراد، الدوال المساعدة، تهيئة Firebase، الثيم، الصلاحيات
      02-auth-data-nav    الدخول، تحميل البيانات، القوائم
      03-views            شاشات كل التابات (renderView)
      04-students-idcard  جدول الطلاب وكارنيه الطالب
      05-chart-bindforms  الرسم البياني وربط النماذج
      06-payments         المدفوعات والاعتماد
      07-admin-actions    الحسابات، إنشاء الطلاب والمساعدين، الحضور، النتائج
      08-print-edit-chat  الطباعة، نافذة التعديل، الحذف، المحادثة
      09-security-ux      تغيير كلمة المرور الإجباري، الخمول، حالة الاتصال، التقويم
      10-schedule-requests الجدول الأسبوعي وطلبات الطلاب
      11-results-gpa      النتائج، المعدل، رفع Excel، كشف الدرجات
      12-courses-registration المواد وتسجيلها
      13-admin-tools          الاستيراد، الصيانة، البحث، المحادثة، وQR
    build.mjs             يجمّع src/js في public/js/app.js
    tests/                اختبارات قواعد Firestore

## الشغل اليومي
1. عدّل الملف المناسب في `src/js`.
2. `npm run build` (بيتشغّل تلقائياً قبل أي نشر عبر predeploy، لكن شغّله يدوياً لما تجرّب محلياً).
3. `firebase deploy --only hosting` (أو مع firestore:rules لو غيّرت القواعد).

الملفات في src/js بتتجمّع في نطاق واحد، يعني أي دالة أو متغير في ملف تقدر تستخدمه في غيره من غير import.
ملف `03-views.js` لسه كبير (دالة renderView واحدة)، وتفكيكه لدوال لكل تاب هو الخطوة الجاية الأنسب.
