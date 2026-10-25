import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { yaml } from "@codemirror/lang-yaml";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { type Diagnostic, lintGutter, setDiagnostics } from "@codemirror/lint";
import { Annotation, EditorSelection, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { Severity } from "../../analyzer/types";

export interface EditorMarker {
  line: number;
  column: number;
  severity: Severity;
  message: string;
}

export interface YamlEditorHandle {
  focus(): void;
  goTo(line: number, column?: number): void;
}

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  markers: readonly EditorMarker[];
  labelledBy: string;
  describedBy?: string;
}

const highlight = HighlightStyle.define([
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: "var(--code-key)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--code-string)" },
  { tag: [tags.number], color: "var(--code-number)" },
  { tag: [tags.bool, tags.null, tags.atom, tags.keyword], color: "var(--code-atom)" },
  { tag: [tags.comment, tags.lineComment], color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [tags.labelName, tags.meta, tags.typeName], color: "var(--code-number)" },
  { tag: [tags.punctuation, tags.separator, tags.squareBracket, tags.brace], color: "var(--muted)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "var(--surface)", color: "var(--fg)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.7", overflow: "auto" },
  ".cm-content": { padding: "12px 0", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 16px 0 8px" },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--subtle)",
    border: "none",
    borderRight: "1px solid var(--line)",
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "36px", padding: "0 8px 0 12px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--surface-2) 70%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--surface-2)", color: "var(--fg)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-line) !important",
  },
  ".cm-placeholder": { color: "var(--subtle)", fontStyle: "normal" },
  ".cm-lintRange-error": { backgroundImage: "none", borderBottom: "2px solid var(--error)" },
  ".cm-lintRange-warning": { backgroundImage: "none", borderBottom: "2px solid var(--warning)" },
  ".cm-lintRange-info": { backgroundImage: "none", borderBottom: "2px dotted var(--note)" },
  ".cm-gutter-lint": { width: "18px" },
  ".cm-gutter-lint .cm-gutterElement": { padding: "0 0 0 4px" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--line-strong)",
    borderRadius: "8px",
    boxShadow: "var(--shadow)",
    color: "var(--fg)",
  },
  ".cm-tooltip-lint": { padding: "2px 0" },
  ".cm-diagnostic": { fontFamily: "var(--font-sans)", fontSize: "12.5px", padding: "4px 10px" },
  ".cm-matchingBracket": { backgroundColor: "var(--accent-soft)", outline: "1px solid var(--accent-line)" },
});

/** Marks document replacements that come from props, so they are not reported back as edits. */
const external = Annotation.define<boolean>();

const LINT_SEVERITY: Record<Severity, Diagnostic["severity"]> = {
  error: "error",
  warning: "warning",
  note: "info",
};

function toDiagnostics(state: EditorState, markers: readonly EditorMarker[]): Diagnostic[] {
  const { doc } = state;
  return markers
    .filter((marker) => marker.line >= 1 && marker.line <= doc.lines)
    .map((marker) => {
      const line = doc.line(marker.line);
      const from = Math.min(line.from + Math.max(marker.column - 1, 0), line.to);
      return {
        from,
        to: Math.max(line.to, from),
        severity: LINT_SEVERITY[marker.severity],
        message: marker.message,
      };
    });
}

/** CodeMirror 6 YAML editor. Uncontrolled internally; `value` replaces the document when it differs. */
export const YamlEditor = forwardRef<YamlEditorHandle, YamlEditorProps>(function YamlEditor(
  { value, onChange, onSubmit, markers, labelledBy, describedBy },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(undefined);
  const callbacks = useRef({ onChange, onSubmit });

  useEffect(() => {
    callbacks.current = { onChange, onSubmit };
  });

  useEffect(() => {
    if (!host.current) return;
    const contentAttributes: Record<string, string> = { "aria-labelledby": labelledBy, "aria-multiline": "true" };
    if (describedBy) contentAttributes["aria-describedby"] = describedBy;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          lintGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          EditorState.tabSize.of(2),
          indentUnit.of("  "),
          yaml(),
          syntaxHighlighting(highlight),
          theme,
          placeholder("Paste a docker-compose.yml or compose.yaml here, or pick an example above."),
          EditorView.contentAttributes.of(contentAttributes),
          keymap.of([
            {
              key: "Mod-Enter",
              preventDefault: true,
              run: () => {
                callbacks.current.onSubmit();
                return true;
              },
            },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            const fromProps = update.transactions.some((tr) => tr.annotation(external));
            if (update.docChanged && !fromProps) callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = undefined;
    };
    // The editor is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      selection: EditorSelection.cursor(0),
      annotations: external.of(true),
    });
  }, [value]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch(setDiagnostics(editor.state, toDiagnostics(editor.state, markers)));
  }, [markers, value]);

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    goTo: (lineNumber, column = 1) => {
      const editor = view.current;
      if (!editor) return;
      const line = editor.state.doc.line(Math.min(Math.max(lineNumber, 1), editor.state.doc.lines));
      const anchor = Math.min(line.from + Math.max(column - 1, 0), line.to);
      editor.dispatch({
        selection: EditorSelection.cursor(anchor),
        effects: EditorView.scrollIntoView(anchor, { y: "center" }),
      });
      editor.focus();
    },
  }));

  return <div ref={host} className="h-full min-h-0" data-testid="yaml-editor" />;
});
