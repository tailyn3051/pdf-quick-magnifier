import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

declare const pdfjsLib: any;
declare const JSZip: any;
declare const PDFLib: any;

type Language = 'en' | 'zh-TW';
type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type Callout = { sourcePageIndex: number; sourceRect: Rect; destPoint: Point; scale: number };
type Callouts = { [destPageIndex: number]: Callout[] };
type Selection = { pageIndex: number; startPoint: Point; endPoint: Point };
type Transform = { scale: number; x: number; y: number };
type CapturedSelection = { sourcePageIndex: number; sourceRect: Rect; dataUrl: string; scaleFactor: number; sourceTransformScale: number; };

const translations = {
  en: {
    title: 'PDF',
    titleSpan: 'Quick Magnifier',
    errorSelectPdf: 'Please select a valid PDF file.',
    errorUploadFile: 'Please upload a PDF file.',
    errorProcessing: 'An error occurred while loading the PDF. Please try again.',
    errorCreatingPdf: 'Could not generate the PDF file. Please try again.',
    uploadFile: '1. Upload PDF',
    uploadPdf: 'Click to Upload PDF',
    pdfLoaded: 'PDF Loaded',
    configure: '2. Configure',
    magnification: 'Magnification',
    instructionsHeader: 'Instructions',
    instruction1: 'Drag on a page to select an area.',
    instruction2: 'Move mouse to position the preview.',
    instruction3: 'Click to place the magnified view.',
    instruction_move: 'Use arrow keys to pan the page.',
    instruction_zoom: 'Hold Alt + scroll to zoom.',
    instruction_pan: 'Hold Alt + drag to pan.',
    instruction_reset: 'Middle-click to reset view.',
    instruction_cancel: 'Press Esc to cancel a selection.',
    results: '3. Results',
    downloadZip: 'Download All (.zip)',
    downloadPdf: 'Download as PDF',
    creatingPdf: 'Creating PDF...',
    loaderText: 'Loading PDF pages...',
    placeholder: 'Upload a PDF to start creating detail views.',
    page: 'Page',
    download: 'Download',
    undo: 'Undo',
    redo: 'Redo',
    resetView: 'Reset View',
    hidePanel: 'Hide Panel',
    showPanel: 'Show Panel',
    addPage: 'Add New Page',
    pageSize: 'Page Size',
    orientation: 'Orientation',
    portrait: 'Portrait',
    landscape: 'Landscape',
    addPageBtn: 'Add Page',
    errorAddPage: 'Failed to add a new page. Please try again.',
    placementMode: 'Placement Mode',
    quickPlace: 'Quick Place',
    crossPlace: 'Cross-Page Place',
    quickPlaceDesc: 'Select and place callout on the same page.',
    crossPlaceDesc: 'Select a detail, then navigate to any page to place it.',
    capturedDetail: 'Captured Detail',
    cancel: 'Cancel',
    duplicateAsBlank: 'Duplicate as Blank',
    duplicateAsBlankDesc: 'Create a blank page with the same dimensions as the original.',
    errorDuplicatePage: 'Failed to duplicate page. Please try again.',
    restart: 'Restart',
    restartConfirm: 'Are you sure you want to restart? All your changes will be lost.',
  },
  'zh-TW': {
    title: 'PDF',
    titleSpan: '快速放大工具',
    errorSelectPdf: '請選擇一個有效的 PDF 檔案。',
    errorUploadFile: '請上傳一個 PDF 檔案。',
    errorProcessing: '載入 PDF 時發生錯誤，請重試。',
    errorCreatingPdf: '無法生成 PDF 檔案，請重試。',
    uploadFile: '1. 上傳 PDF',
    uploadPdf: '點擊上傳 PDF',
    pdfLoaded: '已載入 PDF',
    configure: '2. 設定',
    magnification: '放大倍率',
    instructionsHeader: '操作說明',
    instruction1: '在頁面上拖曳以選取區域。',
    instruction2: '移動滑鼠以定位預覽。',
    instruction3: '點擊以放置放大視圖。',
    instruction_move: '使用方向鍵平移頁面。',
    instruction_zoom: '按住 Alt + 滾動以縮放。',
    instruction_pan: '按住 Alt + 拖曳以平移。',
    instruction_reset: '按下滑鼠中鍵以重設視圖。',
    instruction_cancel: '按下 Esc 鍵以取消選取。',
    results: '3. 結果',
    downloadZip: '全部下載 (.zip)',
    downloadPdf: '下載為 PDF',
    creatingPdf: '正在建立 PDF...',
    loaderText: '正在載入 PDF 頁面...',
    placeholder: '上傳 PDF 以開始建立細節視圖。',
    page: '第',
    download: '下載',
    undo: '復原',
    redo: '重做',
    resetView: '重設視圖',
    hidePanel: '隱藏面板',
    showPanel: '顯示面板',
    addPage: '新增頁面',
    pageSize: '頁面大小',
    orientation: '方向',
    portrait: '直向',
    landscape: '橫向',
    addPageBtn: '新增頁面',
    errorAddPage: '新增頁面失敗，請重試。',
    placementMode: '放置模式',
    quickPlace: '快速放置',
    crossPlace: '跨頁放置',
    quickPlaceDesc: '在同一頁面上選取並放置細節圖。',
    crossPlaceDesc: '選取一個細節，然後導航到任何頁面進行放置。',
    capturedDetail: '已擷取細節',
    cancel: '取消',
    duplicateAsBlank: '複製為空白頁',
    duplicateAsBlankDesc: '建立一個與原頁面尺寸相同的空白頁面。',
    errorDuplicatePage: '複製頁面失敗，請重試。',
    restart: '重新開始',
    restartConfirm: '您確定要重新開始嗎？所有變更都將遺失。',
  },
};

const RENDER_DEBOUNCE_MS = 100;
const PREVIEW_DPI = 200;
const HIGH_QUALITY_DPI = 450;

// This function implements a robust direct-rendering method to generate a high-quality image of a selected area.
const renderPdfSnippet = async (page: any, sourceRect: Rect, scaleFactor: number, isPreview: boolean = false): Promise<string | null> => {
    try {
        const RENDER_DPI = isPreview ? PREVIEW_DPI : HIGH_QUALITY_DPI;
        const outputScale = RENDER_DPI / 72; // The scale for high-resolution output
        const finalContentScale = outputScale * scaleFactor; // The total zoom level of the content

        // 1. Create a viewport for the page at the final desired scale.
        const viewport = page.getViewport({ scale: finalContentScale });

        // 2. Create the output canvas with dimensions matching the magnified selection.
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = Math.ceil(sourceRect.width * finalContentScale);
        outputCanvas.height = Math.ceil(sourceRect.height * finalContentScale);
        const outputCtx = outputCanvas.getContext('2d');
        if (!outputCtx) return null;
        
        // Fill background with white, as JPEG doesn't support transparency
        outputCtx.fillStyle = 'white';
        outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

        // 3. Translate the canvas context. This effectively "slides" the PDF page so that
        // the top-left of our sourceRect is at the origin (0,0) of the canvas.
        outputCtx.translate(-sourceRect.x * finalContentScale, -sourceRect.y * finalContentScale);

        // 4. Render the page. pdf.js will draw the entire page based on the viewport, but only
        // the portion within the canvas's clipping region (our desired snippet) will be visible.
        await page.render({ canvasContext: outputCtx, viewport }).promise;

        // 5. Return as a high-quality JPEG for smaller file size.
        return outputCanvas.toDataURL('image/jpeg', 0.9);
    } catch (e) {
        console.error("Failed to render PDF snippet", e);
        return null;
    }
};


const InteractivePage = ({ 
    pageIndex, 
    pdfDoc, 
    initialCallouts, 
    onAddCallout, 
    scaleFactor, 
    t,
    placementMode,
    capturedSelection,
    onCaptureSelection
}: {
    pageIndex: number;
    pdfDoc: any;
    initialCallouts: Callout[];
    onAddCallout: (sourcePageIndex: number, destPageIndex: number, sourceRect: Rect, destPoint: Point, scale: number) => void;
    scaleFactor: number;
    t: (key: keyof typeof translations.en) => string;
    placementMode: 'quick' | 'cross-page';
    capturedSelection: CapturedSelection | null;
    onCaptureSelection: (selection: CapturedSelection) => void;
}) => {
    const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
    const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const lastMousePos = useRef<Point>({ x: 0, y: 0 });
    const renderTimeoutRef = useRef<number | null>(null);

    const [pdfPage, setPdfPage] = useState<any | null>(null);
    const [interactionState, setInteractionState] = useState<'idle' | 'selecting' | 'placing' | 'panning'>('idle');
    const [selection, setSelection] = useState<Selection | null>(null);
    const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
    const [highResCalloutImages, setHighResCalloutImages] = useState<Map<Callout, HTMLImageElement>>(new Map());
    const [renderingCallouts, setRenderingCallouts] = useState<Set<Callout>>(new Set());
    const [preview, setPreview] = useState<{ sourceRect: Rect; dataUrl: string } | null>(null);
    const [placementPos, setPlacementPos] = useState<Point | null>(null);
    const [isPlacementValid, setIsPlacementValid] = useState(true);

    const isPlacingCrossPage = placementMode === 'cross-page' && !!capturedSelection;
    const isPlacingQuick = placementMode === 'quick' && interactionState === 'placing';

    const getClampedTransform = useCallback((newTransform: Transform): Transform => {
        if (!pdfPage || !viewportRef.current) {
            return newTransform;
        }

        const pdfViewport = pdfPage.getViewport({ scale: newTransform.scale });
        const scaledPdfWidth = pdfViewport.width;
        const scaledPdfHeight = pdfViewport.height;

        const containerWidth = viewportRef.current.clientWidth;
        const containerHeight = viewportRef.current.clientHeight;

        let minX, maxX, minY, maxY;

        // Clamp X coordinate
        if (scaledPdfWidth > containerWidth) {
            minX = containerWidth - scaledPdfWidth;
            maxX = 0;
        } else {
            // If page is narrower than container, center it.
            minX = maxX = (containerWidth - scaledPdfWidth) / 2;
        }

        // Clamp Y coordinate
        if (scaledPdfHeight > containerHeight) {
            minY = containerHeight - scaledPdfHeight;
            maxY = 0;
        } else {
            // If page is shorter than container, center it.
            minY = maxY = (containerHeight - scaledPdfHeight) / 2;
        }
        
        const clampedX = Math.max(minX, Math.min(maxX, newTransform.x));
        const clampedY = Math.max(minY, Math.min(maxY, newTransform.y));

        return { scale: newTransform.scale, x: clampedX, y: clampedY };

    }, [pdfPage]);

    useEffect(() => {
        if (pdfDoc) {
            pdfDoc.getPage(pageIndex + 1).then(page => {
                setPdfPage(page);
                
                const containerWidth = viewportRef.current?.clientWidth || 600;
                const containerHeight = viewportRef.current?.clientHeight || 800;
                const initialViewport = page.getViewport({ scale: 1 });
                const scale = containerWidth / initialViewport.width;
                
                const scaledWidth = initialViewport.width * scale;
                const scaledHeight = initialViewport.height * scale;
                
                const x = containerWidth > scaledWidth ? (containerWidth - scaledWidth) / 2 : 0;
                const y = containerHeight > scaledHeight ? (containerHeight - scaledHeight) / 2 : 0;
                
                setTransform({ scale, x, y });
            }).catch(err => {
                console.error(`Failed to load page ${pageIndex + 1}:`, err);
            });
        }
    }, [pdfDoc, pageIndex]);

    const getNormalizedRect = (start: Point, end: Point): Rect => ({
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(start.x - end.x),
        height: Math.abs(start.y - end.y),
    });
    
    const drawInteractionLayer = useCallback(() => {
        const canvas = interactionCanvasRef.current;
        const viewport = viewportRef.current;
        if (!canvas || !viewport) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = viewport.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.scale, transform.scale);
        
        if (interactionState === 'selecting' && selection) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
            const rect = getNormalizedRect(selection.startPoint, selection.endPoint);
            ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        } else if (isPlacingQuick && preview && placementPos) {
            const sourceRect = preview.sourceRect;
            
            const sourceCenter = { x: sourceRect.x + sourceRect.width / 2, y: sourceRect.y + sourceRect.height / 2 };
            
            // Convert placementPos (window coords) to PDF coords for the arrow destination
            const viewportRect = viewportRef.current!.getBoundingClientRect();
            const mouseX = placementPos.x - viewportRect.left;
            const mouseY = placementPos.y - viewportRect.top;
            const destCenterX = (mouseX - transform.x) / transform.scale;
            const destCenterY = (mouseY - transform.y) / transform.scale;
            
            ctx.beginPath();
            ctx.moveTo(sourceCenter.x, sourceCenter.y);
            ctx.lineTo(destCenterX, destCenterY);
            ctx.strokeStyle = '#cf6679';
            ctx.lineWidth = 3 / transform.scale;
            ctx.stroke();

            const angle = Math.atan2(destCenterY - sourceCenter.y, destCenterX - sourceCenter.x);
            const arrowLength = 20 / transform.scale;
            ctx.beginPath();
            ctx.moveTo(destCenterX, destCenterY);
            ctx.lineTo(destCenterX - arrowLength * Math.cos(angle - Math.PI / 6), destCenterY - arrowLength * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(destCenterX, destCenterY);
            ctx.lineTo(destCenterX - arrowLength * Math.cos(angle + Math.PI / 6), destCenterY - arrowLength * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        }
        ctx.restore();
    }, [interactionState, selection, transform, preview, placementPos, isPlacingQuick]);
    
    const drawPdfLayer = useCallback(async () => {
        const canvas = pdfCanvasRef.current;
        const viewportEl = viewportRef.current;
        if (!canvas || !pdfPage || !viewportEl) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = viewportEl.getBoundingClientRect();
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const pdfTransform = [transform.scale, 0, 0, transform.scale, transform.x, transform.y];
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        try {
            await pdfPage.render({
                canvasContext: ctx,
                viewport: pdfPage.getViewport({ scale: 1 }),
                transform: pdfTransform,
                renderInteractiveForms: false,
            }).promise;
        } catch (e) {
            console.warn(`PDF page ${pageIndex + 1} rendering failed, possibly a blank page.`, e);
        }

        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.scale, transform.scale);
        
        initialCallouts.forEach(callout => {
            const { sourceRect, destPoint, scale, sourcePageIndex } = callout;
            
            const destWidth = sourceRect.width * scale;
            const destHeight = sourceRect.height * scale;
            const highResImage = highResCalloutImages.get(callout);

            if (highResImage && highResImage.complete) {
                ctx.drawImage(highResImage, destPoint.x, destPoint.y, destWidth, destHeight);
            }
            
            // Only draw arrow if source is on the current page
            if (sourcePageIndex === pageIndex) {
                const sourceCenter = { x: sourceRect.x + sourceRect.width / 2, y: sourceRect.y + sourceRect.height / 2 };
                const destCenter = { x: destPoint.x + destWidth / 2, y: destPoint.y + destHeight / 2 };
                ctx.beginPath();
                ctx.moveTo(sourceCenter.x, sourceCenter.y);
                ctx.lineTo(destCenter.x, destCenter.y);
                ctx.strokeStyle = '#cf6679';
                ctx.lineWidth = 3 / transform.scale;
                ctx.stroke();

                const angle = Math.atan2(destCenter.y - sourceCenter.y, destCenter.x - sourceCenter.x);
                const arrowLength = 20 / transform.scale;
                ctx.beginPath();
                ctx.moveTo(destCenter.x, destCenter.y);
                ctx.lineTo(destCenter.x - arrowLength * Math.cos(angle - Math.PI / 6), destCenter.y - arrowLength * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(destCenter.x, destCenter.y);
                ctx.lineTo(destCenter.x - arrowLength * Math.cos(angle + Math.PI / 6), destCenter.y - arrowLength * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
            }
        });
        ctx.restore();

    }, [pdfPage, transform, initialCallouts, highResCalloutImages, pageIndex]);

    const requestPdfRender = useCallback(() => {
        if (renderTimeoutRef.current) {
            clearTimeout(renderTimeoutRef.current);
        }
        renderTimeoutRef.current = window.setTimeout(() => {
            drawPdfLayer();
        }, RENDER_DEBOUNCE_MS);
    }, [drawPdfLayer]);

    useEffect(() => {
        if (pdfPage) {
            drawPdfLayer();
        }
    }, [pdfPage, initialCallouts, highResCalloutImages]);

    useEffect(() => {
        if (pdfPage) {
            requestPdfRender();
        }
    }, [transform, pdfPage, requestPdfRender]);
    
    useEffect(() => {
        drawInteractionLayer();
    }, [drawInteractionLayer]);

    const renderHighResCallout = useCallback(async (callout: Callout) => {
        if (!pdfDoc || highResCalloutImages.has(callout) || renderingCallouts.has(callout)) return;

        setRenderingCallouts(prev => new Set(prev).add(callout));
        try {
            const page = await pdfDoc.getPage(callout.sourcePageIndex + 1);
            const { sourceRect, scale } = callout;
            
            const dataUrl = await renderPdfSnippet(page, sourceRect, scale);
            if (!dataUrl) throw new Error("Snippet rendering returned null");

            const img = new Image();
            img.onload = () => {
                setHighResCalloutImages(prev => new Map(prev).set(callout, img));
                setRenderingCallouts(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(callout);
                    return newSet;
                });
            };
            img.src = dataUrl;

        } catch (e) {
            console.error("Failed to render high-res callout", e);
        }
    }, [pdfDoc, highResCalloutImages, renderingCallouts]);

    useEffect(() => {
        initialCallouts.forEach(callout => {
            if (!highResCalloutImages.has(callout)) {
                renderHighResCallout(callout);
            }
        });
    }, [initialCallouts, renderHighResCallout, highResCalloutImages]);
    
    const cancelPlacing = useCallback(() => {
        setInteractionState('idle');
        setPreview(null);
        setPlacementPos(null);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && interactionState === 'placing') {
                cancelPlacing();
                return;
            }

            if (!isPlacingCrossPage) {
                const PAN_AMOUNT = 20;
                let isArrowKey = false;
                switch (e.key) {
                    case 'ArrowUp':
                        setTransform(prev => getClampedTransform({ ...prev, y: prev.y + PAN_AMOUNT }));
                        isArrowKey = true;
                        break;
                    case 'ArrowDown':
                        setTransform(prev => getClampedTransform({ ...prev, y: prev.y - PAN_AMOUNT }));
                        isArrowKey = true;
                        break;
                    case 'ArrowLeft':
                        setTransform(prev => getClampedTransform({ ...prev, x: prev.x + PAN_AMOUNT }));
                        isArrowKey = true;
                        break;
                    case 'ArrowRight':
                        setTransform(prev => getClampedTransform({ ...prev, x: prev.x - PAN_AMOUNT }));
                        isArrowKey = true;
                        break;
                }
                
                if (isArrowKey) {
                    e.preventDefault();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [interactionState, cancelPlacing, getClampedTransform, isPlacingCrossPage]);

    const clientToPdfCoords = (e: React.MouseEvent): Point => {
        const viewportRect = viewportRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - viewportRect.left;
        const mouseY = e.clientY - viewportRect.top;
        const pdfX = (mouseX - transform.x) / transform.scale;
        const pdfY = (mouseY - transform.y) / transform.scale;
        return { x: pdfX, y: pdfY };
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 1) {
            e.preventDefault();
            resetTransform();
            return;
        }

        if (e.button !== 0 || isPlacingQuick || isPlacingCrossPage) return;

        if (e.altKey) {
            setInteractionState('panning');
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }
        
        const pos = clientToPdfCoords(e);
        setInteractionState('selecting');
        setSelection({ pageIndex, startPoint: pos, endPoint: pos });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (interactionState === 'panning') {
            const dx = e.clientX - lastMousePos.current.x;
            const dy = e.clientY - lastMousePos.current.y;
            setTransform(prev => getClampedTransform({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        } else if (interactionState === 'selecting' && selection) {
            const pos = clientToPdfCoords(e);
            setSelection(prev => ({ ...prev!, endPoint: pos }));
        } else if (isPlacingQuick || isPlacingCrossPage) {
            setPlacementPos({x: e.clientX, y: e.clientY});
            if (pdfPage) {
                const pos = clientToPdfCoords(e);
                
                const currentSourceRect = isPlacingQuick ? preview?.sourceRect : capturedSelection?.sourceRect;
                const currentScaleFactor = isPlacingQuick ? scaleFactor : capturedSelection?.scaleFactor;

                if (!currentSourceRect || !currentScaleFactor) {
                    setIsPlacementValid(false);
                    return;
                }
                
                // Only enforce boundary checks for 'quick' placement mode.
                let isValid = true; 
                if (placementMode === 'quick') {
                    const pageViewport = pdfPage.getViewport({ scale: 1 });
                    const destWidth = currentSourceRect.width * currentScaleFactor;
                    const destHeight = currentSourceRect.height * currentScaleFactor;
                    const destX = pos.x - destWidth / 2;
                    const destY = pos.y - destHeight / 2;
                    
                    isValid = 
                        destX >= 0 && 
                        destY >= 0 && 
                        (destX + destWidth) <= pageViewport.width && 
                        (destY + destHeight) <= pageViewport.height;
                }
                
                setIsPlacementValid(isValid);
            } else {
                setIsPlacementValid(false);
            }
        }
    };
    
    const generatePreviewDataUrl = async (sourceRect: Rect): Promise<string | null> => {
        if (!pdfDoc) return null;
        try {
            const page = await pdfDoc.getPage(pageIndex + 1);
            return await renderPdfSnippet(page, sourceRect, scaleFactor, true);
        } catch (error) {
            console.error("Failed to generate preview snippet:", error);
            return null;
        }
    };

    const handleMouseUp = async (e: React.MouseEvent<HTMLDivElement>) => {
        if (interactionState === 'panning') {
            setInteractionState('idle');
        } else if (interactionState === 'selecting' && selection) {
            const finalSelection = { ...selection, endPoint: clientToPdfCoords(e) };
            const sourceRect = getNormalizedRect(finalSelection.startPoint, finalSelection.endPoint);
            
            setSelection(null);
            
            if (sourceRect.width < 5 || sourceRect.height < 5) {
                setInteractionState('idle');
                return;
            }
            
            const dataUrl = await generatePreviewDataUrl(sourceRect);
            if(dataUrl) {
                if (placementMode === 'quick') {
                    setPreview({ sourceRect, dataUrl });
                    setPlacementPos({ x: e.clientX, y: e.clientY });
                    setIsPlacementValid(true); // Assume valid initially, mouseMove will correct
                    setInteractionState('placing');
                } else { // cross-page
                    onCaptureSelection({ sourcePageIndex: pageIndex, sourceRect, dataUrl, scaleFactor, sourceTransformScale: transform.scale });
                    setInteractionState('idle');
                }
            } else {
                setInteractionState('idle');
            }
        }
    };
    
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isPlacementValid || !pdfPage) return;

        const pos = clientToPdfCoords(e);
        
        if (isPlacingQuick && preview) {
            const { sourceRect } = preview;
            const destWidth = sourceRect.width * scaleFactor;
            const destHeight = sourceRect.height * scaleFactor;
            const destPoint = { x: pos.x - destWidth / 2, y: pos.y - destHeight / 2 };
            
            onAddCallout(pageIndex, pageIndex, sourceRect, destPoint, scaleFactor);

            setInteractionState('idle');
            setPreview(null);
            setPlacementPos(null);
        } else if (isPlacingCrossPage) {
            const { sourcePageIndex, sourceRect, scaleFactor: capturedScale } = capturedSelection;
            const destWidth = sourceRect.width * capturedScale;
            const destHeight = sourceRect.height * capturedScale;
            const destPoint = { x: pos.x - destWidth / 2, y: pos.y - destHeight / 2 };

            onAddCallout(sourcePageIndex, pageIndex, sourceRect, destPoint, capturedScale);
            // The App component will clear the capturedSelection
        }
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!e.altKey) return;
        e.preventDefault();
        const { clientX, clientY, deltaY } = e;
        const viewportRect = viewportRef.current!.getBoundingClientRect();
        
        const ZOOM_SENSITIVITY = 0.2;
        const zoomDirection = Math.sign(deltaY);
        const zoomFactor = 1 - zoomDirection * ZOOM_SENSITIVITY;
        
        setTransform(prevTransform => {
            const newScale = Math.max(0.1, Math.min(20, prevTransform.scale * zoomFactor));
            const mouseX = clientX - viewportRect.left;
            const mouseY = clientY - viewportRect.top;
            
            const pointX = (mouseX - prevTransform.x) / prevTransform.scale;
            const pointY = (mouseY - prevTransform.y) / prevTransform.scale;
            
            const newX = mouseX - pointX * newScale;
            const newY = mouseY - pointY * newScale;
            
            return getClampedTransform({ scale: newScale, x: newX, y: newY });
        });
    };
    
    const resetTransform = useCallback(() => {
        if (!pdfPage || !viewportRef.current) return;
        
        const containerWidth = viewportRef.current.clientWidth;
        const initialViewport = pdfPage.getViewport({ scale: 1 });
        const scale = containerWidth / initialViewport.width;
        
        // Let getClampedTransform handle centering
        const newUnclampedTransform = { scale, x: 0, y: 0 };
        setTransform(getClampedTransform(newUnclampedTransform));
    }, [pdfPage, getClampedTransform]);

    const getCursor = () => {
        if (isPlacingCrossPage) return isPlacementValid ? 'none' : 'not-allowed';
        switch(interactionState) {
            case 'idle': return 'crosshair';
            case 'selecting': return 'crosshair';
            case 'placing': return isPlacementValid ? 'none' : 'not-allowed';
            case 'panning': return 'grabbing';
            default: return 'default';
        }
    };

    const currentPreviewData = isPlacingQuick ? preview : (isPlacingCrossPage ? { sourceRect: capturedSelection.sourceRect, dataUrl: capturedSelection.dataUrl } : null);
    const currentPreviewScale = isPlacingQuick ? scaleFactor : (isPlacingCrossPage ? capturedSelection.scaleFactor : 1);
    
    const displayScale = isPlacingCrossPage ? capturedSelection.sourceTransformScale : transform.scale;

    return (
        <div 
            ref={viewportRef}
            className="interactive-page-viewport"
            style={{ cursor: getCursor() }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { 
                if(interactionState === 'selecting' || interactionState === 'panning') setInteractionState('idle');
                if(isPlacingQuick || isPlacingCrossPage) setIsPlacementValid(false);
            }}
            onClick={handleClick}
            onWheel={handleWheel}
        >
            <canvas ref={pdfCanvasRef} className="pdf-canvas" />
            <canvas ref={interactionCanvasRef} className="interaction-canvas" />
            {(isPlacingQuick || isPlacingCrossPage) && currentPreviewData && placementPos && isPlacementValid && (
                <div 
                    className="callout-preview" 
                    style={{
                        position: 'fixed',
                        left: `${placementPos.x}px`,
                        top: `${placementPos.y}px`,
                        width: `${currentPreviewData.sourceRect.width * currentPreviewScale * displayScale}px`,
                        height: `${currentPreviewData.sourceRect.height * currentPreviewScale * displayScale}px`,
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                    }}
                >
                    <img src={currentPreviewData.dataUrl} style={{ width: '100%', height: '100%' }} alt="Magnified Preview" />
                </div>
            )}
            <div className="zoom-controls">
                <button onClick={(e) => { e.stopPropagation(); handleWheel({ deltaY: -100, altKey: true, clientX: viewportRef.current!.clientWidth/2, clientY: viewportRef.current!.clientHeight/2, preventDefault: ()=>{} } as any) }}>+</button>
                <button onClick={(e) => { e.stopPropagation(); handleWheel({ deltaY: 100, altKey: true, clientX: viewportRef.current!.clientWidth/2, clientY: viewportRef.current!.clientHeight/2, preventDefault: ()=>{} } as any) }}>-</button>
                <button onClick={(e) => {e.stopPropagation(); resetTransform()}}>{t('resetView')}</button>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scaleFactor, setScaleFactor] = useState(3);
  const [processing, setProcessing] = useState(false);
  const [isCreatingPdf, setIsCreatingPdf] = useState(false);
  const [history, setHistory] = useState<Callouts[]>([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [pageSize, setPageSize] = useState<'A4' | 'A3'>('A4');
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [placementMode, setPlacementMode] = useState<'quick' | 'cross-page'>('quick');
  const [capturedSelection, setCapturedSelection] = useState<CapturedSelection | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const callouts = history[historyIndex];

  useEffect(() => {
    const userLang = navigator.language;
    if (userLang.startsWith('zh-TW') || userLang.startsWith('zh-Hant')) {
      setLanguage('zh-TW');
    } else {
      setLanguage('en');
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle('cross-page-placing', !!capturedSelection);
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && capturedSelection) {
            setCapturedSelection(null);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.classList.remove('cross-page-placing');
    };
  }, [capturedSelection]);

  const t = (key: keyof typeof translations.en) => {
    return translations[language][key] || translations.en[key];
  };

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'zh-TW' : 'en');
  };
  
  const togglePanel = () => {
    setIsPanelVisible(prev => !prev);
  };

  const handleRestart = () => {
    if (window.confirm(t('restartConfirm'))) {
        setPdfFile(null);
        setPdfDoc(null);
        setNumPages(0);
        setHistory([{}]);
        setHistoryIndex(0);
        setError(null);
        setCapturedSelection(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setError(null);
      setCapturedSelection(null);
      loadPdf(file);
    } else {
      setPdfFile(null);
      setPdfDoc(null);
      setNumPages(0);
      setHistory([{}]);
      setHistoryIndex(0);
      setError(t('errorSelectPdf'));
      setCapturedSelection(null);
    }
  };

  const loadPdf = useCallback(async (file: File) => {
    setProcessing(true);
    setPdfDoc(null);
    setNumPages(0);
    setHistory([{}]);
    setHistoryIndex(0);
    setError(null);

    try {
      const pdfData = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
    } catch (err: any) {
      console.error(err);
      setError(t('errorProcessing'));
    } finally {
      setProcessing(false);
    }
  }, [language]);

  const handleAddPage = async () => {
    if (!pdfFile) return;

    setProcessing(true);
    setError(null);

    try {
        const { PDFDocument, PageSizes, rgb } = PDFLib;
        const existingPdfBytes = await pdfFile.arrayBuffer();
        const pdfDocToModify = await PDFDocument.load(existingPdfBytes);

        let dimensions: [number, number];
        if (pageSize === 'A4') {
            dimensions = PageSizes.A4;
        } else {
            dimensions = PageSizes.A3;
        }

        if (pageOrientation === 'landscape') {
            dimensions = [dimensions[1], dimensions[0]];
        }

        const newPage = pdfDocToModify.addPage(dimensions);
        
        // Draw a white background to ensure the page has a content stream,
        // which helps with compatibility for rendering engines like pdf.js.
        const [width, height] = dimensions;
        newPage.drawRectangle({
            x: 0,
            y: 0,
            width,
            height,
            color: rgb(1, 1, 1), // White
        });

        // Draw a border on the new page to indicate the placeable area.
        const borderColor = rgb(0.85, 0.85, 0.85); // A light gray color
        const borderWidth = 1;
        const margin = 20; // 20-point margin from the page edge

        newPage.drawRectangle({
            x: margin,
            y: margin,
            width: width - margin * 2,
            height: height - margin * 2,
            borderColor: borderColor,
            borderWidth: borderWidth,
        });

        const pdfBytes = await pdfDocToModify.save();

        const newPdfFile = new File([pdfBytes], pdfFile.name, { type: 'application/pdf' });
        
        setPdfFile(newPdfFile);
        await loadPdf(newPdfFile);

    } catch (err) {
        console.error("Failed to add page", err);
        setError(t('errorAddPage'));
        setProcessing(false);
    }
  };

  const handleDuplicateAsBlank = async (sourcePageIndex: number) => {
    if (!pdfFile || !pdfDoc) return;

    setProcessing(true);
    setError(null);

    try {
        const { PDFDocument, rgb } = PDFLib;
        const existingPdfBytes = await pdfFile.arrayBuffer();
        const pdfDocToModify = await PDFDocument.load(existingPdfBytes);

        const sourcePage = pdfDocToModify.getPage(sourcePageIndex);
        const { width, height } = sourcePage.getSize();

        const newPage = pdfDocToModify.insertPage(sourcePageIndex + 1, [width, height]);
        
        newPage.drawRectangle({
            x: 0,
            y: 0,
            width,
            height,
            color: rgb(1, 1, 1),
        });

        const borderColor = rgb(0.85, 0.85, 0.85);
        const borderWidth = 1;
        const margin = Math.min(20, width / 20, height / 20);

        newPage.drawRectangle({
            x: margin,
            y: margin,
            width: width - margin * 2,
            height: height - margin * 2,
            borderColor: borderColor,
            borderWidth: borderWidth,
        });

        const pdfBytes = await pdfDocToModify.save();
        const newPdfFile = new File([pdfBytes], pdfFile.name, { type: 'application/pdf' });
        
        setPdfFile(newPdfFile);
        await loadPdf(newPdfFile);

    } catch (err) {
        console.error("Failed to duplicate page as blank", err);
        setError(t('errorDuplicatePage'));
        setProcessing(false);
    }
  };
  
  const handleAddCallout = (sourcePageIndex: number, destPageIndex: number, sourceRect: Rect, destPoint: Point, scale: number) => {
    const newCallout: Callout = { sourcePageIndex, sourceRect, destPoint, scale };
    
    const currentCallouts = history[historyIndex];
    const newCallouts: Callouts = {
        ...currentCallouts,
        [destPageIndex]: [...(currentCallouts[destPageIndex] || []), newCallout],
    };
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newCallouts);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);

    if (capturedSelection) {
        setCapturedSelection(null);
    }
  };
  
  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
        setHistoryIndex(historyIndex + 1);
    }
  };

  const generateAnnotatedPagesAsImages = async (): Promise<string[]> => {
    if (!pdfDoc) return [];
    
    const EXPORT_DPI = 300;
    const EXPORT_SCALE = EXPORT_DPI / 72;

    const drawPromises = Array.from({ length: numPages }, (_, i) => i).map(index => {
      return new Promise<string>(async (resolve, reject) => {
        try {
            const page = await pdfDoc.getPage(index + 1);
            const viewport = page.getViewport({ scale: EXPORT_SCALE });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Could not get canvas context.'));
            
            // Add a white background for pages that might be transparent
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            await page.render({ canvasContext: ctx, viewport }).promise;

            const pageCallouts = callouts[index] || [];
            for (const callout of pageCallouts) {
                const { sourceRect, destPoint, scale, sourcePageIndex } = callout;

                const freshPageForSnippet = await pdfDoc.getPage(sourcePageIndex + 1);
                const calloutDataUrl = await renderPdfSnippet(freshPageForSnippet, sourceRect, scale);
                if (!calloutDataUrl) continue;

                const destX = destPoint.x * EXPORT_SCALE;
                const destY = destPoint.y * EXPORT_SCALE;
                const destWidth = sourceRect.width * scale * EXPORT_SCALE;
                const destHeight = sourceRect.height * scale * EXPORT_SCALE;
                
                const img = new Image();
                await new Promise((resolveImg) => {
                    img.onload = resolveImg;
                    img.src = calloutDataUrl;
                });
                
                ctx.drawImage(img, destX, destY, destWidth, destHeight);
                
                if (sourcePageIndex === index) {
                    const sourceCenterX = (sourceRect.x + sourceRect.width / 2) * EXPORT_SCALE;
                    const sourceCenterY = (sourceRect.y + sourceRect.height / 2) * EXPORT_SCALE;
                    const destCenterX = destX + destWidth / 2;
                    const destCenterY = destY + destHeight / 2;

                    ctx.beginPath();
                    ctx.moveTo(sourceCenterX, sourceCenterY);
                    ctx.lineTo(destCenterX, destCenterY);
                    ctx.strokeStyle = '#cf6679';
                    ctx.lineWidth = 6;
                    ctx.stroke();
                    
                    const angle = Math.atan2(destCenterY - sourceCenterY, destCenterX - sourceCenterX);
                    const arrowLength = 40;
                    ctx.beginPath();
                    ctx.moveTo(destCenterX, destCenterY);
                    ctx.lineTo(destCenterX - arrowLength * Math.cos(angle - Math.PI / 6), destCenterY - arrowLength * Math.sin(angle - Math.PI / 6));
                    ctx.moveTo(destCenterX, destCenterY);
                    ctx.lineTo(destCenterX - arrowLength * Math.cos(angle + Math.PI / 6), destCenterY - arrowLength * Math.sin(angle + Math.PI / 6));
                    ctx.stroke();
                }
            }
            resolve(canvas.toDataURL('image/png'));
        } catch (err) {
            reject(err);
        }
      });
    });
    return Promise.all(drawPromises);
  };


  const handleDownloadAll = async () => {
    if (numPages === 0) return;
    setIsCreatingPdf(true); // Use same loader
    try {
        const annotatedPages = await generateAnnotatedPagesAsImages();
        const zip = new JSZip();
        annotatedPages.forEach((dataUrl, i) => {
            const base64Data = dataUrl.split(',')[1];
            zip.file(`page_${i + 1}.png`, base64Data, { base64: true });
        });

        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = 'detailed_pages.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error("Failed to create ZIP", err);
        setError(t('errorCreatingPdf'));
    } finally {
        setIsCreatingPdf(false);
    }
  }

  const handleDownloadAsPdf = async () => {
    if (!pdfDoc || !pdfFile) return;

    setIsCreatingPdf(true);
    setError(null);

    try {
        const { PDFDocument, rgb } = PDFLib;
        const existingPdfBytes = await pdfFile.arrayBuffer();
        const pdfDocToModify = await PDFDocument.load(existingPdfBytes);
        const pages = pdfDocToModify.getPages();

        const arrowColor = rgb(0.81, 0.4, 0.47); // #cf6679

        for (let i = 0; i < pages.length; i++) {
            const pageCallouts = callouts[i] || [];
            if (pageCallouts.length === 0) continue;
            
            const page = pages[i];
            
            const { x: cropX, y: cropY, height: cropHeight } = page.getCropBox() ?? page.getMediaBox();
            
            for (const callout of pageCallouts) {
                const { sourcePageIndex, sourceRect, destPoint, scale } = callout;
                
                const pdfJsPageForSnippet = await pdfDoc.getPage(sourcePageIndex + 1);
                const calloutDataUrl = await renderPdfSnippet(pdfJsPageForSnippet, sourceRect, scale);
                if (!calloutDataUrl) continue;
                
                const jpgImageBytes = await fetch(calloutDataUrl).then(res => res.arrayBuffer());
                const jpgImage = await pdfDocToModify.embedJpg(jpgImageBytes);
                
                const destWidth = sourceRect.width * scale;
                const destHeight = sourceRect.height * scale;
                
                const destRectX = cropX + destPoint.x;
                const destRectY = (cropY + cropHeight) - destPoint.y - destHeight;

                page.drawImage(jpgImage, {
                    x: destRectX,
                    y: destRectY,
                    width: destWidth,
                    height: destHeight,
                });
                
                if (sourcePageIndex === i) {
                    const sourceCenter = { 
                        x: cropX + sourceRect.x + sourceRect.width / 2, 
                        y: (cropY + cropHeight) - (sourceRect.y + sourceRect.height / 2) 
                    };
                    const destCenter = { 
                        x: cropX + destPoint.x + destWidth / 2, 
                        y: (cropY + cropHeight) - (destPoint.y + destHeight / 2) 
                    };
                    
                    page.drawLine({ start: sourceCenter, end: destCenter, thickness: 3, color: arrowColor });
                    
                    const angle = Math.atan2(destCenter.y - sourceCenter.y, destCenter.x - sourceCenter.x);
                    const arrowLength = 20;
                    const arrowPoint1 = { x: destCenter.x - arrowLength * Math.cos(angle - Math.PI / 6), y: destCenter.y - arrowLength * Math.sin(angle - Math.PI / 6) };
                    const arrowPoint2 = { x: destCenter.x - arrowLength * Math.cos(angle + Math.PI / 6), y: destCenter.y - arrowLength * Math.sin(angle + Math.PI / 6) };
                    
                    page.drawLine({ start: destCenter, end: arrowPoint1, thickness: 3, color: arrowColor });
                    page.drawLine({ start: destCenter, end: arrowPoint2, thickness: 3, color: arrowColor });
                }
            }
        }

        const pdfBytes = await pdfDocToModify.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'detailed_document.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err: any) {
        console.error("Failed to create PDF", err);
        setError(t('errorCreatingPdf'));
    } finally {
        setIsCreatingPdf(false);
    }
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1 className="title">{t('title')} <span>{t('titleSpan')}</span></h1>
        <div className="header-actions">
            <button 
                onClick={handleRestart} 
                className="header-action-btn" 
                title={t('restart')}
                disabled={!pdfFile}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M7.5 1v7h1V1h-1z"/>
                    <path d="M3 8.812a4.999 4.999 0 0 1 2.578-4.375l-.485-.874A6 6 0 1 0 11 3.616l-.501.865A5 5 0 1 1 3 8.812z"/>
                </svg>
            </button>
            <button onClick={toggleLanguage} className="lang-toggle">
                {language === 'en' ? '繁' : 'EN'}
            </button>
        </div>
      </header>
      {error && <p className="error-message">{error}</p>}
      <div className={`main-content ${!isPanelVisible ? 'panel-hidden' : ''}`}>
        <button 
          onClick={togglePanel} 
          className="panel-toggle-btn" 
          title={isPanelVisible ? t('hidePanel') : t('showPanel')}
        >
          {isPanelVisible ? '‹' : '›'}
        </button>
        <aside className="controls-panel">
            <div className="panel-scroll-content">
                <div className="upload-section">
                    <h2>{t('uploadFile')}</h2>
                    <div className="file-input-wrapper">
                      <span>{pdfFile ? t('pdfLoaded') : t('uploadPdf')}</span>
                      <input type="file" ref={fileInputRef} accept="application/pdf" onChange={handlePdfChange} disabled={!!capturedSelection}/>
                      {pdfFile && <p className="file-name">{pdfFile.name}</p>}
                    </div>
                </div>

                <div className="settings-section">
                    <h2>{t('addPage')}</h2>
                    <div className="setting">
                        <label htmlFor="pageSize">{t('pageSize')}</label>
                        <select 
                            id="pageSize" 
                            className="styled-select" 
                            value={pageSize} 
                            onChange={(e) => setPageSize(e.target.value as 'A4' | 'A3')}
                            disabled={!pdfFile || processing || isCreatingPdf || !!capturedSelection}
                        >
                            <option value="A4">A4</option>
                            <option value="A3">A3</option>
                        </select>
                    </div>
                    <div className="setting">
                        <label htmlFor="pageOrientation">{t('orientation')}</label>
                        <select 
                            id="pageOrientation" 
                            className="styled-select" 
                            value={pageOrientation} 
                            onChange={(e) => setPageOrientation(e.target.value as 'portrait' | 'landscape')}
                            disabled={!pdfFile || processing || isCreatingPdf || !!capturedSelection}
                        >
                            <option value="portrait">{t('portrait')}</option>
                            <option value="landscape">{t('landscape')}</option>
                        </select>
                    </div>
                    <button onClick={handleAddPage} className="add-page-btn" disabled={!pdfFile || processing || isCreatingPdf || !!capturedSelection}>
                        {t('addPageBtn')}
                    </button>
                </div>

                <div className="settings-section">
                    <h2>{t('configure')}</h2>
                    <fieldset className="setting placement-mode" disabled={!!capturedSelection}>
                        <legend>{t('placementMode')}</legend>
                        <div className="radio-group">
                            <label>
                                <input type="radio" name="placementMode" value="quick" checked={placementMode === 'quick'} onChange={() => setPlacementMode('quick')} />
                                <span>{t('quickPlace')}</span>
                                <p className="radio-desc">{t('quickPlaceDesc')}</p>
                            </label>
                            <label>
                                <input type="radio" name="placementMode" value="cross-page" checked={placementMode === 'cross-page'} onChange={() => setPlacementMode('cross-page')} />
                                <span>{t('crossPlace')}</span>
                                <p className="radio-desc">{t('crossPlaceDesc')}</p>
                            </label>
                        </div>
                    </fieldset>
                     {capturedSelection && (
                        <div className="captured-detail-card">
                            <h3>{t('capturedDetail')}</h3>
                            <img src={capturedSelection.dataUrl} alt="Captured detail preview" />
                            <button onClick={() => setCapturedSelection(null)}>{t('cancel')}</button>
                        </div>
                    )}
                    <div className="setting">
                        <label htmlFor="scaleFactor">{t('magnification')}: <span className="value">{scaleFactor}x</span></label>
                        <input type="range" id="scaleFactor" className="slider" min="1.5" max="10" step="0.5" value={scaleFactor} onChange={(e) => setScaleFactor(parseFloat(e.target.value))} disabled={!!capturedSelection} />
                    </div>
                </div>
                
                <div className="settings-section instructions">
                    <h2>{t('instructionsHeader')}</h2>
                    <ul>
                        <li>{t('instruction1')}</li>
                        <li>{t('instruction2')}</li>
                        <li>{t('instruction3')}</li>
                        <li>{t('instruction_cancel')}</li>
                        <li className="instruction-divider">{t('instruction_zoom')}</li>
                        <li>{t('instruction_pan')}</li>
                        <li>{t('instruction_move')}</li>
                        <li>{t('instruction_reset')}</li>
                    </ul>
                </div>
            </div>
            <div className="panel-sticky-footer">
                <div className="history-controls">
                    <button onClick={handleUndo} disabled={historyIndex === 0 || !!capturedSelection}>{t('undo')}</button>
                    <button onClick={handleRedo} disabled={historyIndex >= history.length - 1 || !!capturedSelection}>{t('redo')}</button>
                </div>
                <p className="version-info">ver-2.7</p>
            </div>
        </aside>

        <main className="results-panel">
            <div className="results-header">
                <h2>{t('results')}</h2>
                <div className="results-actions">
                    <button 
                      className="download-all-btn" 
                      onClick={handleDownloadAll}
                      disabled={numPages === 0 || processing || isCreatingPdf || !!capturedSelection}
                    >
                      {isCreatingPdf ? t('creatingPdf') : t('downloadZip')}
                    </button>
                    <button
                      className="download-pdf-btn"
                      onClick={handleDownloadAsPdf}
                      disabled={numPages === 0 || processing || isCreatingPdf || !!capturedSelection}
                    >
                        {isCreatingPdf ? t('creatingPdf') : t('downloadPdf')}
                    </button>
                </div>
            </div>
          {processing ? (
            <div className="loader-container">
                <div className="loader"></div>
                <p>{t('loaderText')}</p>
            </div>
          ) : numPages > 0 ? (
            <div className="image-grid">
              {Array.from({ length: numPages }, (_, i) => i).map((index) => (
                <div key={index} className="image-card">
                  <InteractivePage 
                    pageIndex={index}
                    pdfDoc={pdfDoc}
                    initialCallouts={callouts[index] || []}
                    onAddCallout={handleAddCallout}
                    scaleFactor={scaleFactor}
                    t={t}
                    placementMode={placementMode}
                    capturedSelection={capturedSelection}
                    onCaptureSelection={setCapturedSelection}
                  />
                  <div className="page-info-overlay">
                    <span className="page-number">{t('page')} {index + 1}</span>
                    <button 
                        className="duplicate-as-blank-btn" 
                        title={t('duplicateAsBlankDesc')}
                        onClick={() => handleDuplicateAsBlank(index)}
                        disabled={processing || isCreatingPdf || !!capturedSelection}
                    >
                      {t('duplicateAsBlank')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="placeholder">
                <p>{t('placeholder')}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
