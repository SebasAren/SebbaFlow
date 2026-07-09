/**
 * Cheap Clarify extension — extracts questions from the last assistant
 * message, forwards them to a cheap model for parsing, and presents them
 * via a TUI questionnaire. Answers are sent back as a user message.
 */

import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  buildExtractPrompt,
  getLastAssistantText,
  hasQuestionMarks,
  parseCheapModel,
  parseQuestions,
  type Question,
} from "./parser";
import { runQuestionnaire } from "./ui";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("clarify", {
    description: "Extract questions from last assistant message and present them via questionnaire",
    handler: async (_args, ctx) => {
      // 1. Get last assistant text
      const lastText = getLastAssistantText(ctx);
      if (!lastText) {
        ctx.ui.notify("No assistant message found.", "warning");
        return;
      }

      // 2. Resolve cheap model
      const cheapModelRef = parseCheapModel();
      if (!cheapModelRef) {
        ctx.ui.notify("CHEAP_MODEL not set. Expected format: provider/model-id", "error");
        return;
      }

      const model = ctx.modelRegistry.find(cheapModelRef.provider, cheapModelRef.modelId);
      if (!model) {
        ctx.ui.notify(
          `Model not found: ${cheapModelRef.provider}/${cheapModelRef.modelId}`,
          "error",
        );
        return;
      }

      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok) {
        ctx.ui.notify(`Auth failed: ${auth.error}`, "error");
        return;
      }
      if (!auth.apiKey) {
        ctx.ui.notify(`No API key for ${cheapModelRef.provider}/${cheapModelRef.modelId}`, "error");
        return;
      }

      // 3. Regex gate: skip LLM call if there are no question marks
      if (!hasQuestionMarks(lastText)) {
        ctx.ui.notify("No questions found in the last assistant message.", "warning");
        return;
      }

      ctx.ui.notify("Parsing questions from assistant message...", "info");

      // 4. Call cheap model to extract questions
      let questions: Question[] | undefined;
      try {
        const response = await complete(
          model,
          {
            messages: [
              {
                role: "user",
                content: [{ type: "text" as const, text: buildExtractPrompt(lastText) }],
                timestamp: Date.now(),
              },
            ],
          },
          {
            apiKey: auth.apiKey,
            headers: auth.headers,
            maxTokens: 4096,
          },
        );

        const rawText = response.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("");

        questions = parseQuestions(rawText);
        if (!questions || questions.length === 0) {
          ctx.ui.notify("No questions found in the last assistant message.", "warning");
          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Cheap model failed: ${message}`, "error");
        return;
      }

      // 5. Show questionnaire
      const result = await runQuestionnaire(questions, ctx);
      if (result.cancelled) {
        ctx.ui.notify("Cancelled.", "info");
        return;
      }

      // 6. Send answers back as user message
      const answerLines = result.answers.map((a) => {
        const q = questions.find((qq) => qq.id === a.id);
        const qLabel = q?.label ?? a.id;
        if (a.wasCustom) {
          return `${qLabel}: ${a.label}`;
        }
        return `${qLabel}: ${a.index}. ${a.label}`;
      });

      const userMessage = answerLines.join("\n");
      pi.sendUserMessage(userMessage);
    },
  });
}
