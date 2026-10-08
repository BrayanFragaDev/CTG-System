import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const configurado = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
const usarEmulador = import.meta.env.VITE_USE_EMULATOR === 'true';

export const app = initializeApp(configurado ? firebaseConfig : { apiKey: 'demo', projectId: 'demo-galpao' });
export const auth = getAuth(app);
export const db = getFirestore(app);

if (usarEmulador) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// Cria a conta de login de outra pessoa sem derrubar a sessão de quem está logado.
// Usa uma instância secundária do Firebase só para o cadastro e depois a descarta.
export async function criarContaLogin(email, senha) {
  const secundario = initializeApp(app.options, `cadastro-${Date.now()}`);
  try {
    const authSec = getAuth(secundario);
    if (usarEmulador) connectAuthEmulator(authSec, 'http://127.0.0.1:9099', { disableWarnings: true });
    const cred = await createUserWithEmailAndPassword(authSec, email, senha);
    await signOut(authSec);
    return cred.user.uid;
  } finally {
    await deleteApp(secundario);
  }
}
