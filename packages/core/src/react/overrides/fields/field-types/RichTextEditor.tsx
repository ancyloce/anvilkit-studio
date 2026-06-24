"use client";

/**
 * @file The heavy TipTap editor backing the `richtext` field override.
 *
 * Loaded **only** through `RichTextField`'s
 * `lazy(() => import("./RichTextEditor"))` boundary, so TipTap (+ ProseMirror)
 * is emitted as a separate async chunk and never counts against the `<Studio>`
 * entry or chrome bundle budgets (both measure entry chunks only). The field
 * value is a serializable **HTML string** — read as the editor's initial
 * content and emitted via `onChange` on every edit.
 *
 * Scope: ships TipTap's `StarterKit` only (paragraphs, headings, bold/italic,
 * strike, code, blockquote, bullet/ordered lists, horizontal rule). HTML using
 * marks/nodes outside that set — links, spans, inline styles, classes — is
 * normalized away on the first edit, so a host migrating richer existing
 * content should extend `extensions` to preserve it.
 */

import "./rich-text-editor.css";

import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListOrdered } from "lucide-react";
import { type ReactNode, useEffect } from "react";

export interface RichTextEditorProps {
	/** Current value — an HTML string (the field's serialized content). */
	readonly value: string;
	/** Emitted with the updated HTML on every edit. */
	readonly onChange: (html: string) => void;
	readonly readOnly?: boolean;
	/** Forwarded to the contenteditable element so the field label's `for` resolves. */
	readonly id?: string;
}

function ToolbarButton({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: () => void;
	children: ReactNode;
}): ReactNode {
	return (
		<button
			type="button"
			className="ak-richtext-tool"
			aria-label={label}
			title={label}
			// Keep the editor selection while clicking a toolbar control.
			onMouseDown={(event) => event.preventDefault()}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

function Toolbar({ editor }: { editor: Editor }): ReactNode {
	return (
		<div
			className="ak-richtext-toolbar"
			role="toolbar"
			aria-label="Text formatting"
		>
			<ToolbarButton
				label="Bold"
				onClick={() => editor.chain().focus().toggleBold().run()}
			>
				<Bold />
			</ToolbarButton>
			<ToolbarButton
				label="Italic"
				onClick={() => editor.chain().focus().toggleItalic().run()}
			>
				<Italic />
			</ToolbarButton>
			<ToolbarButton
				label="Heading"
				onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
			>
				<Heading2 />
			</ToolbarButton>
			<ToolbarButton
				label="Bullet list"
				onClick={() => editor.chain().focus().toggleBulletList().run()}
			>
				<List />
			</ToolbarButton>
			<ToolbarButton
				label="Numbered list"
				onClick={() => editor.chain().focus().toggleOrderedList().run()}
			>
				<ListOrdered />
			</ToolbarButton>
		</div>
	);
}

export default function RichTextEditor({
	value,
	onChange,
	readOnly = false,
	id,
}: RichTextEditorProps): ReactNode {
	const editor = useEditor({
		extensions: [StarterKit],
		content: value,
		editable: !readOnly,
		// `false` so the editor mounts in an effect (no SSR/first-paint markup),
		// which also makes `useEditor` return `Editor | null`.
		immediatelyRender: false,
		editorProps: {
			attributes:
				id !== undefined
					? { class: "ak-richtext-content", id }
					: { class: "ak-richtext-content" },
		},
		onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
	});

	// Sync an externally-changed value into the editor without clobbering the
	// caret on echoes: when our own `onUpdate` round-trips the value back, it
	// already equals `getHTML()`, so we skip `setContent`.
	useEffect(() => {
		if (editor === null) {
			return;
		}
		if (value !== editor.getHTML()) {
			editor.commands.setContent(value, { emitUpdate: false });
		}
	}, [editor, value]);

	useEffect(() => {
		editor?.setEditable(!readOnly);
	}, [editor, readOnly]);

	if (editor === null) {
		return null;
	}

	return (
		<div className="ak-richtext" data-testid="ak-richtext">
			{readOnly ? null : <Toolbar editor={editor} />}
			<EditorContent editor={editor} />
		</div>
	);
}
