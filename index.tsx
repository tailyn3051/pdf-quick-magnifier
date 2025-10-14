import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

declare const pdfjsLib: any;
declare const JSZip: any;
declare const PDFLib: any;

type Language = 'en' | 'zh-TW';
type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type Callout = { sourceRect: Rect; destPoint: Point; scale: number };
type Callouts = { [pageIndex: number]: Callout[] };
type Selection = { pageIndex: number; startPoint: Point; endPoint: Point };
type Transform = { scale: number; x: number; y: number };

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


const InteractivePage = ({ 
    pageIndex, 
    pdfDoc, 
    initialCallouts, 
    onUpdate, 
    scaleFactor, 
    t,
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

    useEffect(() => {
        if (pdfDoc) {
            pdfDoc.getPage(pageIndex + 1).then(page => {
                 setPdfPage(page);
                 const initialViewport = page.getViewport({ scale: 1 });
                 const containerWidth = viewportRef.current?.clientWidth || 600;
                 const scale = containerWidth / initialViewport.width;
                 setTransform({ scale: scale, x: 0, y: 0 });
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
        } else if (interactionState === 'placing' && preview && placementPos) {
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
    }, [interactionState, selection, transform, preview, placementPos, scaleFactor]);
    
    const drawPdfLayer = useCallback(async () => {
        const canvas = pdfCanvasRef.current;
        const viewportEl = viewportRef.current;
        if (!canvas || !pdfPage || !viewportEl) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = viewportEl.getBoundingClientRect();
        
        // 1. Set canvas backing store size based on container size and device pixel ratio
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        // 2. Scale the canvas context to account for DPR. All drawing operations from now on
        // can be done in CSS pixels.
        ctx.scale(dpr, dpr);

        // 3. Define the transform to map PDF coordinates (at scale 1) to the
        // desired pan/zoom position on the canvas (in CSS pixels).
        // CRITICAL FIX: Do NOT multiply by DPR here, as the context is already scaled.
        const pdfTransform = [transform.scale, 0, 0, transform.scale, transform.x, transform.y];
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 4. Render the PDF page with the calculated transform.
        await pdfPage.render({
            canvasContext: ctx,
            viewport: pdfPage.getViewport({ scale: 1 }), // Get base viewport
            transform: pdfTransform, // Apply our pan/zoom transform
            renderInteractiveForms: false,
        }).promise;

        // 5. Draw the callouts on top of the PDF.
        // We re-apply the same pan/zoom transform to the canvas so we can draw
        // the callouts using their stored PDF coordinates.
        ctx.save();
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.scale, transform.scale);
        
        initialCallouts.forEach(callout => {
            const { sourceRect, destPoint, scale } = callout;
            
            const destWidth = sourceRect.width * scale;
            const destHeight = sourceRect.height * scale;
            const highResImage = highResCalloutImages.get(callout);

            if (highResImage && highResImage.complete) {
                 ctx.drawImage(highResImage, destPoint.x, destPoint.y, destWidth, destHeight);
            }
            
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
        });
        ctx.restore();

    }, [pdfPage, transform, initialCallouts, highResCalloutImages]);

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
        const page = await pdfDoc.getPage(pageIndex + 1);
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
    }, [pdfDoc, pageIndex, highResCalloutImages, renderingCallouts]);

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
            // Escape to cancel should only work in 'placing' mode.
            if (e.key === 'Escape' && interactionState === 'placing') {
                cancelPlacing();
                return; // Early return after handling
            }

            // Arrow key panning should work in 'idle' and 'placing' modes.
            if (interactionState === 'idle' || interactionState === 'placing') {
                const PAN_AMOUNT = 20;
                let isArrowKey = false;
                switch (e.key) {
                    case 'ArrowUp':
                        setTransform(prev => ({ ...prev, y: prev.y + PAN_AMOUNT }));
                        isArrowKey = true;
                        break;
                    case 'ArrowDown':
                        setTransform(prev => ({ ...prev, y: prev.y - PAN_AMOUNT }));
                        isArrowKey = true;
                        break;
                    case 'ArrowLeft':
                        setTransform(prev => ({ ...prev, x: prev.x + PAN_AMOUNT }));
                        isArrowKey = true;
                        break;
                    case 'ArrowRight':
                        setTransform(prev => ({ ...prev, x: prev.x - PAN_AMOUNT }));
                        isArrowKey = true;
                        break;
                }
                
                // Prevent default browser action (like scrolling) for arrow keys
                if (isArrowKey) {
                    e.preventDefault();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [interactionState, cancelPlacing]);

    // REWRITTEN COORDINATE CONVERSION LOGIC
    const clientToPdfCoords = (e: React.MouseEvent): Point => {
        const viewportRect = viewportRef.current!.getBoundingClientRect();
        // 1. Get mouse position relative to the container (in CSS pixels)
        const mouseX = e.clientX - viewportRect.left;
        const mouseY = e.clientY - viewportRect.top;
        // 2. Convert from container coordinates to PDF coordinates by "un-applying" the pan and zoom
        const pdfX = (mouseX - transform.x) / transform.scale;
        const pdfY = (mouseY - transform.y) / transform.scale;
        return { x: pdfX, y: pdfY };
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 1) { // Middle mouse button
            e.preventDefault();
            resetTransform();
            return;
        }

        if (e.button !== 0 || interactionState === 'placing') return;
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
            setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
            lastMousePos.current = { x: e.clientX, y: e.clientY };
        } else if (interactionState === 'selecting' && selection) {
            const pos = clientToPdfCoords(e);
            setSelection(prev => ({ ...prev!, endPoint: pos }));
        } else if (interactionState === 'placing') {
            setPlacementPos({x: e.clientX, y: e.clientY});
        }
    };
    
    const generatePreviewDataUrl = async (sourceRect: Rect): Promise<string | null> => {
        if (!pdfDoc) return null;
        try {
            const page = await pdfDoc.getPage(pageIndex + 1);
            return await renderPdfSnippet(page, sourceRect, scaleFactor);
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
                setPreview({ sourceRect, dataUrl });
                setPlacementPos({ x: e.clientX, y: e.clientY });
                setInteractionState('placing');
            } else {
                setInteractionState('idle');
            }
        }
    };
    
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (interactionState !== 'placing' || !preview) return;
        
        // The click position determines the center of the callout.
        const pos = clientToPdfCoords(e);
        const { sourceRect } = preview;
        
        // Calculate the top-left corner (destPoint) from the center position.
        const destWidth = sourceRect.width * scaleFactor;
        const destHeight = sourceRect.height * scaleFactor;
        const destPoint = { x: pos.x - destWidth / 2, y: pos.y - destHeight / 2 };
        
        onUpdate(pageIndex, { sourceRect, destPoint, scale: scaleFactor });

        setInteractionState('idle');
        setPreview(null);
        setPlacementPos(null);
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!e.altKey) return;
        e.preventDefault();
        const { clientX, clientY, deltaY } = e;
        const viewportRect = viewportRef.current!.getBoundingClientRect();
        
        const ZOOM_SENSITIVITY = 0.2;
        const zoomDirection = Math.sign(deltaY);
        const zoomFactor = 1 - zoomDirection * ZOOM_SENSITIVITY;
        const newScale = Math.max(0.1, Math.min(20, transform.scale * zoomFactor));

        // Get mouse position relative to the container (in CSS pixels)
        const mouseX = clientX - viewportRect.left;
        const mouseY = clientY - viewportRect.top;
        
        // Get the PDF point under the mouse before zooming
        const pointX = (mouseX - transform.x) / transform.scale;
        const pointY = (mouseY - transform.y) / transform.scale;
        
        // Calculate the new pan (transform.x, transform.y) to keep that point under the mouse
        const newX = mouseX - pointX * newScale;
        const newY = mouseY - pointY * newScale;
        
        setTransform({ scale: newScale, x: newX, y: newY });
    };
    
    const resetTransform = () => {
        if (!pdfPage) return;
        const initialViewport = pdfPage.getViewport({ scale: 1 });
        const containerWidth = viewportRef.current?.clientWidth || 600;
        const scale = containerWidth / initialViewport.width;
        setTransform({ scale: scale, x: 0, y: 0 });
    }

    const getCursor = () => {
        switch(interactionState) {
            case 'idle': return 'crosshair';
            case 'selecting': return 'crosshair';
            case 'placing': return 'none';
            case 'panning': return 'grabbing';
            default: return 'default';
        }
    };

    return (
        <div 
            ref={viewportRef}
            className="interactive-page-viewport"
            style={{ cursor: getCursor() }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { if(interactionState === 'selecting' || interactionState === 'panning') setInteractionState('idle')}}
            onClick={handleClick}
            onWheel={handleWheel}
        >
            <canvas ref={pdfCanvasRef} className="pdf-canvas" />
            <canvas ref={interactionCanvasRef} className="interaction-canvas" />
             {interactionState === 'placing' && preview && placementPos && (
                <div 
                    className="callout-preview" 
                    style={{
                        position: 'fixed',
                        left: `${placementPos.x}px`,
                        top: `${placementPos.y}px`,
                        width: `${preview.sourceRect.width * scaleFactor * transform.scale}px`,
                        height: `${preview.sourceRect.height * scaleFactor * transform.scale}px`,
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                    }}
                >
                    <img src={preview.dataUrl} style={{ width: '100%', height: '100%' }} alt="Magnified Preview" />
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

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'zh-TW' : 'en');
  };
  
  const togglePanel = () => {
    setIsPanelVisible(prev => !prev);
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setError(null);
      loadPdf(file);
    } else {
      setPdfFile(null);
      setPdfDoc(null);
      setNumPages(0);
      setHistory([{}]);
      setHistoryIndex(0);
      setError(t('errorSelectPdf'));
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
  
  const handleUpdateCallouts = (pageIndex: number, newCallout: Callout) => {
    const currentCallouts = history[historyIndex];
    const newCallouts = {
        ...currentCallouts,
        [pageIndex]: [...(currentCallouts[pageIndex] || []), newCallout],
    };
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newCallouts);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
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
            
            await page.render({ canvasContext: ctx, viewport }).promise;

            const pageCallouts = callouts[index] || [];
            for (const callout of pageCallouts) {
                const { sourceRect, destPoint, scale } = callout;

                // IMPORTANT FIX: Get a fresh page object for each snippet to prevent state corruption
                const freshPageForSnippet = await pdfDoc.getPage(index + 1);
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
            const pdfJsPage = await pdfDoc.getPage(i + 1);

            // CRITICAL FIX: Get the CropBox from the page. This defines the visible area
            // and its offset from the MediaBox origin (bottom-left).
            const { x: cropX, y: cropY, height: cropHeight } = page.getCropBox() ?? page.getMediaBox();
            
            for (const callout of pageCallouts) {
                const { sourceRect, destPoint, scale } = callout;

                // 1. Generate snippet using pdf.js page object
                const calloutDataUrl = await renderPdfSnippet(pdfJsPage, sourceRect, scale);
                if (!calloutDataUrl) continue;
                
                const pngImageBytes = await fetch(calloutDataUrl).then(res => res.arrayBuffer());
                const pngImage = await pdfDocToModify.embedPng(pngImageBytes);
                
                const destWidth = sourceRect.width * scale;
                const destHeight = sourceRect.height * scale;
                
                // 2. Transform UI coordinates (top-left origin) to PDF coordinates (bottom-left origin)
                // accounting for the CropBox offset.
                const destRectX = cropX + destPoint.x;
                const destRectY = (cropY + cropHeight) - destPoint.y - destHeight;

                // 3. Draw destination image
                page.drawImage(pngImage, {
                    x: destRectX,
                    y: destRectY,
                    width: destWidth,
                    height: destHeight,
                });
                
                // 4. Transform and draw arrow
                const sourceCenter = { 
                    x: cropX + sourceRect.x + sourceRect.width / 2, 
                    y: (cropY + cropHeight) - (sourceRect.y + sourceRect.height / 2) 
                };
                const destCenter = { 
                    x: cropX + destPoint.x + destWidth / 2, 
                    y: (cropY + cropHeight) - (destPoint.y + destHeight / 2) 
                };
                
                page.drawLine({ start: sourceCenter, end: destCenter, thickness: 3, color: arrowColor });
                
                // 5. Draw arrowhead
                const angle = Math.atan2(destCenter.y - sourceCenter.y, destCenter.x - sourceCenter.x);
                const arrowLength = 20;
                const arrowPoint1 = { x: destCenter.x - arrowLength * Math.cos(angle - Math.PI / 6), y: destCenter.y - arrowLength * Math.sin(angle - Math.PI / 6) };
                const arrowPoint2 = { x: destCenter.x - arrowLength * Math.cos(angle + Math.PI / 6), y: destCenter.y - arrowLength * Math.sin(angle + Math.PI / 6) };
                
                page.drawLine({ start: destCenter, end: arrowPoint1, thickness: 3, color: arrowColor });
                page.drawLine({ start: destCenter, end: arrowPoint2, thickness: 3, color: arrowColor });
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
        <button onClick={toggleLanguage} className="lang-toggle">
            {language === 'en' ? '繁' : 'EN'}
        </button>
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
                    <input type="file" accept="application/pdf" onChange={handlePdfChange} />
                    {pdfFile && <p className="file-name">{pdfFile.name}</p>}
                    </div>
                </div>

                <div className="settings-section">
                    <h2>{t('configure')}</h2>
                    <div className="setting">
                        <label htmlFor="scaleFactor">{t('magnification')}: <span className="value">{scaleFactor}x</span></label>
                        <input type="range" id="scaleFactor" className="slider" min="1.5" max="10" step="0.5" value={scaleFactor} onChange={(e) => setScaleFactor(parseFloat(e.target.value))} />
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
                    <button onClick={handleUndo} disabled={historyIndex === 0}>{t('undo')}</button>
                    <button onClick={handleRedo} disabled={historyIndex >= history.length - 1}>{t('redo')}</button>
                </div>
                <p className="version-info">ver-2.2</p>
            </div>
        </aside>

        <main className="results-panel">
            <div className="results-header">
                <h2>{t('results')}</h2>
                <div className="results-actions">
                    <button 
                      className="download-all-btn" 
                      onClick={handleDownloadAll}
                      disabled={numPages === 0 || processing || isCreatingPdf}
                    >
                      {isCreatingPdf ? t('creatingPdf') : t('downloadZip')}
                    </button>
                    <button
                      className="download-pdf-btn"
                      onClick={handleDownloadAsPdf}
                      disabled={numPages === 0 || processing || isCreatingPdf}
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
                    onUpdate={handleUpdateCallouts}
                    scaleFactor={scaleFactor}
                    t={t}
                  />
                  <div className="page-number-overlay">{t('page')} {index + 1}</div>
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
