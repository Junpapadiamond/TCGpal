// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComparisonQuestionBox } from "./ComparisonApp";
import { LanguageProvider, setLanguage } from "./i18n";

afterEach(() => { cleanup(); setLanguage("en"); });
const props = { question: "", answer: null, error: null, loading: false, targetLabel: null,
  onQuestionChange: vi.fn(), onAsk: vi.fn(), onClose: vi.fn() };

describe("comparison evidence questions", () => {
  it("offers useful questions that can be asked without typing", () => {
    const onAsk = vi.fn();
    render(<LanguageProvider><ComparisonQuestionBox {...props} onAsk={onAsk} /></LanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: "What is missing?" }));
    expect(onAsk).toHaveBeenCalledWith("What is missing?", "report");
    expect(screen.getByText(/Answers use this report/)).toBeTruthy();
  });
  it("labels rule-based answers without implying a model was used", () => {
    render(<LanguageProvider><ComparisonQuestionBox {...props} answer={{ answer: "Condition unknown.", cautions: [], usedAi: false, webContextChecked: false, webCitations: [] }} /></LanguageProvider>);
    expect(screen.getByText("Rule-based explanation")).toBeTruthy();
  });
  it("attributes AI answers and offers Chinese prompts", () => {
    setLanguage("zh");
    render(<LanguageProvider><ComparisonQuestionBox {...props} answer={{ answer: "品相未知。", cautions: [], usedAi: true, model: "test-model", webContextChecked: false, webCitations: [] }} /></LanguageProvider>);
    expect(screen.getByText("AI 解读 · test-model")).toBeTruthy();
    expect(screen.getByRole("button", { name: "还缺哪些信息？" })).toBeTruthy();
  });
});
