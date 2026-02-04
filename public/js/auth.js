import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

export function setupAuth({
  loginBtn,
  signupBtn,
  logoutBtn,
  loginScreen,
  appScreen,
  onLogin,
  onLogout
}) {

  loginBtn.onclick = async () => {
    try {
      await signInWithEmailAndPassword(
        auth,
        email.value.trim(),
        password.value
      );
    } catch (e) {
      alert(e.message);
    }
  };

  signupBtn.onclick = async () => {
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.value.trim(),
        password.value
      );

      // 🔥 CREATE USER DOC ON SIGNUP
      await setDoc(doc(db, "users", cred.user.uid), {
        email: cred.user.email,
        watchlist: [],
        createdAt: serverTimestamp()
      });

      alert("Account created. Now login.");
    } catch (e) {
      alert(e.message);
    }
  };

  logoutBtn.onclick = async () => {
    await signOut(auth);
  };

  onAuthStateChanged(auth, async user => {
    if (user) {
      // ensure user doc exists (for old users)
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          email: user.email,
          watchlist: [],
          createdAt: serverTimestamp()
        });
      }
      onLogin(user);
    } else {
      onLogout();
    }
  });
}
