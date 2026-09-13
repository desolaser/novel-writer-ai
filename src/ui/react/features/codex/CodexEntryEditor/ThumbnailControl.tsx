import { useState } from 'react';
import { Icon } from '../../../components/Icon';

export function ThumbnailControl({ thumbnail, onPick, fileInputRef }: { thumbnail: string | null; onPick: (f: File) => void; fileInputRef: React.RefObject<HTMLInputElement | null> }) {
	const [lightbox, setLightbox] = useState(false);
	return (
		<div className="nw-thumbnail-wrap">
			{thumbnail ? (
				<img className="nw-thumbnail-avatar" src={thumbnail} alt="thumbnail" onClick={() => setLightbox(true)} style={{ cursor: 'pointer' }} />
			) : (
				<div className="nw-thumbnail-avatar nw-thumbnail-empty" title="No thumbnail">
					<Icon.Plus width={20} height={20} />
				</div>
			)}
			<input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = ''; }} />
			<button className="nw-btn nw-btn-icon nw-thumbnail-btn" title="Change thumbnail" onClick={() => fileInputRef.current?.click()}>
				<Icon.Edit width={12} height={12} />
			</button>
			{lightbox && thumbnail && (
				<div className="nw-lightbox-overlay" onClick={() => setLightbox(false)}>
					<div className="nw-lightbox-content" onClick={(e) => e.stopPropagation()}>
						<button className="nw-lightbox-close" onClick={() => setLightbox(false)} title="Close">
							<Icon.X width={24} height={24} />
						</button>
						<img src={thumbnail} alt="thumbnail fullsize" className="nw-lightbox-image" />
					</div>
				</div>
			)}
		</div>
	);
}
