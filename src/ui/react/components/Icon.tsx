import React from 'react';

/** Iconos SVG planos (sin dependencias, sin unicode raro). */

const base = (props: { width?: number; height?: number; className?: string; fill?: string }) => ({
	width: props.width ?? 14, height: props.height ?? 14, className: props.className,
	fill: props.fill ?? 'currentColor', xmlns: 'http://www.w3.org/2000/svg',
});

export const Icon = {
	Back: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M19 11H7.83l4.88-4.88a1 1 0 1 0-1.42-1.41l-6.59 6.58a1 1 0 0 0 0 1.42l6.59 6.58a1 1 0 0 0 1.42-1.41L7.83 13H19a1 1 0 0 0 0-2z"/></svg>
	),
	X: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
	),
	Trash: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M9 3v1H4v2h1v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm2 2h2v1h-2V5zm-3 3h8v12H8V8z"/></svg>
	),
	Plus: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
	),
	ChevronLeft: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12l4.58-4.59z"/></svg>
	),
	ChevronRight: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
	),
	ChevronDown: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
	),
	Link: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4A3.1 3.1 0 0 1 20.1 12 3.1 3.1 0 0 1 17 15.1h-4V17h4a5 5 0 0 0 0-10z"/></svg>
	),
	ExternalLink: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3zM19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z"/></svg>
	),
	Magic: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="m19.5 2.5 2 2-12 12-2-2 12-12zM5 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2zm13 9 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1zM6 17l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z"/></svg>
	),
	TrashSmall: (p?: any) => (
		<svg viewBox="0 0 24 24" width={11} height={11} fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M9 3v1H4v2h1v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9z"/></svg>
	),
	Edit: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
	),
	MenuThreePoints: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>
	),
	Settings: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M19.14 12.94a7.07 7.07 0 0 0 .06-.94 7.07 7.07 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.48a.5.5 0 0 0 .12.61l2.03 1.58c-.04.31-.06.62-.06.94 0 .32.02.63.06.94L2.82 14.13a.5.5 0 0 0-.12.61l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7.03 7.03 0 0 0 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z"/></svg>
	),
	Check: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
	),
	Minus: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M5 11h14v2H5z"/></svg>
	),
	Filter: (p?: any) => (
		<svg viewBox="0 0 24 24" {...base(p)}><path d="M3 4h18l-7 9v6l-4 2v-8L3 4z"/></svg>
	),
};
