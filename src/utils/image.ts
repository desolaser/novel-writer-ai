export interface ImageSize {
	w: number;
	h: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Could not load image: ${src}`));
		img.src = src;
	});
}

export function imageSize(img: HTMLImageElement): ImageSize {
	return { w: img.naturalWidth, h: img.naturalHeight };
}

/**
 * Draws a rectangular region of the source image onto a new canvas of the
 * given output size. Enables high-quality smoothing for downscaling.
 */
export function cropToCanvas(
	img: HTMLImageElement,
	sx: number,
	sy: number,
	sw: number,
	sh: number,
	outW: number,
	outH: number,
): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = outW;
	canvas.height = outH;
	const ctx = canvas.getContext('2d')!;
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
	return canvas;
}

export function canvasToDataUrl(
	canvas: HTMLCanvasElement,
	mime: string = 'image/png',
	quality?: number,
): string {
	return canvas.toDataURL(mime, quality);
}

export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
	const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
	const binary = atob(base64);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out.buffer;
}

/**
 * Centered square crop of an image, at most `size` pixels on a side, as a PNG
 * data URL: the shape and size of a codex thumbnail.
 */
export async function squareThumbnail(src: string, size = 480): Promise<string> {
	const img = await loadImage(src);
	const { w, h } = imageSize(img);
	const side = Math.min(w, h);
	const out = Math.min(size, side);
	const canvas = cropToCanvas(img, (w - side) / 2, (h - side) / 2, side, side, out, out);
	return canvasToDataUrl(canvas, 'image/png');
}
