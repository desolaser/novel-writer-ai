import { useState, useEffect, useRef } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { ApiFactory } from '../../../../factories/api-factory';
import { getPromptMetaCascading } from '../../../../context/promptMeta';

export function ChatTab({ plugin }: { plugin: NovelWriterPlugin }) {
	const { activeChatId, selectChat, appendMensaje, createChat, store } = useNovelWriter();
	const [input, setInput] = useState('');
	const [mensajes, setMensajes] = useState<any[]>([]);
	const [busy, setBusy] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!activeChatId || !store) { setMensajes([]); return; }
		store.readChat(activeChatId).then(c => setMensajes(c?.mensajes ?? []));
	}, [activeChatId, store]);

	useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [mensajes]);

	const send = async () => {
		const t = input.trim();
		if (!t) return;
		let chatId = activeChatId;
		if (!chatId) {
			const created = await createChat('Chat sin nombre');
			if (!created) return;
			chatId = created.id_chat;
			selectChat(chatId);
		}
		setInput('');
		await appendMensaje('user', t);
		setMensajes(m => [...m, { id_mensaje: 'tmp_u', role: 'user', mensaje: t, created_at: '' }]);
		setBusy(true);

		try {
			const settings = plugin.settings.data;
			const token = settings.apiToken[settings.proveedor.id] ?? '';
			const api = new ApiFactory().createApi(settings.proveedor.id, token);
			// Construir contexto: mensajes previos + system prompt
			const history = [...mensajes, { role: 'user', mensaje: t }]
				.filter(m => m.role === 'user' || m.role === 'assistant')
				.map(m => ({ role: m.role, content: m.role === 'user' ? m.mensaje : m.mensaje }));
			// Usar prompt como string (API espera un solo prompt)
			const memory = await getPromptMetaCascading(plugin.app, settings, 'memoryContent');
			const authorNote = await getPromptMetaCascading(plugin.app, settings, 'authorNote');
			const sysPrompt = memory || authorNote
				? `Contexto: ${memory}${authorNote ? `\n\nAuthor's note: ${authorNote}` : ''}\n\n`
				: '';
			const prompt = sysPrompt + history.map(m => `${m.role === 'user' ? 'Usuario' : 'IA'}: ${m.content}`).join('\n\n') + '\n\nIA: ';
			const result = await api.generateCompletion(prompt, settings.proveedor.modelo, {
				max_tokens: settings.aiOptions.maxOutput,
				temperature: settings.aiOptions.temperature,
				top_p: settings.aiOptions.topP,
				stream: false,
			});
			const reply = result.text ?? '(sin respuesta)';
			await appendMensaje('assistant', reply);
			setMensajes(m => [...m, { id_mensaje: 'tmp_a', role: 'assistant', mensaje: reply, created_at: '' }]);
		} catch (e: any) {
			const err = 'Error: ' + (e?.message ?? String(e));
			await appendMensaje('assistant', err);
			setMensajes(m => [...m, { id_mensaje: 'tmp_e', role: 'assistant', mensaje: err, created_at: '' }]);
		}
		setBusy(false);
	};

	return (
		<div className="nw-chat">
			<div className="nw-chat-messages" ref={scrollRef}>
				{mensajes.map(m => (
					<div key={m.id_mensaje} className={`nw-msg nw-msg-${m.role}`}>
						<div className="nw-msg-role">{m.role === 'user' ? 'Tu' : 'IA'}</div>
						<div className="nw-msg-body">{m.mensaje}</div>
					</div>
				))}
				{busy && <div className="nw-msg nw-msg-assistant"><em>...escribiendo...</em></div>}
			</div>
			<div className="nw-chat-input">
				<textarea className="nw-chat-textarea" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Escribe un mensaje..." rows={2} />
				<button className="nw-btn nw-btn-primary" onClick={send} disabled={busy}>Enviar</button>
			</div>
		</div>
	);
}
