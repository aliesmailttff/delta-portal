// firebase-config.js
// For Firebase JS SDK v10.14.1
export const firebaseConfig = {
  apiKey: "AIzaSyC7ueHe3dccz-wBqO9wtTTLb0D7JmqLI8k",
  authDomain: "delta-student-portal.firebaseapp.com",
  projectId: "delta-student-portal",
  storageBucket: "delta-student-portal.firebasestorage.app",
  messagingSenderId: "110976845843",
  appId: "1:110976845843:web:921f5508604ecdbed757e6",
  measurementId: "G-FG3H74LL3Y"
};

// التحقق الفعلي من أن الإعدادات معبأة (تصحيح خطأ #18)
export function isFirebaseConfigured() {
  const required = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
  return required.every(k => {
    const v = firebaseConfig[k];
    return typeof v === 'string' && v.length > 0 && !v.startsWith('YOUR_');
  });
}