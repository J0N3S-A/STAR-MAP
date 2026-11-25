const DEFAULT_COLORS = ["#fe019a", "#000000", "#8000f8", "#0400f8"];
const RECENT_COLORS_LIMIT = 4;
const KEYBOARD_HEIGHT_THRESHOLD = 120;
const BUTTON_MOUSE_DOWN = 'onmousedown="event.preventDefault()"';

function hslToHex(hue, saturation, lightness) {
    const normalizedHue = ((hue % 360) + 360) % 360;
    const normalizedSaturation = Math.max(0, Math.min(100, saturation)) / 100;
    const normalizedLightness = Math.max(0, Math.min(100, lightness)) / 100;
    const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
    const section = normalizedHue / 60;
    const secondary = chroma * (1 - Math.abs(section % 2 - 1));
    const offset = normalizedLightness - chroma / 2;
    const channels = section < 1 ? [chroma, secondary, 0]
        : section < 2 ? [secondary, chroma, 0]
            : section < 3 ? [0, chroma, secondary]
                : section < 4 ? [0, secondary, chroma]
                    : section < 5 ? [secondary, 0, chroma]
                        : [chroma, 0, secondary];
    return `#${channels.map(channel => Math.round((channel + offset) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexToHsl(hex) {
    const value = hex.slice(1);
    const red = parseInt(value.slice(0, 2), 16) / 255;
    const green = parseInt(value.slice(2, 4), 16) / 255;
    const blue = parseInt(value.slice(4, 6), 16) / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const difference = maximum - minimum;
    let hue = 0;
    if (difference) {
        if (maximum === red) hue = ((green - blue) / difference) % 6;
        else if (maximum === green) hue = (blue - red) / difference + 2;
        else hue = (red - green) / difference + 4;
    }
    const lightness = (maximum + minimum) / 2;
    const saturation = difference ? difference / (1 - Math.abs(2 * lightness - 1)) : 0;
    return { hue: Math.round((hue * 60 + 360) % 360), saturation: Math.round(saturation * 100), lightness: Math.round(lightness * 100) };
}

function button(label, attributes = "") {
    return `<button type="button" ${BUTTON_MOUSE_DOWN} ${attributes}>${label}</button>`;
}

export function initializeSlimToolbar({ recentColorsKey, extraButtonId } = {}) {
    if (document.getElementById("slimToolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.id = "slimToolbar";
    toolbar.className = "slim-bar";
    toolbar.hidden = true;
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Textformatierung");
    toolbar.innerHTML = `
        <div class="slim-bar-quick-actions">
            ${button("B", 'data-command="bold" title="Fett" aria-label="Fett"')}
            ${button("I", 'data-command="italic" title="Kursiv" aria-label="Kursiv"')}
            ${button("U", 'data-command="underline" title="Unterstrichen" aria-label="Unterstrichen"')}
            ${button("S", 'data-command="strikeThrough" title="Durchgestrichen" aria-label="Durchgestrichen"')}
            <span class="slim-bar-divider slim-notebook-divider" aria-hidden="true"></span>
            ${button("Regler", 'class="slim-panel-toggle" data-panel-target="regler" aria-expanded="false"')}
            ${button("Farben", 'class="slim-panel-toggle" data-panel-target="farben" aria-expanded="false"')}
            ${button("Schriftarten", 'class="slim-panel-toggle" data-panel-target="fonts" aria-expanded="false"')}
        </div>
        <div class="slim-bar-panels" hidden>
            <section class="slim-panel" data-panel="regler" hidden>
                <div class="slim-panel-heading"><strong>Regler</strong><span class="slim-color-preview" aria-label="Farbvorschau"></span></div>
                <label class="slim-slider-row">Farbton <input class="slim-hue-slider" type="range" min="0" max="359" value="324"></label>
                <label class="slim-slider-row">Helligkeit <input class="slim-brightness-slider" type="range" min="0" max="100" value="50"></label>
                <label class="slim-slider-row">Schatten <input class="slim-shadow-slider" type="range" min="0" max="90" value="0"></label>
                <div class="slim-panel-footer">${button("Bestätigen", 'class="slim-confirm-color"')}</div>
            </section>
            <section class="slim-panel" data-panel="farben" hidden>
                <div class="slim-panel-heading"><strong>Farben</strong></div>
                <div class="slim-color-layout">
                    <label class="slim-color-picker-label">Farbe <input class="slim-color-picker" type="color" value="#fe019a" aria-label="Farbe auswählen"></label>
                    <div class="slim-hex-fields">
                        <label>HEX <input class="slim-hex-display" type="text" readonly aria-label="Aktueller HEX-Code"></label>
                        ${button("Kopieren", 'class="slim-copy-hex" aria-label="HEX-Code kopieren"')}
                        <label>Eigene Farbe <input class="slim-manual-hex" type="text" inputmode="text" maxlength="7" placeholder="#FF5733" aria-label="HEX-Code eingeben"></label>
                    </div>
                    <div class="slim-palette-group">
                        <span>Standardfarben</span><div class="slim-default-colors"></div>
                        <span>Zuletzt verwendet</span><div class="slim-recent-colors"></div>
                    </div>
                </div>
                <div class="slim-panel-footer">${button("Bestätigen", 'class="slim-confirm-color"')}</div>
            </section>
            <section class="slim-panel" data-panel="fonts" hidden>
                <div class="slim-panel-heading"><strong>Schriftarten</strong></div>
                <label class="slim-font-label">Schriftstil und Schriftart
                    <select class="slim-font-select" aria-label="Schriftstil und Schriftart">
                        <optgroup label="Textstil">
                            <option value="block:p">Normal</option>
                            <option value="block:h2">Überschrift 1</option>
                            <option value="block:h3">Überschrift 2</option>
                            <option value="block:h4">Überschrift 3</option>
                            <option value="block:blockquote">Zitat</option>
                        </optgroup>
                        <optgroup label="Schriftart">
                            <option value="font:Arial">Arial</option>
                            <option value="font:Georgia">Georgia</option>
                            <option value="font:Verdana">Verdana</option>
                            <option value="font:Trebuchet MS">Trebuchet MS</option>
                            <option value="font:Courier New">Courier New</option>
                            <option value="font:Times New Roman">Times New Roman</option>
                            <option value="font:Plus Jakarta Sans">Plus Jakarta Sans</option>
                        </optgroup>
                    </select>
                </label>
            </section>
        </div>`;
    document.body.appendChild(toolbar);

    const quickActions = toolbar.querySelector(".slim-bar-quick-actions");
    const extraButton = extraButtonId ? document.getElementById(extraButtonId) : null;
    const notebookDivider = toolbar.querySelector(".slim-notebook-divider");
    if (extraButton) {
        extraButton.classList.add("slim-bullet-button");
        extraButton.setAttribute("onmousedown", "event.preventDefault()");
        quickActions.append(extraButton);
    } else {
        notebookDivider.hidden = true;
    }

    const panels = toolbar.querySelector(".slim-bar-panels");
    const hueSlider = toolbar.querySelector(".slim-hue-slider");
    const brightnessSlider = toolbar.querySelector(".slim-brightness-slider");
    const shadowSlider = toolbar.querySelector(".slim-shadow-slider");
    const colorPicker = toolbar.querySelector(".slim-color-picker");
    const hexDisplay = toolbar.querySelector(".slim-hex-display");
    const manualHex = toolbar.querySelector(".slim-manual-hex");
    const colorPreview = toolbar.querySelector(".slim-color-preview");
    let activeEditor = null;
    let savedRange = null;
    let contextMenuActive = false;
    let stagedColor = DEFAULT_COLORS[0];
    let hsl = { hue: 324, saturation: 100, lightness: 50 };
    const viewport = window.visualViewport;
    let baselineHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, viewport?.height || 0);

    function readRecentColors() {
        try {
            const colors = JSON.parse(localStorage.getItem(recentColorsKey) || "[]");
            return Array.isArray(colors) ? colors.filter(color => /^#[0-9A-F]{6}$/i.test(color)) : [];
        } catch (error) {
            console.warn("Konnte gespeicherte Farben nicht laden:", error);
            return [];
        }
    }

    function renderColors() {
        toolbar.querySelector(".slim-default-colors").innerHTML = DEFAULT_COLORS.map(color =>
            `<button type="button" ${BUTTON_MOUSE_DOWN} class="slim-color-swatch" data-color="${color}" style="background:${color}" aria-label="Standardfarbe ${color}"></button>`
        ).join("");
        toolbar.querySelector(".slim-recent-colors").innerHTML = readRecentColors().map(color =>
            `<button type="button" ${BUTTON_MOUSE_DOWN} class="slim-color-swatch" data-color="${color}" style="background:${color}" aria-label="Zuletzt verwendete Farbe ${color}"></button>`
        ).join("");
    }

    function rememberColor(color) {
        if (!recentColorsKey) return;
        try {
            const normalized = color.toUpperCase();
            const colors = [normalized, ...readRecentColors().filter(item => item !== normalized)].slice(0, RECENT_COLORS_LIMIT);
            localStorage.setItem(recentColorsKey, JSON.stringify(colors));
            renderColors();
        } catch (error) {
            console.error("Farbe konnte nicht gespeichert werden:", error);
        }
    }

    function setPanel(panelName) {
        const isOpen = Boolean(panelName);
        panels.hidden = !isOpen;
        toolbar.dataset.panel = panelName || "";
        toolbar.querySelectorAll(".slim-panel").forEach(panel => {
            panel.hidden = panel.dataset.panel !== panelName;
        });
        toolbar.querySelectorAll(".slim-panel-toggle").forEach(toggle => {
            toggle.setAttribute("aria-expanded", String(toggle.dataset.panelTarget === panelName));
        });
    }

    function syncSliderGradients() {
        const effectiveLightness = hsl.lightness * (1 - Number(shadowSlider.value) / 100);
        hueSlider.style.background = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 359].map(value =>
            `hsl(${value}, 100%, ${effectiveLightness}%)`).join(", ")})`;
        brightnessSlider.style.background = `linear-gradient(to right, hsl(${hsl.hue}, 100%, 0%), hsl(${hsl.hue}, 100%, ${50 * (1 - Number(shadowSlider.value) / 100)}%), hsl(${hsl.hue}, 100%, ${100 * (1 - Number(shadowSlider.value) / 100)}%))`;
        shadowSlider.style.background = `linear-gradient(to right, hsl(${hsl.hue}, 100%, ${hsl.lightness}%), hsl(${hsl.hue}, 100%, ${hsl.lightness * 0.55}%), #000000)`;
    }

    function setStagedColor(color, clearManualInput = true) {
        if (!/^#[0-9A-F]{6}$/i.test(color)) return false;
        stagedColor = color.toUpperCase();
        hsl = hexToHsl(stagedColor);
        hueSlider.value = String(hsl.hue);
        brightnessSlider.value = String(hsl.lightness);
        shadowSlider.value = "0";
        colorPicker.value = stagedColor;
        hexDisplay.value = stagedColor;
        colorPreview.style.backgroundColor = stagedColor;
        if (clearManualInput) {
            manualHex.value = "";
            manualHex.removeAttribute("aria-invalid");
        }
        toolbar.querySelectorAll(".slim-confirm-color").forEach(button => { button.disabled = false; });
        renderColors();
        syncSliderGradients();
        return true;
    }

    function updateFromSliders() {
        hsl.hue = Number(hueSlider.value);
        hsl.lightness = Number(brightnessSlider.value);
        stagedColor = hslToHex(hsl.hue, 100, hsl.lightness * (1 - Number(shadowSlider.value) / 100)).toUpperCase();
        colorPicker.value = stagedColor;
        hexDisplay.value = stagedColor;
        colorPreview.style.backgroundColor = stagedColor;
        syncSliderGradients();
    }

    function captureSelection() {
        if (!activeEditor) return;
        const selection = window.getSelection();
        if (selection?.rangeCount && activeEditor.contains(selection.anchorNode)) {
            savedRange = selection.getRangeAt(0).cloneRange();
        }
    }

    function restoreSelection() {
        if (!activeEditor || !savedRange) return;
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedRange);
    }

    function runCommand(command, value = null) {
        if (!activeEditor) return;
        restoreSelection();
        activeEditor.focus();
        document.execCommand(command, false, value);
        activeEditor.dispatchEvent(new Event("input", { bubbles: true }));
        captureSelection();
    }

    function applyColor() {
        if (!activeEditor) return;
        runCommand("foreColor", stagedColor);
        rememberColor(stagedColor);
        setPanel("");
    }

    function keyboardIsOpen() {
        const currentHeights = [window.innerHeight, document.documentElement.clientHeight, viewport?.height]
            .filter(height => typeof height === "number" && height > 0);
        return currentHeights.some(height => baselineHeight - height >= KEYBOARD_HEIGHT_THRESHOLD);
    }

    function syncToolbarVisibility() {
        const keyboardOpen = Boolean(activeEditor && !contextMenuActive && keyboardIsOpen());
        toolbar.hidden = !keyboardOpen;
        toolbar.setAttribute("aria-hidden", String(!keyboardOpen));
        if (keyboardOpen && viewport) {
            const keyboardInset = Math.max(0, window.innerHeight - viewport.offsetTop - viewport.height);
            toolbar.style.bottom = `calc(${keyboardInset}px + env(safe-area-inset-bottom) + 8px)`;
        } else if (!keyboardOpen) {
            toolbar.style.removeProperty("bottom");
            setPanel("");
            if (!activeEditor) {
                baselineHeight = Math.max(window.innerHeight, document.documentElement.clientHeight, viewport?.height || 0);
            }
        }
    }

    function focusEditor(editor) {
        if (activeEditor !== editor) {
            activeEditor = editor;
            toolbar.dataset.toolbarFor = editor.id;
            savedRange = null;
            setStagedColor(stagedColor);
        }
        if (extraButton) {
            const isNotebook = editor.dataset.editorType === "notebook";
            extraButton.hidden = !isNotebook;
            notebookDivider.hidden = !isNotebook;
        }
        captureSelection();
        syncToolbarVisibility();
    }

    document.addEventListener("focusin", event => {
        const editor = event.target.closest?.('.rich-editor[contenteditable="true"]');
        if (editor) focusEditor(editor);
    });

    document.addEventListener("focusout", event => {
        if (event.target !== activeEditor || toolbar.contains(event.relatedTarget)) return;
        window.setTimeout(() => {
            if (document.activeElement === activeEditor || toolbar.contains(document.activeElement)) return;
            activeEditor = null;
            savedRange = null;
            syncToolbarVisibility();
        }, 0);
    });

    document.addEventListener("selectionchange", captureSelection);
    document.addEventListener("contextmenu", event => {
        if (!activeEditor || !activeEditor.contains(event.target)) return;
        contextMenuActive = true;
        syncToolbarVisibility();
    });
    document.addEventListener("pointerdown", () => {
        if (!contextMenuActive) return;
        contextMenuActive = false;
        syncToolbarVisibility();
    });
    toolbar.addEventListener("pointerdown", captureSelection);
    toolbar.addEventListener("click", async event => {
        const toggle = event.target.closest(".slim-panel-toggle");
        if (toggle) {
            const target = toggle.dataset.panelTarget;
            setPanel(toolbar.dataset.panel === target ? "" : target);
            if (target === "farben") setStagedColor(stagedColor);
            renderColors();
            return;
        }

        const swatch = event.target.closest(".slim-color-swatch");
        if (swatch) {
            setStagedColor(swatch.dataset.color);
            return;
        }

        if (event.target.closest(".slim-confirm-color")) {
            applyColor();
            return;
        }

        if (event.target.closest(".slim-copy-hex")) {
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(hexDisplay.value);
                } else {
                    hexDisplay.select();
                    if (!document.execCommand("copy")) throw new Error("Kopieren wurde vom Browser abgelehnt.");
                }
                event.target.closest(".slim-copy-hex").textContent = "Kopiert";
                window.setTimeout(() => {
                    const copyButton = toolbar.querySelector(".slim-copy-hex");
                    if (copyButton) copyButton.textContent = "Kopieren";
                }, 1200);
            } catch (error) {
                console.error("HEX-Farbcode konnte nicht kopiert werden:", error);
                alert("Der HEX-Farbcode konnte nicht kopiert werden.");
            }
            return;
        }

        const commandButton = event.target.closest("[data-command]");
        if (commandButton) runCommand(commandButton.dataset.command);
    });

    toolbar.addEventListener("input", event => {
        if (event.target.matches(".slim-hue-slider, .slim-brightness-slider, .slim-shadow-slider")) {
            updateFromSliders();
            return;
        }
        if (event.target === colorPicker) {
            setStagedColor(colorPicker.value);
            return;
        }
        if (event.target === manualHex) {
            const value = manualHex.value.trim();
            const validColor = /^#[0-9A-F]{6}$/i.test(value);
            manualHex.toggleAttribute("aria-invalid", value.length > 0 && !validColor);
            toolbar.querySelectorAll(".slim-confirm-color").forEach(button => { button.disabled = value.length > 0 && !validColor; });
            if (validColor) setStagedColor(value, false);
        }
    });

    toolbar.addEventListener("change", event => {
        if (event.target.matches(".slim-font-select")) {
            const [kind, value] = event.target.value.split(/:(.+)/);
            runCommand(kind === "font" ? "fontName" : "formatBlock", value);
        }
    });

    window.addEventListener("resize", syncToolbarVisibility);
    viewport?.addEventListener("resize", syncToolbarVisibility);
    viewport?.addEventListener("scroll", syncToolbarVisibility);
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !toolbar.hidden) setPanel("");
    });

    renderColors();
    setStagedColor(stagedColor);
}
