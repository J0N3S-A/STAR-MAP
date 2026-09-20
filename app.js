import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCT7bYMjc-r5LpwLM9SdiTKkEtP-IKOcro",
    authDomain: "memo-8ea40.firebaseapp.com",
    projectId: "memo-8ea40",
    storageBucket: "memo-8ea40.firebasestorage.app",
    messagingSenderId: "127177015064",
    appId: "1:127177015064:web:e9d006d90d6e28bf9fa86d"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// AUTHENTICATION & ROLE MANAGEMENT
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

if (loginBtn) {
    loginBtn.addEventListener("click", () => {
        signInWithPopup(auth, provider).catch((error) => {
            console.error("Anmeldefehler:", error);
            alert("Fehler bei der Anmeldung: " + error.message);
        });
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        signOut(auth);
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userRef = doc(db, "users", user.uid);
        try {
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                const userData = userSnap.data();
                if (userData.role === "admin") {
                    if (loginBtn) loginBtn.style.display = "none";
                    if (logoutBtn) logoutBtn.style.display = "inline-block";
                } else {
                    alert("Zugriff verweigert: Sie besitzen keine Administratorrechte.");
                    await signOut(auth);
                }
            } else {
                // إنشاء مستند جديد في مجموعة users وتعيين دور user افتراضيًا
                await setDoc(userRef, {
                    email: user.email,
                    role: "user",
                    createdAt: serverTimestamp()
                });
                alert("Ihr Konto wurde erstellt. Bitte warten Sie auf die Administrator-Freigabe.");
                await signOut(auth);
            }
        } catch (error) {
            console.error("Fehler beim Abrufen der Benutzerrolle:", error);
            alert("Zugriffsfehler auf die Datenbank.");
            await signOut(auth);
        }
    } else {
        if (loginBtn) loginBtn.style.display = "inline-block";
        if (logoutBtn) logoutBtn.style.display = "none";
    }
});

const SUPABASE_URL = "https://slcjqnexveclbtvjxeuc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsY2pxbmV4dmVjbGJ0dmp4ZXVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MTcwNTksImV4cCI6MjEwMDE5MzA1OX0.tZM3I7Kx8_ACL4_HzZRvqSr31OmfuueJs9_Ml7ldgHA"; 
const BUCKET_NAME = "memoiren-files";

let nodesData = new vis.DataSet([]);
let edgesData = new vis.DataSet([]);
let activeBubbleId = null;
let currentAction = null;
let currentNotebookIndex = null;
let currentPageIndex = 0;
let activeGroupRecordingIndex = null;

const container = document.getElementById("mindmap");
const data = { nodes: nodesData, edges: edgesData };
const options = {
    nodes: {
        shape: "dot", size: 22,
        color: { 
            background: "#F2F7F4", border: "#E4ECE7", 
            highlight: { background: "#D9EBE4", border: "#C2DACF" } 
        },
        font: { family: "Plus Jakarta Sans", color: "#4A5D54", size: 14, face: "Plus Jakarta Sans" },
        borderWidth: 2, shadow: { enabled: true, color: "rgba(74, 93, 84, 0.04)", size: 12 }
    },
    edges: { color: { color: "#C2DACF", highlight: "#A7CBB9" }, smooth: { type: "continuous" }, width: 2 },
    physics: {
        enabled: false,
        solver: "barnesHut",
        barnesHut: { gravitationalConstant: -2000, centralGravity: 0.3, springLength: 95, springConstant: 0.04, damping: 0.09 }
    },
    interaction: { hover: true, dragNodes: true },
    manipulation: { enabled: false, addEdge: async function(edgeData, callback) {
        if(edgeData.from !== edgeData.to) {
            await addDoc(collection(db, "connections"), { from: edgeData.from, to: edgeData.to });
            callback(edgeData);
        }
    }}
};
const network = new vis.Network(container, data, options);

network.on("dragEnd", async function (params) {
    const physicsSwitch = document.getElementById("physicsSwitch");
    if (physicsSwitch && physicsSwitch.checked) return; 

    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const position = network.getPosition(nodeId);
        await updateDoc(doc(db, "bubbles", nodeId), { x: position.x, y: position.y });
    }
});

onSnapshot(collection(db, "bubbles"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        const d = change.doc.data();
        if (change.type === "added" || change.type === "modified") {
            nodesData.update({ id: change.doc.id, label: d.title, x: d.x, y: d.y, content: d.content });
            if(activeBubbleId === change.doc.id) renderContent(activeBubbleId);
        }
        if (change.type === "removed") nodesData.remove(change.doc.id);
    });
});
onSnapshot(collection(db, "connections"), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") edgesData.update({ id: change.doc.id, from: change.doc.data().from, to: change.doc.data().to });
        if (change.type === "removed") edgesData.remove(change.doc.id);
    });
});

(function injectPhysicsSwitchUI() {
    const connectSwitch = document.getElementById("connectSwitch");
    if (connectSwitch) {
        const parentLabel = connectSwitch.closest("label") || connectSwitch.parentElement;
        if (parentLabel) {
            const physicsWrapper = document.createElement("div");
            physicsWrapper.style.marginTop = "8px";
            physicsWrapper.innerHTML = `
                <label class="${parentLabel.className || 'switch-container'}" style="${parentLabel.getAttribute('style') || ''}">
                    <span>Körperliche Bewegung</span>
                    <input type="checkbox" id="physicsSwitch">
                    <span class="slider"></span>
                </label>
            `;
            parentLabel.parentNode.insertBefore(physicsWrapper, parentLabel.nextSibling);
            document.getElementById("physicsSwitch").addEventListener("change", (e) => {
                network.setOptions({ physics: { enabled: e.target.checked } });
            });
        }
    }
})();

document.getElementById("connectSwitch").addEventListener("change", (e) => {
    if (e.target.checked) network.addEdgeMode();
    else network.disableEditMode();
});

network.on("doubleClick", async (params) => {
    if (params.nodes.length > 0) {
        activeBubbleId = params.nodes[0];
        const bubble = nodesData.get(activeBubbleId);
        document.getElementById("bubbleTitleInput").value = bubble.label;
        document.getElementById("contentModal").classList.add("active");
        renderContent(activeBubbleId);
    } else if (params.edges.length > 0) {
        const edgeId = params.edges[0];
        await deleteDoc(doc(db, "connections", edgeId));
    }
});

document.getElementById("bubbleBasket").addEventListener("dragend", async (e) => {
    const pos = network.DOMtoCanvas({ x: e.clientX, y: e.clientY });
    await addDoc(collection(db, "bubbles"), {
        title: "Neuer Gedanke", x: pos.x, y: pos.y,
        content: { quickNotes: [], notebooks: [], audioGroups: [], photos: [] }
    });
});

document.getElementById("openSubmapBtn").addEventListener("click", () => {
    if (activeBubbleId) {
        const bubble = nodesData.get(activeBubbleId);
        window.location.href = `submap.html?bubbleId=${activeBubbleId}&title=${encodeURIComponent(bubble.label)}`;
    }
});

async function uploadToSupabase(file) {
    try {
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${fileName}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY, 'Content-Type': file.type },
            body: file
        });
        if (res.ok) return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${fileName}`;
        else { console.error("Supabase Error:", await res.json()); return null; }
    } catch (err) { console.error("Network Error:", err); return null; }
}

async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const scale = Math.min(1000 / img.width, 1);
                canvas.width = img.width * scale; canvas.height = img.height * scale;
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(resolve, "image/jpeg", 0.7);
            };
        };
    });
}

document.getElementById("imageInput").addEventListener("change", async (e) => {
    if (!e.target.files[0] || !activeBubbleId) return;
    const blob = await compressImage(e.target.files[0]);
    const url = await uploadToSupabase(new File([blob], "photo.jpg", {type: "image/jpeg"}));
    if (url) {
        const b = nodesData.get(activeBubbleId);
        if (!b.content.photos) b.content.photos = [];
        b.content.photos.push({ id: Date.now(), url });
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    }
});

let mediaRecorder, audioChunks = [];

window.addAudioGroup = async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.audioGroups) b.content.audioGroups = [];
    b.content.audioGroups.push({ id: Date.now(), title: "Neue Gruppe", description: "", isOpen: true, audios: [] });
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

window.toggleAudioGroup = async (gIdx, isOpen) => {
    const b = nodesData.get(activeBubbleId);
    b.content.audioGroups[gIdx].isOpen = isOpen;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

window.updateAudioGroupField = async (gIdx, field, value) => {
    const b = nodesData.get(activeBubbleId);
    b.content.audioGroups[gIdx][field] = value;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

window.askDeleteAudioGroup = (gIdx) => {
    currentAction = { action: 'deleteAudioGroup', gIdx };
    document.getElementById("confirmModal").classList.add("active");
};

window.startGroupRecording = async (gIdx) => {
    const btn = document.getElementById(`recBtn_${gIdx}`);
    if (mediaRecorder && mediaRecorder.state === "recording" && activeGroupRecordingIndex === gIdx) {
        mediaRecorder.stop();
        if (btn) btn.innerHTML = "🎙️ Neue Aufnahme starten";
        activeGroupRecordingIndex = null;
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            activeGroupRecordingIndex = gIdx;
            
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.start();
            if (btn) btn.innerHTML = "⏹️ Aufnahme läuft... Zum Stoppen klicken";
            
            mediaRecorder.onstop = async () => {
                const file = new File([new Blob(audioChunks, { type: "audio/webm" })], "record.webm", {type: "audio/webm"});
                audioChunks = [];
                const url = await uploadToSupabase(file);
                if(url){
                    const b = nodesData.get(activeBubbleId);
                    if (!b.content.audioGroups[gIdx].audios) b.content.audioGroups[gIdx].audios = [];
                    b.content.audioGroups[gIdx].audios.push({ id: Date.now(), title: "Sprachaufnahme", url });
                    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
                }
            };
        } catch (err) {
            console.error("Microphone error:", err);
            alert("Bitte erlauben Sie den Zugriff auf das Mikrofon.");
        }
    }
};

window.updateGroupAudioTitle = async (gIdx, aIdx, title) => {
    const b = nodesData.get(activeBubbleId);
    b.content.audioGroups[gIdx].audios[aIdx].title = title;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

window.askDeleteGroupAudio = (gIdx, aIdx) => {
    currentAction = { action: 'deleteGroupAudio', gIdx, aIdx };
    document.getElementById("confirmModal").classList.add("active");
};

document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
        document.querySelectorAll(".tab-btn, .tab-content").forEach(el => el.classList.remove("active"));
        e.currentTarget.classList.add("active");
        document.getElementById(e.currentTarget.dataset.tab).classList.add("active");
    });
});

document.getElementById("closeContentModal").addEventListener("click", () => document.getElementById("contentModal").classList.remove("active"));
document.getElementById("bubbleTitleInput").addEventListener("change", (e) => {
    if (activeBubbleId) updateDoc(doc(db, "bubbles", activeBubbleId), { title: e.target.value });
});

function renderContent(id) {
    const bubble = nodesData.get(id);
    if (!bubble) return;
    
    let content = bubble.content || { quickNotes: [], notebooks: [], audioGroups: [], photos: [] };

    if (content.audios && content.audios.length > 0) {
        if (!content.audioGroups) content.audioGroups = [];
        content.audioGroups.unshift({
            id: Date.now(), title: "Einzelne Aufnahmen", description: "Frühere Sprachaufnahmen", isOpen: true, audios: [...content.audios]
        });
        delete content.audios;
        updateDoc(doc(db, "bubbles", id), { content: content });
    }

    document.getElementById("quickNotesList").innerHTML = (content.quickNotes || []).map((n, i) => `
        <div class="item-card">
            <input type="text" value="${n.title}" onchange="updateData('quickNotes', ${i}, 'title', this.value)">
            <textarea onchange="updateData('quickNotes', ${i}, 'text', this.value)">${n.text}</textarea>
            <div class="item-actions">
                <button class="btn-icon-text" onclick="openMoveModal('quickNotes', ${i})">Verschieben</button>
                <button class="btn-icon-text" style="color:var(--danger-color)" onclick="askDelete('quickNotes', ${i})">Löschen</button>
            </div>
        </div>`).join("");

    document.getElementById("notebooksList").innerHTML = (content.notebooks || []).map((nb, i) => `
        <div class="notebook-cover">
            <input type="text" class="notebook-title-input" value="${nb.title}" onchange="updateData('notebooks', ${i}, 'title', this.value)">
            <div class="notebook-actions">
                <button class="btn-open" onclick="openNotebook(${i})">Öffnen</button>
                <div class="actions-row">
                    <button class="btn-icon-text" onclick="openMoveModal('notebooks', ${i})">Verschieben</button>
                    <button class="btn-icon-text" style="color:var(--danger-color)" onclick="askDelete('notebooks', ${i})">Löschen</button>
                </div>
            </div>
        </div>`).join("");
        
    document.getElementById("audiosList").innerHTML = `
        <div style="margin-bottom: 15px;">
            <button class="btn-primary" onclick="addAudioGroup()" style="width: 100%; padding: 12px; font-weight: bold; font-size: 14px; cursor: pointer;">
                + Neue Audiogruppe hinzufügen
            </button>
        </div>
        <div id="audioGroupsContainer">
            ${(content.audioGroups || []).map((group, gIdx) => `
                <div style="border: 2px solid #E4ECE7; padding: 16px; border-radius: 12px; margin-bottom: 16px; background: #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 10px;">
                        <div style="flex-grow: 1;">
                            <label style="font-size: 11px; color: #666; display: block; margin-bottom: 2px; font-weight: bold;">Gruppentitel:</label>
                            <input type="text" value="${group.title || ''}" onchange="updateAudioGroupField(${gIdx}, 'title', this.value)" 
                                   style="width: 100%; font-weight: bold; border: 1px solid #D1DED6; padding: 8px 10px; border-radius: 6px; font-size: 14px; color: #2C3E35; background: #FBFDFB;">
                        </div>
                        <div style="display: flex; gap: 6px; align-items: flex-end; padding-top: 15px;">
                            ${group.isOpen ? 
                                `<button onclick="toggleAudioGroup(${gIdx}, false)" style="background: #E4ECE7; color: #2C3E35; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer;">Ausblenden 🙈</button>` : 
                                `<button onclick="toggleAudioGroup(${gIdx}, true)" style="background: #D9EBE4; color: #2C3E35; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer;">Alle anzeigen 👁️</button>`
                            }
                            <button onclick="askDeleteAudioGroup(${gIdx})" style="background: #FFE8E8; color: #D9534F; border: none; padding: 8px 12px; border-radius: 6px; font-weight: 600; cursor: pointer;">🗑️</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="font-size: 11px; color: #666; display: block; margin-bottom: 2px; font-weight: bold;">Beschreibung / Details:</label>
                        <textarea onchange="updateAudioGroupField(${gIdx}, 'description', this.value)" 
                                  style="width: 100%; border: 1px solid #D1DED6; padding: 8px 10px; border-radius: 6px; font-size: 13px; color: #4A5D54; background: #FBFDFB; resize: vertical; min-height: 45px;">${group.description || ''}</textarea>
                    </div>
                    ${group.isOpen ? `
                        <div style="margin-top: 14px; border-top: 2px dashed #E4ECE7; padding-top: 14px; background: #F9FBF9; padding: 12px; border-radius: 8px;">
                            <div style="margin-bottom: 14px; text-align: center;">
                                <button onclick="startGroupRecording(${gIdx})" id="recBtn_${gIdx}" 
                                        style="background: #4A5D54; color: #FFF; border: none; padding: 10px 20px; border-radius: 20px; font-weight: bold; cursor: pointer; transition: 0.2s;">
                                    🎙️ Neue Aufnahme starten
                                </button>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                ${(group.audios && group.audios.length > 0) ? group.audios.map((a, aIdx) => `
                                    <div style="background: #FFF; padding: 10px 12px; border-radius: 8px; border: 1px solid #E0E7E3;">
                                        <div style="margin-bottom: 6px;">
                                            <input type="text" value="${a.title}" onchange="updateGroupAudioTitle(${gIdx}, ${aIdx}, this.value)" 
                                                   style="border: none; border-bottom: 1px solid #CCC; font-weight: bold; width: 100%; font-size: 13px; padding: 2px 0; color: #333;">
                                        </div>
                                        <audio controls src="${a.url}" style="width: 100%; height: 36px; margin-top: 4px;"></audio>
                                        <div style="text-align: left; margin-top: 6px;">
                                            <button style="color: #D9534F; background: transparent; border: none; font-size: 11px; cursor: pointer; font-weight: bold;" onclick="askDeleteGroupAudio(${gIdx}, ${aIdx})">Aufnahme löschen 🗑️</button>
                                        </div>
                                    </div>
                                `).join("") : '<div style="text-align:center; color:#888; font-size:12px;">Keine Sprachaufnahmen vorhanden.</div>'}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `).join("")}
        </div>
    `;

    document.getElementById("photosList").innerHTML = (content.photos || []).map((p, i) => `
        <div class="photo-wrapper">
            <img src="${p.url}">
            <button class="delete-btn" style="position:absolute; top:8px; right:8px; background:rgba(255,255,255,0.9); width:28px; height:28px; border-radius:50%; display:flex; justify-content:center; align-items:center;" onclick="askDelete('photos', ${i})">&times;</button>
        </div>`).join("");
}

window.updateData = async (type, index, field, value) => {
    const b = nodesData.get(activeBubbleId);
    b.content[type][index][field] = value;
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
};

document.getElementById("addQuickNoteBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.quickNotes) b.content.quickNotes = [];
    b.content.quickNotes.push({ title: "Neue Notiz", text: "" });
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
});

document.getElementById("addNotebookBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.notebooks) b.content.notebooks = [];
    b.content.notebooks.push({ title: "Neues Notizbuch", pages: [""] });
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
});

window.openNotebook = (index) => {
    currentNotebookIndex = index; currentPageIndex = 0;
    const b = nodesData.get(activeBubbleId);
    const nb = b.content.notebooks[index];
    if (!nb.pages) { nb.pages = [nb.text || ""]; delete nb.text; }
    document.getElementById("activeNotebookTitle").innerText = nb.title;
    document.getElementById("notebookModal").classList.add("active");
    renderNotebookPage();
};

function renderNotebookPage() {
    const nb = nodesData.get(activeBubbleId).content.notebooks[currentNotebookIndex];
    const textContent = nb.pages[currentPageIndex] || "";
    document.getElementById("notebookPageInput").value = textContent;
    document.getElementById("pageIndicator").innerText = `Seite ${currentPageIndex + 1}`;
    document.getElementById("prevPageBtn").disabled = currentPageIndex === 0;
    document.getElementById("nextPageBtn").disabled = textContent.trim() === "";
}

document.getElementById("notebookPageInput").addEventListener("input", async (e) => {
    const text = e.target.value;
    const b = nodesData.get(activeBubbleId);
    b.content.notebooks[currentNotebookIndex].pages[currentPageIndex] = text;
    document.getElementById("nextPageBtn").disabled = text.trim() === "";
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
});

document.getElementById("prevPageBtn").addEventListener("click", () => {
    if (currentPageIndex > 0) { currentPageIndex--; renderNotebookPage(); }
});

document.getElementById("nextPageBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    const nb = b.content.notebooks[currentNotebookIndex];
    if (nb.pages[currentPageIndex].trim() !== "") {
        currentPageIndex++;
        if (currentPageIndex >= nb.pages.length) {
            nb.pages.push("");
            await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
        }
        renderNotebookPage();
    }
});
document.getElementById("closeNotebookModal").addEventListener("click", () => document.getElementById("notebookModal").classList.remove("active"));

window.askDelete = (type, index) => {
    currentAction = { action: 'deleteItem', type, index };
    document.getElementById("confirmModal").classList.add("active");
};
document.getElementById("deleteBubbleBtn").addEventListener("click", () => {
    currentAction = { action: 'deleteBubble' }; 
    document.getElementById("confirmModal").classList.add("active");
});
document.getElementById("cancelConfirmBtn").addEventListener("click", () => document.getElementById("confirmModal").classList.remove("active"));

document.getElementById("actionConfirmBtn").addEventListener("click", async () => {
    if (!currentAction) return;
    if (currentAction.action === 'deleteBubble') {
        await deleteDoc(doc(db, "bubbles", activeBubbleId));
        document.getElementById("contentModal").classList.remove("active");
    } else if (currentAction.action === 'deleteAudioGroup') {
        const b = nodesData.get(activeBubbleId);
        b.content.audioGroups.splice(currentAction.gIdx, 1);
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    } else if (currentAction.action === 'deleteGroupAudio') {
        const b = nodesData.get(activeBubbleId);
        b.content.audioGroups[currentAction.gIdx].audios.splice(currentAction.aIdx, 1);
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    } else if (currentAction.action === 'deleteItem') {
        const b = nodesData.get(activeBubbleId);
        b.content[currentAction.type].splice(currentAction.index, 1);
        await updateDoc(doc(db, "bubbles", activeBubbleId), { content: b.content });
    }
    currentAction = null;
    document.getElementById("confirmModal").classList.remove("active");
});

window.openMoveModal = (type, index) => {
    currentAction = { action: 'move', type, index };
    document.getElementById("targetBubbleSelect").innerHTML = nodesData.get().filter(n => n.id !== activeBubbleId).map(n => `<option value="${n.id}">${n.label}</option>`).join("");
    document.getElementById("moveModal").classList.add("active");
};
document.getElementById("cancelMoveBtn").addEventListener("click", () => document.getElementById("moveModal").classList.remove("active"));
document.getElementById("actionMoveBtn").addEventListener("click", async () => {
    const targetId = document.getElementById("targetBubbleSelect").value;
    if(!targetId) return;
    const sourceB = nodesData.get(activeBubbleId);
    const targetB = nodesData.get(targetId);
    const item = sourceB.content[currentAction.type].splice(currentAction.index, 1)[0];
    if (!targetB.content[currentAction.type]) targetB.content[currentAction.type] = [];
    targetB.content[currentAction.type].push(item);
    await updateDoc(doc(db, "bubbles", activeBubbleId), { content: sourceB.content });
    await updateDoc(doc(db, "bubbles", targetId), { content: targetB.content });
    document.getElementById("moveModal").classList.remove("active");
});
