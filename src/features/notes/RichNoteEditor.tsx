import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  AudioWaveform,
  Bold,
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
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { escapeNoteHtml } from "./noteContent";
import { VoiceRecognitionSession, type VoiceRecognitionConstructor } from "./voiceRecognitionSession";

const TEXT_COLORS = ["#f4f7fb", "#6bd6ff", "#59dfc1", "#ffc55f", "#ff756f", "#d89cff"];
const HIGHLIGHT_COLORS = ["#ffe26a66", "#69e3c766", "#6aa9ff66", "#ff716b66", "#d89cff66"];
const TEXT_SCALES = ["title", "paragraph", "body"] as const;
const TEXT_SCALE_SIZES = {
  title: "28px",
  paragraph: "21px"
} as const;

interface RichNoteEditorProps {
  initialContent: string;
  autoStartVoiceToken?: number;
  onChange: (html: string, text: string) => void;
}

declare global {
  interface Window {
    SpeechRecognition?: VoiceRecognitionConstructor;
    webkitSpeechRecognition?: VoiceRecognitionConstructor;
  }
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

type TextScale = (typeof TEXT_SCALES)[number];

function RichNoteEditorComponent({ initialContent, autoStartVoiceToken = 0, onChange }: RichNoteEditorProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recognitionSessionRef = useRef<VoiceRecognitionSession | null>(null);
  recognitionSessionRef.current ??= new VoiceRecognitionSession();
  const voiceMountedRef = useRef(false);
  const handledVoiceTokenRef = useRef(0);
  const voiceSupported = useMemo(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition), []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
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
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: "rich-note-surface",
        "aria-label": "Текст записи",
        spellcheck: "true"
      }
    },
    onUpdate: ({ editor: value }) => {
      onChange(value.getHTML(), value.getText({ blockSeparator: "\n" }));
    }
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: value }) => {
      if (!value || value.isDestroyed) {
        return {
          textScale: "body" as const,
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          bulletList: false,
          taskList: false,
          blockquote: false,
          imageSelected: false,
          canUndo: false,
          canRedo: false
        };
      }
      return {
        textScale: value.getAttributes("textStyle").fontSize === TEXT_SCALE_SIZES.title
          ? "title" as const
          : value.getAttributes("textStyle").fontSize === TEXT_SCALE_SIZES.paragraph
            ? "paragraph" as const
            : value.isActive("heading", { level: 2 })
              ? "title" as const
              : value.isActive("heading", { level: 3 })
                ? "paragraph" as const
                : "body" as const,
        bold: value.isActive("bold"),
        italic: value.isActive("italic"),
        underline: value.isActive("underline"),
        strike: value.isActive("strike"),
        bulletList: value.isActive("bulletList"),
        taskList: value.isActive("taskList"),
        blockquote: value.isActive("blockquote"),
        imageSelected: value.isActive("image"),
        canUndo: value.can().undo(),
        canRedo: value.can().redo()
      };
    }
  });

  const stopVoice = useCallback(() => {
    recognitionSessionRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(() => {
    voiceMountedRef.current = true;
    return () => {
      voiceMountedRef.current = false;
      queueMicrotask(() => {
        if (!voiceMountedRef.current) recognitionSessionRef.current?.stop();
      });
    };
  }, [stopVoice]);

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

  const startVoice = useCallback(() => {
    if (!editor || editor.isDestroyed) return false;
    const session = recognitionSessionRef.current;
    if (!session) return false;
    if (session.active) return true;
    if (!voiceSupported) {
      setVoiceError("Диктовка недоступна в этом браузере.");
      return false;
    }
    setVoiceError("");
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return false;
    const recognition = new Recognition();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = false;
    const result = session.start(recognition, {
      onResult: (event) => {
        const activeEditor = editorRef.current;
        if (!activeEditor || activeEditor.isDestroyed) return;
        const transcript = Array.from(event.results)
          .filter((item) => item.isFinal)
          .map((item) => item[0]?.transcript ?? "")
          .join(" ")
          .trim();
        if (transcript) activeEditor.chain().focus().insertContent(`${activeEditor.isEmpty ? "" : " "}${escapeNoteHtml(transcript)}`).run();
      },
      onError: (event) => {
        setVoiceError(event.error === "not-allowed"
          ? "Доступ к микрофону запрещён. Разрешите его для приложения в настройках iPhone."
          : "Не удалось услышать. Проверьте доступ к микрофону.");
        setListening(false);
      },
      onEnd: () => setListening(false)
    });
    if (result !== "failed") {
      setListening(true);
      return true;
    }
    setVoiceError("Микрофон сейчас занят другим приложением.");
    setListening(false);
    return false;
  }, [editor, voiceSupported]);

  const toggleVoice = useCallback(() => {
    if (listening || recognitionSessionRef.current?.active) {
      stopVoice();
      return;
    }
    startVoice();
  }, [listening, startVoice, stopVoice]);

  useLayoutEffect(() => {
    if (!autoStartVoiceToken || autoStartVoiceToken === handledVoiceTokenRef.current) return;
    if (startVoice()) handledVoiceTokenRef.current = autoStartVoiceToken;
  }, [autoStartVoiceToken, startVoice]);

  if (!editor || !toolbarState) return <div className="rich-editor-loading" aria-label="Подготовка редактора" />;

  function setTextScale(style: TextScale) {
    if (style === "title") {
      editor!.chain().focus().setFontSize(TEXT_SCALE_SIZES.title).run();
      return;
    }
    if (style === "paragraph") {
      editor!.chain().focus().setFontSize(TEXT_SCALE_SIZES.paragraph).run();
      return;
    }
    editor!.chain().focus().unsetFontSize().run();
  }

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

      <div className="rich-format-dock">
        <div className="rich-block-styles" role="group" aria-label="Размер и роль текста">
          {TEXT_SCALES.map((style) => {
            const label = style === "title" ? "Заголовок" : style === "paragraph" ? "Абзац" : "Основной текст";
            return (
              <button
                key={style}
                className={toolbarState.textScale === style ? "active" : ""}
                type="button"
                onClick={() => setTextScale(style)}
                aria-pressed={toolbarState.textScale === style}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="rich-toolbar" aria-label="Форматирование записи">
          {toolbarButton(toolbarState.bold, "Жирный", <Bold size={18} />, () => editor.chain().focus().toggleBold().run())}
          {toolbarButton(toolbarState.italic, "Курсив", <Italic size={18} />, () => editor.chain().focus().toggleItalic().run())}
          {toolbarButton(toolbarState.underline, "Подчёркивание", <UnderlineIcon size={18} />, () => editor.chain().focus().toggleUnderline().run())}
          {toolbarButton(toolbarState.strike, "Зачёркивание", <Strikethrough size={18} />, () => editor.chain().focus().toggleStrike().run())}
          {toolbarButton(toolbarState.bulletList, "Маркированный список", <List size={18} />, () => editor.chain().focus().toggleBulletList().run())}
          {toolbarButton(toolbarState.taskList, "Чек-лист", <ListChecks size={18} />, () => editor.chain().focus().toggleTaskList().run())}
          {toolbarButton(toolbarState.blockquote, "Цитата", <Quote size={18} />, () => editor.chain().focus().toggleBlockquote().run())}
          {toolbarButton(paletteOpen, "Цвет и выделение", <Palette size={18} />, () => setPaletteOpen((value) => !value))}
          {toolbarButton(false, "Добавить фото", <ImagePlus size={18} />, () => imageInputRef.current?.click())}
          {toolbarButton(false, "Уменьшить фото", <Minimize2 size={18} />, () => editor.chain().focus().updateAttributes("image", { width: 180, height: null }).run(), !toolbarState.imageSelected)}
          {toolbarButton(false, "Увеличить фото", <Maximize2 size={18} />, () => editor.chain().focus().updateAttributes("image", { width: 520, height: null }).run(), !toolbarState.imageSelected)}
          {toolbarButton(false, "Отменить", <Undo2 size={18} />, () => editor.chain().focus().undo().run(), !toolbarState.canUndo)}
          {toolbarButton(false, "Повторить", <Redo2 size={18} />, () => editor.chain().focus().redo().run(), !toolbarState.canRedo)}
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
      </div>

      <EditorContent className="rich-editor-content" editor={editor} />
      <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={(event) => void addImages(event.target.files)} aria-label="Прикрепить фотографии" />
    </div>
  );
}

export const RichNoteEditor = memo(
  RichNoteEditorComponent,
  // NoteComposer changes the key for true hydration; keystroke props must not remount TipTap.
  (previous, next) => previous.autoStartVoiceToken === next.autoStartVoiceToken && previous.onChange === next.onChange
);
