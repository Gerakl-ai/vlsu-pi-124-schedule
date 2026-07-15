import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AudioWaveform,
  Bold,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  Maximize2,
  Mic,
  Minimize2,
  Palette,
  Quote,
  Redo2,
  Sparkles,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const TEXT_COLORS = ["#f4f7fb", "#6bd6ff", "#59dfc1", "#ffc55f", "#ff756f", "#d89cff"];
const HIGHLIGHT_COLORS = ["#ffe26a66", "#69e3c766", "#6aa9ff66", "#ff716b66", "#d89cff66"];

interface RichNoteEditorProps {
  initialContent: string;
  onChange: (html: string, text: string) => void;
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (symbol) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[symbol] ?? symbol);
}

export function plainTextToHtml(value: string) {
  const paragraphs = value.split(/\r?\n/).map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`);
  return paragraphs.join("") || "<p></p>";
}

async function compressImage(file: File) {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image decode failed"));
      element.src = source;
    });
    const maxSide = 1600;
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image compression failed")), "image/jpeg", 0.84);
    });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { dataUrl, width, height };
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function RichNoteEditor({ initialContent, onChange }: RichNoteEditorProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [, setRevision] = useState(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceSupported = useMemo(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition), []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      TextStyleKit,
      Highlight.configure({ multicolor: true }),
      Image.configure({
        allowBase64: true,
        resize: { enabled: true, minWidth: 96, minHeight: 64, alwaysPreserveAspectRatio: true },
        HTMLAttributes: { class: "note-inline-image" }
      }),
      Placeholder.configure({ placeholder: "Напишите как думаете..." })
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: "rich-note-surface",
        "aria-label": "Текст записи",
        spellcheck: "true"
      }
    },
    onUpdate: ({ editor: value }) => {
      onChange(value.getHTML(), value.getText({ blockSeparator: "\n" }));
      setRevision((current) => current + 1);
    },
    onSelectionUpdate: () => setRevision((current) => current + 1)
  });

  useEffect(() => {
    if (!editor || editor.getHTML() === initialContent) return;
    editor.commands.setContent(initialContent, { emitUpdate: false });
    onChange(editor.getHTML(), editor.getText({ blockSeparator: "\n" }));
  }, [editor, initialContent, onChange]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  function toolbarButton(active: boolean, label: string, icon: React.ReactNode, onClick: () => void, disabled = false) {
    return (
      <button className={active ? "active" : ""} type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}>
        {icon}
      </button>
    );
  }

  async function addImages(files: FileList | null) {
    if (!editor || !files?.length) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const image = await compressImage(file);
        editor.chain().focus().setImage({
          src: image.dataUrl,
          alt: file.name,
          width: Math.min(560, image.width),
          height: Math.round(Math.min(560, image.width) * (image.height / image.width))
        }).run();
      } catch {
        // A failed attachment leaves the rest of the draft untouched.
      }
    }
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function toggleVoice() {
    if (!editor || !voiceSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    setVoiceError("");
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "ru-RU";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) editor.chain().focus().insertContent(`${editor.isEmpty ? "" : " "}${escapeHtml(transcript)}`).run();
    };
    recognition.onerror = () => {
      setVoiceError("Не удалось услышать. Проверьте доступ к микрофону.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      setListening(true);
      recognition.start();
    } catch {
      setVoiceError("Микрофон сейчас занят другим приложением.");
      setListening(false);
    }
  }

  if (!editor) return <div className="rich-editor-loading" aria-label="Подготовка редактора" />;
  const imageSelected = editor.isActive("image");

  return (
    <div className="rich-note-editor">
      <button
        className={`voice-command ${listening ? "listening" : ""}`}
        type="button"
        onClick={toggleVoice}
        disabled={!voiceSupported}
        aria-pressed={listening}
        aria-label={voiceSupported ? (listening ? "Остановить умную диктовку" : "Начать умную диктовку") : "Умная диктовка не поддерживается"}
      >
        <span className="voice-command-icon">{listening ? <AudioWaveform size={25} /> : <Mic size={25} />}</span>
        <span className="voice-command-copy">
          <strong>{listening ? "Слушаю..." : "Умная диктовка"}</strong>
          <small aria-live="polite">
            {voiceError || (voiceSupported ? (listening ? "Говорите свободно, текст появится ниже" : "Речь станет записью, папка и предмет определятся сами") : "Недоступно в этом браузере")}
          </small>
        </span>
        <span className="voice-intelligence" aria-hidden="true">
          <Sparkles size={14} />
          <span className="voice-meter"><i /><i /><i /><i /></span>
        </span>
      </button>

      <div className="rich-toolbar" aria-label="Форматирование записи">
        {toolbarButton(editor.isActive("heading", { level: 2 }), "Заголовок", <Heading2 size={18} />, () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
        {toolbarButton(editor.isActive("bold"), "Жирный", <Bold size={18} />, () => editor.chain().focus().toggleBold().run())}
        {toolbarButton(editor.isActive("italic"), "Курсив", <Italic size={18} />, () => editor.chain().focus().toggleItalic().run())}
        {toolbarButton(editor.isActive("underline"), "Подчёркивание", <UnderlineIcon size={18} />, () => editor.chain().focus().toggleUnderline().run())}
        {toolbarButton(editor.isActive("strike"), "Зачёркивание", <Strikethrough size={18} />, () => editor.chain().focus().toggleStrike().run())}
        {toolbarButton(editor.isActive("bulletList"), "Маркированный список", <List size={18} />, () => editor.chain().focus().toggleBulletList().run())}
        {toolbarButton(editor.isActive("taskList"), "Чек-лист", <ListChecks size={18} />, () => editor.chain().focus().toggleTaskList().run())}
        {toolbarButton(editor.isActive("blockquote"), "Цитата", <Quote size={18} />, () => editor.chain().focus().toggleBlockquote().run())}
        {toolbarButton(paletteOpen, "Цвет и выделение", <Palette size={18} />, () => setPaletteOpen((value) => !value))}
        {toolbarButton(false, "Добавить фото", <ImagePlus size={18} />, () => imageInputRef.current?.click())}
        {toolbarButton(false, "Уменьшить фото", <Minimize2 size={18} />, () => editor.chain().focus().updateAttributes("image", { width: 180, height: null }).run(), !imageSelected)}
        {toolbarButton(false, "Увеличить фото", <Maximize2 size={18} />, () => editor.chain().focus().updateAttributes("image", { width: 520, height: null }).run(), !imageSelected)}
        {toolbarButton(false, "Отменить", <Undo2 size={18} />, () => editor.chain().focus().undo().run(), !editor.can().undo())}
        {toolbarButton(false, "Повторить", <Redo2 size={18} />, () => editor.chain().focus().redo().run(), !editor.can().redo())}
      </div>

      {paletteOpen && (
        <div className="rich-palette" role="group" aria-label="Цвет текста и маркера">
          <span>Текст</span>
          {TEXT_COLORS.map((color) => (
            <button key={color} type="button" style={{ "--swatch": color } as React.CSSProperties} onClick={() => editor.chain().focus().setColor(color).run()} aria-label={`Цвет текста ${color}`} />
          ))}
          <span>Маркер</span>
          {HIGHLIGHT_COLORS.map((color) => (
            <button key={color} className="highlight" type="button" style={{ "--swatch": color } as React.CSSProperties} onClick={() => editor.chain().focus().toggleHighlight({ color }).run()} aria-label={`Цвет выделения ${color}`} />
          ))}
          <button className="palette-clear" type="button" onClick={() => editor.chain().focus().unsetColor().unsetHighlight().run()} aria-label="Убрать цвет" title="Убрать цвет">
            <Highlighter size={16} />
          </button>
        </div>
      )}

      <EditorContent className="rich-editor-content" editor={editor} />
      <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={(event) => void addImages(event.target.files)} aria-label="Прикрепить фотографии" />
    </div>
  );
}
