declare class AnnotationManager {
	#private;
	constructor();
	createAnnotation<K extends keyof AnnotationsTypeMapOuter>(pageUid: string, type: K, annotationOptions?: AnnotationsTypeMapOuter[K]["options"]): AnnotationsTypeMapOuter[K]["return"];
	deleteAnnotations(annotationUids: string[]): boolean;
	getAnnotationsByUids(annotationUids: string[]): (OuterAnnotation | Incomplete | Unknown)[];
	getAnnotationsByPage(pageUid: string): (OuterAnnotation | Incomplete | Unknown)[];
	getAnnotationsByDoc(docUid: string): (OuterAnnotation | Incomplete | Unknown)[];
	bringAnnotationForward(annotationUid: string): boolean;
	sendAnnotationBackward(annotationUid: string): boolean;
	bringAnnotationToFront(annotationUid: string): boolean;
	sendAnnotationToBack(annotationUid: string): boolean;
	on<K extends keyof AnnotationManagerEventMap>(eventName: K, listener: (event: AnnotationManagerEventMap[K]) => any): void;
	off<K extends keyof AnnotationManagerEventMap>(eventName: K, listener?: (event: AnnotationManagerEventMap[K]) => any): void;
}
declare class BaseAnnotation<T> {
	#private;
	uid: string;
	creationDate: string;
	modificationDate: string;
	constructor(options: T);
	get source(): "user" | "file" | "api" | "";
	get type(): string;
	get pageUid(): string;
	get flattened(): boolean;
	set flattened(value: boolean);
	getOptions(): T;
	updateOptions(options: T): boolean;
}
declare class BaseBrowseViewer implements IBrowseViewer {
	#private;
	v: any;
	vCommon: ViewerCommon;
	uid: string;
	groupUid: string;
	postfix: string;
	errorPrefix: string;
	constructor(options?: BrowseViewerConstructorOptions, prefix?: string);
	get isVisible(): boolean;
	get isBoundContainer(): boolean;
	set multiselectMode(val: boolean);
	get multiselectMode(): boolean;
	show(): void;
	hide(): void;
	getUiConfig(): UiConfig;
	updateUiConfig(uiConfig: UiConfig): boolean;
	getStyle(name: "canvasStyle"): CanvasStyle;
	getStyle(name: "pageStyle"): BaseStyle;
	getStyle(name: "selectedPageStyle"): BaseStyle;
	getStyle(name: "hoveredPageStyle"): BaseStyle;
	getStyle(name: "pageNumberStyle"): PageNumberStyle;
	getStyle(name: "checkboxStyle"): CheckboxStyle;
	getStyle(name: "currentPageStyle"): BaseStyle;
	getStyle(name: "placeholderStyle"): BaseStyle;
	updateStyle(name: "canvasStyle", style: CanvasStyle): boolean;
	updateStyle(name: "pageStyle", style: BaseStyle): boolean;
	updateStyle(name: "selectedPageStyle", style: BaseStyle): boolean;
	updateStyle(name: "hoveredPageStyle", style: BaseStyle): boolean;
	updateStyle(name: "pageNumberStyle", style: PageNumberStyle): boolean;
	updateStyle(name: "checkboxStyle", style: CheckboxStyle): boolean;
	updateStyle(name: "currentPageStyle", style: BaseStyle): boolean;
	getSelectedPageIndices(): number[];
	selectAllPages(): string[];
	selectPages(indices: number[]): string[];
	setRowAndColumn(row: number, column: number): boolean;
	on<K extends keyof BrowseViewerEventMap>(eventName: K, listener: (event: BrowseViewerEventMap[K]) => any): void;
	on(eventName: string, listener: (...args: any[]) => void): void;
	off<K extends keyof BrowseViewerEventMap>(eventName: K, listener?: (event: BrowseViewerEventMap[K]) => any): void;
	off(eventName: string, listener: (...args: any[]) => void): void;
	getVisiblePagesInfo(): PageVisualInfo[];
}
declare class Core {
	#private;
	get versionInfo(): DDVVersionInfo;
	set engineResourcePath(path: string);
	get engineResourcePath(): string;
	set license(license: string);
	get license(): string;
	set deviceFriendlyName(name: string);
	get deviceFriendlyName(): string;
	loadWasm(): Promise<void>;
	init(): Promise<ConfigResult>;
}
declare class Disposable implements IDisposable {
	private store;
	dispose(): void;
	register<T extends IDisposable>(disposable: T): T;
}
declare class DocumentDetect implements IDocumentDetect {
	#private;
	private detector;
	private succeedDetect;
	private failedDetect;
	private autoCaptureStartTime;
	constructor();
	destroy(): void;
	clear(): void;
	detect(image: VImageData, config?: DocumentDetectConfig): Promise<DocumentDetectResult>;
	getStatusMsg(status: EnumDocumentDetectionStatus): string;
	processDetectResult(detectResult: DetectResult): DocumentDetectResult;
	calculateConfidence(location: Quad, width: number, height: number): DocumentDetectConfidence;
	calculateTotalConfidence(conf: DocumentDetectConfidence): number;
	reset(): void;
}
declare class DocumentManager extends Disposable {
	#private;
	constructor();
	/**
	 * Create an empty document.
	 * @param options - The configuration used to create a document.
	 * @returns An empty document object.
	 */
	createDocument(options?: CreateDocumentOptions): IDocument;
	/**
	 * Get the document with the document uid.
	 * @param docUid - The uid of the target document.
	 * @returns The target document object.
	 */
	getDocument(docUid: string): IDocument;
	getAllDocuments(): IDocument[];
	/**
	 * Remove the documents specified by the document uids.
	 * @param documentUids - The uids of the documents to be deleted.
	 * @returns A boolean value represent whether the documents are successfully removed.
	 */
	deleteDocuments(docUids: string[]): boolean;
	deleteAllDocuments(): boolean;
	copyPagesToDocument(sourceDocUid: string, targetDocUid: string, transferOptions?: TransferOptions): boolean;
	movePagesToDocument(sourceDocUid: string, targetDocUid: string, transferOptions?: TransferOptions): boolean;
	mergeDocuments(docUids: string[], options?: MergeDocumentsOptions): IDocument;
	on<K extends keyof DocumentManagerEventMap>(eventName: K, listener: (event: DocumentManagerEventMap[K]) => any): void;
	off<K extends keyof DocumentManagerEventMap>(eventName: K, listener?: (event: DocumentManagerEventMap[K]) => any): void;
}
declare class Elements {
	static getTooltip(): Tooltip;
	static setTooltip(tooltip: Tooltip): boolean;
	static getDisplayTextConfig(): DisplayTextConfig;
	static setDisplayTextConfig(displayTextConfig: DisplayTextConfig): boolean;
	static get Layout(): string;
	static get Button(): string;
	static get Capture(): string;
	static get Flashlight(): string;
	static get CameraConvert(): string;
	static get CameraResolution(): string;
	static get AutoDetect(): string;
	static get AutoCapture(): string;
	static get ImagePreview(): string;
	static get Rotate(): string;
	static get RotateLeft(): string;
	static get RotateRight(): string;
	static get Delete(): string;
	static get DeleteCurrent(): string;
	static get DeleteAll(): string;
	static get Zoom(): string;
	static get ZoomIn(): string;
	static get ZoomOut(): string;
	static get ZoomByPercentage(): string;
	static get Crop(): string;
	static get CropCurrent(): string;
	static get CropAll(): string;
	static get FullQuad(): string;
	static get PerspectiveAll(): string;
	static get Undo(): string;
	static get Redo(): string;
	static get Pan(): string;
	static get CropMode(): string;
	static get Load(): string;
	static get Download(): string;
	static get Print(): string;
	static get Filter(): string;
	static get Restore(): string;
	static get ThumbnailSwitch(): string;
	static get Pagination(): string;
	static get FitMode(): string;
	static get FitWindow(): string;
	static get FitHeight(): string;
	static get FitWidth(): string;
	static get ActualSize(): string;
	static get DisplayMode(): string;
	static get SinglePage(): string;
	static get ContinuousPage(): string;
	static get MainView(): string;
	static get SeparatorLine(): string;
	static get Done(): string;
	static get Back(): string;
	static get Blank(): string;
	static get Close(): string;
	static get AnnotationSet(): string;
	static get EllipseAnnotation(): string;
	static get EraseAnnotation(): string;
	static get InkAnnotation(): string;
	static get LineAnnotation(): string;
	static get PolygonAnnotation(): string;
	static get PolylineAnnotation(): string;
	static get RectAnnotation(): string;
	static get SelectAnnotation(): string;
	static get StampIconAnnotation(): string;
	static get StampImageAnnotation(): string;
	static get TextBoxAnnotation(): string;
	static get TextTypewriterAnnotation(): string;
	static get BringForward(): string;
	static get BringToFront(): string;
	static get SendBackward(): string;
	static get SendToBack(): string;
	static get HighlightAnnotation(): string;
	static get UnderlineAnnotation(): string;
	static get StrikeoutAnnotation(): string;
	static get TextSelectionMode(): string;
	static get TextSearchPanel(): string;
	static get TextSearchPanelSwitch(): string;
}
declare class Ellipse extends BaseAnnotation<EllipseAnnotationOptions> {
	constructor(options?: EllipseAnnotationOptions);
	get type(): string;
}
declare class Highlight extends BaseAnnotation<HighlightAnnotationOptions> {
	constructor(options?: HighlightAnnotationOptions);
	get type(): string;
	updateOptions(options: HighlightAnnotationOptions): boolean;
}
declare class ImageFilter implements IImageFilter {
	#private;
	get defaultFilterType(): string;
	applyFilter(image: VImageData, type: EnumImageFilterTypeInternal, filterInputOptions?: FilterInputOptions, outputOptions?: ProcessOutputOptions): Promise<Blob>;
	querySupported(): ImageFilterItem[];
	destroy(): void;
}
declare class ImageIOWasmEnv {
	#private;
	static resourceDir: string;
	static fetchOptions: {
		mode: string;
		credentials: string;
		retries: number;
		retryDelay: number;
	};
	static enableSimd: boolean;
	static enableWasmCompression: boolean;
	static get isApple(): boolean;
	static get version(): string;
	static enableDebugOutput(enable: boolean, callback: (...args: any) => void): void;
	static hasDebugOutput(): boolean;
	static get blobReadModeSettings(): BlobReadModeSettings;
	static set blobReadModeSettings(value: BlobReadModeSettings);
	static getMemoryUsed(): any;
	static get heapConfig(): any;
	static updateHeapConfig(workerName: WorkerName, maxHeapSize?: number, initHeapSize?: number): void;
	static getLicenseInfo(license: any, isLts: boolean, uuid: string): Promise<LicenseInfo>;
	private static Init;
	static isResourceDirValid(maxRetries?: number, retryDelay?: number): Promise<boolean>;
	static loadPdfReader(license: any, isLts: boolean, uuid: string): Promise<boolean | void>;
	static loadMain(license: any, isLts: boolean, uuid: string): Promise<boolean | void>;
	static load(license: any, isLts: boolean, uuid: string): Promise<void>;
	static preloadModule(name: WasmModuleName): Promise<boolean | void>;
	static unloadMainWorker(): void;
	static unloadPdfReaderWorker(): void;
	static unloadDocumentDetectorWorker(): void;
	static unloadWorker(): Promise<void>;
	static unload(): Promise<void>;
	private static getUseSimd;
	static getPdfFonts(): string[];
	static getPdfInfo(blob: Blob, password?: string): Promise<unknown>;
}
declare class Incomplete {
	#private;
	uid: string;
	creationDate: string;
	modificationDate: string;
	constructor(raw: any);
	get source(): "user" | "file" | "api" | "";
	get type(): string;
	get pageUid(): string;
	get raw(): any;
	get flattened(): boolean;
	set flattened(value: boolean);
}
declare class Ink extends BaseAnnotation<InkAnnotationOptions> {
	constructor(options?: InkAnnotationOptions);
	get type(): string;
}
declare class Line extends BaseAnnotation<LineAnnotationOptions> {
	constructor(options?: LineAnnotationOptions);
	get type(): string;
	updateOptions(options: LineAnnotationOptions): boolean;
}
declare class Polygon extends BaseAnnotation<PolygonAnnotationOptions> {
	constructor(options?: PolygonAnnotationOptions);
	get type(): string;
	updateOptions(options: PolygonAnnotationOptions): boolean;
}
declare class Polyline extends BaseAnnotation<PolylineAnnotationOptions> {
	constructor(options?: PolylineAnnotationOptions);
	get type(): string;
	updateOptions(options: PolylineAnnotationOptions): boolean;
}
declare class Rectangle extends BaseAnnotation<RectAnnotationOptions> {
	constructor(options?: RectAnnotationOptions);
	get type(): string;
}
declare class Stamp {
	#private;
	uid: string;
	creationDate: string;
	modificationDate: string;
	constructor(options?: StampAnnotationOptions);
	get source(): "user" | "file" | "api" | "";
	get type(): string;
	get pageUid(): string;
	get flattened(): boolean;
	set flattened(value: boolean);
	getOptions(): StampAnnotationOptions;
	updateOptions(options: StampAnnotationOptions): Promise<void>;
}
declare class Strikeout extends BaseAnnotation<StrikeoutAnnotationOptions> {
	constructor(options?: StrikeoutAnnotationOptions);
	get type(): string;
	updateOptions(options: StrikeoutAnnotationOptions): boolean;
}
declare class TextBox extends BaseAnnotation<TextBoxAnnotationOptions> {
	constructor(options?: TextBoxAnnotationOptions);
	get type(): string;
}
declare class TextTypewriter extends BaseAnnotation<TextTypewriterAnnotationOptions> {
	constructor(options?: TextTypewriterAnnotationOptions);
	get type(): string;
	updateOptions(options: TextTypewriterAnnotationOptions): boolean;
}
declare class Underline extends BaseAnnotation<UnderlineAnnotationOptions> {
	constructor(options?: UnderlineAnnotationOptions);
	get type(): string;
	updateOptions(options: UnderlineAnnotationOptions): boolean;
}
declare class Unknown {
	uid: string;
	creationDate: string;
	modificationDate: string;
	constructor();
	get source(): "user" | "file" | "api" | "";
	get type(): string;
	get pageUid(): string;
	get flattened(): boolean;
	set flattened(value: boolean);
}
declare class ViewerCommon {
	getIsBoundContainer(viewer: Viewer): any;
	bindContainer(viewer: Viewer, container: HTMLElement | string, apiName: string): void;
	unbindContainer(viewer: Viewer): void;
	getIsVisible(viewer: Viewer): boolean;
	show(viewer: Viewer): void;
	hide(viewer: Viewer): void;
	getCurrentDocument(viewer: Viewer): IDocument | null;
	openDocument(docUidOrDoc: string | IDocument, viewerUid: string, apiName: string): void;
	closeDocument(viewer: Viewer, apiName: string): boolean;
	getStyle(viewer: Viewer, viewerType: "capture" | "perspective" | "edit" | "browse", styleName: string, styleList: string[], apiName: string): any;
	updateStyle(viewer: Viewer, styleName: string, style: any, styleList: string[], apiName: string): boolean;
	getUiConfig(viewer: Viewer): UiConfig;
	updateUiConfig(viewer: Viewer, config: UiConfig, viewerType: string, apiName: string): any;
	indexToUid(viewer: Viewer, index: number, apiName: string): any;
	uidToIndex(viewer: Viewer, pageUid: string, apiName: string): number;
	getCurrentPageUid(viewer: Viewer): string;
	getCurrentPageIndex(viewer: Viewer): number;
	getPageCount(viewer: Viewer): number;
	gotoPage(viewer: Viewer, index: number, apiName: string): any;
	rotate(viewer: Viewer, angle: number, indices: number[], apiName: string): any;
	saveOperation(viewer: Viewer): boolean;
	on(viewer: Viewer, apiName: string, eventName: string, listener?: (event: any) => any): void;
	off(viewer: Viewer, apiName: string, eventName: string, listener?: (event: any) => any): void;
	destroy(viewer: Viewer): void;
}
declare const Version: string;
declare enum EnumImageFilterTypeInternal {
	NONE = "none",
	BLACK_AND_WHITE = "blackAndWhite",
	GRAY = "gray",
	REMOVE_SHADOW = "removeShadow",
	SAVE_INK = "saveInk",
	ENHANCE = "enhance",
	INVERT = "invert",
	BRIGHTNESS = "brightness",
	CONTRAST = "contrast",
	BRIGHTNESS_AND_CONTRAST = "brightnessAndContrast"
}
declare enum EnumLineEnding {
	NONE = "none",
	OPEN = "open",
	OPEN_REVERSE = "openReverse",
	CLOSED = "closed",
	CLOSED_REVERSE = "closedReverse",
	BUTT = "butt",
	SLASH = "slash",
	SQUARE = "square",
	DIAMOND = "diamond",
	CIRCLE = "circle"
}
declare enum EnumStampIcon {
	REJECTED = "rejected",// cross
	ACCEPTED = "accepted",// tick
	INITIAL_HERE = "initialHere",
	SIGN_HERE = "signHere",
	WITNESS = "witness",
	APPROVED = "approved",
	NOT_APPROVED = "notApproved",
	DRAFT = "draft",
	FINAL = "final",
	COMPLETED = "completed",
	CONFIDENTIAL = "confidential",
	VOID = "void"
}
declare enum ImageType {
	IT_DIB = -1,
	IT_RGBA = -2,
	IT_BGRA = -3,
	IT_BMP = 0,
	IT_JPG = 1,
	IT_PNG = 3,
	IT_ALL = 5
}
declare enum ReturnedDataType {
	RT_AUTO = -1,
	RT_BINARY = 1,
	RT_BASE64 = 2
}
declare enum WorkerName {
	core = "ddv-core",
	reader = "ddv-reader",
	detector = "ddv-detector",
	loader = "ddv-loader"
}
export declare class BrowseViewer extends BaseBrowseViewer {
	constructor(options: BrowseViewerConstructorOptions);
	get currentDocument(): IDocument | null;
	bindContainer(container: string | HTMLElement): void;
	unbindContainer(): void;
	openDocument(docUidOrDoc: string | IDocument): void;
	closeDocument(): boolean;
	/**
	 * Rotate pages specified by the indices in the activated document.
	 * @param indices - The indices of pages to be rotated.
	 * @param angle - The angle to rotate the pages, in degrees.
	 * Positive values mean clockwise rotation.
	 * @returns A boolean value represent whether the operation is successful.
	*/
	rotate(angle: number, indices?: number[]): boolean;
	/**
	 * Get the uid of the page represented by the index in the activated document.
	 * @param index  - The index of a page in the activated document.
	 * @returns The uid of the page.
	 */
	indexToUid(index: number): string;
	/**
	 * Get the index of the page represented by the uid in the activated document.
	 * @param uid  - The uid of a page in the activated document.
	 * @returns The index of the page.
	 */
	uidToIndex(uid: string): number;
	/**
	 * Get the uid of the current page.
	 * @returns The uid of the current page.
	 */
	getCurrentPageUid(): string;
	getCurrentPageIndex(): number;
	getPageCount(): number;
	goToPage(index: number): number;
	saveOperations(): boolean;
	destroy(): void;
}
export declare class CaptureViewer {
	#private;
	uid: string;
	groupUid: string;
	postfix: string;
	constructor(options?: CaptureViewerConstructorOptions);
	get isVisible(): boolean;
	get isBoundContainer(): boolean;
	get currentDocument(): IDocument | null;
	get acceptedPolygonConfidence(): number;
	set acceptedPolygonConfidence(val: number);
	get maxFrameNumber(): number;
	set maxFrameNumber(val: number);
	get enableAutoDetect(): boolean;
	set enableAutoDetect(val: boolean);
	get enableAutoCapture(): boolean;
	set enableAutoCapture(val: boolean);
	bindContainer(container: HTMLElement | string): void;
	unbindContainer(): void;
	show(): void;
	hide(): void;
	getUiConfig(): UiConfig;
	updateUiConfig(uiConfig: UiConfig): boolean;
	openDocument(docUidOrDoc: string | IDocument): void;
	closeDocument(): boolean;
	getStyle(name: "canvasStyle"): CanvasStyle;
	getStyle(name: "quadSelectionStyle"): QuadSelectionStyle;
	updateStyle(name: "canvasStyle", style: CanvasStyle): boolean;
	updateStyle(name: "quadSelectionStyle", style: QuadSelectionStyle): boolean;
	capture(): Promise<Blob>;
	play(config?: VideoConfig): Promise<void>;
	stop(): void;
	getCurrentCamera(): VideoDeviceInfo;
	getAllCameras(): Promise<VideoDeviceInfo[]>;
	selectCamera(cameraObjectOrDeviceID: VideoDeviceInfo | string): Promise<PlayCallbackInfo>;
	getCurrentResolution(): [
		number,
		number
	];
	turnOnTorch(): Promise<void>;
	turnOffTorch(): Promise<void>;
	on<K extends keyof CaptureViewerEventMap>(eventName: K, listener: (event: CaptureViewerEventMap[K]) => any): void;
	on(eventName: string, listener: (...args: any[]) => void): void;
	off<K extends keyof CaptureViewerEventMap>(eventName: K, listener?: (event: CaptureViewerEventMap[K]) => any): void;
	off(eventName: string, listener: (...args: any[]) => void): void;
	destroy(): void;
}
export declare class CustomViewer {
	#private;
	uid: string;
	isDestroyed: boolean;
	postfix: string;
	constructor(options?: CustomViewerConstructorOptions);
	get isBoundContainer(): boolean;
	get isVisible(): boolean;
	bindContainer(container: HTMLElement): void;
	unbindContainer(): void;
	hide(): void;
	show(): void;
	getUiConfig(): UiConfig;
	updateUiConfig(uiConfig: UiConfig): boolean;
	on(eventName: string, listener: (...args: any[]) => void): void;
	off(eventName: string, listener?: (...args: any[]) => void): void;
	destroy(): void;
}
export declare class EditViewer {
	#private;
	uid: string;
	groupUid: string;
	postfix: string;
	thumbnail: IBrowseViewer;
	constructor(options?: EditViewerConstructorOptions);
	get isVisible(): boolean;
	get isBoundContainer(): boolean;
	get currentDocument(): IDocument | null;
	get zoom(): number;
	set zoom(val: number);
	get zoomOrigin(): ZoomOrigin;
	set zoomOrigin(val: ZoomOrigin);
	get displayMode(): DisplayMode;
	set displayMode(val: DisplayMode);
	get toolMode(): ToolMode;
	set toolMode(val: ToolMode);
	get annotationMode(): AnnotationMode;
	set annotationMode(val: AnnotationMode);
	get fitMode(): FitMode;
	set fitMode(type: FitMode);
	get cropMode(): CropMode;
	set cropMode(mode: CropMode);
	bindContainer(container: HTMLElement | string): void;
	unbindContainer(): void;
	show(): void;
	hide(): void;
	getUiConfig(): UiConfig;
	updateUiConfig(uiConfig: UiConfig): boolean;
	openDocument(docUidOrDoc: string | IDocument): void;
	closeDocument(): boolean;
	getStyle(name: "canvasStyle"): CanvasStyle;
	getStyle(name: "pageStyle"): BaseStyle;
	getStyle(name: "currentPageStyle"): BaseStyle;
	getStyle(name: "quadSelectionStyle"): QuadSelectionStyle;
	getStyle(name: "annotationSelectionStyle"): AnnotationSelectionStyle;
	updateStyle(name: "canvasStyle", style: CanvasStyle): boolean;
	updateStyle(name: "pageStyle", style: BaseStyle): boolean;
	updateStyle(name: "currentPageStyle", style: BaseStyle): boolean;
	updateStyle(name: "quadSelectionStyle", style: QuadSelectionStyle): boolean;
	updateStyle(name: "annotationSelectionStyle", style: AnnotationSelectionStyle): boolean;
	setParallelScrollCount(count: number): boolean;
	/**
	 * Set the selection rectangle of the selected page.
	 * @param rect - The selection rectangle to be set.
	 * @param keepExisted - Whether to keep the existed selection rectangle.
	 * @returns A boolean value represent whether the operation is successful.
	 */
	setCropRect(rect: Rect): boolean;
	getCropRect(): Rect | null;
	crop(rect: Rect, indices?: number[]): boolean;
	/**
	 * Rotate pages specified by the indices in the activated document.
	 * @param indices - The indices of pages to be rotated.
	 * @param angle - The angle to rotate the pages, in degrees.
	 * Positive values mean clockwise rotation.
	 * @returns A boolean value represent whether the operation is successful.
	*/
	rotate(angle: number, indices?: number[]): boolean;
	/**
	 * Undo the last operation.
	 * @returns A boolean value represent whether the operation is successful.
	*/
	undo(): boolean;
	/**
	 * Redo the last undo operation.
	 * @returns A boolean value represent whether the operation is successful.
	*/
	redo(): boolean;
	saveOperations(): boolean;
	/**
	 * Get the uid of the page represented by the index in the activated document.
	 * @param index  - The index of a page in the activated document.
	 * @returns The uid of the page.
	 */
	indexToUid(index: number): string;
	/**
	 * Get the index of the page represented by the uid in the activated document.
	 * @param uid  - The uid of a page in the activated document.
	 * @returns The index of the page.
	 */
	uidToIndex(uid: string): number;
	/**
	 * Get the uid of the current page.
	 * @returns The uid of the current page.
	 */
	getCurrentPageUid(): string;
	getCurrentPageIndex(): number;
	getPageCount(): number;
	goToPage(index: number): number;
	selectAnnotations(annotationUids: string[]): boolean;
	getSelectedAnnotations(): (Incomplete | Unknown | OuterAnnotation)[];
	copySelectedTexts(): Promise<void>;
	on<K extends keyof EditViewerEventMap>(eventName: K, listener: (event: EditViewerEventMap[K]) => any): void;
	on(eventName: string, listener: (...args: any[]) => void): void;
	off<K extends keyof EditViewerEventMap>(eventName: K, listener?: (event: EditViewerEventMap[K]) => any): void;
	off(eventName: string, listener: (...args: any[]) => void): void;
	destroy(): void;
	setAnnotationDrawingStyle(config: AnnotationDrawingStyleConfig): boolean;
	getTextSelection(): ITextSelectedInfo[];
	searchNextText(text: string, options?: SearchTextOptions): Promise<boolean>;
	searchPrevText(text: string, options?: SearchTextOptions): Promise<boolean>;
	searchFullText(text: string, options?: SearchTextOptions): Promise<boolean>;
	getVisiblePagesInfo(): PageVisualInfo[];
	getAnnotationDrawingStyle(): AnnotationDrawingStyleConfig;
}
export declare class PerspectiveViewer {
	#private;
	uid: string;
	groupUid: string;
	postfix: string;
	constructor(options: PerspectiveViewerConstructorOptions);
	get isVisible(): boolean;
	get isBoundContainer(): boolean;
	get currentDocument(): IDocument | null;
	bindContainer(container: HTMLElement | string): void;
	unbindContainer(): void;
	show(): void;
	hide(): void;
	getUiConfig(): UiConfig;
	updateUiConfig(uiConfig: UiConfig): boolean;
	openDocument(docUidOrDoc: string | IDocument): void;
	closeDocument(): boolean;
	getStyle(name: "canvasStyle"): CanvasStyle;
	getStyle(name: "pageStyle"): BaseStyle;
	getStyle(name: "quadSelectionStyle"): QuadSelectionStyle;
	updateStyle(name: "canvasStyle", style: CanvasStyle): boolean;
	updateStyle(name: "pageStyle", style: BaseStyle): boolean;
	updateStyle(name: "quadSelectionStyle", style: QuadSelectionStyle): boolean;
	setQuadSelection(quad: Quad): boolean;
	getQuadSelection(): Quad | null;
	resetQuadSelection(indices?: number[]): boolean;
	applyPerspective(quad: Quad): Promise<Blob>;
	rotate(angle: number, indices?: number[]): boolean;
	saveOperations(): boolean;
	/**
	 * Jump to the target page.
	 * @param index - The index of the page to be selected as the current page
	 * in the activated document.
	 * @returns A number represent the index of page. It is -1 while the input parameter is invalid.
	 */
	goToPage(index: number): number;
	/**
	 * Get the uid of the page represented by the index in the activated document.
	 * @param index  - The index of a page in the activated document.
	 * @returns The uid of the page.
	 */
	indexToUid(index: number): string;
	/**
	 * Get the index of the page represented by the uid in the activated document.
	 * @param uid  - The uid of a page in the activated document.
	 * @returns The index of the page.
	 */
	uidToIndex(uid: string): number;
	/**
	 * Get the uid of the current page.
	 * @returns The uid of the current page.
	 */
	getCurrentPageUid(): string;
	/**
	 * Get the index of the current page.
	 * @returns The index of the current page.
	 */
	getCurrentPageIndex(): number;
	getPageCount(): number;
	on<K extends keyof PerspectiveViewerEventMap>(eventName: K, listener: (event: PerspectiveViewerEventMap[K]) => any): void;
	on(eventName: string, listener: (...args: any[]) => void): void;
	off<K extends keyof PerspectiveViewerEventMap>(eventName: K, listener?: (event: PerspectiveViewerEventMap[K]) => any): void;
	off(eventName: string, listener: (...args: any[]) => void): void;
	destroy(): void;
	getVisiblePagesInfo(): PageVisualInfo[];
}
export declare const DDV: {
	/** The document manager object */
	documentManager: DocumentManager;
	/** The configuration object */
	Core: Core;
	Elements: typeof Elements;
	/** The constructor of the DocumentDetect class. */
	DocumentDetect: typeof DocumentDetect;
	/** The constructor of the ImageFilter class. */
	ImageFilter: typeof ImageFilter;
	/** The constructor of the BrowseViewer class. */
	BrowseViewer: typeof BrowseViewer;
	/** The constructor of the CaptureViewer class. */
	CaptureViewer: typeof CaptureViewer;
	/** The constructor of the CustomViewer class. */
	CustomViewer: typeof CustomViewer;
	/** The constructor of the EditViewer class. */
	EditViewer: typeof EditViewer;
	/** The constructor of the PerspectiveViewer class. */
	PerspectiveViewer: typeof PerspectiveViewer;
	readonly lastError: LastError;
	clearLastError(): void;
	Experiments: {
		get(name: string, params?: any): any;
		set(name: string, value: any): any;
	};
	addFonts(fonts: Blob[]): Promise<string[]>;
	getDefaultUiConfig(viewerType: ViewerType): UiConfig | null;
	/**
	 * Set a processing handler to the DDV system.
	 */
	setProcessingHandler<K extends keyof ProcessingHandlerMap>(type: K, handler: ProcessingHandlerMap[K]): void;
	/**
	 * Set a filter parser to the DDV system.
	 * @param mine - The MIME type of file.
	 * @param parserClass - The constructor of the file parser.
	 */
	setFileParser(mine: SourceMIME, parserClass: FileParserConstructor): void;
	unload(): void;
	/**
	 * Register an event listener to the DDV system.
	 * @param eventName - The name of the event.
	 * @param listener - The listener function.
	 * @template K - The type of the event name.
	 */
	on<J extends keyof InfoDetailsMap, K extends keyof DDVEventMap<J>>(eventName: K, listener: (event: DDVEventMap<J>[K]) => any): void;
	/**
	 * Unregister an event listener from the DDV system.
	 * @param eventName - The name of the event.
	 * @param listener - The listener function (optional).
	 * If listener is not provided, all listeners of the event will be removed.
	 * @template K - The type of the event name.
	 */
	off<J extends keyof InfoDetailsMap, K extends keyof DDVEventMap<J>>(eventName: K, listener?: (event: DDVEventMap<J>[K]) => any): void;
	/** Enums */
	EnumImageDataType: typeof EnumImageDataType;
	EnumConvertMode: typeof EnumConvertMode;
	EnumDocumentDetectionStatus: typeof EnumDocumentDetectionStatus;
	EnumImageFilterType: typeof EnumImageFilterType;
	EnumPDFCompressionType: typeof EnumPDFCompressionType;
	EnumPDFPageType: typeof EnumPDFPageType;
	EnumTIFFCompressionType: typeof EnumTIFFCompressionType;
	EnumStampIcon: typeof EnumStampIcon;
	EnumLineEnding: typeof EnumLineEnding;
	EnumAnnotationRenderMode: typeof EnumAnnotationRenderMode;
	/** Annotations */
	annotationManager: AnnotationManager;
};
export declare const enum AnnotationModifiedActionEnum {
	MOVED = "moved",
	RESIZED = "resized",
	ROTATED = "rotated",
	FLAGS_CHANGED = "flagsChanged",
	APPEARANCE_CHANGED = "appearanceChanged",
	CONTENT_CHANGED = "contentChanged",
	FLATTENED_CHANGED = "flattenedChanged"
}
export declare const enum AnnotationParserTypeEnum {
	ARC = "arc",
	CIRCLE = "circle",
	IMAGE = "image",
	TEXT_ASSIST = "textAssist",
	ELLIPSE = "ellipse",
	RECT = "rectangle",
	LINE = "line",
	POLYGON = "polygon",
	POLYLINE = "polyline",
	TEXT_TYPEWRITER = "textTypewriter",
	TEXT_BOX = "textBox",
	INK = "ink",
	STAMP = "stamp",
	HIGHLIGHT = "highlight",
	UNDERLINE = "underline",
	STRIKEOUT = "strikeout",
	INCOMPLETE = "incomplete",
	UNKNOWN = "unknown"
}
export declare const enum DisplayModeEnum {
	SINGLE = "single",
	MULTIPLE = "multiple",
	CONTINUOUS = "continuous",
	SLIDE = "slide"
}
export declare const enum FitModeEnum {
	NONE = "none",
	WIDTH = "width",
	HEIGHT = "height",
	WINDOW = "window",
	ACTUAL_SIZE = "actualSize"
}
export declare const enum MIME {
	IMAGE_PNG = "image/png",
	IMAGE_JPEG = "image/jpeg",
	IMAGE_BMP = "image/bmp",
	IMAGE_WEBP = "image/webp",
	IMAGE_TIFF = "image/tiff",
	APPLICATION_PDF = "application/pdf",
	TEXT_PLAIN = "text/plain"
}
export declare const enum SourceMIME {
	IMAGE_PNG = "image/png",
	IMAGE_JPEG = "image/jpeg",
	IMAGE_BMP = "image/bmp",
	IMAGE_WEBP = "image/webp",
	IMAGE_TIFF = "image/tiff",
	IMAGE_JP2 = "image/jp2",
	APPLICATION_PDF = "application/pdf",
	IMAGE_RGBA = "image/rgba",
	APPLICATION_BLANK_IMAGE = "application/ddv-blank-image"
}
export declare const enum ToolModeEnum {
	PAN = "pan",
	CROP = "crop",
	ZOOM_IN = "zoomIn",
	ZOOM_OUT = "zoomOut",
	ANNOTATION = "annotation",
	TEXT_SELECTION = "textSelection"
}
export declare enum EnumAnnotationRenderMode {
	NO_ANNOTATIONS = "noAnnotations",
	RENDER_ANNOTATIONS = "renderAnnotations",
	LOAD_ANNOTATIONS = "loadAnnotations"
}
export declare enum EnumConvertMode {
	CM_RENDERALL = "cm/renderall",
	CM_IMAGEONLY = "cm/imageonly",
	CM_AUTO = "cm/auto"
}
export declare enum EnumDocumentDetectionStatus {
	GOOD = "Good",
	AUTO_CAPTURE = "AutoCaptured",
	SMALL_SIZE = "SmallSize",
	OFF_CENTER = "OffCenter",
	SKEW = "Skew",
	NOTHING_DETECTED = "NothingDetected"
}
export declare enum EnumImageDataType {
	RGBA = 1,
	BGRA = 2,
	JPEG = 3,
	PNG = 4
}
export declare enum EnumImageFilterType {
	NONE = "none",
	BLACK_AND_WHITE = "blackAndWhite",
	GRAY = "gray",
	REMOVE_SHADOW = "removeShadow",
	SAVE_INK = "saveInk",
	ENHANCE = "enhance",
	INVERT = "invert"
}
export declare enum EnumPDFCompressionType {
	PDF_AUTO = "pdf/auto",
	PDF_FAX4 = "pdf/fax4",
	PDF_LZW = "pdf/lzw",
	PDF_JPEG = "pdf/jpeg",
	PDF_JP2000 = "pdf/jp2000",
	PDF_JBIG2 = "pdf/jbig2"
}
export declare enum EnumPDFPageType {
	PAGE_DEFAULT = "page/default",
	PAGE_A4 = "page/a4",
	PAGE_A4_REVERSE = "page/a4reverse",
	PAGE_A3 = "page/a3",
	PAGE_A3_REVERSE = "page/a3reverse",
	PAGE_LETTER = "page/letter",
	PAGE_LETTER_REVERSE = "page/letterreverse",
	PAGE_LEGAL = "page/legal",
	PAGE_LEGAL_REVERSE = "page/legalreverse"
}
export declare enum EnumTIFFCompressionType {
	TIFF_AUTO = "tiff/auto",
	TIFF_FAX3 = "tiff/fax3",
	TIFF_FAX4 = "tiff/fax4",
	TIFF_LZW = "tiff/lzw",
	TIFF_JPEG = "tiff/jpeg"
}
export interface AnnotationCommonStyle {
	x?: number;
	y?: number;
	borderWidth?: number;
	borderColor?: string;
	background?: string;
	lineDash?: number[];
	lineCap?: string;
	lineJoin?: string;
	miterLimit?: number;
	opacity?: number;
}
export interface AnnotationConfig {
	toolbarConfig?: ToolbarConfig;
	paletteConfig?: PaletteConfig;
	annotationSelectionStyle?: AnnotationSelectionStyle;
	/**
	 * Specify the ink creation delay. The delay allows users to create the annotation with
	 * multiple strokes. Default value: 1000, means 1 second.
	 */
	inkCreateDelay?: number;
	/** Whether to show the selected annotation on top level. Default value: true */
	showOnTopWhenSelected?: boolean;
	enableContinuousDrawing?: boolean;
	defaultStyleConfig?: AnnotationDrawingStyleConfig;
}
export interface AnnotationDrawingStyleConfig {
	rectangle?: RectangleStyle;
	ellipse?: EllipseStyle;
	polygon?: PolygonStyle;
	polyline?: PolylineStyle;
	line?: LineStyle;
	ink?: InkStyle;
	textBox?: TextBoxStyle;
	textTypewriter?: TextTypewriterStyle;
	stamp?: StampStyle;
	highlight?: HighlightStyle;
	underline?: UnderlineStyle;
	strikeout?: StrikeoutStyle;
}
export interface AnnotationLayerChangedEvent {
	oldAnnotationUidList: string[];
	newAnnotationUidList: string[];
}
export interface AnnotationManagerEventMap {
	annotationsAdded: AnnotationsAddedEvent;
	annotationsDeleted: AnnotationsDeletedEvent;
	annotationsModified: AnnotationsModifiedEvent;
	annotationLayerChanged: AnnotationLayerChangedEvent;
}
export interface AnnotationOptionsMap {
	ellipse: EllipseAnnotationOptions;
	ink: InkAnnotationOptions;
	line: LineAnnotationOptions;
	polygon: PolygonAnnotationOptions;
	polyline: PolylineAnnotationOptions;
	rectangle: RectAnnotationOptions;
	stamp: StampAnnotationOptions;
	textBox: TextBoxAnnotationOptions;
	textTypewriter: TextTypewriterAnnotationOptions;
}
export interface AnnotationRawData {
	borderStyle?: {
		width?: number;
		style?: string;
		dash?: number[];
	};
	color?: number[];
	interiorColor?: number[];
	contents?: string;
	creationdate?: string;
	flags?: string[];
	defaultStyle?: string;
	defaultAppearance?: string;
	inreplyto?: number;
	intent?: string;
	line?: number[];
	lineEnding?: string[];
	date?: string;
	name?: string;
	normalAppearance?: NormalAppearance;
	opacity?: number;
	rectDifference?: number[];
	rect?: number[];
	subject?: string;
	type?: string;
	title?: string;
	vertices?: number[];
	inkList?: number[][];
	icon?: string;
	state?: string;
	statemodel?: string;
	customData?: any;
	defaultAppearanceData?: {
		fontColor?: number[];
		fontName?: string;
		fontSize?: number;
	};
	richText?: string;
	quadPoints?: number[][];
	replies?: AnnotationRawData[];
	markedStates: AnnotationRawData[];
	reviewStates: AnnotationRawData[];
	oriIndex: number;
	modified: boolean;
}
export interface AnnotationSelectionStyle {
	border?: string;
	background?: string;
	ctrlBorderRadius?: string;
	ctrlBorder?: string;
	ctrlWidth?: string;
	ctrlHeight?: string;
	ctrlBackground?: string;
}
export interface AnnotationStyle extends AnnotationCommonStyle {
	rx?: number;
	ry?: number;
	width?: number;
	height?: number;
	text?: string;
	textAlign?: FreeTextAlign;
	color?: string;
	fontSize?: number;
	fontFamily?: string;
	fontStyle?: string;
	fontWeight?: string;
	textBaseLine?: string;
	img?: HTMLImageElement;
	startPoint?: Point2Init;
	endPoint?: Point2Init;
	lineEnding?: string[];
	points?: Point2Init[];
	textContents?: FreeTextContent[];
	segments?: Point2Init[][];
	imageData?: string | Blob;
	stampConfig?: any[];
	annotationRaw?: AnnotationRawData;
	iconName?: string;
	renderBlendMode?: string;
	lines?: Rect[];
}
export interface AnnotationToolbarButton {
	id?: string;
	className?: string;
	style?: Partial<CSSStyleDeclaration>;
	tooltip?: string;
	label?: string;
	displayText?: string;
}
export interface AnnotationTransform {
	scale: Vector2Init;
	angle: number;
	position?: Point2Init;
}
export interface AnnotationsAddedEvent {
	annotationUids: string[];
}
export interface AnnotationsDeletedEvent {
	annotationUids: string[];
}
export interface AnnotationsModifiedEvent<K extends keyof AnnotationOptionsMap = keyof AnnotationOptionsMap> {
	modifiedAnnotations: {
		uid: string;
		oldOptions: AnnotationOptionsMap[K];
		newOptions: AnnotationOptionsMap[K];
	}[];
	actions: AnnotationModifiedActionEnum[];
}
export interface AnnotationsTypeMap {
	rectangle: {
		options: RectAnnotationOptions;
		return: Rectangle;
	};
	ellipse: {
		options: EllipseAnnotationOptions;
		return: Ellipse;
	};
	polygon: {
		options: PolygonAnnotationOptions;
		return: Polygon;
	};
	polyline: {
		options: PolylineAnnotationOptions;
		return: Polyline;
	};
	line: {
		options: LineAnnotationOptions;
		return: Line;
	};
	ink: {
		options: InkAnnotationOptions;
		return: Ink;
	};
	textBox: {
		options: TextBoxAnnotationOptions;
		return: TextBox;
	};
	textTypewriter: {
		options: TextTypewriterAnnotationOptions;
		return: TextTypewriter;
	};
	highlight: {
		options: HighlightAnnotationOptions;
		return: Highlight;
	};
	underline: {
		options: UnderlineAnnotationOptions;
		return: Underline;
	};
	strikeout: {
		options: StrikeoutAnnotationOptions;
		return: Strikeout;
	};
	unknown: {
		options: any;
		return: Unknown;
	};
	incomplete: {
		options: any;
		return: Incomplete;
	};
}
export interface AnnotationsTypeMapOuter extends AnnotationsTypeMap {
	stamp: {
		options: StampAnnotationOptions;
		return: Promise<Stamp>;
	};
}
export interface BaseAnnotationOptions {
	borderWidth?: number;
	borderColor?: string;
	background?: string;
	opacity?: number;
	lineDash?: number[];
	flags?: Flags;
	rotation?: number;
}
export interface BaseAnnotationStyle {
	opacity?: number;
}
export interface BaseStyle {
	border?: string;
	background?: string;
}
export interface BlobReadModeSettings {
	minBlobSize?: number;
	fontForLoad?: boolean;
	fontForSave?: boolean;
}
export interface BrowseViewerConfig {
	canvasStyle?: CanvasStyle;
	currentPageStyle?: BaseStyle;
	pageStyle?: BaseStyle;
	selectedPageStyle?: BaseStyle;
	hoveredPageStyle?: BaseStyle;
	placeholderStyle?: BaseStyle;
	pageNumberStyle?: PageNumberStyle;
	checkboxStyle?: CheckboxStyle;
	rows?: number;
	columns?: number;
	scrollDirection?: "horizontal" | "vertical";
	multiselectMode?: boolean;
	scrollToLatest?: boolean;
	enableDragPage?: boolean;
	enableLoadSourceByDrag?: boolean;
	enableAutoScrollForDragPages?: boolean;
}
export interface BrowseViewerConstructorOptions {
	container?: string | HTMLElement;
	viewerConfig?: BrowseViewerConfig;
	keyboardInteractionConfig?: KeyBoardInteractionConfig;
	uiConfig?: UiConfig;
	/** The uid of the controller/viewer to be synced */
	groupUid?: string;
}
export interface BrowseViewerEventMap {
	"resized": IResizedEvent;
	"pageRendered": IPageRendererEvent;
	"currentIndexChanged": ICurrentIndexChangedEvent;
	"currentPageChanged": ICurrentPageChangedEvent;
	"selectedPagesChanged": ISelectedPagesChangedEvent;
	"pagesDragged": IPagesDraggedEvent;
	"pagesDropped": IPagesDroppedEvent;
	"visibilityChanged": IVisibilityChangedEvent;
	"click": IPointerEvent;
	"dblclick": IPointerEvent;
	"rightclick": IPointerEvent;
	"pointerdown": IPointerEvent;
	"pointermove": IPointerEvent;
	"pointerup": IPointerEvent;
	"pageover": IPointerEvent;
	"pageout": IPointerEvent;
	"paginationChanged": IPaginationChangedEvent;
	"scroll": Event;
}
export interface CanvasStyle {
	border?: string;
	background?: string;
	cursor?: Cursor;
}
export interface CaptureViewerConfig {
	canvasStyle?: CanvasStyle;
	quadSelectionStyle?: QuadSelectionStyle;
	enableTorch?: boolean;
	enableAutoCapture?: boolean;
	enableAutoDetect?: boolean;
	acceptedPolygonConfidence?: number;
	maxFrameNumber?: number;
	autoCaptureDelay?: number;
}
export interface CaptureViewerConstructorOptions {
	container?: string | HTMLElement;
	viewerConfig?: CaptureViewerConfig;
	uiConfig?: UiConfig;
	/** The uid of the controller/viewer to be synced */
	groupUid?: string;
}
export interface CaptureViewerEventMap {
	"resized": IResizedEvent;
	"played": ICameraPlayedEvent;
	"stopped": ICameraStoppedEvent;
	"captured": ICameraCaptureEvent;
	"cameraChanged": ICameraChangedEvent;
	"click": IPointerEvent;
	"dblclick": IPointerEvent;
	"rightclick": IPointerEvent;
	"visibilityChanged": IVisibilityChangedEvent;
	"paginationChanged": IPaginationChangedEvent;
}
export interface CheckboxStyle {
	left?: string;
	top?: string;
	right?: string;
	bottom?: string;
	width?: string;
	height?: string;
	background?: string;
	border?: string;
	borderRadius?: string;
	translateX?: string;
	translateY?: string;
	opacity?: number;
	visibility?: "hidden" | "visible";
	checkMarkColor?: string;
	checkMarkLineWidth?: string;
}
export interface ConfigResult {
	licenseInfo: LicenseInfo;
	deviceUuid?: string;
}
export interface CreateDocumentOptions {
	name?: string;
	author?: string;
	creationDate?: string;
}
export interface CustomViewerConstructorOptions {
	container?: HTMLElement | string;
	uiConfig?: UiConfig;
}
export interface DDVError {
	message: string;
	cause: VError;
}
export interface DDVEventMap<J extends keyof InfoDetailsMap> {
	"error": DDVError;
	"warning": DDVError;
	"verbose": DDVError;
	"info": InfoObject<J>;
}
export interface DDVVersionInfo {
	viewer?: typeof Version;
	build?: string;
	engine: typeof ImageIOWasmEnv.version;
}
export interface DetectResult {
	location: Quad;
	width: number;
	height: number;
	config: DocumentDetectConfig;
	confidence?: number;
}
export interface DisplayTextConfig extends IconComponent {
	FitMode_FitWidth?: string;
	FitMode_FitHeight?: string;
	FitMode_FitWindow?: string;
	FitMode_ActualSize?: string;
	DisplayMode_SinglePage?: string;
	DisplayMode_ContinuousPage?: string;
	Crop_CropAll?: string;
	Crop_CropCurrent?: string;
	Crop_CropCancel?: string;
	Crop_CropApply?: string;
	Filter_FilterAll?: string;
	Delete_DeleteCurrent?: string;
	Delete_DeleteAll?: string;
	CameraResolution_720P?: string;
	CameraResolution_1080P?: string;
	CameraResolution_1440P?: string;
	CameraResolution_2160P?: string;
}
export interface DocumentDetectConfidence {
	angleConfidence: number;
	areaConfidence: number;
	centerConfidence: number;
}
export interface DocumentDetectConfig {
	acceptedPolygonConfidence?: number;
	enableAutoCapture?: boolean;
	autoCaptureDelay: number;
}
export interface DocumentDetectResult {
	success: boolean;
	location?: Quad;
	confidence?: number;
	status?: EnumDocumentDetectionStatus;
	statusMsg?: string;
}
/**
 * Support DocumentCreated and DocumentDeleted events
 */
export interface DocumentEvent {
	readonly docUid: string;
	readonly docName: string;
}
export interface DocumentManagerEventMap {
	"documentCreated": DocumentEvent;
	"documentDeleted": DocumentEvent;
	"pagesAdded": PagesAddedEvent;
	"pagesDeleted": PagesDeletedEvent;
}
export interface EditViewerConfig {
	canvasStyle?: CanvasStyle;
	pageStyle?: BaseStyle;
	currentPageStyle?: BaseStyle;
	quadSelectionStyle?: QuadSelectionStyle;
	minZoom?: number;
	maxZoom?: number;
	scrollDirection?: "horizontal" | "vertical";
	enableSlide?: boolean;
	scrollToLatest?: boolean;
	enableMagnifier?: boolean;
	enableLoadSourceByDrag?: boolean;
	enableAutoScrollForTextSelection?: boolean;
}
export interface EditViewerConstructorOptions {
	container?: string | HTMLElement;
	viewerConfig?: EditViewerConfig;
	thumbnailConfig?: ThumbnailConfig;
	keyboardInteractionConfig?: KeyBoardInteractionConfig;
	uiConfig?: UiConfig;
	/** The uid of the controller/viewer to be synced */
	groupUid?: string;
	annotationConfig?: AnnotationConfig;
}
export interface EditViewerEventMap {
	"resized": IResizedEvent;
	"pageRendered": IPageRendererEvent;
	"currentIndexChanged": ICurrentIndexChangedEvent;
	"currentPageChanged": ICurrentPageChangedEvent;
	"displayModeChanged": IDisplayModeChangedEvent;
	"fitModeChanged": IFitModeChangedEvent;
	"zoomChanged": IZoomChangedEvent;
	"toolModeChanged": IToolModeChangedEvent;
	"selectedAnnotationsChanged": ISelectedAnnotationsChangedEvent;
	"visibilityChanged": IVisibilityChangedEvent;
	"cropRectDrawn": ICropRectDrawnEvent;
	"cropRectDeleted": ICropRectDeletedEvent;
	"cropRectModified": ICropRectModifiedEvent;
	"textUnselected": void;
	"textSelected": ITextSelectedEvent;
	"textSearchTriggered": ITextSearchTriggeredEvent;
	"scroll": Event;
	"click": IPointerEvent;
	"dblclick": IPointerEvent;
	"rightclick": IPointerEvent;
	"pointerdown": IPointerEvent;
	"pointermove": IPointerEvent;
	"pointerup": IPointerEvent;
	"pageover": IPointerEvent;
	"pageout": IPointerEvent;
	"paginationChanged": IPaginationChangedEvent;
	"undoRedoStateChanged": IUndoRedoStateChangedEvent;
	"annotationDrawingStyleChanged": IAnnotationDrawingStyleChangedEvent<AnnotationDrawingStyleConfig>;
}
export interface EllipseAnnotationOptions extends BaseAnnotationOptions {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
}
export interface EllipseStyle extends RectangleStyle {
}
export interface FileParserConstructor {
	new (): IFileParser;
}
export interface FilterInfo {
	pageUid: string;
	filterType: string;
}
export interface FilterInputOptions {
	brightness?: number;
	contrast?: number;
	method?: string;
}
export interface Flags {
	print?: boolean;
	noView?: boolean;
	readOnly?: boolean;
	noResize?: boolean;
	noRotate?: boolean;
	noMove?: boolean;
}
export interface FreeTextContent extends FreeTextContentProps {
	fontSize?: string | number;
}
export interface FreeTextContentProps {
	content?: string;
	color?: string;
	lineThrough?: boolean;
	underline?: boolean;
	fontFamily?: string;
	fontStyle?: string;
	fontWeight?: string;
}
export interface HighlightAnnotationOptions extends TextAssistAnnotationOptions {
	background?: string;
}
export interface HighlightStyle extends BaseAnnotationStyle {
	background?: string;
}
export interface IAnnotationDrawingStyleChangedEvent<T> {
	newDrawingStyle: T;
	oldDrawingStyle: T;
}
export interface IBrowseViewer {
	uid: string;
	groupUid: string;
	postfix: string;
	get isVisible(): boolean;
	get multiselectMode(): boolean;
	get isBoundContainer(): boolean;
	getStyle(styleName: BrowseViewerStyleName): BrowseViewerStyle;
	updateStyle(styleName: BrowseViewerStyleName, style: BrowseViewerStyle): boolean;
	getUiConfig(): UiConfig;
	updateUiConfig(uiConfig: UiConfig): boolean;
	show(): void;
	hide(): void;
	getSelectedPageIndices(): number[];
	selectAllPages(): string[];
	selectPages(indices: number[]): string[];
	setRowAndColumn(rows: number, columns: number): boolean;
	on<K extends keyof BrowseViewerEventMap>(type: K, listener: (event: BrowseViewerEventMap[K]) => any): void;
	off<K extends keyof BrowseViewerEventMap>(type: K, listener?: (event: BrowseViewerEventMap[K]) => any): void;
	getVisiblePagesInfo(): PageVisualInfo[];
}
export interface ICameraCaptureEvent {
	pageUid: string;
}
export interface ICameraChangedEvent {
	oldDeviceId: string;
	newDeviceId: string;
}
export interface ICameraPlayedEvent {
	deviceId: string;
	resolution: [
		number,
		number
	];
}
export interface ICameraStoppedEvent {
	deviceId: string;
}
export interface ICropRectDeletedEvent {
	rect: Rect;
}
export interface ICropRectDrawnEvent {
	rect: Rect;
}
export interface ICropRectModifiedEvent {
	oldRect: Rect;
	newRect: Rect;
}
export interface ICurrentIndexChangedEvent {
	oldIndex: number;
	newIndex: number;
}
export interface ICurrentPageChangedEvent {
	oldPageUid: string;
	newPageUid: string;
}
export interface IDisplayModeChangedEvent {
	oldDisplayMode: DisplayModeEnum;
	newDisplayMode: DisplayModeEnum;
}
export interface IDisposable {
	dispose(): void;
	register?: <T extends IDisposable>(disposable: T) => T;
}
export interface IDocTextSearcher {
	get docUid(): string;
	getResults(pageIndex: number): Promise<TextSearchResult[]>;
	destroy(): void;
}
export interface IDocument {
	get name(): string;
	get uid(): string;
	get pages(): string[];
	get creationDate(): string;
	get author(): string;
	loadSource(sources: Source | PdfSource | (Source | PdfSource)[], index?: number): Promise<string[]>;
	loadSource(fileData: Blob | Blob[], index?: number): Promise<string[]>;
	loadSource(sources: any, loadSourceOptions?: LoadSourceOptions | number): Promise<string[]>;
	getPageData(pageUid: string): IPageData;
	insertBlankPage(pageWidth: number, pageHeight: number, insertBeforeIndex?: number): string;
	updatePage(pageUid: string, source: UpdatedSource | UpdatedPdfSource): Promise<boolean>;
	setPageCustomData(pageUid: string, data: any): Promise<boolean>;
	getPageCustomData(pageUid: string): Promise<any>;
	deletePages(indices: number[]): boolean;
	deleteAllPages(): boolean;
	movePages(indices: number[], insertBeforeIndex?: number): void;
	switchPage(one: number, another: number): void;
	rename(name: string): boolean;
	saveToPng(index: number, setting?: SavePngSettings): Promise<Blob>;
	saveToJpeg(index: number, saveJpegSettings?: SaveJpegSettings): Promise<Blob>;
	saveToPdf(savePDFSettings?: SavePdfSettings): Promise<Blob>;
	saveToPdf(indices: number[], savePDFSettings?: SavePdfSettings): Promise<Blob>;
	saveToTiff(saveTIFFSettings?: SaveTiffSettings): Promise<Blob>;
	saveToTiff(indices: number[], saveTIFFSettings?: SaveTiffSettings): Promise<Blob>;
	print(indices?: number[]): void;
	print(indices: number[], setting?: PrintSettings): void;
	isPageModified(index: number): boolean;
	createTextSearcher(text: string, options?: SearchTextOptions): IDocTextSearcher;
}
export interface IDocumentDetect {
	detect(image: VImageData, config?: DocumentDetectConfig): Promise<DocumentDetectResult>;
	getStatusMsg(status: EnumDocumentDetectionStatus): string;
	processDetectResult(detectResult: DetectResult): DocumentDetectResult;
	calculateConfidence(location: Quad, width: number, height: number): DocumentDetectConfidence;
	calculateTotalConfidence(conf: DocumentDetectConfidence): number;
	reset(): void;
	destroy(): void;
}
export interface IFileParser {
	type: string;
	once: boolean;
	initParser(source: Blob, parserOptions?: ParserOptions): void;
	getPageCount(): Promise<number>;
	parseAnnotations(indices: number[], parsedPages: ParsedPage[]): Promise<ParsedAnnotationPage[]>;
	parse(indices?: number[]): Promise<ParsedPage[]>;
	getPage(index?: number): Promise<ParsedPage>;
	renderPage?: (config: {
		index: number;
		width: number;
		height: number;
		rect: number[];
		outputType: ImageType;
	}, task: RenderPageTask) => Promise<PdfRenderPageRawData>;
	cancelRenderPage?: (task: RenderPageTask) => void;
	getPageTexts(indices: number[]): Promise<ParsedPageTexts[]>;
	cancelGetPage(index?: number): void;
	destroy(): void;
}
export interface IFitModeChangedEvent {
	oldFitMode: FitModeEnum;
	newFitMode: FitModeEnum;
}
export interface IImageFilter {
	querySupported(): ImageFilterItem[];
	get defaultFilterType(): string;
	applyFilter(image: VImageData, type: string): Promise<Blob>;
	destroy(): void;
}
export interface IPageData {
	get uid(): string;
	get fileIndex(): number;
	get filter(): string;
	get perspectiveQuad(): Quad;
	get rotation(): number;
	get mediaBox(): Rect;
	get cropBox(): Rect;
	fileData(): Promise<Blob>;
	raw(): Promise<PageImageInfo>;
	display(): Promise<PageImageInfo>;
	thumbnail(): Promise<PageImageInfo>;
	destroy(): void;
}
export interface IPageRendererEvent {
	index: number;
	pageUid: string;
}
export interface IPagesDraggedEvent {
	indices: number[];
	pageUids: string[];
}
export interface IPagesDroppedEvent {
	indicesBefore: number[];
	indicesAfter: number[];
	pageUids: string[];
}
export interface IPaginationChangedEvent {
	currentPageNumber: number;
	pageCount: number;
}
/**
 * Support click/dblclick/rightclick/longtap/tap
 */
export interface IPointerEvent {
	index: number;
	pageUid: string;
	imageX: number;
	imageY: number;
	canvasX: number;
	canvasY: number;
	nativeEvent: PointerEvent;
}
export interface IQuadModifiedEvent {
	oldQuad: Quad;
	newQuad: Quad;
}
export interface IResizedEvent {
	oldWidth: number;
	oldHeight: number;
	newWidth: number;
	newHeight: number;
}
export interface ISelectedAnnotationsChangedEvent {
	newAnnotationUids: string[];
	oldAnnotationUids: string[];
}
export interface ISelectedPagesChangedEvent {
	oldIndices: number[];
	newIndices: number[];
	oldPageUids: string[];
	newPageUids: string[];
}
export interface ITextSearchedInfo {
	pageUid: string;
	text: string;
	rects: RectXY[];
	context: string;
}
export interface ITextSelectedInfo {
	pageUid: string;
	text: string;
	rects: RectXY[];
}
export interface IToolModeChangedEvent {
	oldToolMode: ToolModeEnum;
	newToolMode: ToolModeEnum;
}
export interface IUndoRedoStateChangedEvent {
	undoCount: number;
	redoCount: number;
}
export interface IVisibilityChangedEvent {
	isVisible: boolean;
}
export interface IZoomChangedEvent {
	oldZoomRatio: number;
	newZoomRatio: number;
}
export interface IconComponent {
	CameraResolution?: string;
	Capture?: string;
	Flashlight?: string;
	CameraConvert?: string;
	AutoDetect?: string;
	AutoCapture?: string;
	Rotate?: string;
	RotateLeft?: string;
	RotateRight?: string;
	Load?: string;
	Download?: string;
	Delete?: string;
	DeleteCurrent?: string;
	DeleteAll?: string;
	Zoom?: string;
	ZoomIn?: string;
	ZoomOut?: string;
	ZoomByPercentage?: string;
	Crop?: string;
	CropAll?: string;
	CropCurrent?: string;
	CropMode?: string;
	PerspectiveAll?: string;
	FullQuad?: string;
	Undo?: string;
	Redo?: string;
	Restore?: string;
	Pan?: string;
	Filter?: string;
	Print?: string;
	ThumbnailSwitch?: string;
	DisplayMode?: string;
	ContinuousPage?: string;
	MultiPage?: string;
	SinglePage?: string;
	FitMode?: string;
	FitWidth?: string;
	FitHeight?: string;
	FitWindow?: string;
	ActualSize?: string;
	Back?: string;
	Close?: string;
	Done?: string;
	FirstPage?: string;
	LastPage?: string;
	NextPage?: string;
	PrevPage?: string;
	ImagePreview?: string;
	AnnotationSet?: string;
	EllipseAnnotation?: string;
	InkAnnotation?: string;
	LineAnnotation?: string;
	PolygonAnnotation?: string;
	PolylineAnnotation?: string;
	RectAnnotation?: string;
	StampIconAnnotation?: string;
	StampImageAnnotation?: string;
	TextBoxAnnotation?: string;
	TextTypewriterAnnotation?: string;
	SelectAnnotation?: string;
	EraseAnnotation?: string;
	HighlightAnnotation?: string;
	UnderlineAnnotation?: string;
	StrikeoutAnnotation?: string;
	BringForward?: string;
	BringToFront?: string;
	SendBackward?: string;
	SendToBack?: string;
	TextSearchPanelSwitch?: string;
	TextSelectionMode?: string;
}
export interface ImageFilterItem {
	type: string;
	label: string;
}
export interface InfoDetailsMap {
	"init": InitInfo;
	"loadSource": LoadSourceInfo;
	"save": SaveSourceInfo;
	"filter": FilterInfo;
	"perspective": PerspectiveInfo;
	"loadWasm": LoadWasmInfo;
}
export interface InfoObject<K extends keyof InfoDetailsMap> {
	id: number;
	type: K;
	status: InfoStatus;
	timestamp: number;
	details?: InfoDetailsMap[K];
}
export interface InitInfo {
}
export interface InkAnnotationOptions extends Omit<BaseAnnotationOptions, "background" | "lineDash"> {
	points?: Point[][];
}
export interface InkStyle extends BaseAnnotationStyle {
	borderWidth?: number;
	borderColor?: string;
}
export interface KeyBoardInteractionConfig {
	enableZoom?: boolean;
	enableUndoRedo?: boolean;
	enableAnnotationClipboard?: boolean;
	enableMultipleAnnotationsSelection?: boolean;
	enableMultiplePagesSelection?: boolean;
	enableMoveAnnotation?: boolean;
	enableDeleteAnnotation?: boolean;
	enablePageNavigation?: boolean;
}
export interface LastError {
	message: string;
	cause: VError;
}
export interface LicenseInfo {
	modules: {
		code: number;
		message: string;
		module: number;
	}[];
	msg: string;
	trial: number;
}
export interface LineAnnotationOptions extends Omit<BaseAnnotationOptions, "rotation"> {
	startPoint?: Point;
	endPoint?: Point;
	lineEnding?: LineEnding;
}
export interface LineEnding {
	start?: EnumLineEnding;
	end?: EnumLineEnding;
}
export interface LineStyle extends PolylineStyle {
}
export interface LoadSourceInfo {
	docUid: string;
	current: number;
	total: number;
}
export interface LoadSourceOptions {
	insertBeforeIndex?: number;
	/** Whether ignore the exception while loading the source. */
	exception?: ExceptionType;
}
export interface LoadWasmInfo {
}
export interface MergeDocumentsOptions {
	name?: string;
	author?: string;
	creationDate?: string;
	deleteOriginal?: boolean;
	includeAnnotations?: boolean;
}
export interface NormalAppearance {
	matrix: number[];
	bbox: number[];
	objs: OBJS[];
	transform: number[];
	blendMode?: string;
}
export interface OBJS {
	charSpace?: number;
	dashArray?: number[];
	dashPhase?: number;
	fillColor?: number[];
	fillType?: number;
	fontCharSet?: number;
	fontIsBold?: boolean;
	fontIsItalic?: boolean;
	fontName?: string;
	fontPitchFamily?: number;
	fontSize?: number;
	isStroke?: boolean;
	lineCap?: number;
	lineJoin?: number;
	lineWidth?: number;
	miterLimit?: number;
	position?: number[];
	renderMode?: number;
	segments?: any;
	objMatrix?: number[];
	strokeColor?: number[];
	type: string;
	text?: string;
	wordSpace?: number;
}
export interface PageImageInfo {
	data: Blob;
	width: number;
	height: number;
}
export interface PageNumberStyle {
	onPage?: boolean;
	left?: string;
	top?: string;
	right?: string;
	bottom?: string;
	width?: string;
	height?: string;
	background?: string;
	border?: string;
	borderRadius?: string;
	translateX?: string;
	translateY?: string;
	opacity?: number;
	visibility?: "hidden" | "visible";
	color?: string;
	fontSize?: string;
	fontFamily?: string;
}
export interface PageVisualInfo {
	pageUid: string;
	pageIndex: number;
	isHovered: boolean;
	isSelected: boolean;
	width: number;
	height: number;
	canvasOffsetX: number;
	canvasOffsetY: number;
	containerOffsetX: number;
	containerOffsetY: number;
}
export interface PagesAddedEvent {
	readonly docUid: string;
	readonly indices: number[];
	readonly pageUids: string[];
}
export interface PagesDeletedEvent {
	readonly docUid: string;
	readonly pageUids: string[];
	readonly indices: number[];
}
export interface PaletteConfig {
	enabled?: boolean;
	id?: string;
	style?: Partial<CSSStyleDeclaration>;
	className?: string;
	colorList?: string[];
	labels?: {
		text?: string;
		stroke?: string;
		fill?: string;
		opacity?: string;
		style?: string;
		standardBusiness?: string;
	};
}
export interface ParsedAnnotation {
	uid?: string;
	type?: AnnotationParserTypeEnum;
	style?: AnnotationStyle | AnnotationStyle[];
	transform?: AnnotationTransform;
	iconColor?: string;
	comment?: ParsedAnnotationComment;
	opacity?: number;
	flags?: string[];
	raw?: AnnotationRawData;
	customData?: any;
	parsedOriIndex?: number;
}
export interface ParsedAnnotationComment extends ParsedAnnotationReply {
	replies?: ParsedAnnotationReply[];
}
export interface ParsedAnnotationPage {
	pageUid: string;
	fileIndex: number;
	annotations: ParsedAnnotation[];
}
export interface ParsedAnnotationReply {
	uid: string;
	author: string;
	type: string;
	subject?: string;
	contents: string;
	creationDate?: string;
	modifiedDate?: string;
	stateModel?: string;
	state?: string;
	reviewStates?: ParsedAnnotationReply[];
	markedStates?: ParsedAnnotationReply[];
	flags?: string[];
}
/**
 * The parsed resource is an image.
 */
export interface ParsedImageResource {
	data?: Blob;
	width: number;
	height: number;
	resolutionX: number;
	resolutionY: number;
	bitDepth?: number;
}
export interface ParsedPage {
	pageUid?: string;
	fileIndex: number;
	annotations?: ParsedAnnotation[];
	rotation?: number;
	filter?: string;
	mediaBox: Rect;
	cropBox: Rect;
	resource: ParsedImageResource;
	pdfOptions?: ParsedPagePdfOptions;
	realReadMode?: number;
	nativeMediaBox?: Rect;
	nativeCropBox?: Rect;
}
export interface ParsedPagePdfOptions {
	convertMode: EnumConvertMode;
	renderOptions: {
		renderAnnotations: EnumAnnotationRenderMode;
		renderGrayscale: boolean;
	};
	rotation: number;
	mediaBox: Rect;
	cropBox: Rect;
	annotCount: number;
	parsedAnnotCount: number;
	pageContentType?: string;
}
export interface ParsedPageTexts {
	charInfos: ParsedTextChar[];
	index: number;
}
export interface ParsedTextChar {
	uid: string;
	oriLineUid: string;
	visibleIndex: number;
	indexInMergeLine: number;
	unicode: number;
	charBox: Rect;
	/** The char index in the page texts */
	oriIndex?: number;
	/** It will be edited when cropping page. */
	indexWithWrap?: number;
	/** It will be edited when cropping page. */
	indexWithoutWrap?: number;
	indexInSearch?: number;
	objId?: string;
}
export interface ParserOptions {
	pageWidth?: number;
	pageHeight?: number;
}
export interface PdfPageInfo {
	curImageBitDepth: number;
	imageBitDepth: number;
	/** Pixel size. */
	imageHeight: number;
	imageIsGrayScale?: boolean;
	imageType: number;
	/** Pixel size. */
	imageWidth: number;
	imageXResolution: number;
	imageYResolution: number;
	pageIndex?: number;
	rotation?: number;
	realReadMode?: number;
	mediaBox?: Array<number>;
	cropBox?: Array<number>;
	annotCount?: number;
}
export interface PdfRenderPageRawData {
	blobType: MIME.IMAGE_JPEG;
	code: number;
	imageData: Uint8ClampedArray;
	imageInfo: PdfPageInfo;
	message: string;
	pageIndex: number;
}
export interface PdfSource extends Source {
	convertMode: EnumConvertMode;
	password?: string;
	renderOptions?: {
		renderAnnotations?: EnumAnnotationRenderMode;
		resolution?: number;
		maxWidth?: number;
		maxHeight?: number;
		renderGrayscale?: boolean;
	};
}
export interface PerspectiveInfo {
	pageUid: string;
	perspectiveQuad: Quad;
}
export interface PerspectiveViewerConfig {
	canvasStyle?: CanvasStyle;
	pageStyle?: BaseStyle;
	quadSelectionStyle?: QuadSelectionStyle;
	enableSlide?: boolean;
	scrollToLatest?: boolean;
	enableMagnifier?: boolean;
	enableLoadSourceByDrag?: boolean;
}
export interface PerspectiveViewerConstructorOptions {
	container?: string | HTMLElement;
	viewerConfig?: PerspectiveViewerConfig;
	uiConfig?: UiConfig;
	/** The uid of the controller/viewer to be synced */
	groupUid?: string;
}
export interface PerspectiveViewerEventMap {
	"resized": IResizedEvent;
	"pageRendered": IPageRendererEvent;
	"currentIndexChanged": ICurrentIndexChangedEvent;
	"currentPageChanged": ICurrentPageChangedEvent;
	"quadModified": IQuadModifiedEvent;
	"visibilityChanged": IVisibilityChangedEvent;
	"click": IPointerEvent;
	"dblclick": IPointerEvent;
	"rightclick": IPointerEvent;
	"pointerdown": IPointerEvent;
	"pointermove": IPointerEvent;
	"pointerup": IPointerEvent;
	"pageover": IPointerEvent;
	"pageout": IPointerEvent;
	"paginationChanged": IPaginationChangedEvent;
}
export interface PlayCallbackInfo {
	deviceId: string;
	width: number;
	height: number;
}
export interface Point {
	x: number;
	y: number;
}
export interface Point2Init {
	x: number;
	y: number;
}
export interface PolygonAnnotationOptions extends Omit<BaseAnnotationOptions, "rotation"> {
	points?: Point[];
}
export interface PolygonStyle extends RectangleStyle {
}
export interface PolylineAnnotationOptions extends Omit<BaseAnnotationOptions, "rotation"> {
	points?: Point[];
	lineEnding?: LineEnding;
}
export interface PolylineStyle extends RectangleStyle {
	lineEnding?: {
		start: EnumLineEnding;
		end: EnumLineEnding;
	};
}
export interface PrintSettings {
	printAnnotation?: boolean;
}
export interface ProcessOutputOptions {
	outputType?: ImageType;
	bRGBA?: boolean;
	is1BitTo8Bit?: boolean;
	jpegQuality?: number;
	bitDepth?: number;
	xdpi?: number;
	ydpi?: number;
	returnType?: ReturnedDataType;
}
export interface ProcessingHandlerMap {
	"documentBoundariesDetect": IDocumentDetect;
	"imageFilter": IImageFilter;
}
export interface QuadSelectionStyle {
	border?: string;
	background?: string;
	maskColor?: string;
	ctrlBorderRadius?: string;
	ctrlBorder?: string;
	ctrlWidth?: string;
	ctrlHeight?: string;
	ctrlBackground?: string;
	invalidCtrlBorderColor?: string;
	invalidBorderColor?: string;
}
export interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}
export interface RectAnnotationOptions extends BaseAnnotationOptions {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
}
export interface RectXY {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface RectangleStyle extends BaseAnnotationStyle {
	borderWidth?: number;
	borderColor?: string;
	background?: string;
	lineDash?: number[];
}
export interface RenderPageTask {
	taskUid: string;
	canceled: boolean;
}
export interface SaveJpegSettings {
	quality?: number;
	saveAnnotation?: boolean;
}
export interface SavePdfSettings {
	/**
	 * Specify the author.
	 */
	author?: string;
	/**
	 * Specify the compression type.
	 */
	compression?: EnumPDFCompressionType;
	/**
	* Specify the page type.
	*/
	pageType?: EnumPDFPageType;
	/**
	 * Specify the creator.
	 */
	creator?: string;
	/**
	 * Specify the creation date.
	 * Note that the argument should be 'D:YYYYMMDDHHmmSS', like 'D:20230101085959'.
	 */
	creationDate?: string;
	/**
	 * Specify the key words.
	 */
	keyWords?: string;
	/**
	 * Specify the modified date.
	 * Note that the argument should be 'D:YYYYMMDDHHmmSS', like 'D:20230101085959'.
	 */
	modifiedDate?: string;
	/**
	 * Specify the producer.
	 */
	producer?: string;
	/**
	 * Specify the subject.
	 */
	subject?: string;
	/**
	 * Specify the title.
	 */
	title?: string;
	/**
	 * Specify the PDF version. For example, 1.5. The allowed values are 1.1 ~ 1.7.
	 * NOTE: If the compression type is PDF_JBig2, the lowest version is 1.4
	 * If the compression type is PDF_JP2000, the lowest version is 1.5
	 */
	version?: string;
	/**
	 * Specify the quality of the images in the file.
	 * The value ranges from 0 to 100.
	 * Only valid when the {compression} is 'JPEG' or 'JPEG2000'.
	 */
	quality?: number;
	password?: string;
	saveAnnotation?: "none" | "image" | "annotation" | "flatten";
	mimeType?: string;
	/**
	* Specify the scale factor of the images in the file.
	* The value ranges from greater than 0 to less than or equal to 1.
	* Default is 1.
	*/
	imageScaleFactor?: number;
}
export interface SavePngSettings {
	saveAnnotation?: boolean;
}
export interface SaveSourceInfo {
	docUid: string;
	pageUids: string[];
	current: number;
	total: number;
}
export interface SaveTiffSettings {
	customTag?: TiffCustomTag[];
	/**
	 * Specify the compression type.
	 */
	compression?: EnumTIFFCompressionType;
	/**
	 * Specify the quality of the images in the file.
	 * The value ranges from 0 to 100.
	 * Only valid when the {compression} is 'JPEG'.
	 */
	quality?: number;
	saveAnnotation?: boolean;
}
export interface SearchTextOptions {
	caseSensitive?: boolean;
	wholeWord?: boolean;
}
export interface Source {
	fileData: Blob;
}
export interface StampAnnotationOptions {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	stamp?: EnumStampIcon | string | Blob | object[];
	opacity?: number;
	flags?: Flags;
	rotation?: number;
}
export interface StampStyle extends BaseAnnotationStyle {
	stamp?: EnumStampIcon | string | Blob;
}
export interface StrikeoutAnnotationOptions extends TextAssistAnnotationOptions {
	borderColor?: string;
}
export interface StrikeoutStyle extends BaseAnnotationStyle {
	borderColor?: string;
}
export interface TextAssistAnnotationOptions {
	rects?: RectXY[];
	opacity?: number;
	flags?: Flags;
}
export interface TextBoxAnnotationOptions extends BaseAnnotationOptions {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	textAlign?: "left" | "right" | "center" | "justify";
	textContents?: TextContent[];
}
export interface TextBoxStyle extends RectangleStyle {
	textAlign?: string;
	textContent?: TextContent;
}
export interface TextContent {
	content?: string;
	color?: string;
	underline?: boolean;
	lineThrough?: boolean;
	fontSize?: number;
	fontFamily?: string;
	fontStyle?: string;
	fontWeight?: string;
}
export interface TextSearchResult {
	pageUid: string;
	text: string;
	rects: RectXY[];
	context: string;
}
export interface TextTypewriterAnnotationOptions {
	x?: number;
	y?: number;
	textContents?: TextContent[];
	opacity?: number;
	author?: string;
	subject?: string;
	flags?: Flags;
}
export interface TextTypewriterStyle extends BaseAnnotationStyle {
	textContent?: TextContent;
}
export interface ThumbnailConfig extends BrowseViewerConfig {
	size?: string;
	visibility?: "visible" | "hidden";
	position?: "left" | "right" | "top" | "bottom";
}
export interface TiffCustomTag {
	id?: number;
	content?: string;
	contentIsBase64?: boolean;
}
export interface ToolbarConfig {
	enabled?: boolean;
	id?: string;
	className?: string;
	style?: Partial<CSSStyleDeclaration>;
	paletteButton?: AnnotationToolbarButton;
	deleteButton?: AnnotationToolbarButton;
	copyButton?: AnnotationToolbarButton;
	highlightButton?: AnnotationToolbarButton;
	underlineButton?: AnnotationToolbarButton;
	strikeoutButton?: AnnotationToolbarButton;
}
export interface Tooltip extends IconComponent {
}
export interface TransferOptions {
	sourceIndices?: number[];
	insertBeforeIndex?: number;
	includeAnnotations?: boolean;
}
export interface UiConfig {
	type: string;
	flexDirection?: "row" | "column";
	id?: string;
	name?: string;
	tooltip?: string;
	dataId?: string;
	style?: Partial<CSSStyleDeclaration>;
	className?: string;
	label?: string;
	events?: Partial<Record<keyof GlobalEventHandlersEventMap, any>>;
	children?: (UiConfig | string)[];
}
export interface UnderlineAnnotationOptions extends TextAssistAnnotationOptions {
	borderColor?: string;
}
export interface UnderlineStyle extends BaseAnnotationStyle {
	borderColor?: string;
}
export interface UpdatedPdfSource extends UpdatedSource {
	convertMode: EnumConvertMode;
	password?: string;
	renderOptions?: {
		renderAnnotations?: EnumAnnotationRenderMode;
		resolution?: number;
		maxWidth?: number;
		maxHeight?: number;
		renderGrayscale?: boolean;
	};
}
export interface UpdatedSource {
	fileData: Blob;
	fileIndex?: number;
}
export interface VError {
	code: number;
	message: string;
	details?: string[];
	name?: string;
}
export interface VImageData {
	type: EnumImageDataType;
	data: ArrayBuffer | Blob;
	height?: number;
	width?: number;
}
export interface Vector2Init {
	x: number;
	y: number;
}
export interface VideoConfig {
	resolution?: [
		number,
		number
	];
	fill?: boolean;
}
export interface VideoDeviceInfo {
	deviceId: string;
	label: string;
}
export interface ZoomOrigin {
	x: "start" | "center" | "end";
	y: "start" | "center" | "end";
}
export type AnnotationMode = "select" | "erase" | "rectangle" | "ellipse" | "line" | "polygon" | "polyline" | "ink" | "textBox" | "textTypewriter" | "stamp" | "highlight" | "underline" | "strikeout";
export type BrowseViewerStyle = BaseStyle | CanvasStyle | PageNumberStyle | CheckboxStyle;
export type BrowseViewerStyleName = "canvasStyle" | "pageStyle" | "selectedPageStyle" | "hoveredPageStyle" | "placeholderStyle" | "pageNumberStyle" | "checkboxStyle" | "currentPageStyle";
export type CropMode = "current" | "all";
/**
 * cursor
 * @see https://drafts.csswg.org/css-ui-3/#cursor
 */
export type Cursor = "auto" | "default" | "none" | "context-menu" | "help" | "pointer" | "progress" | "wait" | "cell" | "crosshair" | "text" | "vertical-text" | "alias" | "copy" | "move" | "no-drop" | "not-allowed" | "e-resize" | "n-resize" | "ne-resize" | "nw-resize" | "s-resize" | "se-resize" | "sw-resize" | "w-resize" | "ns-resize" | "ew-resize" | "nesw-resize" | "col-resize" | "nwse-resize" | "row-resize" | "all-scroll" | "zoom-in" | "zoom-out" | "grab" | "grabbing";
export type DisplayMode = "single" | "continuous";
export type ExceptionType = "fail" | "ignore";
export type FitMode = "width" | "height" | "window" | "actualSize";
export type FreeTextAlign = "left" | "right" | "center" | "justify";
export type ITextSearchTriggeredEvent = ITextSearchedInfo[];
export type ITextSelectedEvent = ITextSelectedInfo[];
export type InfoStatus = "Pending" | "InProgress" | "Completed" | "Failed" | "Canceled";
export type OuterAnnotation = Rectangle | Ellipse | Ink | Line | Polygon | Polyline | Stamp | TextBox | TextTypewriter;
export type Quad = [
	[
		number,
		number
	],
	[
		number,
		number
	],
	[
		number,
		number
	],
	[
		number,
		number
	]
];
export type ToolMode = "pan" | "crop" | "annotation" | "textSelection";
export type Viewer = any;
export type ViewerType = "editViewer" | "perspectiveViewer" | "captureViewer" | "browseViewer";
export type WasmModuleName = "core" | "pdf" | "proc";

export {};
