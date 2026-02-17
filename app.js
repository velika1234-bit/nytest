// ==========================================
// ЧАСТ 1: КОНФИГУРАЦИЯ И ВХОД
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, serverTimestamp, updateDoc, deleteDoc, addDoc, query, where, limit, getDocs, collectionGroup } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const AVATARS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

function formatDate(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getTimestampMs(ts) {
    if (!ts) return 0;
    return ts.toMillis ? ts.toMillis() : (ts.seconds * 1000);
}

function parseScoreValue(str) {
    if (!str) return { score: 0, total: 0 };
    const p = str.split('/');
    if (p.length < 2) return { score: 0, total: 0 };
    return { score: Number(p[0]) || 0, total: Number(p[1]) || 0 };
}

function decodeQuizCode(code) {
    try {
        if (!code) return null;
        const clean = code.trim().replace(/\s/g, '');
        return JSON.parse(decodeURIComponent(escape(atob(clean))));
    } catch (e) {
        console.error("Decoding error:", e);
        return null;
    }
}

const firebaseConfig = {
    apiKey: "AIzaSyA0WhbnxygznaGCcdxLBHweZZThezUO314",
    authDomain: "videoquiz-ultimate.firebaseapp.com",
    projectId: "videoquiz-ultimate",
    storageBucket: "videoquiz-ultimate.firebasestorage.app",
    messagingSenderId: "793138692820",
    appId: "1:793138692820:web:8ee2418d28d47fca6bf141"
};

const finalAppId = 'videoquiz-ultimate-live';
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app, 'us-central1');

let user = null;
let lastAuthUid = null;
let isTeacher = false;
let editingQuizId = null;
let editingQuestionIndex = null;
const MASTER_TEACHER_CODE = "vilidaf76";

let player, solvePlayer, hostPlayer;
let questions = [], currentQuiz = null, studentNameValue = "";
let sessionID = "", liveActiveQIdx = -1;
let sessionDocId = "";
let lastAnsweredIdx = -1;
let currentVideoId = "";
let unsubscribes = [];
let activeIntervals = [];
let liveScore = 0;
let scoreCount = 0, currentQIndex = -1;
let lastFetchedParticipants = [];
let soloResults = [];
let myQuizzes = [];
let isYTReady = false;
let authMode = 'login';
let soloGameFinished = false;
let currentQuizOwnerId = null;
let currentParticipantRef = null;
let participantStorageMode = 'legacy';
let rulesModalShown = false;
let sopModeEnabled = false;
let isDiscussionMode = false;

const getTeacherSoloResultsCollection = (tid) => collection(db, 'artifacts', finalAppId, 'users', tid, 'solo_results');
const getSessionRefById = (id) => doc(db, 'artifacts', finalAppId, 'public', 'data', 'sessions', id);
const getParticipantsCollection = (id) => collection(db, 'artifacts', finalAppId, 'public', 'data', 'sessions', id, 'participants');
const getParticipantRef = (sessId, partId) => doc(db, 'artifacts', finalAppId, 'public', 'data', 'sessions', sessId, 'participants', partId);
const getLegacyParticipantsCollection = () => collection(db, 'artifacts', finalAppId, 'public', 'data', 'participants');
const getLegacyParticipantRef = (partId) => doc(db, 'artifacts', finalAppId, 'public', 'data', 'participants', partId);

window.tempLiveSelection = null;

const safeSetText = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };

onAuthStateChanged(auth, async (u) => {
    const incomingUid = u?.uid || null;
    const emailDisp = document.getElementById('user-email-display');
    if (emailDisp) emailDisp.innerText = u ? (u.email || "Анонимен") : "";

    if (lastAuthUid !== incomingUid) {
        myQuizzes = [];
        soloResults = [];
        if (document.getElementById('my-quizzes-list')) renderMyQuizzes();
        if (document.getElementById('solo-results-body')) renderSoloResults();

        const adminBtn = document.getElementById('admin-panel-btn');
        if (adminBtn) {
            if (u && u.uid === 'uNdGTBsgatZX4uOPTZqKG9qLJVZ2') adminBtn.classList.remove('hidden');
            else adminBtn.classList.add('hidden');
        }
    }
    
    lastAuthUid = incomingUid;
    user = u;
    document.getElementById('auth-loader')?.classList.add('hidden');

    if (user) {
        const profileRef = doc(db, 'artifacts', finalAppId, 'users', user.uid, 'settings', 'profile');
        try {
            const snap = await getDoc(profileRef);
            if (snap.exists() && snap.data().role === 'teacher') {
                isTeacher = true;
                window.loadMyQuizzes();
                window.loadSoloResults();
                if (!document.getElementById('screen-welcome').classList.contains('hidden')) {
                    window.switchScreen('teacher-dashboard');
                }
            } else if (!user.isAnonymous) {
                window.switchScreen('welcome');
            }
        } catch (e) {
            if (e.code === 'permission-denied') window.showRulesHelpModal();
        }
    } else {
        window.switchScreen('welcome');
    }
});

const initAuth = async () => {
    setTimeout(() => document.getElementById('auth-loader')?.classList.add('hidden'), 4000);
    await setPersistence(auth, browserLocalPersistence);
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try { await signInWithCustomToken(auth, __initial_auth_token); } catch (e) {}
    }
};
initAuth();

window.resolveTeacherUidFromCode = async (decoded) => {
    if (!decoded) return null;
    if (decoded.ownerId) return decoded.ownerId;
    const email = (decoded.ownerEmailNormalized || decoded.ownerEmail || '').trim().toLowerCase();
    if (!email) return null;
    try {
        const q = query(collectionGroup(db, 'profile'), where('role', '==', 'teacher'), where('emailNormalized', '==', email));
        const snap = await getDocs(q);
        if (snap.size === 1) return snap.docs[0].ref.parent.parent?.id || null;
    } catch (e) {}
    return null;
};

window.switchScreen = (name) => {
    document.querySelectorAll('#app > div').forEach(div => div.classList.add('hidden'));
    const target = document.getElementById('screen-' + name);
    if (target) target.classList.remove('hidden');

    if (player) { try { player.destroy(); } catch (e) {} player = null; }
    if (solvePlayer) { try { solvePlayer.destroy(); } catch (e) {} solvePlayer = null; }
    if (hostPlayer) { try { hostPlayer.destroy(); } catch (e) {} hostPlayer = null; }

    unsubscribes.forEach(unsub => unsub()); unsubscribes = [];
    activeIntervals.forEach(i => clearInterval(i)); activeIntervals = [];
    currentParticipantRef = null;

    if (name === 'teacher-dashboard' && user) { window.loadMyQuizzes(); window.loadSoloResults(); }
    if (window.lucide) lucide.createIcons();
    window.scrollTo(0, 0);
};

window.showMessage = (text, type = 'info') => {
    const c = document.getElementById('msg-container');
    if (!c) return;
    const msg = document.createElement('div');
    msg.className = `p-4 rounded-2xl shadow-2xl font-black text-white animate-pop mb-3 flex items-center gap-3 ${type === 'error' ? 'bg-rose-500' : 'bg-indigo-600'}`;
    msg.innerHTML = `<i data-lucide="${type === 'error' ? 'alert-circle' : 'info'}" class="w-5 h-5"></i><span>${text}</span>`;
    c.appendChild(msg);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => { msg.classList.add('opacity-0'); setTimeout(() => msg.remove(), 500); }, 4000);
};

window.quitHostSession = () => { if (confirm("Край на сесията?")) window.switchScreen('teacher-dashboard'); };
window.showRulesHelpModal = () => { rulesModalShown = true; document.getElementById('modal-rules-help').classList.remove('hidden'); document.getElementById('modal-rules-help').classList.add('flex'); };

window.toggleAuthMode = () => {
    authMode = authMode === 'login' ? 'register' : 'login';
    const isReg = authMode === 'register';
    document.getElementById('auth-title').innerText = isReg ? "Регистрация" : "Вход за Учители";
    document.getElementById('auth-submit-btn').innerText = isReg ? "Регистрирай се" : "Влез в панел";
    document.getElementById('auth-toggle-text').innerText = isReg ? "Вход" : "Регистрация";
    const el = document.getElementById('auth-teacher-code-container');
    if(isReg) el.classList.remove('hidden'); else el.classList.add('hidden');
};

window.handleAuthSubmit = async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-password').value.trim();
    if (!email || !pass) return window.showMessage("Попълнете всички полета!", "error");
    if (auth.currentUser && auth.currentUser.isAnonymous) await signOut(auth);
    window.showMessage("Обработка...", "info");

    try {
        if (authMode === 'register') {
            const code = document.getElementById('auth-teacher-code').value.trim();
            if (code !== MASTER_TEACHER_CODE) return window.showMessage("Грешен код!", "error");
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await setDoc(doc(db, 'artifacts', finalAppId, 'users', cred.user.uid, 'settings', 'profile'), {
                role: 'teacher', email: email, emailNormalized: email.toLowerCase(), activatedAt: serverTimestamp()
            });
            window.showMessage("Успешна регистрация!");
            window.switchScreen('teacher-dashboard');
        } else {
            await signInWithEmailAndPassword(auth, email, pass);
            window.showMessage("Добре дошли!");
            window.switchScreen('teacher-dashboard');
        }
    } catch (e) { window.showMessage("Грешка: " + e.message, "error"); }
};

window.handleLogout = async () => {
    await signOut(auth); window.showMessage("Изход."); setTimeout(() => location.reload(), 1000);
};

window.openImportModal = () => { document.getElementById('import-code-input').value = ""; document.getElementById('modal-import').classList.remove('hidden'); document.getElementById('modal-import').classList.add('flex'); };
window.submitImport = () => {
    const code = document.getElementById('import-code-input').value;
    const dec = decodeQuizCode(code);
    if (!dec || !dec.v) return window.showMessage("Невалиден код.", "error");
    window.saveImportedQuiz({ title: dec.title || "Без име", v: dec.v, q: dec.q || [] });
    document.getElementById('modal-import').classList.add('hidden');
};

window.saveImportedQuiz = async (data) => {
    if (!user) return;
    try {
        await addDoc(collection(db, 'artifacts', finalAppId, 'users', user.uid, 'my_quizzes'), {
            title: data.title + " (Импортиран)", v: data.v, questions: data.q, createdAt: serverTimestamp()
        });
        window.showMessage("Урокът е добавен!", "info");
    } catch (e) { if(e.code === 'permission-denied') window.showRulesHelpModal(); else window.showMessage("Грешка.", "error"); }
// ==========================================
// ЧАСТ 2: УЧИТЕЛСКИ ПАНЕЛ И СЕСИЯ НА ЖИВО
// ==========================================
window.loadMyQuizzes = async () => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'artifacts', finalAppId, 'users', user.uid, 'my_quizzes'), (snap) => {
        myQuizzes = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        renderMyQuizzes();
    });
    unsubscribes.push(unsub);
};

window.loadSoloResults = async () => {
    if (!user) return;
    const unsub = onSnapshot(getTeacherSoloResultsCollection(user.uid), (snap) => {
        soloResults = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        renderSoloResults();
    });
    unsubscribes.push(unsub);
};

window.deleteSoloResult = async (id) => {
    if (!user || !confirm("Изтриване?")) return;
    try { await deleteDoc(doc(getTeacherSoloResultsCollection(user.uid), id)); window.showMessage("Изтрито."); } catch (e) {}
};

function renderMyQuizzes() {
    const el = document.getElementById('my-quizzes-list');
    if (!el) return;
    el.innerHTML = myQuizzes.map(q => `
        <div class="bg-white p-5 rounded-[1.5rem] border shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
            <div class="truncate w-full text-center sm:text-left">
                <h4 class="font-black text-slate-800 truncate text-lg">${q.title}</h4>
                <p class="text-[10px] text-slate-400 font-black uppercase">${q.questions?.length || 0} въпроса</p>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="window.startHostFromLibrary('${q.id}')" title="Старт" class="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><i data-lucide="play" class="w-5 h-5"></i></button>
                <button onclick="window.editQuiz('${q.id}')" title="Редакция" class="p-3 bg-white text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white border-2 border-indigo-100 transition-all"><i data-lucide="pencil" class="w-5 h-5"></i></button>
                <button onclick="window.showShareCode('${q.id}')" title="Код" class="p-3 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-600 hover:text-white transition-all"><i data-lucide="link" class="w-5 h-5"></i></button>
                <button onclick="window.deleteQuiz('${q.id}')" title="Изтрий" class="p-3 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
            </div>
        </div>
    `).join('') || '<div class="col-span-full text-center py-10 opacity-30 italic">Няма уроци.</div>';
    if(window.lucide) lucide.createIcons();
}

function renderSoloResults() {
    const body = document.getElementById('solo-results-body');
    if (!body) return;
    const sorted = [...soloResults].sort((a,b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
    const totals = sorted.reduce((acc, r) => {
        const p = parseScoreValue(r.score);
        acc.score += p.score; acc.total += p.total; return acc;
    }, { score: 0, total: 0 });
    const pct = totals.total > 0 ? Math.round((totals.score / totals.total) * 100) : 0;
    const sumEl = document.getElementById('solo-results-summary');
    if(sumEl) sumEl.innerText = `Опити: ${sorted.length} • Среден успех: ${pct}%`;

    body.innerHTML = sorted.map(r => `
        <tr class="border-b text-xs hover:bg-slate-50">
            <td class="py-3 px-4 font-black">${r.studentName || '-'}</td>
            <td class="py-3 px-4 truncate max-w-[120px]">${r.quizTitle || '-'}</td>
            <td class="py-3 px-4 font-mono text-slate-400">${formatDate(r.timestamp)}</td>
            <td class="py-3 px-4 text-right font-bold text-indigo-600">${r.score}</td>
            <td class="py-3 px-4 text-center"><button onclick="window.deleteSoloResult('${r.id}')" class="text-rose-400 hover:text-rose-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="py-6 text-center italic text-slate-300">Няма резултати.</td></tr>';
    if(window.lucide) lucide.createIcons();
}

window.startHostFromLibrary = async (id) => {
    const quiz = myQuizzes.find(q => q.id === id);
    if (!quiz) return;
    currentQuiz = { v: quiz.v, q: quiz.questions, title: quiz.title };
    currentQuizOwnerId = user?.uid || null;
    await window.openLiveHost();
};

const createUniqueSessionPin = async () => {
    for(let i=0; i<20; i++) {
        const p = Math.floor(1000 + Math.random() * 9000).toString();
        const s = await getDoc(getSessionRefById(p));
        if(!s.exists()) return p;
    }
    return Math.floor(10000 + Math.random() * 90000).toString();
};

window.openLiveHost = async () => {
    if (!user) return;
    sessionID = await createUniqueSessionPin();
    sessionDocId = sessionID;
    window.switchScreen('live-host');
    document.getElementById('host-pin').innerText = sessionID;

    const joinUrl = `${window.location.origin}${window.location.pathname}?pin=${sessionID}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}`;
    const qrEl = document.getElementById('host-qr-container');
    if (qrEl) qrEl.innerHTML = `<div class="text-[10px] uppercase font-black text-slate-400 mb-2 tracking-widest">QR Вход</div><img src="${qrUrl}" class="w-24 h-24 rounded-xl border-4 border-indigo-50"><div class="text-[9px] text-slate-300 mt-1 font-mono">Сканирай</div>`;

    try {
        await setDoc(getSessionRefById(sessionDocId), {
            activeQ: -1, status: 'waiting', hostId: user.uid, pin: sessionID, timestamp: serverTimestamp(),
            totalPoints: currentQuiz.q.reduce((a,b) => a + (b.points||1), 0)
        });
    } catch(e) { if(e.code === 'permission-denied') window.showRulesHelpModal(); }

    participantStorageMode = 'session';
    lastFetchedParticipants = [];
    
    const u1 = onSnapshot(getParticipantsCollection(sessionDocId), (s) => {
        lastFetchedParticipants = s.docs.map(d => ({...d.data(), id: d.id}));
        renderHostDashboard();
    });
    const u2 = onSnapshot(getLegacyParticipantsCollection(), (s) => {
        const l = s.docs.map(d => ({...d.data(), id: d.id})).filter(p => p.sessionId === sessionID);
        l.forEach(p => { if(!lastFetchedParticipants.find(x => x.id === p.id)) lastFetchedParticipants.push(p); });
        renderHostDashboard();
    });
    unsubscribes.push(u1, u2);
};

window.initHostPlayer = () => {
    if (!window.YT || !window.YT.Player) { setTimeout(window.initHostPlayer, 1000); return; }
    document.getElementById('host-video-container').innerHTML = '<div id="host-video"></div>';
    document.getElementById('host-setup-area')?.classList.add('hidden');
    hostPlayer = new YT.Player('host-video', {
        videoId: currentQuiz.v, width: '100%', height: '100%',
        playerVars: { 'autoplay': 1, 'modestbranding': 1, 'rel': 0, 'playsinline': 1 },
        events: {
            'onReady': (e) => e.target.playVideo(),
            'onStateChange': async (e) => {
                if (e.data === YT.PlayerState.PLAYING) {
                    activeIntervals.forEach(clearInterval); activeIntervals = [];
                    const i = setInterval(async () => {
                        if (!hostPlayer?.getCurrentTime) return;
                        const cur = Math.floor(hostPlayer.getCurrentTime());
                        document.getElementById('host-timer').innerText = formatTime(cur);
                        const qIdx = currentQuiz.q.findIndex(q => Math.abs(q.time - cur) <= 1);
                        if (qIdx !== -1 && qIdx !== liveActiveQIdx) {
                            liveActiveQIdx = qIdx;
                            hostPlayer.pauseVideo();
                            await updateDoc(getSessionRefById(sessionDocId), {
                                activeQ: qIdx, qData: JSON.parse(JSON.stringify(currentQuiz.q[qIdx])), status: 'active', qStartedAt: serverTimestamp()
                            });
                        }
                    }, 1000);
                    activeIntervals.push(i);
                }
            }
        }
    });
};

window.deleteParticipant = async (id) => {
    if(!confirm("Премахване?")) return;
    try { await deleteDoc(getParticipantRef(sessionDocId, id)); await deleteDoc(getLegacyParticipantRef(id)); } catch(e) {}
};

function renderHostDashboard() {
    document.getElementById('host-participant-count').innerText = lastFetchedParticipants.length;
    let tA = 0, tC = 0;
    lastFetchedParticipants.forEach(p => {
        const v = Object.values(p.answers || {});
        tA += v.length;
        tC += v.filter(x => x === true).length;
    });
    const pct = tA > 0 ? (tC/tA)*100 : 0;
    document.getElementById('progress-percent').innerText = Math.round(pct) + '%';
    
    const lb = [...lastFetchedParticipants].sort((a,b) => (b.score - a.score));
    document.getElementById('host-results-body').innerHTML = lb.map((p, i) => `
        <tr class="border-b transition-all hover:bg-slate-50 animate-pop">
            <td class="py-3 px-3 font-black text-xs">
                <div class="flex items-center gap-2"><span class="text-slate-300">${i+1}.</span><span class="text-lg">${p.avatar||'👤'}</span><span class="truncate">${p.name}</span></div>
            </td>
            <td class="py-3 px-3 text-right font-black text-indigo-600">${p.score}</td>
            <td class="py-3 px-2 text-center"><button onclick="window.deleteParticipant('${p.id}')" class="text-slate-300 hover:text-rose-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
        </tr>
    `).join('');
    if(window.lucide) lucide.createIcons();
}

window.finishLiveSession = async () => {
    if (!sessionID) return;
    try {
        await updateDoc(getSessionRefById(sessionDocId), { status: 'finished' });
        document.getElementById('export-buttons-container').classList.remove('hidden');
        document.getElementById('export-buttons-container').classList.add('flex');
        window.showMessage("Сесията приключи!");
    } catch (e) { if(e.code === 'permission-denied') window.showRulesHelpModal(); }
};

// EXPORTS
function getExportData() { return lastFetchedParticipants.map(p => ({ Name: p.name, Score: p.score })); }
window.exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(getExportData());
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, `QuizResults_${sessionID}.xlsx`);
    window.showMessage("Excel изтеглен!");
};
window.exportPDF = async () => {
    window.showMessage("Генериране на PDF...", "info");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    try {
        const fontRes = await fetch("https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf");
        const fontBuff = await fontRes.arrayBuffer();
        const fontBase64 = btoa(new Uint8Array(fontBuff).reduce((d, b) => d + String.fromCharCode(b), ''));
        doc.addFileToVFS("Roboto.ttf", fontBase64);
        doc.addFont("Roboto.ttf", "Roboto", "normal");
        doc.setFont("Roboto");
    } catch(e) {}
    doc.setFontSize(18); doc.text(`Резултати: Сесия ${sessionID}`, 10, 10);
    doc.autoTable({ head: [['Име', 'Точки']], body: getExportData().map(d => [d.Name, d.Score]), styles: { font: "Roboto", fontStyle: 'normal' } });
    doc.save(`QuizResults_${sessionID}.pdf`);
    window.showMessage("PDF изтеглен!");
};
window.exportSoloResultsExcel = () => {
    const ws = XLSX.utils.json_to_sheet(soloResults.map(r => ({ Student: r.studentName, Quiz: r.quizTitle, Date: formatDate(r.timestamp), Score: r.score })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "SoloResults");
    XLSX.writeFile(wb, "SoloResults.xlsx");
};
// ==========================================
// ЧАСТ 3: УЧЕНИЦИ, ИНДИВИДУАЛНА РАБОТА, РЕДАКТОР
// ==========================================
window.joinLiveSession = async () => {
    const pin = document.getElementById('live-pin').value.trim();
    studentNameValue = document.getElementById('live-student-name').value.trim();
    if(!pin || !studentNameValue) return window.showMessage("Попълнете полетата!", "error");
    
    try {
        window.showMessage("Свързване...", "info");
        if(!auth.currentUser) await signInAnonymously(auth);
        
        const snap = await getDoc(getSessionRefById(pin));
        if(!snap.exists()) return window.showMessage("Невалиден ПИН.", "error");

        sessionID = pin; sessionDocId = pin;
        const randomAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
        window.switchScreen('live-client');
        document.getElementById('my-avatar-display').innerText = randomAvatar;

        const uid = auth.currentUser.uid;
        const pData = { name: studentNameValue, sessionId: pin, avatar: randomAvatar, score: 0, answers: {} };
        
        try {
            currentParticipantRef = getParticipantRef(pin, uid);
            await setDoc(currentParticipantRef, pData, { merge: true });
        } catch(e) {
            currentParticipantRef = getLegacyParticipantRef(uid);
            await setDoc(currentParticipantRef, pData, { merge: true });
        }

        const unsub = onSnapshot(getSessionRefById(pin), (s) => {
            const d = s.data(); if(!d) return;
            if(d.status === 'finished') {
                window.switchScreen('live-client');
                document.getElementById('client-question').classList.add('hidden');
                document.getElementById('client-waiting').classList.add('hidden');
                document.getElementById('client-finished').classList.remove('hidden');
                document.getElementById('final-score-display').innerText = liveScore;
            } else if(d.status === 'active' && d.activeQ !== liveActiveQIdx) {
                liveActiveQIdx = d.activeQ;
                window.currentLiveQ = d.qData;
                document.getElementById('client-question').classList.remove('hidden');
                document.getElementById('client-waiting').classList.add('hidden');
                document.getElementById('live-q-text-client').innerText = d.qData.text;
                window.renderLiveQuestionUI(d.qData);
            } else if(d.status !== 'active') {
                document.getElementById('client-question').classList.add('hidden');
                document.getElementById('client-waiting').classList.remove('hidden');
            }
        });
        unsubscribes.push(unsub);
        
    } catch(e) { window.showMessage("Грешка при вход.", "error"); }
};

window.renderLiveQuestionUI = (q) => {
    const c = document.getElementById('live-options-client'); c.innerHTML = '';
    window.tempLiveSelection = null;
    
    if(q.type === 'single' || q.type === 'boolean') {
        const opts = q.type === 'boolean' ? ['ДА', 'НЕ'] : q.options;
        c.innerHTML = opts.map((o, i) => `
            <button onclick="window.submitLiveAnswer(${q.type === 'boolean' ? (i===0) : i})" class="w-full p-4 bg-white border-2 border-slate-100 rounded-xl font-bold text-lg shadow-sm mb-3 text-left hover:border-indigo-500">${o}</button>
        `).join('');
    } else {
        c.innerHTML = '<p class="text-center font-bold text-slate-500">Отговори на екрана на учителя.</p>';
    }
};

window.submitLiveAnswer = async (val) => {
    if(lastAnsweredIdx === liveActiveQIdx) return;
    lastAnsweredIdx = liveActiveQIdx;
    
    const isCor = (val === window.currentLiveQ.correct);
    if(isCor) liveScore += (window.currentLiveQ.points || 1);
    
    document.getElementById('client-question').classList.add('hidden');
    document.getElementById('client-waiting').classList.remove('hidden');
    document.getElementById('waiting-status-text').innerText = isCor ? "ВЕРЕН! 🎉" : "ГРЕШЕН... 😢";
    
    if(currentParticipantRef) {
        const up = { score: liveScore };
        up[`answers.${liveActiveQIdx}`] = isCor;
        await updateDoc(currentParticipantRef, up);
    }
};

// SOLO MODE
window.startIndividual = async () => {
    const code = document.getElementById('ind-quiz-code').value.trim().replace(/\s/g, '');
    if(!code) return window.showMessage("Въведете код!", "error");
    
    window.showMessage("Зареждане...", "info");
    const decoded = decodeQuizCode(code);
    if(!decoded || !decoded.v) return window.showMessage("Невалиден код.", "error");
    
    currentQuiz = decoded;
    currentQuiz.q.sort((a,b) => a.time - b.time);
    
    isDiscussionMode = document.getElementById('ind-discussion-mode').checked;
    sopModeEnabled = document.getElementById('ind-sop-mode').checked;
    
    if(!isDiscussionMode) {
        studentNameValue = prompt("Вашето име:") || "Анонимен";
    }
    
    currentQuizOwnerId = await window.resolveTeacherUidFromCode(decoded);
    
    if(!auth.currentUser) { try { await signInAnonymously(auth); } catch(e){} }
    
    window.switchScreen('solve');
    scoreCount = 0; currentQIndex = -1; soloGameFinished = false;
    
    if(!window.YT) { setTimeout(window.initSolvePlayer, 1000); return; }
    
    document.getElementById('solve-player-container').innerHTML = '<div id="solve-player"></div>';
    
    solvePlayer = new YT.Player('solve-player', {
        videoId: currentQuiz.v, width: '100%', height: '100%',
        playerVars: { 'autoplay': 1, 'controls': 1, 'rel': 0, 'playsinline': 1 },
        events: {
            'onStateChange': (e) => {
                if (e.data === YT.PlayerState.PLAYING) {
                    activeIntervals.forEach(clearInterval); activeIntervals = [];
                    const m = setInterval(() => {
                        if(!solvePlayer?.getCurrentTime) return;
                        const cur = Math.floor(solvePlayer.getCurrentTime());
                        const qIdx = currentQuiz.q.findIndex((q, i) => cur >= q.time && i > currentQIndex);
                        if(qIdx !== -1) {
                            currentQIndex = qIdx;
                            window.triggerSoloQuestion(currentQuiz.q[qIdx]);
                        }
                        if(solvePlayer.getDuration() > 0 && cur >= solvePlayer.getDuration()-1) window.finishSoloGame();
                    }, 500);
                    activeIntervals.push(m);
                } else if(e.data === YT.PlayerState.ENDED) {
                    window.finishSoloGame();
                }
            }
        }
    });
};

window.triggerSoloQuestion = (q) => {
    solvePlayer.pauseVideo();
    const ov = document.getElementById('ind-overlay');
    ov.classList.remove('hidden'); ov.classList.add('flex'); ov.style.zIndex = "9999";
    
    const txt = document.getElementById('ind-overlay-q-text');
    txt.innerText = q.text;
    if(sopModeEnabled) {
        txt.className = "font-black text-white leading-tight drop-shadow-lg text-4xl md:text-6xl";
        readQuestionWithSpeech(q.text);
    } else {
        txt.className = "font-black text-white leading-tight drop-shadow-lg text-2xl md:text-4xl";
    }
    
    const c = document.getElementById('ind-overlay-options'); c.innerHTML = '';
    
    if(q.type === 'single' || q.type === 'boolean') {
        const opts = q.type === 'boolean' ? ['ДА', 'НЕ'] : q.options;
        c.innerHTML = opts.map((o, i) => `
            <button onclick="window.submitSoloAnswer(${q.type === 'boolean' ? (i===0) : i})" class="w-full p-4 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-white font-bold text-left backdrop-blur-sm pointer-events-auto">${o}</button>
        `).join('');
    } else {
         c.innerHTML = `<button onclick="window.submitSoloAnswer(true)" class="w-full p-4 bg-indigo-600 rounded-xl text-white font-bold pointer-events-auto">Продължи</button>`;
    }
};

window.submitSoloAnswer = (val) => {
    const q = currentQuiz.q[currentQIndex];
    let isCor = (q.type === 'boolean' || q.type === 'single') ? (val === q.correct) : true;
    
    if(isCor) {
        scoreCount += (q.points || 1);
        window.showMessage("Верен отговор!", "success");
    } else {
        window.showMessage("Грешен отговор!", "error");
    }
    
    document.getElementById('ind-overlay').classList.add('hidden');
    document.getElementById('ind-overlay').classList.remove('flex');
    if('speechSynthesis' in window) window.speechSynthesis.cancel();
    setTimeout(() => solvePlayer.playVideo(), 1000);
};

window.finishSoloGame = async () => {
    if(soloGameFinished) return;
    soloGameFinished = true;
    window.switchScreen('finish');
    activeIntervals.forEach(clearInterval);
    
    const max = currentQuiz.q.reduce((a,b) => a + (b.points||1), 0);
    const pct = max > 0 ? Math.round((scoreCount/max)*100) : 0;
    
    let msg = pct > 80 ? "Отлично!" : (pct > 50 ? "Добър резултат!" : "Опитай пак!");
    document.getElementById('res-score').innerHTML = `<div class="text-6xl mb-2">${scoreCount} / ${max}</div><div class="text-xl text-slate-400">${msg}</div>`;
    
    if(isDiscussionMode) return;
    
    if(auth.currentUser && currentQuizOwnerId) {
        const id = `${auth.currentUser.uid}_${Date.now()}`;
        try {
            await setDoc(doc(getTeacherSoloResultsCollection(currentQuizOwnerId), id), {
                studentName: studentNameValue,
                quizTitle: currentQuiz.title + (sopModeEnabled ? " (СОП)" : ""),
                score: `${scoreCount}/${max}`,
                timestamp: serverTimestamp(),
                userId: auth.currentUser.uid
            });
            window.showMessage("Резултатът е записан!", "success");
        } catch(e) { console.error(e); }
    }
};

// EDITOR
window.editQuiz = (id) => {
    const q = myQuizzes.find(x => x.id === id);
    if(!q) return;
    editingQuizId = id; questions = JSON.parse(JSON.stringify(q.questions)); currentVideoId = q.v;
    window.switchScreen('create');
    document.getElementById('yt-url').value = `https://youtu.be/${q.v}`;
    window.loadEditorVideo();
};

window.saveQuizToLibrary = async () => {
    if(!user) return;
    const title = prompt("Име на урока:") || "Без име";
    try {
        const d = { title, v: currentVideoId, questions, updatedAt: serverTimestamp() };
        if(editingQuizId) await updateDoc(doc(db, 'artifacts', finalAppId, 'users', user.uid, 'my_quizzes', editingQuizId), d);
        else await addDoc(collection(db, 'artifacts', finalAppId, 'users', user.uid, 'my_quizzes'), d);
        window.showMessage("Запазено!", "success");
        window.switchScreen('teacher-dashboard');
    } catch(e) { window.showMessage("Грешка при запис.", "error"); }
};

window.deleteQuiz = async (id) => {
    if(confirm("Изтриване?")) {
        await deleteDoc(doc(db, 'artifacts', finalAppId, 'users', user.uid, 'my_quizzes', id));
    }
};

window.showShareCode = (id) => {
    const q = myQuizzes.find(x => x.id === id);
    const code = btoa(unescape(encodeURIComponent(JSON.stringify({
        v: q.v, q: q.questions, title: q.title, ownerId: user.uid, ownerEmail: user.email
    }))));
    document.getElementById('share-code-display').value = code;
    document.getElementById('modal-share').classList.remove('hidden'); document.getElementById('modal-share').classList.add('flex');
};

window.copyShareCode = () => {
    document.getElementById('share-code-display').select();
    document.execCommand('copy');
    window.showMessage("Копирано!");
};

window.loadEditorVideo = () => {
    const url = document.getElementById('yt-url').value;
    const id = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([\w-]{11})/)?.[1];
    if(!id) return;
    currentVideoId = id;
    document.getElementById('editor-view').classList.remove('hidden');
    document.getElementById('editor-player-container').innerHTML = '<div id="player"></div>';
    player = new YT.Player('player', { videoId: id, events: { 'onReady': () => {
        setInterval(() => { if(player?.getCurrentTime) document.getElementById('timer').innerText = formatTime(player.getCurrentTime()); }, 500);
    }}});
    renderEditorList();
};

window.openQuestionModal = () => { document.getElementById('modal-q').classList.remove('hidden'); document.getElementById('modal-q').classList.add('flex'); };
window.saveQuestion = () => {
    const text = document.getElementById('m-text').value;
    const type = document.getElementById('m-type').value;
    const t = player ? Math.floor(player.getCurrentTime()) : 0;
    const q = { time: t, text: text || "Въпрос", type, points: 1, correct: 0, options: ["Отговор A", "Отговор B"] };
    questions.push(q);
    questions.sort((a,b) => a.time - b.time);
    renderEditorList();
    document.getElementById('modal-q').classList.add('hidden');
};

function renderEditorList() {
    const c = document.getElementById('q-list');
    c.innerHTML = questions.map((q, i) => `
        <div class="p-3 bg-white border rounded-xl mb-2 flex justify-between">
            <span class="font-bold text-indigo-600">${formatTime(q.time)}</span>
            <span class="truncate w-32">${q.text}</span>
            <button onclick="questions.splice(${i},1); renderEditorList()" class="text-rose-500">✕</button>
        </div>
    `).join('');
}

window.onYouTubeIframeAPIReady = () => { isYTReady = true; };

window.addEventListener('DOMContentLoaded', () => {
    const p = new URLSearchParams(window.location.search).get('pin');
    if(p) setTimeout(() => { 
        const el = document.getElementById('live-pin'); 
        if(el) { el.value = p; window.showMessage("ПИН зареден!"); }
    }, 1000);
});
// ==========================================
// KRAI NA APP.JS
// ==========================================
};
