import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { faviconUrl } from '../../../../../utils/urls';

export function RefFavicon({ url }: { url: string }) {
	const src = faviconUrl(url);
	const [errored, setErrored] = useState(false);
	if (!src || errored) return <Icon.Link width={14} height={14} />;
	return <img className="nw-ref-favicon" src={src} alt="" width={14} height={14} onError={() => setErrored(true)} />;
}
