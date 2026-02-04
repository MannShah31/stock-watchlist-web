import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

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
      await createUserWithEmailAndPassword(
        auth,
        email.value.trim(),
        password.value
      );
      alert("Account created. Now login.");
    } catch (e) {
      alert(e.message);
    }
  };

  logoutBtn.onclick = async () => {
    await signOut(auth);
  };

  onAuthStateChanged(auth, user => {
    if (user) onLogin(user);
    else onLogout();
  });
}
