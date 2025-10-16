

    import React, { useState, useCallback, useEffect, useRef } from 'react';
    import { createRoot } from 'react-dom/client';

    declare const pdfjsLib: any;
    declare const JSZip: any;
    declare const PDFLib: any;

    type Language = 'en' | 'zh-TW';
    type Rect = { x: number; y: number; width: number; height: number };
    type Point = { x: number; y: number };
    type Callout = { sourcePageIndex: number; sourceRect: Rect; destPoint: Point; scale: number };
    type Callouts = { [pageIndex: number]: Callout[] };
    type Selection = { pageIndex: number; startPoint: Point; endPoint: Point };
    type Transform = { scale: number; x: number; y: number };
    type CustomPage = { width: number; height: number };
    type ClipboardItem = { sourcePageIndex: number; sourceRect: Rect; scale: number; dataUrl: string };

    // FIX: Added explicit props type for PageRenderer to fix type errors.
    type PageRendererProps = {
        pageIndex: number;
        pdfDoc: any;
        customPage?: CustomPage;
        initialCallouts: Callout[];
        onPlaceItem: (destPageIndex: number, item: ClipboardItem & { destPoint: Point }) => void;
        onSelectForClipboard: React.Dispatch<React.SetStateAction<ClipboardItem | null>>;
        scaleFactor: number;
        clipboardItem: ClipboardItem | null;
        t: (key: keyof typeof translations.en) => string;
    };

    const PAGE_SIZES = {
        A4: { width: 595, height: 842 },
        A3: { width: 842, height: 1191 },
    };

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
        instruction_place_anywhere: 'Click on any page (original or new) to place the detail.',
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
        createPage: '4. Create New Page',
        pageSize: 'Page Size',
        orientation: 'Orientation',
        portrait: 'Portrait',
        landscape: 'Landscape',
        addPage: 'Add Page',
        placingStatus: 'Placing detail... Click on a page to place or press Esc to cancel.',
        detailFromPage: 'Detail from Page',
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
        instruction_place_anywhere: '在任何頁面（原始或新頁面）上點擊以放置細節視圖。',
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
        createPage: '4. 建立新頁面',
        pageSize: '頁面大小',
        orientation: '方向',
        portrait: '直向',
        landscape: '橫向',
        addPage: '新增頁面',
        placingStatus: '正在放置細節... 在頁面上點擊以放置或按 Esc 取消。',
        detailFromPage: '細節來自頁面',
    },
    };

    const RENDER_DEBOUNCE_MS = 100;

    // This function implements a robust direct-rendering method to generate a high-quality image of a selected area.
    const renderPdfSnippet = async (page: any, sourceRect: Rect, scaleFactor: number): Promise<string | null> => {
        try {
            const RENDER_DPI = 300;
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

            // 3. Translate the canvas context. This effectively "slides" the PDF page so that
            // the top-left of our sourceRect is at the origin (0,0) of the canvas.
            outputCtx.translate(-sourceRect.x * finalContentScale, -sourceRect.y * finalContentScale);

            // 4. Render the page. pdf.js will draw the entire page based on the viewport, but only
            // the portion within the canvas's clipping region (our desired snippet) will be visible.
            await page.render({ canvasContext: outputCtx, viewport }).promise;

            return outputCanvas.toDataURL('image/png');
        } catch (e) {
            console.error("Failed to render PDF snippet", e);
            return null;
        }
    };

    const PageRenderer = ({
        pageIndex,
        pdfDoc,
        customPage,
        initialCallouts,
        onPlaceItem,
        onSelectForClipboard,
        scaleFactor,
        clipboardItem,
        t,
    }: PageRendererProps) => {
        const isCompositionPage = !!customPage;
        const canvasRef = useRef<HTMLCanvasElement>(null);
        const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
        const viewportRef = useRef<HTMLDivElement>(null);
        const lastMousePos = useRef<Point>({ x: 0, y: 0 });
        const renderTimeoutRef = useRef<number | null>(null);

        const [page, setPage] = useState<any | null>(null);
        const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
        const [interactionState, setInteractionState] = useState<'idle' | 'selecting' | 'panning'>('idle');
        const [selection, setSelection] = useState<Selection | null>(null);
        const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
        const [highResCalloutImages, setHighResCalloutImages] = useState<Map<Callout, HTMLImageElement>>(new Map());
        const [renderingCallouts, setRenderingCallouts] = useState<Set<Callout>>(new Set());
        const [placementPos, setPlacementPos] = useState<Point | null>(null);
        const [isPlacementValid, setIsPlacementValid] = useState(true);

        const getClampedTransform = useCallback((newTransform: Transform): Transform => {
            if (!viewportRef.current || pageDimensions.width === 0) {
                return newTransform;
            }

            const scaledPdfWidth = pageDimensions.width * newTransform.scale;
            const scaledPdfHeight = pageDimensions.height * newTransform.scale;
            const containerWidth = viewportRef.current.clientWidth;
            const containerHeight = viewportRef.current.clientHeight;

            let minX, maxX, minY, maxY;
            if (scaledPdfWidth > containerWidth) {
                minX = containerWidth - scaledPdfWidth;
                maxX = 0;
            } else {
                minX = maxX = (containerWidth - scaledPdfWidth) / 2;
            }
            if (scaledPdfHeight > containerHeight) {
                minY = containerHeight - scaledPdfHeight;
                maxY = 0;
            } else {
                minY = maxY = (containerHeight - scaledPdfHeight) / 2;
            }
            
            return { scale: newTransform.scale, x: Math.max(minX, Math.min(maxX, newTransform.x)), y: Math.max(minY, Math.min(maxY, newTransform.y)) };

        }, [pageDimensions]);

        useEffect(() => {
            const getPageInfo = async () => {
                let p: any;
                let dims: { width: number, height: number };
                if (isCompositionPage && customPage) {
                    dims = { width: customPage.width, height: customPage.height };
                } else if (pdfDoc) {
                    p = await pdfDoc.getPage(pageIndex + 1);
                    const viewport = p.getViewport({ scale: 1 });
                    dims = { width: viewport.width, height: viewport.height };
                    setPage(p);
                } else {
                    return;
                }
                setPageDimensions(dims);

                const containerWidth = viewportRef.current?.clientWidth || 600;
                const scale = containerWidth / dims.width;
                setTransform(getClampedTransform({ scale, x: 0, y: 0 }));
            };
            getPageInfo();
        }, [pdfDoc, pageIndex, customPage, isCompositionPage, getClampedTransform]);


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
            }
            ctx.restore();
        }, [interactionState, selection, transform]);
        
        const drawPageLayer = useCallback(async () => {
            const canvas = canvasRef.current;
            if (!canvas || !viewportRef.current || pageDimensions.width === 0) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = viewportRef.current.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const canvasTransform = [transform.scale, 0, 0, transform.scale, transform.x, transform.y];
            
            if (page) {
                await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: 1 }), transform: canvasTransform }).promise;
            } else {
                ctx.save();
                ctx.translate(transform.x, transform.y);
                ctx.scale(transform.scale, transform.scale);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, pageDimensions.width, pageDimensions.height);
                ctx.restore();
            }

            ctx.save();
            ctx.translate(transform.x, transform.y);
            ctx.scale(transform.scale, transform.scale);
            
            for(const callout of initialCallouts) {
                const { sourceRect, destPoint, scale, sourcePageIndex } = callout;
                const destWidth = sourceRect.width * scale;
                const destHeight = sourceRect.height * scale;
                const highResImage = highResCalloutImages.get(callout);

                if (highResImage?.complete) {
                    ctx.drawImage(highResImage, destPoint.x, destPoint.y, destWidth, destHeight);
                }

                if (sourcePageIndex === pageIndex) { // Draw arrow only for same-page callouts
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
                } else { // Draw label for cross-page callouts
                    ctx.font = `${12 / transform.scale}px ${getComputedStyle(document.body).fontFamily}`;
                    ctx.fillStyle = '#333';
                    ctx.textAlign = 'center';
                    const label = `${t('detailFromPage')} ${sourcePageIndex + 1}`;
                    ctx.fillText(label, destPoint.x + destWidth / 2, destPoint.y + destHeight + 16 / transform.scale);
                }
            }
            ctx.restore();
        }, [page, transform, initialCallouts, highResCalloutImages, pageDimensions, t, pageIndex]);

        const requestRender = useCallback(() => {
            if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
            renderTimeoutRef.current = window.setTimeout(() => drawPageLayer(), RENDER_DEBOUNCE_MS);
        }, [drawPageLayer]);

        useEffect(() => { if (pageDimensions.width > 0) drawPageLayer(); }, [pageDimensions, initialCallouts, highResCalloutImages]);
        useEffect(() => { if (pageDimensions.width > 0) requestRender(); }, [transform, pageDimensions, requestRender]);
        useEffect(() => { drawInteractionLayer(); }, [drawInteractionLayer]);

        const renderHighResCallout = useCallback(async (callout: Callout) => {
            if (!pdfDoc || highResCalloutImages.has(callout) || renderingCallouts.has(callout)) return;
            setRenderingCallouts(prev => new Set(prev).add(callout));
            try {
                const sourcePage = await pdfDoc.getPage(callout.sourcePageIndex + 1);
                const dataUrl = await renderPdfSnippet(sourcePage, callout.sourceRect, callout.scale);
                if (!dataUrl) throw new Error("Snippet rendering returned null");

                const img = new Image();
                img.onload = () => {
                    setHighResCalloutImages(prev => new Map(prev).set(callout, img));
                    setRenderingCallouts(prev => { const newSet = new Set(prev); newSet.delete(callout); return newSet; });
                };
                img.src = dataUrl;
            } catch (e) {
                console.error("Failed to render high-res callout", e);
            }
        }, [pdfDoc, highResCalloutImages, renderingCallouts]);

        useEffect(() => {
            initialCallouts.forEach(callout => {
                if (!highResCalloutImages.has(callout)) renderHighResCallout(callout);
            });
        }, [initialCallouts, renderHighResCallout, highResCalloutImages]);
        
        useEffect(() => {
            const handleKeyDown = (e: KeyboardEvent) => {
                if (interactionState === 'idle' || clipboardItem) {
                    const PAN_AMOUNT = 20; let isArrowKey = false;
                    switch (e.key) {
                        case 'ArrowUp': setTransform(prev => getClampedTransform({ ...prev, y: prev.y + PAN_AMOUNT })); isArrowKey = true; break;
                        case 'ArrowDown': setTransform(prev => getClampedTransform({ ...prev, y: prev.y - PAN_AMOUNT })); isArrowKey = true; break;
                        case 'ArrowLeft': setTransform(prev => getClampedTransform({ ...prev, x: prev.x + PAN_AMOUNT })); isArrowKey = true; break;
                        case 'ArrowRight': setTransform(prev => getClampedTransform({ ...prev, x: prev.x - PAN_AMOUNT })); isArrowKey = true; break;
                    }
                    if (isArrowKey) e.preventDefault();
                }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, [interactionState, clipboardItem, getClampedTransform]);

        const clientToPageCoords = (e: React.MouseEvent): Point => {
            const viewportRect = viewportRef.current!.getBoundingClientRect();
            const mouseX = e.clientX - viewportRect.left;
            const mouseY = e.clientY - viewportRect.top;
            return { x: (mouseX - transform.x) / transform.scale, y: (mouseY - transform.y) / transform.scale };
        };

        const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.button === 1) { e.preventDefault(); resetTransform(); return; }
            if (e.button !== 0 || clipboardItem) return;
            if (e.altKey) {
                setInteractionState('panning');
                lastMousePos.current = { x: e.clientX, y: e.clientY };
            } else if (!isCompositionPage) {
                const pos = clientToPageCoords(e);
                setInteractionState('selecting');
                setSelection({ pageIndex, startPoint: pos, endPoint: pos });
            }
        };

        const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
            if (interactionState === 'panning') {
                const dx = e.clientX - lastMousePos.current.x;
                const dy = e.clientY - lastMousePos.current.y;
                setTransform(prev => getClampedTransform({ ...prev, x: prev.x + dx, y: prev.y + dy }));
                lastMousePos.current = { x: e.clientX, y: e.clientY };
            } else if (interactionState === 'selecting' && selection) {
                setSelection(prev => ({ ...prev!, endPoint: clientToPageCoords(e) }));
            }
            if (clipboardItem) {
                setPlacementPos({x: e.clientX, y: e.clientY});
                const pos = clientToPageCoords(e);
                const { sourceRect, scale } = clipboardItem;
                const destWidth = sourceRect.width * scale;
                const destHeight = sourceRect.height * scale;
                const destX = pos.x - destWidth / 2;
                const destY = pos.y - destHeight / 2;
                const isValid = destX >= 0 && destY >= 0 && (destX + destWidth) <= pageDimensions.width && (destY + destHeight) <= pageDimensions.height;
                setIsPlacementValid(isValid);
            }
        };
        
        const handleMouseUp = async (e: React.MouseEvent<HTMLDivElement>) => {
            if (interactionState === 'panning') {
                setInteractionState('idle');
            } else if (interactionState === 'selecting' && selection) {
                const finalSelection = { ...selection, endPoint: clientToPageCoords(e) };
                const sourceRect = getNormalizedRect(finalSelection.startPoint, finalSelection.endPoint);
                setSelection(null);
                setInteractionState('idle');
                if (sourceRect.width < 5 || sourceRect.height < 5) return;
                
                const dataUrl = await renderPdfSnippet(page, sourceRect, scaleFactor);
                if(dataUrl) {
                    onSelectForClipboard({ sourcePageIndex: pageIndex, sourceRect, scale: scaleFactor, dataUrl });
                }
            }
        };
        
        const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
            if (!clipboardItem || !isPlacementValid) return;
            const pos = clientToPageCoords(e);
            const { sourceRect, scale } = clipboardItem;
            const destWidth = sourceRect.width * scale;
            const destHeight = sourceRect.height * scale;
            const destPoint = { x: pos.x - destWidth / 2, y: pos.y - destHeight / 2 };
            onPlaceItem(pageIndex, { ...clipboardItem, destPoint });
        };

        const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
            if (!e.altKey) return; e.preventDefault();
            const { clientX, clientY, deltaY } = e;
            const viewportRect = viewportRef.current!.getBoundingClientRect();
            const zoomDirection = Math.sign(deltaY);
            const zoomFactor = 1 - zoomDirection * 0.2;
            setTransform(prevTransform => {
                const newScale = Math.max(0.1, Math.min(20, prevTransform.scale * zoomFactor));
                const mouseX = clientX - viewportRect.left, mouseY = clientY - viewportRect.top;
                const pointX = (mouseX - prevTransform.x) / prevTransform.scale, pointY = (mouseY - prevTransform.y) / prevTransform.scale;
                const newX = mouseX - pointX * newScale, newY = mouseY - pointY * newScale;
                return getClampedTransform({ scale: newScale, x: newX, y: newY });
            });
        };
        
        const resetTransform = useCallback(() => {
            if (!viewportRef.current || pageDimensions.width === 0) return;
            const containerWidth = viewportRef.current.clientWidth;
            const scale = containerWidth / pageDimensions.width;
            setTransform(getClampedTransform({ scale, x: 0, y: 0 }));
        }, [pageDimensions, getClampedTransform]);

        const getCursor = () => {
            if (clipboardItem) return isPlacementValid ? 'none' : 'not-allowed';
            switch(interactionState) {
                case 'idle': return isCompositionPage ? 'default' : 'crosshair';
                case 'selecting': return 'crosshair';
                case 'panning': return 'grabbing';
                default: return 'default';
            }
        };

        return (
            <div className="image-card" style={{ aspectRatio: `${pageDimensions.width || 1} / ${pageDimensions.height || 1}`}}>
                <div 
                    ref={viewportRef}
                    className="interactive-page-viewport"
                    style={{ cursor: getCursor() }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={() => { 
                        if(interactionState !== 'idle') setInteractionState('idle');
                        if(clipboardItem) setIsPlacementValid(false);
                    }}
                    onClick={handleClick}
                    onWheel={handleWheel}
                >
                    <canvas ref={canvasRef} className="pdf-canvas" />
                    <canvas ref={interactionCanvasRef} className="interaction-canvas" />
                    {clipboardItem && placementPos && isPlacementValid && (
                        <div 
                            className="callout-preview" 
                            style={{
                                position: 'fixed',
                                left: `${placementPos.x}px`,
                                top: `${placementPos.y}px`,
                                width: `${clipboardItem.sourceRect.width * clipboardItem.scale * transform.scale}px`,
                                height: `${clipboardItem.sourceRect.height * clipboardItem.scale * transform.scale}px`,
                                transform: 'translate(-50%, -50%)',
                            }}
                        >
                            <img src={clipboardItem.dataUrl} style={{ width: '100%', height: '100%' }} alt="Magnified Preview" />
                        </div>
                    )}
                    <div className="zoom-controls">
                        <button onClick={(e) => { e.stopPropagation(); handleWheel({ deltaY: -100, altKey: true, clientX: viewportRef.current!.clientWidth/2, clientY: viewportRef.current!.clientHeight/2, preventDefault: ()=>{} } as any) }}>+</button>
                        <button onClick={(e) => { e.stopPropagation(); handleWheel({ deltaY: 100, altKey: true, clientX: viewportRef.current!.clientWidth/2, clientY: viewportRef.current!.clientHeight/2, preventDefault: ()=>{} } as any) }}>-</button>
                        <button onClick={(e) => {e.stopPropagation(); resetTransform()}}>{t('resetView')}</button>
                    </div>
                </div>
                 <div className="page-number-overlay">{t('page')} {pageIndex + 1}</div>
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
    const [customPages, setCustomPages] = useState<CustomPage[]>([]);
    const [clipboardItem, setClipboardItem] = useState<ClipboardItem | null>(null);
    const [newPageConfig, setNewPageConfig] = useState({ size: 'A4', orientation: 'portrait' });
    
    const callouts = history[historyIndex];

    useEffect(() => {
        const userLang = navigator.language;
        if (userLang.startsWith('zh-TW') || userLang.startsWith('zh-Hant')) {
        setLanguage('zh-TW');
        } else {
        setLanguage('en');
        }
    }, []);

    const t = (key: keyof typeof translations.en) => {
        return translations[language][key] || translations.en[key];
    };
    
    const handleCancelPlacement = useCallback(() => {
        setClipboardItem(null);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleCancelPlacement();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleCancelPlacement]);

    const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type === 'application/pdf') {
        setPdfFile(file);
        setError(null);
        loadPdf(file);
        } else {
            setPdfFile(null); setPdfDoc(null); setNumPages(0);
            setHistory([{}]); setHistoryIndex(0); setCustomPages([]);
            setError(t('errorSelectPdf'));
        }
    };

    const loadPdf = useCallback(async (file: File) => {
        setProcessing(true); setPdfDoc(null); setNumPages(0);
        setHistory([{}]); setHistoryIndex(0); setCustomPages([]);
        setError(null);
        try {
            const pdfData = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
            setPdfDoc(pdf);
            setNumPages(pdf.numPages);
        } catch (err: any) {
            console.error(err); setError(t('errorProcessing'));
        } finally {
            setProcessing(false);
        }
    }, [language]);
    
    const handlePlaceItem = (destPageIndex: number, item: ClipboardItem & { destPoint: Point }) => {
        const { sourcePageIndex, sourceRect, destPoint, scale } = item;
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
        setClipboardItem(null);
    };
    
    const handleUndo = () => { if (historyIndex > 0) setHistoryIndex(historyIndex - 1); };
    const handleRedo = () => { if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1); };
    
    const handleAddCustomPage = () => {
        const { size, orientation } = newPageConfig;
        const dims = PAGE_SIZES[size];
        const newPage = orientation === 'portrait' ? { width: dims.width, height: dims.height } : { width: dims.height, height: dims.width };
        setCustomPages(prev => [...prev, newPage]);
    };

    const generateAnnotatedPagesAsImages = async (): Promise<string[]> => {
        if (!pdfDoc) return [];
        const EXPORT_DPI = 300;
        const EXPORT_SCALE = EXPORT_DPI / 72;
        const totalPages = numPages + customPages.length;

        const drawPromises = Array.from({ length: totalPages }, (_, i) => {
            return new Promise<string>(async (resolve, reject) => {
                try {
                    const pageCallouts = callouts[i] || [];
                    const isCustom = i >= numPages;
                    const canvas = document.createElement('canvas');
                    let ctx: CanvasRenderingContext2D | null;

                    if (isCustom) {
                        const customPage = customPages[i - numPages];
                        canvas.width = customPage.width * EXPORT_SCALE;
                        canvas.height = customPage.height * EXPORT_SCALE;
                        ctx = canvas.getContext('2d');
                        if (!ctx) return reject('No context');
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    } else {
                        const page = await pdfDoc.getPage(i + 1);
                        const viewport = page.getViewport({ scale: EXPORT_SCALE });
                        canvas.width = viewport.width; canvas.height = viewport.height;
                        ctx = canvas.getContext('2d');
                        if (!ctx) return reject('No context');
                        await page.render({ canvasContext: ctx, viewport }).promise;
                    }

                    for (const callout of pageCallouts) {
                        const { sourcePageIndex, sourceRect, destPoint, scale } = callout;
                        const sourcePage = await pdfDoc.getPage(sourcePageIndex + 1);
                        const calloutDataUrl = await renderPdfSnippet(sourcePage, sourceRect, scale);
                        if (!calloutDataUrl) continue;
                        
                        const img = await new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.src = calloutDataUrl; });
                        const destX = destPoint.x * EXPORT_SCALE, destY = destPoint.y * EXPORT_SCALE;
                        const destWidth = sourceRect.width * scale * EXPORT_SCALE, destHeight = sourceRect.height * scale * EXPORT_SCALE;
                        ctx.drawImage(img, destX, destY, destWidth, destHeight);

                        if (sourcePageIndex === i) {
                            const sourceCenterX = (sourceRect.x + sourceRect.width / 2) * EXPORT_SCALE, sourceCenterY = (sourceRect.y + sourceRect.height / 2) * EXPORT_SCALE;
                            const destCenterX = destX + destWidth / 2, destCenterY = destY + destHeight / 2;
                            ctx.beginPath(); ctx.moveTo(sourceCenterX, sourceCenterY); ctx.lineTo(destCenterX, destCenterY);
                            ctx.strokeStyle = '#cf6679'; ctx.lineWidth = 6; ctx.stroke();
                            const angle = Math.atan2(destCenterY - sourceCenterY, destCenterX - sourceCenterX), arrowLength = 40;
                            ctx.beginPath(); ctx.moveTo(destCenterX, destCenterY);
                            ctx.lineTo(destCenterX - arrowLength * Math.cos(angle - Math.PI / 6), destCenterY - arrowLength * Math.sin(angle - Math.PI / 6));
                            ctx.moveTo(destCenterX, destCenterY);
                            ctx.lineTo(destCenterX - arrowLength * Math.cos(angle + Math.PI / 6), destCenterY - arrowLength * Math.sin(angle + Math.PI / 6));
                            ctx.stroke();
                        } else {
                            ctx.font = `${12 * EXPORT_SCALE}px ${getComputedStyle(document.body).fontFamily}`;
                            ctx.fillStyle = '#333'; ctx.textAlign = 'center';
                            const label = `${t('detailFromPage')} ${sourcePageIndex + 1}`;
                            ctx.fillText(label, destX + destWidth / 2, destY + destHeight + (16 * EXPORT_SCALE));
                        }
                    }
                    resolve(canvas.toDataURL('image/png'));
                } catch (err) { reject(err); }
            });
        });
        return Promise.all(drawPromises);
    };

    const handleDownloadAll = async () => {
        if (!pdfDoc) return; setIsCreatingPdf(true);
        try {
            const pages = await generateAnnotatedPagesAsImages();
            const zip = new JSZip();
            pages.forEach((dataUrl, i) => zip.file(`page_${i + 1}.png`, dataUrl.split(',')[1], { base64: true }));
            const content = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = 'detailed_pages.zip';
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
        } catch (err) { console.error("ZIP Error", err); setError(t('errorCreatingPdf')); } finally { setIsCreatingPdf(false); }
    };

    const handleDownloadAsPdf = async () => {
        if (!pdfDoc || !pdfFile) return;
        setIsCreatingPdf(true); setError(null);
        try {
            const { PDFDocument, rgb, StandardFonts } = PDFLib;
            const finalPdfDoc = await PDFDocument.create();
            const sourcePdfDoc = await PDFDocument.load(await pdfFile.arrayBuffer());
            const sourcePages = await finalPdfDoc.copyPages(sourcePdfDoc, sourcePdfDoc.getPageIndices());
            sourcePages.forEach(p => finalPdfDoc.addPage(p));

            const arrowColor = rgb(0.81, 0.4, 0.47);
            const font = await finalPdfDoc.embedFont(StandardFonts.Helvetica);

            for (let i = 0; i < numPages; i++) {
                const pageCallouts = (callouts[i] || []).filter(c => c.sourcePageIndex === i);
                if (pageCallouts.length === 0) continue;
                const page = finalPdfDoc.getPage(i);
                const pdfJsPage = await pdfDoc.getPage(i + 1);
                const { height: pageHeight } = page.getSize();

                for (const callout of pageCallouts) {
                    const { sourceRect, destPoint, scale } = callout;
                    const calloutDataUrl = await renderPdfSnippet(pdfJsPage, sourceRect, scale);
                    if (!calloutDataUrl) continue;
                    const pngImage = await finalPdfDoc.embedPng(await fetch(calloutDataUrl).then(res => res.arrayBuffer()));
                    const destWidth = sourceRect.width * scale, destHeight = sourceRect.height * scale;
                    page.drawImage(pngImage, { x: destPoint.x, y: pageHeight - destPoint.y - destHeight, width: destWidth, height: destHeight });

                    const sourceCenter = { x: sourceRect.x + sourceRect.width / 2, y: pageHeight - (sourceRect.y + sourceRect.height / 2) };
                    const destCenter = { x: destPoint.x + destWidth / 2, y: pageHeight - (destPoint.y + destHeight / 2) };
                    page.drawLine({ start: sourceCenter, end: destCenter, thickness: 2, color: arrowColor });
                    const angle = Math.atan2(destCenter.y - sourceCenter.y, destCenter.x - sourceCenter.x), arrowLength = 15;
                    page.drawLine({ start: destCenter, end: { x: destCenter.x - arrowLength * Math.cos(angle - Math.PI / 6), y: destCenter.y - arrowLength * Math.sin(angle - Math.PI / 6) }, thickness: 2, color: arrowColor });
                    page.drawLine({ start: destCenter, end: { x: destCenter.x - arrowLength * Math.cos(angle + Math.PI / 6), y: destCenter.y - arrowLength * Math.sin(angle + Math.PI / 6) }, thickness: 2, color: arrowColor });
                }
            }
            
            for (let i = 0; i < customPages.length; i++) {
                const pageIndex = numPages + i;
                const customPage = customPages[i];
                const page = finalPdfDoc.addPage([customPage.width, customPage.height]);
                const pageCallouts = callouts[pageIndex] || [];
                for (const callout of pageCallouts) {
                    const { sourcePageIndex, sourceRect, destPoint, scale } = callout;
                    const sourcePdfJsPage = await pdfDoc.getPage(sourcePageIndex + 1);
                    const calloutDataUrl = await renderPdfSnippet(sourcePdfJsPage, sourceRect, scale);
                    if (!calloutDataUrl) continue;
                    const pngImage = await finalPdfDoc.embedPng(await fetch(calloutDataUrl).then(res => res.arrayBuffer()));
                    const destWidth = sourceRect.width * scale, destHeight = sourceRect.height * scale;
                    page.drawImage(pngImage, { x: destPoint.x, y: customPage.height - destPoint.y - destHeight, width: destWidth, height: destHeight });
                    const label = `${t('detailFromPage')} ${sourcePageIndex + 1}`;
                    page.drawText(label, { x: destPoint.x, y: customPage.height - destPoint.y - destHeight - 14, font, size: 10, color: rgb(0.2, 0.2, 0.2) });
                }
            }

            const pdfBytes = await finalPdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'detailed_document.pdf';
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
        } catch (err: any) {
            console.error("Failed to create PDF", err); setError(t('errorCreatingPdf'));
        } finally { setIsCreatingPdf(false); }
    };
    
    return (
        <div className="container">
        <header className="app-header">
            <h1 className="title">{t('title')} <span>{t('titleSpan')}</span></h1>
            <button onClick={() => setLanguage(p => p === 'en' ? 'zh-TW' : 'en')} className="lang-toggle">
                {language === 'en' ? '繁' : 'EN'}
            </button>
        </header>
        {error && <p className="error-message">{error}</p>}
        {clipboardItem && <div className="placing-status-bar">{t('placingStatus')}</div>}
        <div className={`main-content ${!isPanelVisible ? 'panel-hidden' : ''} ${clipboardItem ? 'is-placing' : ''}`}>
            <button onClick={() => setIsPanelVisible(p => !p)} className="panel-toggle-btn" title={isPanelVisible ? t('hidePanel') : t('showPanel')}>
                {isPanelVisible ? '‹' : '›'}
            </button>
            <aside className="controls-panel">
                <div className="panel-scroll-content">
                    <div className="upload-section">
                        <h2>{t('uploadFile')}</h2>
                        <div className="file-input-wrapper">
                        <span>{pdfFile ? t('pdfLoaded') : t('uploadPdf')}</span>
                        <input type="file" accept="application/pdf" onChange={handlePdfChange} />
                        {pdfFile && <p className="file-name">{pdfFile.name}</p>}
                        </div>
                    </div>

                    <div className="settings-section">
                        <h2>{t('configure')}</h2>
                        <div className="setting">
                            <label htmlFor="scaleFactor">{t('magnification')}: <span className="value">{scaleFactor}x</span></label>
                            <input type="range" id="scaleFactor" className="slider" min="1.5" max="10" step="0.5" value={scaleFactor} onChange={(e) => setScaleFactor(parseFloat(e.target.value))} disabled={!!clipboardItem}/>
                        </div>
                    </div>
                    
                    <div className="settings-section instructions">
                        <h2>{t('instructionsHeader')}</h2>
                        <ul>
                            <li>{t('instruction1')}</li>
                            <li>{t('instruction_place_anywhere')}</li>
                            <li>{t('instruction_cancel')}</li>
                            <li className="instruction-divider">{t('instruction_zoom')}</li>
                            <li>{t('instruction_pan')}</li>
                            <li>{t('instruction_move')}</li>
                            <li>{t('instruction_reset')}</li>
                        </ul>
                    </div>

                    {pdfDoc && <div className="settings-section">
                        <h2>{t('createPage')}</h2>
                        <div className="setting">
                            <label htmlFor="pageSize">{t('pageSize')}</label>
                            <select id="pageSize" value={newPageConfig.size} onChange={e => setNewPageConfig(p => ({...p, size: e.target.value}))}>
                                <option value="A4">A4</option>
                                <option value="A3">A3</option>
                            </select>
                        </div>
                        <div className="setting">
                             <label htmlFor="orientation">{t('orientation')}</label>
                            <select id="orientation" value={newPageConfig.orientation} onChange={e => setNewPageConfig(p => ({...p, orientation: e.target.value}))}>
                                <option value="portrait">{t('portrait')}</option>
                                <option value="landscape">{t('landscape')}</option>
                            </select>
                        </div>
                        <button className="add-page-btn" onClick={handleAddCustomPage}>{t('addPage')}</button>
                    </div>}

                </div>
                <div className="panel-sticky-footer">
                    <div className="history-controls">
                        <button onClick={handleUndo} disabled={historyIndex === 0}>{t('undo')}</button>
                        <button onClick={handleRedo} disabled={historyIndex >= history.length - 1}>{t('redo')}</button>
                    </div>
                    <p className="version-info">ver-2.6</p>
                </div>
            </aside>

            <main className="results-panel">
                <div className="results-header">
                    <h2>{t('results')}</h2>
                    <div className="results-actions">
                        <button className="download-all-btn" onClick={handleDownloadAll} disabled={!pdfDoc || processing || isCreatingPdf}>{isCreatingPdf ? t('creatingPdf') : t('downloadZip')}</button>
                        <button className="download-pdf-btn" onClick={handleDownloadAsPdf} disabled={!pdfDoc || processing || isCreatingPdf}>{isCreatingPdf ? t('creatingPdf') : t('downloadPdf')}</button>
                    </div>
                </div>
            {processing ? (
                <div className="loader-container"><div className="loader"></div><p>{t('loaderText')}</p></div>
            ) : (numPages + customPages.length) > 0 ? (
                <div className="image-grid">
                {Array.from({ length: numPages }, (_, i) => (
                    <PageRenderer 
                        key={`pdf-page-${i}`}
                        pageIndex={i}
                        pdfDoc={pdfDoc}
                        initialCallouts={callouts[i] || []}
                        onSelectForClipboard={setClipboardItem}
                        onPlaceItem={handlePlaceItem}
                        scaleFactor={scaleFactor}
                        clipboardItem={clipboardItem}
                        t={t}
                    />
                ))}
                {customPages.map((page, i) => {
                    const pageIndex = numPages + i;
                    return (
                         <PageRenderer 
                            key={`custom-page-${pageIndex}`}
                            pageIndex={pageIndex}
                            pdfDoc={pdfDoc}
                            customPage={page}
                            initialCallouts={callouts[pageIndex] || []}
                            onSelectForClipboard={setClipboardItem}
                            onPlaceItem={handlePlaceItem}
                            scaleFactor={scaleFactor}
                            clipboardItem={clipboardItem}
                            t={t}
                        />
                    );
                })}
                </div>
            ) : (
                <div className="placeholder"><p>{t('placeholder')}</p></div>
            )}
            </main>
        </div>
        </div>
    );
    };

    const container = document.getElementById('root');
    const root = createRoot(container!);
    root.render(<App />);
