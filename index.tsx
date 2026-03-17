import { GoogleGenAI } from "@google/genai";

// --- Shim for process.env to support runtime API_KEY injection ---
function getRuntimeApiKey(): string {
    // Priority: 
    // 1. window.process.env.API_KEY (Runtime injected)
    // 2. window.API_KEY (Alternative runtime)
    // 3. process.env.GEMINI_API_KEY (Build-time fallback)
    return (window as any).process?.env?.API_KEY || 
           (window as any).API_KEY || 
           (process.env as any).GEMINI_API_KEY || 
           "";
}

// --- Types ---
type Lang = 'en' | 'vi';

interface MetadataSlot {
    id: number;
    file: File | null;
    text: string;
    outputUrl: string | null;
}

// --- Global State ---
let currentLang: Lang = 'en';
let activeTab: 'text-overlay' | 'remove-logo' = 'text-overlay';
let authorSignature: string = '';
let currentFont: string = 'Inter'; 
let currentFiles: File[] = [];
let logoImg: HTMLImageElement | null = null; // Store logo image

let metadataSlots: MetadataSlot[] = [
    { id: 1, file: null, text: '', outputUrl: null },
    { id: 2, file: null, text: '', outputUrl: null },
    { id: 3, file: null, text: '', outputUrl: null },
    { id: 4, file: null, text: '', outputUrl: null },
    { id: 5, file: null, text: '', outputUrl: null }
];

interface RemoveLogoSlot {
    id: number;
    file: File | null;
    outputUrl: string | null;
    originalWidth?: number;
    originalHeight?: number;
}

let removeLogoSlots: RemoveLogoSlot[] = [
    { id: 1, file: null, outputUrl: null },
    { id: 2, file: null, outputUrl: null },
    { id: 3, file: null, outputUrl: null },
    { id: 4, file: null, outputUrl: null },
    { id: 5, file: null, outputUrl: null }
];

// Modal State
let modalScale = 1;
let modalTranslate = { x: 0, y: 0 };
let isDraggingModal = false;
let dragStart = { x: 0, y: 0 };
let currentTranslateStart = { x: 0, y: 0 };

// --- Translations ---
const translations = {
    en: {
        appTitle: "IMGEN PRO",
        appSubtitle: "ADVANCED IMAGE PROCESSING",
        tabTextOverlay: "TEXT OVERLAY",
        tabRemoveLogo: "REMOVE LOGO",
        lblUpload: "SOURCE IMAGES",
        lblDrag: "DRAG & DROP FOR AUTO-FILL",
        lblFontStyle: "GLOBAL FONT STYLE",
        lblAuthor: "GLOBAL AUTHOR SIGNATURE",
        lblLogo: "GLOBAL LOGO (CENTER)",
        btnAddSlot: "ADD NEW SLOT",
        btnClearMetadata: "RESET",
        btnDownloadAll: "DOWNLOAD ALL",
        btnRunAll: "RUN REMOVE ALL",
        btnEmbedAll: "EMBED TEXT ALL",
        slotUpload: "UPLOAD IMAGE(S)",
        slotTextOverlay: "TEXT OVERLAY",
        slotPlaceholder: "ENTER TEXT TO OVERLAY ON IMAGE...",
        btnTranslate: "TRANSLATE",
        btnEmbed: "EMBED TEXT",
        btnSave: "SAVE PNG",
        outputLabel: "OUTPUT",
        removeLogoDesc: "ONLY WORKS WITH IMAGES UP TO 2K RESOLUTION. AUTOMATICALLY DETECT AND REMOVE GEMINI LOGOS OR WATERMARKS FROM YOUR IMAGES USING AI.",
        btnRunRemoveLogo: "RUN REMOVE LOGO"
    },
    vi: {
        appTitle: "IMGEN PRO",
        appSubtitle: "XỬ LÝ HÌNH ẢNH NÂNG CAO",
        tabTextOverlay: "CHÈN CHỮ",
        tabRemoveLogo: "XÓA LOGO",
        lblUpload: "ẢNH GỐC",
        lblDrag: "KÉO & THẢ ĐỂ TỰ ĐỘNG ĐIỀN",
        lblFontStyle: "KIỂU FONT CHUNG",
        lblAuthor: "CHỮ KÝ TÁC GIẢ (CHUNG)",
        lblLogo: "LOGO CHỮ KÝ (GIỮA ẢNH)",
        btnAddSlot: "THÊM SLOT MỚI",
        btnClearMetadata: "ĐẶT LẠI",
        btnDownloadAll: "TẢI TẤT CẢ",
        btnRunAll: "CHẠY XÓA TẤT CẢ",
        btnEmbedAll: "CHÈN CHỮ TẤT CẢ",
        slotUpload: "TẢI ẢNH LÊN",
        slotTextOverlay: "VĂN BẢN CHÈN",
        slotPlaceholder: "NHẬP VĂN BẢN CẦN CHÈN LÊN ẢNH...",
        btnTranslate: "DỊCH",
        btnEmbed: "CHÈN VĂN BẢN",
        btnSave: "LƯU ẢNH PNG",
        outputLabel: "KẾT QUẢ",
        removeLogoDesc: "CHỈ HOẠT ĐỘNG VỚI ẢNH TỪ 2K TRỞ XUỐNG. TỰ ĐỘNG PHÁT HIỆN VÀ XÓA LOGO GEMINI HOẶC WATERMARK KHỎI ẢNH CỦA BẠN BẰNG AI.",
        btnRunRemoveLogo: "CHẠY XÓA LOGO"
    }
};

// --- Icons ---
const iconRemove = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
const iconTrash = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`;

// --- DOM References ---
function getEl<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

const statusMsg = getEl<HTMLParagraphElement>('status-msg');
const loader = getEl<HTMLDivElement>('loader');
const fileInput = getEl<HTMLInputElement>('file-input');
const dropZone = getEl<HTMLDivElement>('drop-zone');
const previewContainer = getEl<HTMLDivElement>('preview-container');
const emptyState = getEl<HTMLDivElement>('empty-state');

// Tabs
const tabTextOverlay = getEl<HTMLButtonElement>('tab-text-overlay');
const tabRemoveLogo = getEl<HTMLButtonElement>('tab-remove-logo');

// Panels
const panelMetadata = getEl<HTMLDivElement>('panel-metadata');
const panelRemoveLogo = getEl<HTMLDivElement>('panel-remove-logo');

// Results
const metadataResults = getEl<HTMLDivElement>('metadata-results');
const removeLogoResults = getEl<HTMLDivElement>('remove-logo-results');

// Remove Logo Controls
const removeStrength = getEl<HTMLInputElement>('remove-strength');
const strengthVal = getEl<HTMLSpanElement>('strength-val');

// Buttons (Metadata)
const btnAddSlot = getEl<HTMLButtonElement>('btn-add-slot');
const btnClearMetadata = getEl<HTMLButtonElement>('btn-clear-metadata');
const btnDownloadAll = getEl<HTMLButtonElement>('btn-download-all');
const langToggleBtn = getEl<HTMLButtonElement>('lang-toggle-btn');
const langEn = getEl<HTMLSpanElement>('lang-en');
const langVi = getEl<HTMLSpanElement>('lang-vi');
const fontSelector = getEl<HTMLSelectElement>('font-selector');
const authorInput = getEl<HTMLTextAreaElement>('author-input');
const logoInput = getEl<HTMLInputElement>('logo-input');

// New Buttons for Importing
const btnImportAuthor = getEl<HTMLDivElement>('btn-import-author');
const authorFileInput = getEl<HTMLInputElement>('author-file-input');
const btnImportLogo = getEl<HTMLDivElement>('btn-import-logo');

// Modal
const imageModal = getEl<HTMLDivElement>('image-modal');
const modalImg = getEl<HTMLImageElement>('modal-img');
const modalContainer = getEl<HTMLDivElement>('modal-container');
const btnCloseModal = getEl<HTMLButtonElement>('btn-close-modal');

// --- Window Interface ---
declare global {
  interface Window {
    aistudio?: {
      openSelectKey: () => Promise<void>;
      hasSelectedApiKey: () => Promise<boolean>;
    };
  }
}

// --- Utils ---
function showStatus(msg: string, isError: boolean = false) {
    if (statusMsg) {
        statusMsg.textContent = msg;
        statusMsg.className = isError 
            ? 'text-center text-xs text-red-500 h-4 truncate font-bold' 
            : 'text-center text-xs text-gray-500 h-4 truncate';
        setTimeout(() => { if(statusMsg) statusMsg.textContent = ''; }, 4000);
    }
}

function setLoading(isLoading: boolean) {
    if (loader) loader.classList.toggle('hidden', !isLoading);
}

function updateUI() {
    // Update Static Elements
    const t = translations[currentLang];
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key && t[key as keyof typeof t]) {
            el.textContent = t[key as keyof typeof t];
        }
    });

    // Update Tab Visuals
    if (tabTextOverlay && tabRemoveLogo) {
        if (activeTab === 'text-overlay') {
            tabTextOverlay.className = "px-4 py-2 rounded-sm text-sm font-bold transition-all cursor-pointer bg-blue-900/40 text-blue-400 border border-blue-800/50";
            tabRemoveLogo.className = "px-4 py-2 rounded-sm text-sm font-bold transition-all cursor-pointer text-gray-400 hover:text-white hover:bg-gray-800";
            panelMetadata?.classList.remove('hidden');
            panelRemoveLogo?.classList.add('hidden');
            metadataResults?.classList.remove('hidden');
            removeLogoResults?.classList.add('hidden');
        } else {
            tabTextOverlay.className = "px-4 py-2 rounded-sm text-sm font-bold transition-all cursor-pointer text-gray-400 hover:text-white hover:bg-gray-800";
            tabRemoveLogo.className = "px-4 py-2 rounded-sm text-sm font-bold transition-all cursor-pointer bg-yellow-900/40 text-yellow-500 border border-yellow-800/50";
            panelMetadata?.classList.add('hidden');
            panelRemoveLogo?.classList.remove('hidden');
            metadataResults?.classList.add('hidden');
            removeLogoResults?.classList.remove('hidden');
        }
    }

    // Update Button Spans specifically
    const btnAddText = getEl('btn-add-slot-text');
    if (btnAddText) btnAddText.textContent = t.btnAddSlot;
    
    const btnClearText = getEl('btn-clear-metadata-text');
    if (btnClearText) btnClearText.textContent = t.btnClearMetadata;

    const btnDownloadText = getEl('btn-download-all-text');
    if (btnDownloadText) btnDownloadText.textContent = t.btnDownloadAll;

    // Update Lang Toggle Visuals
    if (langEn && langVi) {
        if (currentLang === 'en') {
            langEn.className = "text-blue-400 font-bold";
            langEn.style.color = "#60a5fa";
            langVi.className = "text-gray-400";
            langVi.style.color = "#9ca3af";
        } else {
            langEn.className = "text-gray-400";
            langEn.style.color = "#9ca3af";
            langVi.className = "text-blue-400 font-bold";
            langVi.style.color = "#60a5fa";
        }
    }

    // Update Drop Zone based on Tab
    if (dropZone) {
        const lblDrag = getEl('lbl-drag');
        const lblUpload = getEl('lbl-upload');
        const emptyStateIcon = dropZone.querySelector('#empty-state svg');
        
        if (lblUpload) {
            lblUpload.textContent = activeTab === 'text-overlay' ? t.btnEmbedAll : t.lblUpload;
        }

        if (lblDrag) {
            if (activeTab === 'text-overlay') {
                lblDrag.textContent = t.btnEmbedAll;
                lblDrag.setAttribute('data-i18n', 'btnEmbedAll');
                dropZone.className = "min-h-[120px] flex flex-col justify-center border-2 border-dashed border-blue-800/50 rounded-sm p-4 text-center hover:border-blue-700 hover:bg-blue-900/10 transition-all cursor-pointer group relative bg-blue-900/5";
                if (emptyStateIcon) {
                    emptyStateIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />';
                    emptyStateIcon.parentElement!.className = "w-12 h-12 bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-900/40 transition-colors shadow-lg border border-blue-800/30";
                    emptyStateIcon.classList.remove('text-yellow-600');
                    emptyStateIcon.classList.add('text-blue-600');
                }
                lblDrag.className = "text-xs font-bold text-blue-700 group-hover:text-blue-600 transition-colors uppercase tracking-widest";
            } else {
                lblDrag.textContent = t.btnRunAll;
                lblDrag.setAttribute('data-i18n', 'btnRunAll');
                dropZone.className = "min-h-[120px] flex flex-col justify-center border-2 border-dashed border-yellow-800/50 rounded-sm p-4 text-center hover:border-yellow-700 hover:bg-yellow-900/10 transition-all cursor-pointer group relative bg-yellow-900/5";
                if (emptyStateIcon) {
                    emptyStateIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />';
                    emptyStateIcon.parentElement!.className = "w-12 h-12 bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-yellow-900/40 transition-colors shadow-lg border border-yellow-800/30";
                    emptyStateIcon.classList.remove('text-blue-600');
                    emptyStateIcon.classList.add('text-yellow-600');
                }
                lblDrag.className = "text-xs font-bold text-yellow-700 group-hover:text-yellow-600 transition-colors uppercase tracking-widest";
            }
        }
    }

    // Re-render slots
    renderMetadataSlots();
    renderRemoveLogoSlots();
}

function closeModal() {
    if (imageModal) {
        imageModal.classList.add('hidden');
        if (modalImg) modalImg.src = '';
    }
}

function openModal(url: string) {
    if (imageModal && modalImg) {
        modalImg.src = url;
        // Reset Zoom/Pan
        modalScale = 1;
        modalTranslate = { x: 0, y: 0 };
        updateModalTransform();
        
        modalImg.style.maxHeight = '90vh';
        modalImg.style.maxWidth = '90vw';
        
        imageModal.classList.remove('hidden');
    }
}

function updateModalTransform() {
    if (modalImg) {
        if (modalScale > 1) {
            modalImg.style.maxHeight = 'none';
            modalImg.style.maxWidth = 'none';
        } else {
             modalImg.style.maxHeight = '90vh';
             modalImg.style.maxWidth = '90vw';
        }
        modalImg.style.transform = `translate(${modalTranslate.x}px, ${modalTranslate.y}px) scale(${modalScale})`;
    }
}

async function getApiKey(): Promise<string | undefined> {
    return getRuntimeApiKey();
}

// --- PNG Logic ---
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        if (c & 1) c = 0xedb88320 ^ (c >>> 1);
        else c = c >>> 1;
    }
    crcTable[n] = c;
}

function crc32(buf: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return crc ^ 0xffffffff;
}

function extractPngMetadata(buffer: ArrayBuffer): string | null {
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);
    if (view.getUint32(0) !== 0x89504E47) return null;
    let offset = 8;
    while (offset < buffer.byteLength) {
        if (offset + 8 > buffer.byteLength) break;
        const length = view.getUint32(offset);
        const type = String.fromCharCode(...uint8.slice(offset + 4, offset + 8));
        if (type === 'tEXt') {
            const chunkData = uint8.slice(offset + 8, offset + 8 + length);
            let nullIndex = -1;
            for (let i = 0; i < chunkData.length; i++) { if (chunkData[i] === 0) { nullIndex = i; break; } }
            if (nullIndex > -1) {
                const keyword = new TextDecoder().decode(chunkData.slice(0, nullIndex));
                if (keyword === 'parameters' || keyword === 'BananaProData') {
                    return new TextDecoder().decode(chunkData.slice(nullIndex + 1));
                }
            }
        }
        offset += 12 + length;
        if (type === 'IEND') break;
    }
    return null;
}

function writePngMetadata(originalPng: Uint8Array, key: string, value: string): Uint8Array {
    const keyBytes = new TextEncoder().encode(key);
    const textBytes = new TextEncoder().encode(value);
    const chunkData = new Uint8Array(keyBytes.length + 1 + textBytes.length);
    chunkData.set(keyBytes, 0); chunkData[keyBytes.length] = 0; chunkData.set(textBytes, keyBytes.length + 1);
    const len = chunkData.length;
    const lenBuf = new Uint8Array(4); new DataView(lenBuf.buffer).setUint32(0, len, false);
    const typeBuf = new TextEncoder().encode("tEXt");
    const crcBuf = new Uint8Array(4);
    const crcCheck = new Uint8Array(typeBuf.length + chunkData.length);
    crcCheck.set(typeBuf, 0); crcCheck.set(chunkData, typeBuf.length);
    new DataView(crcBuf.buffer).setUint32(0, crc32(crcCheck), false);
    const chunk = new Uint8Array(4 + 4 + len + 4);
    chunk.set(lenBuf, 0); chunk.set(typeBuf, 4); chunk.set(chunkData, 8); chunk.set(crcBuf, 8 + len);
    let pos = 8;
    while(pos < originalPng.length) {
        const chunkLen = new DataView(originalPng.buffer).getUint32(pos);
        const type = String.fromCharCode(...originalPng.slice(pos + 4, pos + 8));
        if (type === 'IHDR') {
             const insertionPoint = pos + 8 + chunkLen + 4;
             const newPng = new Uint8Array(originalPng.length + chunk.length);
             newPng.set(originalPng.slice(0, insertionPoint), 0);
             newPng.set(chunk, insertionPoint);
             newPng.set(originalPng.slice(insertionPoint), insertionPoint + chunk.length);
             return newPng;
        }
        pos += 8 + chunkLen + 4;
    }
    return originalPng;
}

async function extractMetadataString(file: File): Promise<string> {
    try {
        const buffer = await file.arrayBuffer();
        const meta = extractPngMetadata(buffer);
        return meta || "";
    } catch(e) { return ""; }
}

// --- Gemini Call (Kept for Translation feature) ---
async function callGemini(prompt: string, files: File[], asJson: boolean = true): Promise<string> {
    const key = await getApiKey();
    if (!key) { showStatus("API KEY REQUIRED", true); return ""; }

    const ai = new GoogleGenAI({ apiKey: key });
    const parts: any[] = [];
    
    // Add files if any (though translation usually just sends text, the helper supports files)
    for (const file of files) {
        const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
        });
        parts.push({ inlineData: { mimeType: file.type, data: base64 } });
    }
    
    parts.push({ text: prompt });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: parts },
             config: asJson ? { responseMimeType: "application/json" } : {}
        });
        return response.text || (asJson ? "{}" : "");
    } catch (e: any) {
        console.error(e);
        showStatus("GEMINI API ERROR", true);
        return asJson ? "{}" : "";
    }
}

// --- File Handling (Common) ---
function handleCommonFiles(files: File[]) {
    // Enforce 5 image limit
    if (files.length > 5) {
        showStatus("LIMIT 5 IMAGES MAX. TRUNCATING...", true);
        files = files.slice(0, 5);
    }
    
    currentFiles = files;
    if (previewContainer) {
        previewContainer.innerHTML = '';
        files.forEach(f => {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(f);
            img.className = "h-32 w-auto rounded-sm shadow-sm snap-center border border-gray-700";
            previewContainer.appendChild(img);
        });
        previewContainer.classList.remove('hidden');
        if(emptyState) emptyState.classList.add('hidden');
    }
    
    // Auto populate slots if they are empty
    if (files.length > 0) {
        if (activeTab === 'text-overlay') {
            const emptySlots = metadataSlots.filter(slot => !slot.file);
            files.forEach(async (file, idx) => {
                if (idx < emptySlots.length) {
                    const slot = emptySlots[idx];
                    slot.file = file;
                    const meta = await extractMetadataString(file);
                    try {
                        const parsed = JSON.parse(meta);
                        slot.text = JSON.stringify(parsed, null, 2);
                    } catch {
                        slot.text = meta;
                    }
                }
            });
            renderMetadataSlots();
        } else {
            const emptySlots = removeLogoSlots.filter(slot => !slot.file);
            files.forEach((file, idx) => {
                if (idx < emptySlots.length) {
                    const slot = emptySlots[idx];
                    slot.file = file;
                } else {
                    const newId = (Math.max(...removeLogoSlots.map(s => s.id)) || 0) + 1;
                    removeLogoSlots.push({ id: newId, file: file, outputUrl: null });
                }
            });
            renderRemoveLogoSlots();
        }
    }
}

async function runEmbed(slot: MetadataSlot) {
    if (!slot.file || !slot.text) return;
    
    // Auto Delete Old Result Logic
    if (slot.outputUrl) {
        URL.revokeObjectURL(slot.outputUrl);
        slot.outputUrl = null;
    }

    return new Promise<void>((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(slot.file!);
        img.onload = () => {
            const canvas = document.createElement('canvas'); 
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                // Draw Text with current Font and Logo
                drawTextOnCanvas(ctx, slot.text, authorSignature, canvas.width, canvas.height, currentFont);
                
                canvas.toBlob(async (blob) => {
                    if(blob) {
                        const buffer = await blob.arrayBuffer();
                        // Determine key based on content
                        let key = "parameters";
                        try { JSON.parse(slot.text); key = "BananaProData"; } catch {}
                        
                        const finalPng = writePngMetadata(new Uint8Array(buffer), key, slot.text);
                        const finalBlob = new Blob([finalPng], { type: 'image/png' });
                        
                        slot.outputUrl = URL.createObjectURL(finalBlob);
                        renderMetadataSlots();
                        resolve();
                    }
                }, 'image/png');
            }
        };
    });
}

async function runEmbedAll() {
    const slotsToProcess = metadataSlots.filter(s => s.file && s.text);
    if (slotsToProcess.length === 0) {
        showStatus("NO IMAGES/TEXT TO PROCESS.", true);
        return;
    }
    
    setLoading(true);
    showStatus(`EMBEDDING TEXT FOR ${slotsToProcess.length} IMAGES...`);
    
    try {
        for (const slot of slotsToProcess) {
            await runEmbed(slot);
        }
        showStatus("ALL TEXT EMBEDDED!");
    } catch (e) {
        console.error(e);
        showStatus("ERROR DURING BATCH EMBEDDING", true);
    } finally {
        setLoading(false);
    }
}

// --- Metadata Writer Logic ---

// Drawing Function
function drawTextOnCanvas(ctx: CanvasRenderingContext2D, text: string, author: string, width: number, height: number, fontFamily: string) {
    // 1. Setup Area: Bottom 45% (Increased from 33% to fit more content and larger logo)
    const areaHeight = height * 0.45;
    const startY = height - areaHeight;
    const padding = width * 0.03; 
    const maxTextWidth = width - (padding * 2);

    // Draw Background Overlay (Dark Fade)
    const gradient = ctx.createLinearGradient(0, startY, 0, height);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.0)');
    gradient.addColorStop(0.15, 'rgba(0, 0, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.95)'); 
    ctx.fillStyle = gradient;
    ctx.fillRect(0, startY, width, areaHeight);

    // 2. Draw Logo in Center Top of Text Area
    let logoOffset = 0;
    if (logoImg) {
        // Logo width: 50% (Increased from 35% based on user request "Larger than current")
        const targetW = width * 0.50;
        const logoAspect = logoImg.width / logoImg.height;
        const targetH = targetW / logoAspect;
        
        const logoX = (width - targetW) / 2;
        // Position at the top of the dark area with a small offset
        const logoY = startY + (areaHeight * 0.02); 
        
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 10;
        ctx.drawImage(logoImg, logoX, logoY, targetW, targetH);
        ctx.restore();

        // Calculate offset to push text down.
        logoOffset = targetH + (areaHeight * 0.02);
    }

    // 3. Prepare Signature Metrics
    const baseRefFontSize = Math.floor(width * 0.06); 
    // Allow smaller minimum font size to help text fit
    const minRefFontSize = Math.max(10, width * 0.015);
    
    let signatureHeight = 0;
    let signatureFontSize = 0;
    
    if (author && author.trim() !== '') {
        signatureFontSize = Math.max(baseRefFontSize * 0.35, minRefFontSize); 
        ctx.font = `italic ${signatureFontSize}px '${fontFamily}'`;
        signatureHeight = signatureFontSize * 1.5;
    }

    // 4. Main Text Auto-Fitting Logic
    // Start text below the logo
    const textStartY = startY + logoOffset + padding;
    const bottomBuffer = author && author.trim() !== '' ? signatureHeight + padding : padding;
    const maxTextEndY = height - bottomBuffer;
    const maxAvailableHeight = maxTextEndY - textStartY;
    
    // Safety check
    if (maxAvailableHeight <= 0) return;

    let fontSize = baseRefFontSize;
    let lines: string[] = [];
    let lineHeight = 0;

    // Loop to find the largest font size that fits
    while (fontSize >= minRefFontSize) {
        ctx.font = `500 ${fontSize}px '${fontFamily}'`;
        // Line height multiplier
        lineHeight = fontSize * 1.3;
        lines = [];
        
        const paragraphs = text.split('\n');
        let fits = true;
        let currentContentHeight = 0;

        for (const para of paragraphs) {
            // Handle empty lines
            if (para.trim() === '') {
                currentContentHeight += lineHeight * 0.5;
                continue;
            }

            const words = para.split(' ');
            let line = '';
            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxTextWidth && n > 0) {
                    lines.push(line);
                    currentContentHeight += lineHeight;
                    line = words[n] + ' ';
                } else {
                    line = testLine;
                }
            }
            lines.push(line);
            currentContentHeight += lineHeight;

            if (currentContentHeight > maxAvailableHeight) {
                fits = false;
                break;
            }
        }

        if (fits) break;
        fontSize -= 1; // Decrease by 1 for finer granularity
    }

    // Draw Text
    ctx.font = `500 ${fontSize}px '${fontFamily}'`;
    ctx.fillStyle = '#f3f4f6';
    ctx.textAlign = 'center'; // Center align text looks better with centered logo
    ctx.textBaseline = 'top';
    
    // Add simple shadow for better readability
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    let cursorY = textStartY;
    lines.forEach(line => {
        if (cursorY + lineHeight <= height) { // simple clipping check
             ctx.fillText(line, width / 2, cursorY);
        }
        cursorY += lineHeight;
    });

    // Draw Signature
    if (author && author.trim() !== '') {
        ctx.font = `italic ${signatureFontSize}px '${fontFamily}'`;
        ctx.fillStyle = '#fbbf24'; 
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        // Updated Signature format: "— Author —"
        ctx.fillText(`— ${author} —`, width - padding, height - padding);
    }
}

function renderMetadataSlots() {
    if (!metadataResults) return;
    metadataResults.innerHTML = '';
    
    const t = translations[currentLang];

    metadataSlots.forEach((slot, index) => {
        const row = document.createElement('div');
        row.className = "grid grid-cols-1 lg:grid-cols-[180px_1fr_180px] gap-3 bg-[#18181a] border border-gray-800 rounded-sm p-3 relative group";
        
        // Remove Button
        const btnRemove = document.createElement('button');
        btnRemove.className = "absolute top-2 right-2 p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-all z-10 opacity-0 group-hover:opacity-100";
        btnRemove.innerHTML = iconRemove;
        btnRemove.onclick = () => {
            metadataSlots = metadataSlots.filter(s => s.id !== slot.id);
            renderMetadataSlots();
        };

        // 1. Upload Area
        const uploadCol = document.createElement('div');
        uploadCol.className = "flex flex-col gap-2 relative";
        
        const previewBox = document.createElement('div');
        previewBox.className = "relative aspect-square w-full rounded-sm border-2 border-dashed border-gray-700 hover:border-orange-500/50 transition-colors flex flex-col items-center justify-center bg-black cursor-pointer overflow-hidden";
        
        const handleFilesForSlot = async (files: File[]) => {
            const validFiles = files.filter(f => f.type.startsWith('image/'));
            if (validFiles.length === 0) return;
            
            // Auto-fill logic
            let fileIndex = 0;
            slot.file = validFiles[fileIndex];
            // Extract Metadata Immediately
            const meta = await extractMetadataString(slot.file);
            try { 
                const parsed = JSON.parse(meta);
                slot.text = JSON.stringify(parsed, null, 2); 
            } catch { 
                slot.text = meta; 
            }
            
            fileIndex++;
            while(fileIndex < validFiles.length) {
                const nextFile = validFiles[fileIndex];
                // Extract metadata for next files too
                const nextMeta = await extractMetadataString(nextFile);
                let nextText = nextMeta;
                try { nextText = JSON.stringify(JSON.parse(nextMeta), null, 2); } catch {}

                if (index + fileIndex < metadataSlots.length) {
                     metadataSlots[index + fileIndex].file = nextFile;
                     metadataSlots[index + fileIndex].text = nextText;
                } else {
                     const newId = (Math.max(...metadataSlots.map(s => s.id)) || 0) + 1;
                     metadataSlots.push({ id: newId, file: nextFile, text: nextText, outputUrl: null });
                }
                fileIndex++;
            }
            renderMetadataSlots();
            showStatus(`LOADED ${validFiles.length} IMAGES.`);
        };

        previewBox.ondragover = (e) => { e.preventDefault(); previewBox.classList.add('border-orange-500'); };
        previewBox.ondragleave = (e) => { e.preventDefault(); previewBox.classList.remove('border-orange-500'); };
        previewBox.ondrop = (e) => {
            e.preventDefault(); previewBox.classList.remove('border-orange-500');
            if (e.dataTransfer?.files) handleFilesForSlot(Array.from(e.dataTransfer.files));
        };

        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.className = 'hidden';
        input.onchange = (e) => { if ((e.target as HTMLInputElement).files) handleFilesForSlot(Array.from((e.target as HTMLInputElement).files!)); };
        
        if (slot.file) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(slot.file);
            img.className = "w-full h-full object-contain";
            previewBox.appendChild(img);
            previewBox.classList.remove('border-dashed');
            
            // Clear Image Button
            const btnTrash = document.createElement('button');
            btnTrash.className = "absolute top-2 right-2 p-1 bg-black/50 text-red-400 rounded-sm hover:bg-black/70";
            btnTrash.innerHTML = iconTrash;
            btnTrash.onclick = (e) => { e.stopPropagation(); slot.file = null; slot.outputUrl = null; renderMetadataSlots(); };
            uploadCol.appendChild(btnTrash);
        } else {
            previewBox.innerHTML = `<span class="text-[10px] text-gray-500 font-bold uppercase">${t.slotUpload}</span>`;
        }
        previewBox.onclick = () => input.click();
        uploadCol.appendChild(previewBox);
        uploadCol.appendChild(input);

        // 2. Text Area
        const textCol = document.createElement('div');
        textCol.className = "flex flex-col gap-2 h-full relative";
        
        const label = document.createElement('div');
        label.className = "flex justify-between items-center";
        label.innerHTML = `<span class="text-[10px] font-bold text-orange-400 uppercase">${t.slotTextOverlay}</span>`;
        
        const textarea = document.createElement('textarea');
        textarea.className = "flex-1 bg-gray-900 border border-gray-700 rounded-sm p-2 text-[11px] font-mono text-gray-300 focus:ring-1 focus:ring-orange-500 outline-none resize-none min-h-[120px] mb-8";
        textarea.value = slot.text;
        textarea.placeholder = t.slotPlaceholder;
        textarea.oninput = (e) => { slot.text = (e.target as HTMLTextAreaElement).value; };

        const btnTranslate = document.createElement('button');
        btnTranslate.className = "absolute top-0 right-0 text-xs text-blue-400 hover:text-white border border-blue-500/50 rounded-sm px-2 py-0.5";
        btnTranslate.innerText = t.btnTranslate;
        btnTranslate.onclick = async () => {
            if(!slot.text) return;
            setLoading(true);
            const prompt = `Translate to ${currentLang === 'en' ? 'Vietnamese' : 'English'}. Return only the translated text:\n${slot.text}`;
            const res = await callGemini(prompt, []);
            slot.text = res.trim();
            renderMetadataSlots();
            setLoading(false);
        };

        const btnEmbed = document.createElement('button');
        btnEmbed.className = "absolute bottom-0 right-0 bg-orange-600 hover:bg-orange-500 text-white font-bold py-1.5 px-3 rounded-sm text-[10px] shadow-lg";
        btnEmbed.innerText = t.btnEmbed;
        btnEmbed.onclick = () => {
            if (!slot.file || !slot.text) { showStatus("MISSING FILE OR TEXT", true); return; }
            runEmbed(slot).then(() => showStatus("TEXT EMBEDDED!"));
        };

        textCol.appendChild(label);
        textCol.appendChild(btnTranslate);
        textCol.appendChild(textarea);
        textCol.appendChild(btnEmbed);

        // 3. Output
        const outputCol = document.createElement('div');
        outputCol.className = "flex flex-col gap-2";
        const outputBox = document.createElement('div');
        outputBox.className = "relative aspect-square w-full rounded-sm border-2 border-dashed border-gray-800 flex flex-col items-center justify-center bg-black overflow-hidden";
        
        if (slot.outputUrl) {
            const img = document.createElement('img');
            img.src = slot.outputUrl;
            img.className = "w-full h-full object-contain cursor-pointer";
            img.onclick = () => openModal(slot.outputUrl!);
            outputBox.appendChild(img);
            outputBox.classList.remove('border-dashed');

            const btnSave = document.createElement('button');
            btnSave.className = "w-full bg-green-700 hover:bg-green-600 text-white font-bold py-1.5 rounded-sm text-[10px] mt-2";
            btnSave.innerText = t.btnSave;
            btnSave.onclick = () => {
                const a = document.createElement('a'); 
                a.href = slot.outputUrl!; 
                const originalName = slot.file ? slot.file.name.split('.')[0] : `image_${slot.id}`;
                a.download = `Overlay_${originalName}.png`; 
                a.click();
            };
            outputCol.appendChild(outputBox);
            outputCol.appendChild(btnSave);
        } else {
            outputBox.innerHTML = `<span class="text-[10px] text-red-500 font-bold">${t.outputLabel}</span>`;
            outputCol.appendChild(outputBox);
        }

        row.appendChild(btnRemove);
        row.appendChild(uploadCol);
        row.appendChild(textCol);
        row.appendChild(outputCol);
        metadataResults.appendChild(row);
    });
}

async function runRemoveLogoAll() {
    const slotsToProcess = removeLogoSlots.filter(s => s.file);
    if (slotsToProcess.length === 0) {
        showStatus("NO IMAGES TO PROCESS.", true);
        return;
    }
    
    setLoading(true);
    showStatus(`PROCESSING ${slotsToProcess.length} IMAGES...`);
    
    try {
        for (const slot of slotsToProcess) {
            await runRemoveLogo(slot, true); // Pass true to skip internal loading state
        }
        showStatus("ALL LOGOS REMOVED!");
    } catch (e) {
        console.error(e);
        showStatus("ERROR DURING BATCH PROCESSING", true);
    } finally {
        setLoading(false);
    }
}

// --- Remove Logo Logic ---
async function runRemoveLogo(slot: RemoveLogoSlot, skipLoading: boolean = false) {
    if (!slot.file) return;
    if (!skipLoading) setLoading(true);
    if (!skipLoading) showStatus("REMOVING LOGO...");

    const key = await getApiKey();
    if (!key) { setLoading(false); return; }

    const ai = new GoogleGenAI({ apiKey: key });
    
    try {
        // Get original dimensions using naturalWidth/Height
        const img = new Image();
        const objectUrl = URL.createObjectURL(slot.file);
        img.src = objectUrl;
        await new Promise((resolve, reject) => { 
            img.onload = resolve; 
            img.onerror = reject;
        });
        slot.originalWidth = img.naturalWidth;
        slot.originalHeight = img.naturalHeight;
        URL.revokeObjectURL(objectUrl);

        const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(slot.file!);
        });

        const prompt = `CRITICAL TASK: REMOVE WATERMARK. 
        Identify and completely remove the Gemini logo (the four-pointed sparkle/star icon) and any "Gemini" text or other watermarks from this image. 
        You MUST reconstruct the background behind the logo perfectly using surrounding textures, colors, and patterns. 
        The removal must be SEAMLESS and INVISIBLE. 
        DO NOT leave any blurry patches, artifacts, or ghosting where the logo was. 
        Return ONLY the processed image.
        MAINTAIN THE ORIGINAL HIGH RESOLUTION AND PIXEL COUNT (${slot.originalWidth}x${slot.originalHeight}). DO NOT COMPRESS OR DOWNSCALE.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { mimeType: slot.file.type, data: base64 } },
                    { text: prompt }
                ]
            }
        });

        if (!response.candidates || response.candidates.length === 0) {
            throw new Error("NO CANDIDATES RETURNED");
        }

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                const base64Data = part.inlineData.data;
                
                // Resize back to original resolution to ensure no loss in pixel count
                const resultImg = new Image();
                resultImg.src = `data:image/png;base64,${base64Data}`;
                await new Promise((resolve, reject) => { 
                    resultImg.onload = resolve; 
                    resultImg.onerror = reject;
                });

                const canvas = document.createElement('canvas');
                canvas.width = slot.originalWidth || resultImg.naturalWidth;
                canvas.height = slot.originalHeight || resultImg.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(resultImg, 0, 0, canvas.width, canvas.height);
                    
                    if (slot.outputUrl) URL.revokeObjectURL(slot.outputUrl);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            slot.outputUrl = URL.createObjectURL(blob);
                            renderRemoveLogoSlots();
                            showStatus("LOGO REMOVED!");
                        }
                    }, 'image/png');
                }
                break;
            }
        }
    } catch (e: any) {
        console.error(e);
        if (e.message?.includes("403") || e.message?.includes("permission")) {
            showStatus("PERMISSION DENIED. PLEASE SELECT A PAID API KEY.", true);
            // Optionally trigger the key selection dialog automatically
            if (window.aistudio?.openSelectKey) {
                setTimeout(() => window.aistudio.openSelectKey(), 2000);
            }
        } else {
            showStatus("ERROR REMOVING LOGO", true);
        }
    } finally {
        if (!skipLoading) setLoading(false);
    }
}

function renderRemoveLogoSlots() {
    if (!removeLogoResults) return;
    removeLogoResults.innerHTML = '';
    
    const t = translations[currentLang];

    removeLogoSlots.forEach((slot, index) => {
        const row = document.createElement('div');
        row.className = "grid grid-cols-2 gap-2 bg-[#0a1224] border border-gray-800 rounded-sm p-3 relative group";
        
        // Remove Button
        const btnRemove = document.createElement('button');
        btnRemove.className = "absolute top-2 right-2 p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-all z-10 opacity-0 group-hover:opacity-100";
        btnRemove.innerHTML = iconRemove;
        btnRemove.onclick = () => {
            removeLogoSlots = removeLogoSlots.filter(s => s.id !== slot.id);
            renderRemoveLogoSlots();
        };

        // 1. Upload Area
        const uploadCol = document.createElement('div');
        uploadCol.className = "flex flex-col gap-2 relative";
        
        const previewBox = document.createElement('div');
        previewBox.className = "relative aspect-square w-full rounded-sm border-2 border-dashed border-gray-800 hover:border-blue-900/50 transition-colors flex flex-col items-center justify-center bg-black cursor-pointer overflow-hidden";
        
        const handleFilesForSlot = (files: File[]) => {
            const validFiles = files.filter(f => f.type.startsWith('image/'));
            if (validFiles.length === 0) return;
            
            let fileIndex = 0;
            slot.file = validFiles[fileIndex];
            fileIndex++;
            
            while(fileIndex < validFiles.length) {
                const nextFile = validFiles[fileIndex];
                if (index + fileIndex < removeLogoSlots.length) {
                     removeLogoSlots[index + fileIndex].file = nextFile;
                } else {
                     const newId = (Math.max(...removeLogoSlots.map(s => s.id)) || 0) + 1;
                     removeLogoSlots.push({ id: newId, file: nextFile, outputUrl: null });
                }
                fileIndex++;
            }
            renderRemoveLogoSlots();
        };

        previewBox.ondragover = (e) => { e.preventDefault(); previewBox.classList.add('border-blue-900'); };
        previewBox.ondragleave = (e) => { e.preventDefault(); previewBox.classList.remove('border-blue-900'); };
        previewBox.ondrop = (e) => {
            e.preventDefault(); previewBox.classList.remove('border-blue-900');
            if (e.dataTransfer?.files) handleFilesForSlot(Array.from(e.dataTransfer.files));
        };

        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.className = 'hidden';
        input.onchange = (e) => { if ((e.target as HTMLInputElement).files) handleFilesForSlot(Array.from((e.target as HTMLInputElement).files!)); };
        
        if (slot.file) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(slot.file);
            img.className = "w-full h-full object-contain";
            previewBox.appendChild(img);
            previewBox.classList.remove('border-dashed');
            
            const btnTrash = document.createElement('button');
            btnTrash.className = "absolute top-2 right-2 p-1 bg-black/50 text-red-400 rounded-sm hover:bg-black/70";
            btnTrash.innerHTML = iconTrash;
            btnTrash.onclick = (e) => { e.stopPropagation(); slot.file = null; slot.outputUrl = null; renderRemoveLogoSlots(); };
            uploadCol.appendChild(btnTrash);

            const btnRun = document.createElement('button');
            btnRun.className = "w-full bg-yellow-800 hover:bg-yellow-700 text-white font-bold py-2 rounded-sm text-[10px] mt-2 transition-all shadow-lg hover:shadow-yellow-900/20 active:scale-95 flex items-center justify-center gap-2";
            btnRun.innerText = t.btnRunRemoveLogo;
            btnRun.onclick = () => runRemoveLogo(slot);
            uploadCol.appendChild(btnRun);
        } else {
            previewBox.innerHTML = `<span class="text-[10px] text-gray-500 font-bold uppercase">${t.slotUpload}</span>`;
        }
        previewBox.onclick = () => input.click();
        uploadCol.appendChild(previewBox);
        uploadCol.appendChild(input);

        // 2. Output
        const outputCol = document.createElement('div');
        outputCol.className = "flex flex-col gap-2";
        const outputBox = document.createElement('div');
        outputBox.className = "relative aspect-square w-full rounded-sm border-2 border-dashed border-gray-800 flex flex-col items-center justify-center bg-black overflow-hidden";
        
        if (slot.outputUrl) {
            const img = document.createElement('img');
            img.src = slot.outputUrl;
            img.className = "w-full h-full object-contain cursor-pointer";
            img.onclick = () => openModal(slot.outputUrl!);
            outputBox.appendChild(img);
            outputBox.classList.remove('border-dashed');

            const btnSave = document.createElement('button');
            btnSave.className = "w-full bg-green-700 hover:bg-green-600 text-white font-bold py-1.5 rounded-sm text-[10px] mt-2";
            btnSave.innerText = t.btnSave;
            btnSave.onclick = () => {
                const a = document.createElement('a'); 
                a.href = slot.outputUrl!; 
                const originalName = slot.file ? slot.file.name.split('.')[0] : `image_${slot.id}`;
                a.download = `No_Logo_${originalName}.png`; 
                a.click();
            };
            outputCol.appendChild(outputBox);
            outputCol.appendChild(btnSave);
        } else {
            outputBox.innerHTML = `<span class="text-[10px] text-blue-800 font-bold">${t.outputLabel}</span>`;
            outputCol.appendChild(outputBox);
        }

        row.appendChild(btnRemove);
        row.appendChild(uploadCol);
        row.appendChild(outputCol);
        removeLogoResults.appendChild(row);
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Author Input: Drag & Drop Text File
    if (authorInput) {
        authorInput.addEventListener('input', (e) => { authorSignature = (e.target as HTMLTextAreaElement).value; });
        
        authorInput.addEventListener('dragover', (e) => {
            e.preventDefault();
            authorInput.classList.add('bg-gray-800');
            authorInput.classList.add('ring-2');
            authorInput.classList.add('ring-orange-500');
        });

        authorInput.addEventListener('dragleave', (e) => {
             e.preventDefault();
             authorInput.classList.remove('bg-gray-800', 'ring-2', 'ring-orange-500');
        });

        authorInput.addEventListener('drop', (e) => {
            e.preventDefault();
            authorInput.classList.remove('bg-gray-800', 'ring-2', 'ring-orange-500');
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        const content = re.target?.result as string;
                        authorInput.value = content;
                        authorSignature = content;
                        showStatus('AUTHOR SIGNATURE LOADED FROM FILE.');
                    };
                    reader.readAsText(file);
                } else {
                    showStatus('PLEASE DROP A .TXT FILE.', true);
                }
            }
        });
    }

    // --- Import Text Button Logic ---
    if (btnImportAuthor && authorFileInput && authorInput) {
        // Trigger hidden input on click
        btnImportAuthor.addEventListener('click', () => {
            authorFileInput.click();
        });

        // Handle file selection
        authorFileInput.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                const file = files[0];
                const reader = new FileReader();
                reader.onload = (re) => {
                    const content = re.target?.result as string;
                    authorInput.value = content;
                    authorSignature = content;
                    showStatus('AUTHOR SIGNATURE LOADED FROM FILE.');
                };
                reader.readAsText(file);
                // Reset input so same file can be selected again
                (e.target as HTMLInputElement).value = '';
            }
        });
    }

    // --- Import Logo Button Logic ---
    if (btnImportLogo && logoInput) {
        btnImportLogo.addEventListener('click', () => {
            logoInput.click();
        });
    }

    // Logo Input Listener
    if (logoInput) {
        logoInput.addEventListener('change', (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const img = new Image();
                img.onload = () => {
                    logoImg = img;
                    showStatus("LOGO LOADED SUCCESSFULLY");
                };
                img.src = URL.createObjectURL(file);
            } else {
                logoImg = null;
            }
        });
    }

    // Language Toggle Listener
    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', () => {
            currentLang = currentLang === 'en' ? 'vi' : 'en';
            updateUI();
        });
    }

    // Tab Listeners
    tabTextOverlay?.addEventListener('click', () => { activeTab = 'text-overlay'; updateUI(); });
    tabRemoveLogo?.addEventListener('click', () => { activeTab = 'remove-logo'; updateUI(); });

    // Remove Logo Strength Slider
    removeStrength?.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value;
        if (strengthVal) strengthVal.textContent = `${val}%`;
    });

    fontSelector?.addEventListener('change', (e) => { currentFont = (e.target as HTMLSelectElement).value; });
    
    btnAddSlot?.addEventListener('click', () => {
        if (activeTab === 'text-overlay') {
            const newId = (Math.max(...metadataSlots.map(s => s.id)) || 0) + 1;
            metadataSlots.push({ id: newId, file: null, text: '', outputUrl: null });
            renderMetadataSlots();
        } else {
            const newId = (Math.max(...removeLogoSlots.map(s => s.id)) || 0) + 1;
            removeLogoSlots.push({ id: newId, file: null, outputUrl: null });
            renderRemoveLogoSlots();
        }
    });
    
    btnClearMetadata?.addEventListener('click', () => {
        if (activeTab === 'text-overlay') {
            metadataSlots = [
                { id: 1, file: null, text: '', outputUrl: null },
                { id: 2, file: null, text: '', outputUrl: null },
                { id: 3, file: null, text: '', outputUrl: null },
                { id: 4, file: null, text: '', outputUrl: null },
                { id: 5, file: null, text: '', outputUrl: null }
            ];
            renderMetadataSlots();
        } else {
            removeLogoSlots = [
                { id: 1, file: null, outputUrl: null },
                { id: 2, file: null, outputUrl: null },
                { id: 3, file: null, outputUrl: null },
                { id: 4, file: null, outputUrl: null },
                { id: 5, file: null, outputUrl: null }
            ];
            renderRemoveLogoSlots();
        }
        showStatus("ALL SLOTS RESET");
    });

    // Download All Listener
    btnDownloadAll?.addEventListener('click', () => {
        const slots = activeTab === 'text-overlay' ? metadataSlots : removeLogoSlots;
        const validSlots = slots.filter(s => s.outputUrl);
        if (validSlots.length === 0) {
            showStatus("NO PROCESSED IMAGES TO DOWNLOAD.", true);
            return;
        }

        let delay = 0;
        validSlots.forEach((slot) => {
            setTimeout(() => {
                const a = document.createElement('a');
                a.href = slot.outputUrl!;
                const originalName = slot.file ? slot.file.name.split('.')[0] : `image_${slot.id}`;
                const prefix = activeTab === 'text-overlay' ? 'Overlay_' : 'No_Logo_';
                a.download = `${prefix}${originalName}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }, delay);
            delay += 300; 
        });
        showStatus(`STARTING DOWNLOAD FOR ${validSlots.length} IMAGES...`);
    });

    btnCloseModal?.addEventListener('click', closeModal);

    // Modal Zoom & Pan
    if (modalContainer) {
        modalContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            // Zoom Logic
            const zoomSpeed = 0.001;
            modalScale += e.deltaY * -zoomSpeed * Math.max(1, modalScale); // accelerate zoom slightly
            modalScale = Math.min(Math.max(0.5, modalScale), 5); // Clamp 0.5x to 5x
            updateModalTransform();
        }, { passive: false });

        modalContainer.addEventListener('mousedown', (e) => {
            isDraggingModal = true;
            dragStart = { x: e.clientX, y: e.clientY };
            currentTranslateStart = { ...modalTranslate };
        });

        window.addEventListener('mousemove', (e) => {
            if (isDraggingModal && modalScale > 1) { 
                const dx = e.clientX - dragStart.x;
                const dy = e.clientY - dragStart.y;
                modalTranslate.x = currentTranslateStart.x + dx;
                modalTranslate.y = currentTranslateStart.y + dy;
                updateModalTransform();
            }
        });

        window.addEventListener('mouseup', () => {
            isDraggingModal = false;
        });
    }

    // Escape to Close Modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    // Common Drop Zone for Autofill
    if(dropZone && fileInput) {
        dropZone.onclick = () => {
            if (activeTab === 'remove-logo') {
                runRemoveLogoAll();
            } else {
                runEmbedAll();
            }
        };
        fileInput.onchange = (e) => { 
            if((e.target as HTMLInputElement).files) handleCommonFiles(Array.from((e.target as HTMLInputElement).files!)); 
        };
        dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('border-yellow-500'); };
        dropZone.ondrop = (e) => { e.preventDefault(); dropZone.classList.remove('border-yellow-500'); if(e.dataTransfer?.files) handleCommonFiles(Array.from(e.dataTransfer.files)); };
    }

    // Initialize
    updateUI(); // Calls renderMetadataSlots
});
