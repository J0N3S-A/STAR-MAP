import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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

// AUTHENTICATION & ROLE MANAGEMENT FOR SUBMAP
const subLoginBtn = document.getElementById("subLoginBtn");
const subLogoutBtn = document.getElementById("subLogoutBtn");

if (subLoginBtn) {
    subLoginBtn.addEventListener("click", () => {
        signInWithPopup(auth, provider).catch((error) => {
            console.error("Anmeldefehler:", error);
            alert("Fehler bei der Anmeldung: " + error.message);
        });
    });
}

if (subLogoutBtn) {
    subLogoutBtn.addEventListener("click", () => {
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
                    if (subLoginBtn) subLoginBtn.style.display = "none";
                    if (subLogoutBtn) subLogoutBtn.style.display = "inline-block";
                } else {
                    alert("Zugriff verweigert: Sie besitzen keine Administratorrechte.");
                    await signOut(auth);
                }
            } else {
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
        if (subLoginBtn) subLoginBtn.style.display = "inline-block";
        if (subLogoutBtn) subLogoutBtn.style.display = "none";
    }
});

const urlParams = new URLSearchParams(window.location.search);
const parentBubbleId = urlParams.get('bubbleId');
const parentTitle = urlParams.get('title') || 'Submap';

if(!parentBubbleId) window.location.href = "index.html";

document.getElementById('submapTitleDisplay').innerText = parentTitle;
document.getElementById('backToMainBtn').addEventListener('click', () => window.location.href = "index.html");

let subNodesData = new vis.DataSet([]);
let subEdgesData = new vis.DataSet([]);
let activeNodeId = null;
let pendingAction = null;
const RECENT_COLORS_KEY = "star-map-recent-colors";

const subNodesRef = collection(db, `bubbles/${parentBubbleId}/subnodes`);
const subEdgesRef = collection(db, `bubbles/${parentBubbleId}/subedges`);

const container = document.getElementById("submindmap");
const data = { nodes: subNodesData, edges: subEdgesData };

const options = {
    nodes: {
        shape: "box",
        margin: 16,
        widthConstraint: { minimum: 150, maximum: 280 },
        color: { 
            background: "#F2F7F4", border: "#E4ECE7", 
            highlight: { background: "#D9EBE4", border: "#C2DACF" } 
        },
        font: { multi: 'html', family: "Plus Jakarta Sans", color: "#4A5D54", size: 14 },
        borderWidth: 2, shadow: { enabled: true, color: "rgba(74, 93, 84, 0.04)", size: 12 }
    },
    edges: { color: { color: "#C2DACF", highlight: "#A7CBB9" }, smooth: { type: "continuous" }, width: 2 },
    physics: { enabled: false },
    interaction: { hover: true, dragNodes: true },
    manipulation: {
        enabled: false,
        addEdge: async function(edgeData, callback) {
            if(edgeData.from !== edgeData.to) {
                await addDoc(subEdgesRef, { from: edgeData.from, to: edgeData.to });
                callback(edgeData);
            }
        }
    }
};
const network = new vis.Network(container, data, options);

function formatLabel(title, text, showText) {
    let label = "<b>" + (title || "Ohne Titel") + "</b>";
    if (showText && text) label += "<br><br>" + toEditorHtml(text);
    return label;
}

function toEditorHtml(value) {
    if (!value) return "";
    let text = String(value);
    // Older saved notes may contain escaped editor markup such as &lt;br&gt;.
    if (/&lt;br\s*\/?&gt;/i.test(text)) {
        const decoder = document.createElement("textarea");
        decoder.innerHTML = text;
        text = decoder.value;
    }
    return /<(br|div|p|h[1-6]|blockquote|strong|b|em|i|u)\b[^>]*>/i.test(text)
        ? text
        : text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

async function initSubmap() {
    const snap = await getDocs(subNodesRef);
    if (snap.empty) {
        await addDoc(subNodesRef, {
            title: parentTitle, text: "Hauptgedanke", x: 0, y: 0, showText: false, isCentral: true
        });
    }
    
    onSnapshot(subNodesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const d = change.doc.data();
            if (change.type === "added" || change.type === "modified") {
                subNodesData.update({ 
                    id: change.doc.id, 
                    label: formatLabel(d.title, d.text, d.showText), 
                    x: d.x, y: d.y, 
                    titleData: d.title, textData: d.text, 
                    showText: d.showText, isCentral: d.isCentral 
                });
            }
            if (change.type === "removed") subNodesData.remove(change.doc.id);
        });
    });

    onSnapshot(subEdgesRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const d = change.doc.data();
            if (change.type === "added") subEdgesData.update({ id: change.doc.id, from: d.from, to: d.to });
            if (change.type === "removed") subEdgesData.remove(change.doc.id);
        });
    });
}
initSubmap();

network.on("dragEnd", async function (params) {
    if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const position = network.getPosition(nodeId);
        await updateDoc(doc(subNodesRef, nodeId), { x: position.x, y: position.y });
    }
});

document.getElementById("subConnectSwitch").addEventListener("change", (e) => {
    if (e.target.checked) network.addEdgeMode();
    else network.disableEditMode();
});

network.on("click", async (params) => {
    if (params.nodes.length > 0) {
        if (suppressNextNodeClick) {
            suppressNextNodeClick = false;
            return;
        }
        const nodeId = params.nodes[0];
        const node = subNodesData.get(nodeId);
        const newState = !node.showText;
        
        subNodesData.update({ id: nodeId, label: formatLabel(node.titleData, node.textData, newState), showText: newState });
        await updateDoc(doc(subNodesRef, nodeId), { showText: newState });
    } else if (params.edges.length > 0) {
        pendingAction = { type: 'edge', id: params.edges[0] };
        document.getElementById("confirmSubModal").classList.add("active");
    }
});

let longPressTimer = null;
let suppressNextNodeClick = false;
let pressedNodeId = null;

function openNodeEditor(nodeId) {
    activeNodeId = nodeId;
    const node = subNodesData.get(activeNodeId);
    document.getElementById("nodeTitleInput").value = node.titleData || "";
    document.getElementById("nodeTextInput").innerHTML = toEditorHtml(node.textData);
    document.getElementById("editNodeModal").classList.add("active");
    document.getElementById("deleteNodeBtn").style.display = node.isCentral ? "none" : "block";
}

function getPointerCoordinates(event) {
    const touch = event.touches && event.touches[0];
    return { x: touch ? touch.clientX : event.clientX, y: touch ? touch.clientY : event.clientY };
}

function startLongPress(event) {
    const coordinates = getPointerCoordinates(event);
    const canvasPosition = network.DOMtoCanvas(coordinates);
    cancelLongPress();
    pressedNodeId = network.getNodeAt(canvasPosition);
    if (!pressedNodeId) return;
    const node = subNodesData.get(pressedNodeId);
    // Editing is available only after the short click has made the text visible.
    if (!node || !node.showText) {
        pressedNodeId = null;
        return;
    }
    longPressTimer = window.setTimeout(() => {
        suppressNextNodeClick = true;
        openNodeEditor(pressedNodeId);
        longPressTimer = null;
    }, 1000);
}

function cancelLongPress() {
    if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    pressedNodeId = null;
}

container.addEventListener("mousedown", startLongPress);
container.addEventListener("touchstart", startLongPress, { passive: true });
container.addEventListener("mouseup", cancelLongPress);
container.addEventListener("mousemove", cancelLongPress);
container.addEventListener("mouseleave", cancelLongPress);
container.addEventListener("touchend", cancelLongPress);
container.addEventListener("touchcancel", cancelLongPress);
container.addEventListener("touchmove", cancelLongPress, { passive: true });

document.getElementById("addNodeBasket").addEventListener("click", async () => {
    const center = network.getViewPosition();
    await addDoc(subNodesRef, {
        title: "Neuer Block", text: "Schreiben Sie Ihren Text hier...", 
        x: center.x, y: center.y + 100, showText: false, isCentral: false
    });
});

document.getElementById("closeEditModal").addEventListener("click", () => document.getElementById("editNodeModal").classList.remove("active"));

document.getElementById("saveNodeBtn").addEventListener("click", async () => {
    if (activeNodeId) {
        const newTitle = document.getElementById("nodeTitleInput").value;
        const newText = document.getElementById("nodeTextInput").innerHTML;
        await updateDoc(doc(subNodesRef, activeNodeId), { title: newTitle, text: newText });
        document.getElementById("editNodeModal").classList.remove("active");
    }
});

document.getElementById("deleteNodeBtn").addEventListener("click", () => {
    pendingAction = { type: 'node', id: activeNodeId };
    document.getElementById("editNodeModal").classList.remove("active");
    document.getElementById("confirmSubModal").classList.add("active");
});

document.getElementById("cancelSubConfirmBtn").addEventListener("click", () => document.getElementById("confirmSubModal").classList.remove("active"));

document.getElementById("actionSubConfirmBtn").addEventListener("click", async () => {
    if (pendingAction) {
        if (pendingAction.type === 'node') {
            await deleteDoc(doc(subNodesRef, pendingAction.id));
            const edgesToRemove = subEdgesData.get({ filter: e => e.from === pendingAction.id || e.to === pendingAction.id });
            edgesToRemove.forEach(async e => await deleteDoc(doc(subEdgesRef, e.id)));
        } else if (pendingAction.type === 'edge') {
            await deleteDoc(doc(subEdgesRef, pendingAction.id));
        }
        pendingAction = null;
        document.getElementById("confirmSubModal").classList.remove("active");
    }
});

function getRecentColors() {
    try {
        const colors = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) || "[]");
        return Array.isArray(colors) ? colors.filter(color => /^#[0-9A-F]{6}$/i.test(color)) : [];
    } catch (error) {
        console.warn("Konnte gespeicherte Farben nicht laden:", error);
        return [];
    }
}

function renderRecentColors() {
    document.querySelectorAll(".custom-colors").forEach(container => {
        container.innerHTML = getRecentColors().map(color =>
            `<button type="button" class="color-swatch" data-color="${color}" style="background:${color}" aria-label="Farbe ${color}"></button>`
        ).join("");
    });
}

function rememberColor(color) {
    const normalized = color.toUpperCase();
    const colors = [normalized, ...getRecentColors().filter(item => item !== normalized)].slice(0, 4);
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(colors));
    renderRecentColors();
}

function applyEditorColor(editor, color) {
    if (!/^#[0-9A-F]{6}$/i.test(color)) return;
    restoreEditorSelection(editor);
    editor.focus();
    document.execCommand("foreColor", false, color);
    rememberColor(color);
}

renderRecentColors();

document.addEventListener("click", (e) => {
    const menuToggle = e.target.closest(".format-menu-toggle");
    if (menuToggle) {
        menuToggle.closest(".format-toolbar").classList.toggle("open");
        return;
    }
    const colorSwatch = e.target.closest(".color-swatch");
    if (colorSwatch) {
        const toolbar = colorSwatch.closest(".format-toolbar");
        const editor = document.getElementById(toolbar.dataset.toolbarFor);
        if (editor) applyEditorColor(editor, colorSwatch.dataset.color);
        return;
    }
    const control = e.target.closest(".format-toolbar [data-command]");
    if (!control || control.tagName !== "BUTTON") return;
    const toolbar = control.closest(".format-toolbar");
    const editor = document.getElementById(toolbar.dataset.toolbarFor);
    if (!editor) return;
    restoreEditorSelection(editor);
    editor.focus();
    document.execCommand(control.dataset.command, false, control.value || null);
});

document.addEventListener("change", (e) => {
    const control = e.target.closest(".format-toolbar [data-command], .format-toolbar .hex-color-input");
    if (!control || control.tagName === "BUTTON") return;
    const toolbar = control.closest(".format-toolbar");
    const editor = document.getElementById(toolbar.dataset.toolbarFor);
    if (!editor) return;
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
});

document.addEventListener("input", (e) => {
    const hexInput = e.target.closest(".hex-color-input");
    if (!hexInput || !/^#[0-9A-F]{6}$/i.test(hexInput.value.trim())) return;
    const toolbar = hexInput.closest(".format-toolbar");
    const editor = document.getElementById(toolbar.dataset.toolbarFor);
    if (editor) applyEditorColor(editor, hexInput.value.trim());
    hexInput.value = "";
});

let savedEditorSelection = null;
document.addEventListener("mousedown", (e) => {
    const control = e.target.closest(".format-toolbar [data-command], .format-toolbar .color-swatch, .format-toolbar .hex-color-input");
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
