import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDoc, getDocs, setDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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
let isPageStarred = {}; // لتتبع الصفحات المميزة
let editingQuickNoteIndex = null;
let activeQuickNoteModalIndex = null;
let movingQuickNoteIndex = null;
const NOTEBOOK_SAVE_DELAY_MS = 700;
let notebookSaveTimer = null;
let notebookSaveQueue = Promise.resolve();
let notebookSaveDirty = false;
let notebookSaveRevision = 0;
let notebookStorageReady = false;
const RECENT_COLORS_KEY = "star-map-recent-colors";
const DEFAULT_COLORS = ["#fe019a", "#000000", "#8000f8", "#0400f8"];
let stagedFormatColor = DEFAULT_COLORS[0];

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
            const existing = nodesData.get(change.doc.id);
            if (existing?.content?.notebooks && d.content?.notebooks) {
                const cachedNotebooks = new Map(existing.content.notebooks.filter(nb => nb.id).map(nb => [nb.id, nb]));
                d.content.notebooks = d.content.notebooks.map(notebook => {
                    const cached = notebook.id && cachedNotebooks.get(notebook.id);
                    return cached?.pages ? { ...notebook, pages: cached.pages, pageTitles: cached.pageTitles } : notebook;
                });
            }
            nodesData.update({ id: change.doc.id, label: d.title, x: d.x, y: d.y, content: d.content });
            if(activeBubbleId === change.doc.id && editingQuickNoteIndex === null) renderContent(activeBubbleId);
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
        await saveBubbleContent(activeBubbleId, b.content);
    }
});

let mediaRecorder, audioChunks = [];

window.addAudioGroup = async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.audioGroups) b.content.audioGroups = [];
    b.content.audioGroups.push({ id: Date.now(), title: "Neue Gruppe", description: "", isOpen: true, audios: [] });
    await saveBubbleContent(activeBubbleId, b.content);
};

window.toggleAudioGroup = async (gIdx, isOpen) => {
    const b = nodesData.get(activeBubbleId);
    b.content.audioGroups[gIdx].isOpen = isOpen;
    await saveBubbleContent(activeBubbleId, b.content);
};

window.updateAudioGroupField = async (gIdx, field, value) => {
    const b = nodesData.get(activeBubbleId);
    b.content.audioGroups[gIdx][field] = value;
    await saveBubbleContent(activeBubbleId, b.content);
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
                    await saveBubbleContent(activeBubbleId, b.content);
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
    await saveBubbleContent(activeBubbleId, b.content);
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
document.getElementById("closeQuickNoteModal").addEventListener("click", () => {
    document.getElementById("quickNoteModal").classList.remove("active");
    activeQuickNoteModalIndex = null;
});
document.getElementById("bubbleTitleInput").addEventListener("change", (e) => {
    if (activeBubbleId) updateDoc(doc(db, "bubbles", activeBubbleId), { title: e.target.value });
});

window.openQuickNoteModal = (index) => {
    const bubble = nodesData.get(activeBubbleId);
    const note = bubble.content.quickNotes[index];
    activeQuickNoteModalIndex = index;
    const titleInput = document.getElementById("quickNoteModalTitle");
    const editor = document.getElementById("quickNoteModalEditor");
    titleInput.value = note.title || "";
    editor.dataset.editorIndex = String(index);
    editor.innerHTML = toEditorHtml(note.text);
    const toolbar = document.querySelector('.header-format-toolbar[data-toolbar-for="quickNoteModalEditor"]');
    toolbar.classList.remove("open");
    toolbar.querySelector(".format-menu-toggle").setAttribute("aria-expanded", "false");
    setFormatView(toolbar, "main");
    document.getElementById("quickNoteModal").classList.add("active");
};

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

function renderQuickNoteCard(note, index) {
    return `
        <div class="item-card">
            <div class="item-title-row">
                <input type="text" value="${escapeHtml(note.title)}" onchange="updateData('quickNotes', ${index}, 'title', this.value)">
                <div class="format-toolbar header-format-toolbar" data-toolbar-for="quickNote-${index}" aria-label="Textformatierung">
                    <button type="button" class="format-menu-toggle" title="Textformatierung" aria-label="Textformatierung">Aa</button>
                    <div class="format-tools">
                        <button type="button" class="format-toggle" data-command="bold" title="Fett" aria-label="Fett">B</button>
                        <div class="color-swatches" aria-label="Standardfarben">
                            ${DEFAULT_COLORS.map(color => `<button type="button" class="color-swatch" data-color="${color}" style="background:${color}" aria-label="Farbe ${color}"></button>`).join("")}
                        </div>
                        <div class="custom-colors" aria-label="Zuletzt verwendete Farben"></div>
                        <input class="hex-color-input" type="text" inputmode="text" maxlength="7" placeholder="#FF5733" aria-label="Hex-Farbcode">
                        <select data-command="formatBlock" title="Textstil" aria-label="Textstil">
                            <option value="p">Normal</option><option value="h3">Überschrift</option><option value="blockquote">Zitat</option>
                        </select>
                    </div>
                </div>
            </div>
            <div id="quickNote-${index}" class="quick-note-editor rich-editor" contenteditable="true" data-editor-type="quick-note" data-editor-index="${index}" role="textbox" aria-multiline="true" data-placeholder="Text hier eingeben...">${toEditorHtml(note.text)}</div>
            <div class="item-actions">
                <button type="button" class="quick-note-expand-btn" aria-label="Notiz vollständig anzeigen" title="Notiz vollständig anzeigen" onclick="openQuickNoteModal(${index})">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
                <button class="btn-icon-text" onclick="openQuickNoteGroupMoveModal(${index})">Sammlung</button>
                <button class="btn-icon-text" onclick="openMoveModal('quickNotes', ${index})">Bubble verschieben</button>
                <button class="btn-icon-text" style="color:var(--danger-color)" onclick="askDelete('quickNotes', ${index})">Löschen</button>
            </div>
        </div>`;
}

function renderQuickNotes(content) {
    const groups = content.quickNoteGroups || [];
    const notes = content.quickNotes || [];
    const ungroupedNotes = notes
        .map((note, index) => ({ note, index }))
        .filter(({ note }) => !groups.some(group => String(group.id) === String(note.groupId)));
    const ungroupedMarkup = ungroupedNotes.length
        ? `<div class="quick-note-ungrouped">${ungroupedNotes.map(({ note, index }) => renderQuickNoteCard(note, index)).join("")}</div>`
        : "";
    const groupsMarkup = groups.map((group, groupIndex) => {
        const groupNotes = notes
            .map((note, index) => ({ note, index }))
            .filter(({ note }) => String(note.groupId) === String(group.id));
        const isOpen = group.isOpen !== false;
        return `
            <section class="quick-note-group">
                <div class="quick-note-group-header">
                    <input class="quick-note-group-title" type="text" value="${escapeHtml(group.title || "")}" aria-label="Sammlungsname" onchange="updateQuickNoteGroupTitle(${groupIndex}, this.value)">
                    <div class="quick-note-group-actions">
                        <button type="button" class="btn-icon-text" onclick="toggleQuickNoteGroup(${groupIndex}, ${!isOpen})">${isOpen ? "Ausblenden 🙈" : "Alle anzeigen 👁️"}</button>
                        <button type="button" class="btn-icon-text quick-note-group-delete" aria-label="Sammlung löschen" onclick="askDeleteQuickNoteGroup(${groupIndex})">&times;</button>
                    </div>
                </div>
                ${isOpen ? `<div class="quick-note-group-notes">${groupNotes.map(({ note, index }) => renderQuickNoteCard(note, index)).join("") || '<div class="quick-note-group-empty">Noch keine Notizen in dieser Sammlung.</div>'}</div>` : ""}
            </section>`;
    }).join("");
    const notesDivider = groupsMarkup && ungroupedMarkup
        ? '<hr class="quick-notes-divider">'
        : "";
    document.getElementById("quickNotesList").innerHTML = `${groupsMarkup}${notesDivider}${ungroupedMarkup}`;
}

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
        saveBubbleContent(id, content);
    }

    renderQuickNotes(content);
    if (activeQuickNoteModalIndex !== null && document.getElementById("quickNoteModal").classList.contains("active")) {
        const activeNote = content.quickNotes?.[activeQuickNoteModalIndex];
        const modalEditor = document.getElementById("quickNoteModalEditor");
        const modalToolbar = document.querySelector('.header-format-toolbar[data-toolbar-for="quickNoteModalEditor"]');
        const modalHasFocus = modalEditor === document.activeElement || modalToolbar.contains(document.activeElement);
        if (activeNote && editingQuickNoteIndex === null && !modalHasFocus) {
            document.getElementById("quickNoteModalTitle").value = activeNote.title || "";
            modalEditor.innerHTML = toEditorHtml(activeNote.text);
        }
    }

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
    renderRecentColors();
}

function toEditorHtml(value) {
    if (!value) return "";
    const text = String(value);
    return /<([a-z][\s\S]*?)>/i.test(text)
        ? text
        : text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

window.updateData = async (type, index, field, value) => {
    const b = nodesData.get(activeBubbleId);
    b.content[type][index][field] = value;
    await saveBubbleContent(activeBubbleId, b.content);
};

function getRecentColors() {
    try {
        const colors = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) || "[]");
        return Array.isArray(colors) ? colors.filter(color => /^#[0-9A-F]{6}$/i.test(color)) : [];
    } catch (error) {
        console.warn("Konnte gespeicherte Farben nicht laden:", error);
        return [];
    }
}

function rememberColor(color) {
    const normalized = color.toUpperCase();
    const colors = [normalized, ...getRecentColors().filter(item => item !== normalized)].slice(0, 4);
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(colors));
    renderRecentColors();
}

function renderRecentColors() {
    document.querySelectorAll(".color-format-view .color-swatches").forEach(defaultColors => {
        defaultColors.innerHTML = DEFAULT_COLORS.map(color =>
            `<button type="button" class="color-swatch" data-color="${color}" style="background:${color}" aria-label="Standardfarbe ${color}"></button>`
        ).join("");
    });
    document.querySelectorAll(".custom-colors").forEach(container => {
        container.innerHTML = getRecentColors().map(color =>
            `<button type="button" class="color-swatch" data-color="${color}" style="background:${color}" aria-label="Farbe ${color}"></button>`
        ).join("");
    });
    updateSelectedPaletteColor();
}

function applyEditorColor(editor, color) {
    if (!/^#[0-9A-F]{6}$/i.test(color)) return;
    restoreEditorSelection(editor);
    editor.focus();
    document.execCommand("foreColor", false, color);
    rememberColor(color);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
}

function updateSelectedPaletteColor() {
    document.querySelectorAll(".color-format-view .color-swatch").forEach(swatch => {
        const selected = swatch.dataset.color.toUpperCase() === stagedFormatColor.toUpperCase();
        swatch.classList.toggle("selected", selected);
        swatch.setAttribute("aria-pressed", String(selected));
    });
}

function setStagedFormatColor(color, clearManualInput = true) {
    if (!/^#[0-9A-F]{6}$/i.test(color)) return false;
    stagedFormatColor = color.toUpperCase();
    document.querySelectorAll(".format-toolbar .hsl-color-picker").forEach(input => { input.value = stagedFormatColor; });
    document.querySelectorAll(".format-toolbar .current-color-hex").forEach(input => { input.value = stagedFormatColor; });
    if (clearManualInput) {
        document.querySelectorAll(".format-toolbar .manual-color-hex").forEach(input => {
            input.value = "";
            input.removeAttribute("aria-invalid");
        });
    }
    document.querySelectorAll(".format-toolbar .confirm-color-btn").forEach(button => { button.disabled = false; });
    updateSelectedPaletteColor();
    return true;
}

function setFormatView(toolbar, viewName) {
    toolbar.querySelectorAll("[data-format-view]").forEach(view => {
        const active = view.dataset.formatView === viewName;
        view.hidden = !active;
        view.classList.toggle("active", active);
    });
}

function executeFormatCommand(toolbar, command, value = null) {
    const editor = document.getElementById(toolbar.dataset.toolbarFor);
    if (!editor) return;
    restoreEditorSelection(editor);
    editor.focus();
    document.execCommand(command, false, value);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
}

renderRecentColors();

document.addEventListener("focusin", (event) => {
    const editor = event.target.closest(".quick-note-editor");
    if (editor) editingQuickNoteIndex = Number(editor.dataset.editorIndex);
});
document.addEventListener("focusout", (event) => {
    if (event.target.closest(".quick-note-editor")) {
        window.setTimeout(() => { editingQuickNoteIndex = null; }, 0);
    }
});

document.getElementById("addQuickNoteBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.quickNotes) b.content.quickNotes = [];
    b.content.quickNotes.push({ title: "Neue Notiz", text: "", groupId: null });
    await saveBubbleContent(activeBubbleId, b.content);
});

document.getElementById("addQuickNoteGroupBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.quickNoteGroups) b.content.quickNoteGroups = [];
    b.content.quickNoteGroups.push({ id: String(Date.now()), title: "Neue Sammlung", isOpen: true });
    await saveBubbleContent(activeBubbleId, b.content);
});

window.updateQuickNoteGroupTitle = async (groupIndex, title) => {
    const b = nodesData.get(activeBubbleId);
    b.content.quickNoteGroups[groupIndex].title = title;
    await saveBubbleContent(activeBubbleId, b.content);
};

window.toggleQuickNoteGroup = async (groupIndex, isOpen) => {
    const b = nodesData.get(activeBubbleId);
    b.content.quickNoteGroups[groupIndex].isOpen = isOpen;
    await saveBubbleContent(activeBubbleId, b.content);
};

window.askDeleteQuickNoteGroup = (groupIndex) => {
    currentAction = { action: "deleteQuickNoteGroup", groupIndex };
    document.getElementById("confirmModal").classList.add("active");
};

window.openQuickNoteGroupMoveModal = (noteIndex) => {
    const b = nodesData.get(activeBubbleId);
    const note = b.content.quickNotes[noteIndex];
    movingQuickNoteIndex = noteIndex;
    document.getElementById("quickNoteGroupSelect").innerHTML = [
        `<option value="">Ohne Sammlung</option>`,
        ...(b.content.quickNoteGroups || []).map(group =>
            `<option value="${escapeHtml(group.id)}" ${String(note.groupId) === String(group.id) ? "selected" : ""}>${escapeHtml(group.title || "Unbenannte Sammlung")}</option>`
        )
    ].join("");
    document.getElementById("quickNoteGroupMoveModal").classList.add("active");
};

document.getElementById("cancelQuickNoteGroupMoveBtn").addEventListener("click", () => {
    movingQuickNoteIndex = null;
    document.getElementById("quickNoteGroupMoveModal").classList.remove("active");
});

document.getElementById("confirmQuickNoteGroupMoveBtn").addEventListener("click", async () => {
    if (movingQuickNoteIndex === null) return;
    const b = nodesData.get(activeBubbleId);
    const targetGroupId = document.getElementById("quickNoteGroupSelect").value;
    b.content.quickNotes[movingQuickNoteIndex].groupId = targetGroupId || null;
    await saveBubbleContent(activeBubbleId, b.content);
    movingQuickNoteIndex = null;
    document.getElementById("quickNoteGroupMoveModal").classList.remove("active");
});

document.getElementById("quickNoteModalTitle").addEventListener("change", async (event) => {
    if (activeBubbleId === null || activeQuickNoteModalIndex === null) return;
    await window.updateData("quickNotes", activeQuickNoteModalIndex, "title", event.target.value);
});

document.getElementById("addNotebookBtn").addEventListener("click", async () => {
    const b = nodesData.get(activeBubbleId);
    if (!b.content.notebooks) b.content.notebooks = [];
    const notebook = { title: "Neues Notizbuch", pages: [""], pageTitles: [""] };
    ensureNotebookPageTitles(notebook);
    b.content.notebooks.push(notebook);
    await saveBubbleContent(activeBubbleId, b.content);
});

function ensureNotebookPageTitles(notebook) {
    if (!Array.isArray(notebook.pageTitles)) notebook.pageTitles = [];
    notebook.pages.forEach((_, index) => {
        if (typeof notebook.pageTitles[index] !== "string") notebook.pageTitles[index] = "";
    });
    notebook.pageTitles.length = notebook.pages.length;
    if (!notebook.id) notebook.id = createNotebookId();
    if (!Array.isArray(notebook.pageIds)) notebook.pageIds = [];
    notebook.pageIds = notebook.pages.map((_, index) => notebook.pageIds[index] || createNotebookId());
}

function createNotebookId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function notebookPageRef(bubbleId, notebook, pageIndex) {
    return doc(db, "bubbles", bubbleId, "notebookPages", `${notebook.id}_${notebook.pageIds[pageIndex]}`);
}

async function removeNotebookPageDocuments(bubbleId, notebook) {
    if (!notebook?.id) return;
    const snapshot = await getDocs(collection(db, "bubbles", bubbleId, "notebookPages"));
    await Promise.all(snapshot.docs
        .filter(page => page.id.startsWith(`${notebook.id}_`))
        .map(page => deleteDoc(page.ref)));
}

async function copyNotebookPageDocuments(sourceBubbleId, targetBubbleId, notebook) {
    if (!notebook?.id) return;
    const snapshot = await getDocs(collection(db, "bubbles", sourceBubbleId, "notebookPages"));
    const pages = snapshot.docs.filter(page => page.id.startsWith(`${notebook.id}_`));
    await Promise.all(pages.map(page => setDoc(
        doc(db, "bubbles", targetBubbleId, "notebookPages", page.id),
        page.data()
    )));
}

function serializeBubbleContent(content) {
    return {
        ...content,
        notebooks: (content.notebooks || []).map(notebook => {
            if (notebook.storageVersion !== 1) return notebook;
            const { pages, ...metadata } = notebook;
            return metadata;
        })
    };
}

async function saveBubbleContent(bubbleId, content) {
    const storedContent = serializeBubbleContent(content);
    await updateDoc(doc(db, "bubbles", bubbleId), { content: storedContent });
}

function setNotebookSaveStatus(state, message) {
    const status = document.getElementById("notebookSaveStatus");
    if (!status) return;
    status.dataset.state = state;
    status.textContent = message;
}

async function loadNotebookPages(bubbleId, notebook) {
    if (!Array.isArray(notebook.pages)) {
        const pageCount = notebook.storageVersion === 1 && Array.isArray(notebook.pageIds)
            ? Math.max(notebook.pageIds.length, 1)
            : 1;
        notebook.pages = Array.from({ length: pageCount }, (_, index) => index === 0 ? notebook.text || "" : "");
    }
    delete notebook.text;
    ensureNotebookPageTitles(notebook);

    if (notebook.storageVersion !== 1) {
        for (let index = 0; index < notebook.pages.length; index++) {
            await setDoc(notebookPageRef(bubbleId, notebook, index), {
                content: notebook.pages[index] || "",
                title: notebook.pageTitles[index] || ""
            });
        }
        notebook.storageVersion = 1;
        const bubble = nodesData.get(bubbleId);
        const currentNotebook = bubble.content.notebooks.find(candidate => candidate.id === notebook.id);
        if (!currentNotebook) throw new Error("Notizbuch wurde während der Migration geändert.");
        Object.assign(currentNotebook, {
            id: notebook.id,
            pageIds: notebook.pageIds,
            pageTitles: notebook.pageTitles,
            pages: notebook.pages,
            storageVersion: 1
        });
        await saveBubbleContent(bubbleId, bubble.content);
    }

    const pageSnapshots = await Promise.all(notebook.pages.map((_, index) => getDoc(notebookPageRef(bubbleId, notebook, index))));
    notebook.pages = pageSnapshots.map((page, index) => {
        if (!page.exists()) return notebook.pages[index] || "";
        const data = page.data();
        if (typeof data.title === "string") notebook.pageTitles[index] = data.title;
        return typeof data.content === "string" ? data.content : "";
    });
}

function scheduleNotebookSave() {
    notebookSaveDirty = true;
    notebookSaveRevision++;
    setNotebookSaveStatus("saving", "Wird gespeichert…");
    clearTimeout(notebookSaveTimer);
    notebookSaveTimer = setTimeout(() => {
        flushNotebookSave().catch(error => {
            console.error("Notizbuchseite konnte nicht gespeichert werden:", error);
            setNotebookSaveStatus("error", "Speichern fehlgeschlagen");
        });
    }, NOTEBOOK_SAVE_DELAY_MS);
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden && notebookStorageReady && notebookSaveDirty) {
        flushNotebookSave().catch(error => {
            console.error("Notizbuchseite konnte beim Wechseln der Ansicht nicht gespeichert werden:", error);
            setNotebookSaveStatus("error", "Speichern fehlgeschlagen");
        });
    }
});

async function flushNotebookSave() {
    clearTimeout(notebookSaveTimer);
    if (!notebookSaveDirty) {
        await notebookSaveQueue;
        return;
    }

    const bubbleId = activeBubbleId;
    const notebookIndex = currentNotebookIndex;
    const pageIndex = currentPageIndex;
    const bubble = nodesData.get(bubbleId);
    const notebook = bubble?.content?.notebooks?.[notebookIndex];
    if (!notebook || !document.getElementById("notebookModal").classList.contains("active")) return;

    ensureNotebookPageTitles(notebook);
    const editor = document.getElementById("notebookPageInput");
    const titleInput = document.getElementById("notebookPageTitleInput");
    const content = editor.innerHTML;
    const title = titleInput.value;
    const revision = notebookSaveRevision;
    notebook.pages[pageIndex] = content;
    notebook.pageTitles[pageIndex] = title;

    const savePromise = notebookSaveQueue.then(async () => {
        await setDoc(notebookPageRef(bubbleId, notebook, pageIndex), { content, title });
    });
    notebookSaveQueue = savePromise.catch(() => {});
    await savePromise;
    if (revision === notebookSaveRevision) {
        notebookSaveDirty = false;
        setNotebookSaveStatus("saved", "Gespeichert");
    }
}

async function tryFlushNotebookSave() {
    if (!notebookStorageReady) return !notebookSaveDirty;
    try {
        do {
            await flushNotebookSave();
            await notebookSaveQueue;
        } while (notebookSaveDirty);
        return true;
    } catch (error) {
        console.error("Notizbuchseite konnte nicht gespeichert werden:", error);
        setNotebookSaveStatus("error", "Speichern fehlgeschlagen");
        return false;
    }
}

window.openNotebook = async (index) => {
    currentNotebookIndex = index; currentPageIndex = 0;
    clearTimeout(notebookSaveTimer);
    notebookSaveDirty = false;
    notebookSaveRevision++;
    notebookStorageReady = false;
    setNotebookSaveStatus("saved", "Gespeichert");
    const bubbleId = activeBubbleId;
    const notebook = nodesData.get(bubbleId).content.notebooks[index];
    try {
        await loadNotebookPages(bubbleId, notebook);
        notebookStorageReady = true;
        setNotebookSaveStatus("saved", "Gespeichert");
    } catch (error) {
        console.error("Notizbuchseiten konnten nicht geladen oder migriert werden:", error);
        setNotebookSaveStatus("error", "Speichern fehlgeschlagen");
    }
    if (activeBubbleId !== bubbleId || currentNotebookIndex !== index) return;
    const currentNotebook = nodesData.get(bubbleId).content.notebooks[index];
    if (currentNotebook.id !== notebook.id) return;
    currentNotebook.pages = notebook.pages;
    currentNotebook.pageTitles = notebook.pageTitles;
    document.getElementById("activeNotebookTitle").innerText = currentNotebook.title;
    document.getElementById("notebookModal").classList.add("active");
    loadStarredPages();
    updateStarButtonUI();
    renderNotebookPage();
}

function renderNotebookPage() {
    const nb = nodesData.get(activeBubbleId).content.notebooks[currentNotebookIndex];
    ensureNotebookPageTitles(nb);
    document.getElementById("notebookPageTitleInput").value = nb.pageTitles[currentPageIndex] || "";
    const textContent = nb.pages[currentPageIndex] || "";
    document.getElementById("notebookPageInput").innerHTML = toEditorHtml(textContent);
    document.getElementById("pageIndicator").innerText = `Seite ${currentPageIndex + 1}`;
    document.getElementById("notebookPageInput").contentEditable = String(notebookStorageReady);
    document.getElementById("notebookPageTitleInput").disabled = !notebookStorageReady;
    document.getElementById("prevPageBtn").disabled = !notebookStorageReady || currentPageIndex === 0;
    document.getElementById("nextPageBtn").disabled = !notebookStorageReady;
    document.getElementById("starBtn").disabled = !notebookStorageReady;
    document.getElementById("pagesListBtn").disabled = !notebookStorageReady;
    document.getElementById("reorderPageBtn").disabled = !notebookStorageReady;
    updateStarButtonUI(); // تحديث حالة النجمة عند تغيير الصفحة
}
// دوال التحكم بالنجمة والصفحات
async function loadStarredPages() {
    const b = nodesData.get(activeBubbleId);
    const nb = b.content.notebooks[currentNotebookIndex];
    if (!nb.starred) { nb.starred = []; }
    isPageStarred = {};
    nb.starred.forEach(idx => { isPageStarred[idx] = true; });
}

function updateStarButtonUI() {
    const btn = document.getElementById("starBtn");
    if (!btn) return;
    const isStarred = isPageStarred[currentPageIndex];
    if (isStarred) {
        btn.style.color = "#FFD700";
        btn.style.opacity = "1";
    } else {
        btn.style.color = "#8A9D93";
        btn.style.opacity = "0.6";
    }
}

window.togglePageStar = async () => {
    const b = nodesData.get(activeBubbleId);
    const nb = b.content.notebooks[currentNotebookIndex];
    if (!nb.starred) { nb.starred = []; }
    
    const idx = nb.starred.indexOf(currentPageIndex);
    if (idx > -1) {
        nb.starred.splice(idx, 1);
        isPageStarred[currentPageIndex] = false;
    } else {
        nb.starred.push(currentPageIndex);
        isPageStarred[currentPageIndex] = true;
    }
    
    updateStarButtonUI();
    await saveBubbleContent(activeBubbleId, b.content);
};

window.showPagesList = async () => {
    if (!await tryFlushNotebookSave()) return;
    const b = nodesData.get(activeBubbleId);
    const nb = b.content.notebooks[currentNotebookIndex];
    const container = document.getElementById("pagesListContainer");
    
    container.innerHTML = nb.pages.map((text, idx) => {
        const preview = text.substring(0, 50) + (text.length > 50 ? "..." : "");
        const isStarred = isPageStarred[idx];
        return `
            <div style="padding: 12px; background: #F2F7F4; border-radius: 10px; cursor: pointer; transition: 0.2s;" onclick="goToPage(${idx})">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; color: #4A5D54;">Seite ${idx + 1}</span>
                    ${isStarred ? '⭐' : ''}
                </div>
                <div style="font-size: 13px; color: #8A9D93; margin-top: 4px;">${preview || '(Leer)'}</div>
            </div>
        `;
    }).join("");
    
    document.getElementById("pagesListModal").classList.add("active");
};

window.goToPage = async (pageIndex) => {
    if (!await tryFlushNotebookSave()) return;
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= nodesData.get(activeBubbleId).content.notebooks[currentNotebookIndex].pages.length) return;
    currentPageIndex = pageIndex;
    renderNotebookPage();
    document.getElementById("pagesListModal").classList.remove("active");
};

document.getElementById("reorderPageBtn").addEventListener("click", async () => {
    if (!await tryFlushNotebookSave()) return;
    const b = nodesData.get(activeBubbleId);
    const nb = b.content.notebooks[currentNotebookIndex];
    ensureNotebookPageTitles(nb);
    const requestedPage = window.prompt(`Neue Position für Seite (1-${nb.pages.length})`, String(currentPageIndex + 1));
    if (requestedPage === null) return;
    const targetIndex = Number(requestedPage) - 1;
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= nb.pages.length) {
        window.alert(`Bitte eine ganze Zahl zwischen 1 und ${nb.pages.length} eingeben.`);
        return;
    }
    if (targetIndex === currentPageIndex) return;

    const entries = nb.pages.map((text, index) => ({
        text,
        title: nb.pageTitles[index],
        pageId: nb.pageIds[index],
        starred: Array.isArray(nb.starred) && nb.starred.includes(index)
    }));
    const [movedEntry] = entries.splice(currentPageIndex, 1);
    entries.splice(targetIndex, 0, movedEntry);
    nb.pages = entries.map(entry => entry.text);
    nb.pageTitles = entries.map(entry => entry.title);
    nb.pageIds = entries.map(entry => entry.pageId);
    nb.starred = entries.reduce((starred, entry, index) => {
        if (entry.starred) starred.push(index);
        return starred;
    }, []);
    currentPageIndex = targetIndex;
    await saveBubbleContent(activeBubbleId, b.content);
    await loadStarredPages();
    renderNotebookPage();
});

document.addEventListener("click", async (e) => {
    const menuToggle = e.target.closest(".format-menu-toggle");
    if (menuToggle) {
        const toolbar = menuToggle.closest(".format-toolbar");
        const isOpen = toolbar.classList.toggle("open");
        menuToggle.setAttribute("aria-expanded", String(isOpen));
        if (isOpen) {
            setFormatView(toolbar, "main");
            setStagedFormatColor(stagedFormatColor);
        }
        return;
    }
    const viewButton = e.target.closest(".format-view-option, .format-back-btn");
    if (viewButton) {
        const toolbar = viewButton.closest(".format-toolbar");
        const viewName = viewButton.dataset.viewTarget;
        setFormatView(toolbar, viewName);
        if (viewName === "colors") setStagedFormatColor(stagedFormatColor);
        return;
    }
    const copyHexButton = e.target.closest(".copy-hex-btn");
    if (copyHexButton) {
        const hexInput = copyHexButton.closest(".format-view").querySelector(".current-color-hex");
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(hexInput.value);
            } else {
                hexInput.select();
                if (!document.execCommand("copy")) throw new Error("Kopieren wurde vom Browser abgelehnt.");
            }
            copyHexButton.textContent = "Kopiert";
            window.setTimeout(() => { copyHexButton.textContent = "Kopieren"; }, 1200);
        } catch (error) {
            console.error("HEX-Farbcode konnte nicht kopiert werden:", error);
            alert("Der HEX-Farbcode konnte nicht kopiert werden.");
        }
        return;
    }
    const confirmColorButton = e.target.closest(".confirm-color-btn");
    if (confirmColorButton) {
        const toolbar = confirmColorButton.closest(".format-toolbar");
        const editor = document.getElementById(toolbar.dataset.toolbarFor);
        if (editor) {
            applyEditorColor(editor, stagedFormatColor);
            toolbar.classList.remove("open");
            toolbar.querySelector(".format-menu-toggle").setAttribute("aria-expanded", "false");
        }
        return;
    }
    const colorSwatch = e.target.closest(".color-swatch");
    if (colorSwatch) {
        const toolbar = colorSwatch.closest(".format-toolbar");
        const editor = document.getElementById(toolbar.dataset.toolbarFor);
        if (colorSwatch.closest(".color-format-view")) {
            setStagedFormatColor(colorSwatch.dataset.color);
            return;
        }
        if (editor) applyEditorColor(editor, colorSwatch.dataset.color);
        return;
    }
    const control = e.target.closest(".format-toolbar [data-command]");
    if (!control) return;
    if (control.tagName !== "BUTTON") return;
    const toolbar = control.closest(".format-toolbar");
    const editor = document.getElementById(toolbar.dataset.toolbarFor);
    if (!editor) return;
    restoreEditorSelection(editor);
    editor.focus();
    document.execCommand(control.dataset.command, false, control.value || null);
    if (control.dataset.command === "bold" && control.classList.contains("font-bold-toggle")) {
        control.setAttribute("aria-pressed", String(document.queryCommandState("bold")));
    }
    editor.dispatchEvent(new Event("input", { bubbles: true }));
});

document.addEventListener("click", (event) => {
    const toolbar = document.querySelector('.header-format-toolbar[data-toolbar-for="notebookPageInput"].open');
    if (toolbar && !toolbar.contains(event.target)) {
        toolbar.classList.remove("open");
        toolbar.querySelector(".format-menu-toggle").setAttribute("aria-expanded", "false");
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const quickNoteModal = document.getElementById("quickNoteModal");
    if (quickNoteModal.classList.contains("active")) {
        quickNoteModal.classList.remove("active");
        activeQuickNoteModalIndex = null;
        return;
    }
    const toolbar = document.querySelector('.header-format-toolbar[data-toolbar-for="notebookPageInput"].open');
    if (!toolbar) return;
    toolbar.classList.remove("open");
    toolbar.querySelector(".format-menu-toggle").setAttribute("aria-expanded", "false");
});

document.addEventListener("change", (e) => {
    const control = e.target.closest(".format-toolbar [data-command], .format-toolbar .hex-color-input, .format-toolbar .font-format-select");
    if (!control || control.tagName === "BUTTON") return;
    const toolbar = control.closest(".format-toolbar");
    const editor = document.getElementById(toolbar.dataset.toolbarFor);
    if (!editor) return;
    if (control.classList.contains("font-format-select")) {
        const [kind, value] = control.value.split(/:(.+)/);
        executeFormatCommand(toolbar, kind === "font" ? "fontName" : "formatBlock", value);
        return;
    }
    if (control.classList.contains("hex-color-input")) {
        applyEditorColor(editor, control.value.trim());
        control.value = "";
        return;
    }
    restoreEditorSelection(editor);
    editor.focus();
    const selectedValue = control.value;
    document.execCommand(control.dataset.command, false, selectedValue);
    if (control.dataset.command === "formatBlock") control.value = selectedValue;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
});

document.addEventListener("input", (e) => {
    const colorPicker = e.target.closest(".hsl-color-picker");
    if (colorPicker) {
        setStagedFormatColor(colorPicker.value);
        return;
    }
    const manualHex = e.target.closest(".manual-color-hex");
    if (manualHex) {
        const validColor = /^#[0-9A-F]{6}$/i.test(manualHex.value.trim());
        manualHex.toggleAttribute("aria-invalid", manualHex.value.length > 0 && !validColor);
        manualHex.closest(".format-toolbar").querySelector(".confirm-color-btn").disabled = manualHex.value.length > 0 && !validColor;
        if (validColor) setStagedFormatColor(manualHex.value.trim(), false);
        return;
    }
    const hexInput = e.target.closest(".hex-color-input");
    if (!hexInput || !/^#[0-9A-F]{6}$/i.test(hexInput.value.trim())) return;
    const toolbar = hexInput.closest(".format-toolbar");
    const editor = document.getElementById(toolbar.dataset.toolbarFor);
    if (editor) applyEditorColor(editor, hexInput.value.trim());
    hexInput.value = "";
});

let savedEditorSelection = null;
document.addEventListener("mousedown", (e) => {
    const control = e.target.closest(".format-toolbar button, .format-toolbar input, .format-toolbar select");
    if (!control) return;
    const editor = document.getElementById(control.closest(".format-toolbar").dataset.toolbarFor);
    const selection = window.getSelection();
    if (editor && selection.rangeCount && editor.contains(selection.anchorNode)) {
        savedEditorSelection = { editor, range: selection.getRangeAt(0).cloneRange() };
    }
});
function restoreEditorSelection(editor) {
    if (!savedEditorSelection || savedEditorSelection.editor !== editor) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedEditorSelection.range);
}

document.addEventListener("input", async (e) => {
    if (e.target.id === "notebookPageTitleInput" && notebookStorageReady && activeBubbleId !== null && currentNotebookIndex !== null) {
        const b = nodesData.get(activeBubbleId);
        if (!b) return;
        const notebook = b.content.notebooks[currentNotebookIndex];
        ensureNotebookPageTitles(notebook);
        notebook.pageTitles[currentPageIndex] = e.target.value;
        scheduleNotebookSave();
        return;
    }

    const editor = e.target.closest(".rich-editor");
    if (!editor) return;
    if (editor.dataset.editorType === "quick-note") {
        await updateData("quickNotes", Number(editor.dataset.editorIndex), "text", editor.innerHTML);
    } else if (editor.dataset.editorType === "notebook" && notebookStorageReady && activeBubbleId !== null && currentNotebookIndex !== null) {
        const b = nodesData.get(activeBubbleId);
        if (!b) return;
        b.content.notebooks[currentNotebookIndex].pages[currentPageIndex] = editor.innerHTML;
        document.getElementById("nextPageBtn").disabled = false;
        scheduleNotebookSave();
    }
});

document.getElementById("prevPageBtn").addEventListener("click", async () => {
    if (currentPageIndex > 0 && await tryFlushNotebookSave()) {
        currentPageIndex--;
        renderNotebookPage();
    }
});

const btn = document.getElementById("nextPageBtn");
let pressTimer;
let longPress = false;

btn.addEventListener("pointerdown", () => {
    longPress = false;
    pressTimer = setTimeout(async () => {
        longPress = true;
        if (!await tryFlushNotebookSave()) return;
        const b = nodesData.get(activeBubbleId);
        const nb = b.content.notebooks[currentNotebookIndex];
        const lastPageIndex = nb.pages.length - 1;

        if (nb.pages[lastPageIndex].trim() === "") {
            currentPageIndex = lastPageIndex;
        } else {
            ensureNotebookPageTitles(nb);
            nb.pages.push("");
            nb.pageTitles.push("");
            nb.pageIds.push(createNotebookId());
            try {
                await saveBubbleContent(activeBubbleId, b.content);
            } catch (error) {
                nb.pages.pop();
                nb.pageTitles.pop();
                nb.pageIds.pop();
                console.error("Neue Notizbuchseite konnte nicht gespeichert werden:", error);
                setNotebookSaveStatus("error", "Speichern fehlgeschlagen");
                return;
            }
            currentPageIndex = nb.pages.length - 1;
        }

        renderNotebookPage();
    }, 2000);
});

btn.addEventListener("pointerup", async () => {
    clearTimeout(pressTimer);
    if (!longPress) {
        if (!await tryFlushNotebookSave()) return;
        const b = nodesData.get(activeBubbleId);
        const nb = b.content.notebooks[currentNotebookIndex];
        if (nb.pages[currentPageIndex].trim() !== "") {
            const nextPageIndex = currentPageIndex + 1;
            if (nextPageIndex >= nb.pages.length) {
                ensureNotebookPageTitles(nb);
                nb.pages.push("");
                nb.pageTitles.push("");
                nb.pageIds.push(createNotebookId());
                try {
                    await saveBubbleContent(activeBubbleId, b.content);
                } catch (error) {
                    nb.pages.pop();
                    nb.pageTitles.pop();
                    nb.pageIds.pop();
                    console.error("Neue Notizbuchseite konnte nicht gespeichert werden:", error);
                    setNotebookSaveStatus("error", "Speichern fehlgeschlagen");
                    return;
                }
            }
            currentPageIndex = nextPageIndex;
            renderNotebookPage();
        }
    }
    longPress = false;
});

btn.addEventListener("pointercancel", () => clearTimeout(pressTimer));
document.getElementById("closeNotebookModal").addEventListener("click", async () => {
    if (await tryFlushNotebookSave()) document.getElementById("notebookModal").classList.remove("active");
});

document.getElementById("starBtn").addEventListener("click", window.togglePageStar);
document.getElementById("pagesListBtn").addEventListener("click", window.showPagesList);
document.getElementById("pagesListModal").addEventListener("click", (e) => {
    if (e.target.id === "pagesListModal") {
        document.getElementById("pagesListModal").classList.remove("active");
    }
});

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
        try {
            const pageDocs = await getDocs(collection(db, "bubbles", activeBubbleId, "notebookPages"));
            await Promise.all(pageDocs.docs.map(page => deleteDoc(page.ref)));
        } catch (error) {
            console.error("Notizbuchseiten des gelöschten Gedankens konnten nicht bereinigt werden:", error);
        }
        document.getElementById("contentModal").classList.remove("active");
    } else if (currentAction.action === 'deleteAudioGroup') {
        const b = nodesData.get(activeBubbleId);
        b.content.audioGroups.splice(currentAction.gIdx, 1);
        await saveBubbleContent(activeBubbleId, b.content);
    } else if (currentAction.action === 'deleteGroupAudio') {
        const b = nodesData.get(activeBubbleId);
        b.content.audioGroups[currentAction.gIdx].audios.splice(currentAction.aIdx, 1);
        await saveBubbleContent(activeBubbleId, b.content);
    } else if (currentAction.action === "deleteQuickNoteGroup") {
        const b = nodesData.get(activeBubbleId);
        const [deletedGroup] = b.content.quickNoteGroups.splice(currentAction.groupIndex, 1);
        (b.content.quickNotes || []).forEach(note => {
            if (String(note.groupId) === String(deletedGroup.id)) note.groupId = null;
        });
        await saveBubbleContent(activeBubbleId, b.content);
    } else if (currentAction.action === 'deleteItem') {
        const b = nodesData.get(activeBubbleId);
        const [deletedItem] = b.content[currentAction.type].splice(currentAction.index, 1);
        await saveBubbleContent(activeBubbleId, b.content);
        if (currentAction.type === "notebooks") {
            try {
                await removeNotebookPageDocuments(activeBubbleId, deletedItem);
            } catch (error) {
                console.error("Gelöschte Notizbuchseiten konnten nicht bereinigt werden:", error);
            }
        }
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
    if (!currentAction) return;
    const sourceB = nodesData.get(activeBubbleId);
    const targetB = nodesData.get(targetId);
    const item = sourceB.content[currentAction.type][currentAction.index];
    if (!item) return;
    if (!targetB.content[currentAction.type]) targetB.content[currentAction.type] = [];
    if (currentAction.type === "notebooks") await copyNotebookPageDocuments(activeBubbleId, targetId, item);
    targetB.content[currentAction.type].push(item);
    sourceB.content[currentAction.type].splice(currentAction.index, 1);
    try {
        const batch = writeBatch(db);
        batch.update(doc(db, "bubbles", targetId), { content: serializeBubbleContent(targetB.content) });
        batch.update(doc(db, "bubbles", activeBubbleId), { content: serializeBubbleContent(sourceB.content) });
        await batch.commit();
    } catch (error) {
        targetB.content[currentAction.type].pop();
        sourceB.content[currentAction.type].splice(currentAction.index, 0, item);
        throw error;
    }
    if (currentAction.type === "notebooks") {
        try {
            await removeNotebookPageDocuments(activeBubbleId, item);
        } catch (error) {
            console.error("Verschobene Notizbuchseiten konnten nicht bereinigt werden:", error);
        }
    }
    document.getElementById("moveModal").classList.remove("active");
});
