document.addEventListener("DOMContentLoaded", () => {

    /* ================= DOM REFERENCES ================= */

    const urlInput = document.getElementById("urlInput");
    const counter = document.getElementById("counter");
    const delayInput = document.getElementById("delay");
    const maxWaitInput = document.getElementById("maxWait");
    const limitInput = document.getElementById("limit");
    const rememberCb = document.getElementById("remember");
    const status = document.getElementById("status");
    const fileInput = document.getElementById("fileInput");
    const themeToggle = document.getElementById("themeToggle");
    const modeSelect = document.getElementById("modeSelect");
    const repeatCountInput = document.getElementById("repeatCount");
    const clearBtn = document.getElementById("clearUrls");

    /* ================= UNIVERSAL MODAL ================= */

    const appModal = document.getElementById("appModal");
    const modalTitle = document.getElementById("modalTitle");
    const modalMessage = document.getElementById("modalMessage");
    const modalIcon = document.getElementById("modalIcon");
    const modalConfirm = document.getElementById("modalConfirm");
    const modalCancel = document.getElementById("modalCancel");

    function showModal({
        type = "info",
        title = "Notice",
        message = "",
        confirmText = "OK",
        cancelText = "Cancel",
        showCancel = true
    }) {
        return new Promise(resolve => {

            const icons = {
                warning: "⚠️",
                error: "❌",
                success: "✅",
                info: "ℹ️"
            };

            modalTitle.textContent = title;
            modalMessage.textContent = message;
            modalIcon.textContent = icons[type] || "ℹ️";

            modalConfirm.textContent = confirmText;
            modalCancel.textContent = cancelText;
            modalCancel.style.display = showCancel ? "inline-block" : "none";

            appModal.classList.remove("hidden");

            function cleanup(result) {
                appModal.classList.add("hidden");
                modalConfirm.removeEventListener("click", onConfirm);
                modalCancel.removeEventListener("click", onCancel);
                document.removeEventListener("keydown", onEsc);
                appModal.removeEventListener("click", onOutside);
                resolve(result);
            }

            function onConfirm() { cleanup(true); }
            function onCancel() { cleanup(false); }
            function onEsc(e) { if (e.key === "Escape") cleanup(false); }
            function onOutside(e) { if (e.target === appModal) cleanup(false); }

            modalConfirm.addEventListener("click", onConfirm);
            modalCancel.addEventListener("click", onCancel);
            document.addEventListener("keydown", onEsc);
            appModal.addEventListener("click", onOutside);
        });
    }

    /* ================= THEME ================= */

    function applyTheme(theme) {
        document.body.classList.remove("dark", "light");
        document.body.classList.add(theme);
        themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
    }

    function loadTheme() {
        chrome.storage.local.get("theme", data => {
            applyTheme(data.theme || "light");
        });
    }

    themeToggle.addEventListener("click", () => {
        const current = document.body.classList.contains("dark") ? "dark" : "light";
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        chrome.storage.local.set({ theme: next });
    });

    loadTheme();

    /* ================= URL UTILITIES ================= */

    function extractUrls(text, removeDuplicates = false) {
        const regex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}[^\s]*)/g;
        const matches = text.match(regex) || [];

        let urls = matches.map(url => {
            if (!/^https?:\/\//i.test(url)) url = "https://" + url;
            try {
                new URL(url);
                return url;
            } catch {
                return null;
            }
        }).filter(Boolean);

        if (removeDuplicates) urls = [...new Set(urls)];
        return urls;
    }

    function getUrlsForOpening() {
        let urls = extractUrls(urlInput.value, false);
        const limit = parseInt(limitInput.value) || 0;
        if (limit > 0) urls = urls.slice(0, limit);
        return urls;
    }

    function updateCounter() {
        const raw = extractUrls(urlInput.value, false).length;
        const unique = extractUrls(urlInput.value, true).length;
        counter.textContent = raw === unique ? raw : `${raw} (${unique} unique)`;
    }

    /* ================= EXTRACT ================= */

    document.getElementById("extractBtn")?.addEventListener("click", () => {
        const urls = extractUrls(urlInput.value, false);
        urlInput.value = urls.join("\n");
        updateCounter();
        status.textContent = "URLs extracted.";
        setTimeout(() => status.textContent = "", 1500);
    });

    /* ================= CLEANUP ================= */

    document.getElementById("cleanup").onclick = () => {
        const urls = extractUrls(urlInput.value, true);
        urlInput.value = urls.join("\n");
        updateCounter();
        status.textContent = "Duplicates removed.";
        setTimeout(() => status.textContent = "", 1500);
    };

    /* ================= OPEN LOGIC ================= */

    async function openAll(urls) {

        if (urls.length === 0) {
            showModal({
                type: "error",
                title: "No URLs Found",
                message: "Please enter at least one valid URL.",
                showCancel: false
            });
            return;
        }

        const mode = modeSelect.value;
        const repeatCount = parseInt(repeatCountInput.value) || 1;

        const finalUrls = [];
        for (let i = 0; i < repeatCount; i++) {
            finalUrls.push(...urls);
        }

        const totalToOpen = finalUrls.length;

        if (totalToOpen > 100) {
            const confirmed = await showModal({
                type: "warning",
                title: "Open Multiple Tabs?",
                message: `You are about to open ${totalToOpen} tabs. This may slow down your browser.`,
                confirmText: "Continue",
                cancelText: "Cancel"
            });
            if (!confirmed) return;
        }

        if (mode === "group") {
            const groups = {};
            finalUrls.forEach(url => {
                const host = new URL(url).hostname;
                if (!groups[host]) groups[host] = [];
                groups[host].push(url);
            });

            for (const host in groups) {
                const win = await chrome.windows.create({ url: groups[host][0] });
                for (let i = 1; i < groups[host].length; i++) {
                    chrome.tabs.create({ windowId: win.id, url: groups[host][i] });
                }
            }
            return;
        }

        if (mode === "window") {
            const win = await chrome.windows.create({ url: finalUrls[0] });
            for (let i = 1; i < finalUrls.length; i++) {
                chrome.tabs.create({ windowId: win.id, url: finalUrls[i] });
            }
            return;
        }

        for (const url of finalUrls) {
            chrome.tabs.create({ url });
        }
    }

    async function openOneByOne(urls) {
        if (urls.length === 0) {
            showModal({
                type: "error",
                title: "No URLs Found",
                message: "Please enter at least one valid URL.",
                showCancel: false
            });
            return;
        }

        const delay = parseInt(delayInput.value) * 1000 || 0;
        const maxWait = parseInt(maxWaitInput.value) * 1000 || 0;

        for (const url of urls) {
            chrome.tabs.create({ url });
            await new Promise(r => setTimeout(r, delay || maxWait));
        }
    }

    document.getElementById("openAll").onclick = () =>
        openAll(getUrlsForOpening());

    document.getElementById("openOne").onclick = () =>
        openOneByOne(getUrlsForOpening());

    /* ================= IMPORT / EXPORT ================= */

    document.getElementById("exportBtn").onclick = () => {

        const baseUrls = extractUrls(urlInput.value, false);

        if (baseUrls.length === 0) {
            showModal({
                type: "error",
                title: "No URLs Found",
                message: "Nothing to export.",
                showCancel: false
            });
            return;
        }

        const repeatCount = parseInt(repeatCountInput.value) || 1;

        // Group URLs by hostname
        const grouped = {};

        baseUrls.forEach(url => {
            const fullUrl = /^https?:\/\//i.test(url) ? url : "https://" + url;
            const host = new URL(fullUrl).hostname.replace("www.", "");

            if (!grouped[host]) grouped[host] = [];
            grouped[host].push(fullUrl);
        });

        // For each host, multiply by repeatCount and export separately
        Object.keys(grouped).forEach(host => {

            const originalUrls = grouped[host];

            const multiplied = [];
            originalUrls.forEach(url => {
                for (let i = 0; i < repeatCount; i++) {
                    multiplied.push(url);
                }
            });

            const totalCount = multiplied.length;

            const blob = new Blob(
                [multiplied.join("\n")],
                { type: "text/plain" }
            );

            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `${totalCount}-${host}-urls.txt`;
            link.click();
        });

        status.textContent = "Export completed.";
        setTimeout(() => status.textContent = "", 1500);
    };

    document.getElementById("importBtn").onclick = () => fileInput.click();

    fileInput.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            urlInput.value = event.target.result;
            updateCounter();
        };
        reader.readAsText(file);
    };

    /* ================= COPY ================= */

    document.getElementById("copyBtn").onclick = () =>
        navigator.clipboard.writeText(urlInput.value);

    document.getElementById("copyCleanBtn").onclick = () =>
        navigator.clipboard.writeText(extractUrls(urlInput.value, true).join("\n"));

    /* ================= CLEAR BUTTON ================= */

    function toggleClearButton() {
        clearBtn.style.display = urlInput.value.trim().length > 0 ? "inline-block" : "none";
    }

    toggleClearButton();
    urlInput.addEventListener("input", toggleClearButton);

    clearBtn.onclick = async () => {
        const confirmed = await showModal({
            type: "warning",
            title: "Clear URLs?",
            message: "This will remove all URLs from the input box.",
            confirmText: "Clear",
            cancelText: "Cancel"
        });
        if (!confirmed) return;

        urlInput.value = "";
        updateCounter();
        toggleClearButton();
    };

    /* ================= RESTORE DEFAULT ================= */

    document.getElementById("restore").onclick = async () => {
        const confirmed = await showModal({
            type: "warning",
            title: "Restore Defaults?",
            message: "This will reset all settings and clear stored data.",
            confirmText: "Restore",
            cancelText: "Cancel"
        });
        if (!confirmed) return;

        delayInput.value = 0;
        maxWaitInput.value = 3;
        limitInput.value = 0;
        repeatCountInput.value = 1;
        rememberCb.checked = false;
        modeSelect.value = "group";
        applyTheme("light");
        chrome.storage.local.clear();
        urlInput.value = "";
        updateCounter();
    };

    /* ================= STORAGE ================= */

    function saveState() {
        if (!rememberCb.checked) return;
        chrome.storage.local.set({ urls: urlInput.value });
    }

    function loadState() {
        chrome.storage.local.get("urls", data => {
            if (data.urls) {
                urlInput.value = data.urls;
                updateCounter();
            }
        });
    }

    urlInput.addEventListener("input", () => {
        updateCounter();
        saveState();
    });

    rememberCb.addEventListener("change", saveState);
    limitInput.addEventListener("input", updateCounter);

    loadState();
    updateCounter();
});