import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, writeFileSync, mkdtempSync, rmdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { piCodingAgentMock, piTuiMock, typeboxMock } from "@pi-ext/shared/test-mocks";

mock.module("@earendil-works/pi-coding-agent", piCodingAgentMock);
mock.module("@earendil-works/pi-tui", piTuiMock);
mock.module("typebox", typeboxMock);

// ── Mock OpenAI SDK ────────────────────────────────────────────────────────
// NOTE: We do NOT mock ./validate or image-size here. Creating real minimal PNG
// files for test fixtures avoids cross-contamination with other test files.

const mockCreate = mock<(params: any) => any>();

mock.module("openai", () => ({
  default: class OpenAI {
    apiKey: string;
    baseURL: string | undefined;
    chat: { completions: { create: typeof mockCreate } };

    constructor(options: { apiKey: string; baseURL?: string }) {
      this.apiKey = options.apiKey;
      this.baseURL = options.baseURL;
      this.chat = {
        completions: {
          create: mockCreate,
        },
      };
    }
  },
}));

// ── Imports ────────────────────────────────────────────────────────────────

import ext from "./index";

// ── Helpers ────────────────────────────────────────────────────────────────

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function mockSdkResponse(images?: Array<{ image_url: { url: string } }>) {
  return {
    id: "chatcmpl-test",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "Here's your image",
          ...(images ? { images } : {}),
        },
      },
    ],
  };
}

function makeTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bg: () => "",
    bold: (text: string) => text,
  };
}

describe("pi-image extension", () => {
  let registeredTools: any[];
  let tool: any;
  let savedFiles: string[];

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    mockCreate.mockReset();

    registeredTools = [];
    const mockApi = {
      registerTool: (t: any) => registeredTools.push(t),
      registerCommand: mock(() => {}),
    };
    ext(mockApi as any);
    tool = registeredTools[0];
    savedFiles = [];
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;

    for (const file of savedFiles) {
      try {
        if (existsSync(file)) unlinkSync(file);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  describe("registration", () => {
    it("registers a tool named 'generate_image'", () => {
      expect(registeredTools).toHaveLength(1);
      expect(registeredTools[0].name).toBe("generate_image");
    });

    it("has renderCall and renderResult functions", () => {
      expect(typeof tool.renderCall).toBe("function");
      expect(typeof tool.renderResult).toBe("function");
    });

    it("describes both generate and edit modes in the tool description", () => {
      const desc = tool.description;
      expect(desc.toLowerCase()).toContain("generate");
      expect(desc.toLowerCase()).toContain("image_path");
    });
  });

  describe("renderCall", () => {
    it("shows prompt in the rendered text", () => {
      const result = tool.renderCall({ prompt: "a sunset over mountains" }, makeTheme(), {});

      expect(result.text).toContain("Generate Image");
      expect(result.text).toContain("a sunset over mountains");
    });

    it("shows prompt when not specified", () => {
      const result = tool.renderCall({ prompt: "a cat" }, makeTheme(), {});

      expect(result.text).toContain("a cat");
    });

    it("reuses context.lastComponent when available", () => {
      const existing = { setText: mock(() => {}) };
      const result = tool.renderCall({ prompt: "test" }, makeTheme(), {
        lastComponent: existing as any,
      });

      expect(result).toBe(existing);
      expect(existing.setText).toHaveBeenCalled();
    });

    it("shows image_path when editing", () => {
      const result = tool.renderCall(
        { prompt: "make it sunset", image_path: "/tmp/photo.png" },
        makeTheme(),
        {},
      );

      expect(result.text).toContain("Generate Image");
      expect(result.text).toContain("/tmp/photo.png");
    });
  });

  describe("renderResult", () => {
    it("shows file path and metadata", () => {
      const result = tool.renderResult(
        {
          content: [
            { type: "text" as const, text: "Generated image saved to /tmp/pi-img-abc123.png" },
          ],
          details: {
            model: "flux.2-max",
            aspectRatio: "16:9",
            sizeBytes: 12345,
            path: "/tmp/pi-img-abc123.png",
          },
        },
        { expanded: true, isPartial: false },
        makeTheme(),
        {},
      );

      expect(result.text).toContain("/tmp/pi-img-abc123.png");
      expect(result.text).toContain("flux.2-max");
      expect(result.text).toContain("16:9");
    });

    it("reuses context.lastComponent when available", () => {
      const existing = { setText: mock(() => {}) };
      const result = tool.renderResult(
        {
          content: [{ type: "text" as const, text: "Generated image saved" }],
          details: { model: "test", aspectRatio: "1:1", sizeBytes: 100, path: "/tmp/test.png" },
        },
        { expanded: true, isPartial: false },
        makeTheme(),
        { lastComponent: existing as any },
      );

      expect(result).toBe(existing);
      expect(existing.setText).toHaveBeenCalled();
    });

    it("shows source path when editing result contains sourcePath", () => {
      const result = tool.renderResult(
        {
          content: [{ type: "text" as const, text: "Edited image saved to /tmp/out.png" }],
          details: {
            model: "test-model",
            aspectRatio: "16:9",
            sizeBytes: 54321,
            path: "/tmp/out.png",
            sourcePath: "/tmp/original.png",
          },
        },
        { expanded: true, isPartial: false },
        makeTheme(),
        {},
      );

      expect(result.text).toContain("/tmp/out.png");
      expect(result.text).toContain("/tmp/original.png");
    });
  });

  describe("execute — happy path", () => {
    it("returns file path and metadata on successful image generation", async () => {
      mockCreate.mockResolvedValue(mockSdkResponse([{ image_url: { url: PNG_DATA_URL } }]));

      const result = await tool.execute(
        "call-1",
        { prompt: "a sunset" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      // Content text mentions the saved path
      expect(result.content[0].text).toMatch(/\/tmp\/pi-img-[a-f0-9]+\.png/);
      // Content includes inline image data (same flow as read tool)
      expect(result.content[1]).toEqual({
        type: "image",
        data: expect.any(String),
        mimeType: "image/png",
      });
      expect(result.content[1].data.length).toBeGreaterThan(0);
      // Details contain model, aspectRatio, sizeBytes, path
      expect(result.details.model).toBeTruthy();
      expect(result.details.aspectRatio).toBe("1:1");
      expect(typeof result.details.sizeBytes).toBe("number");
      expect(result.details.sizeBytes).toBeGreaterThan(0);
      expect(result.details.path).toMatch(/\/tmp\/pi-img-[a-f0-9]+\.png/);
      // File actually exists on disk
      expect(existsSync(result.details.path)).toBe(true);

      savedFiles.push(result.details.path);
    });

    it("uses fast model and 1:1 aspect ratio by default", async () => {
      mockCreate.mockResolvedValue(mockSdkResponse([{ image_url: { url: PNG_DATA_URL } }]));

      const result = await tool.execute(
        "call-2",
        { prompt: "test" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      expect(result.details.aspectRatio).toBe("1:1");
      // Model should be IMAGE_MODEL or its default
      expect(result.details.model).toBe(
        process.env.IMAGE_MODEL || "google/gemini-3.1-flash-image-preview",
      );

      savedFiles.push(result.details.path);
    });

    it("throws when no images are returned", async () => {
      mockCreate.mockResolvedValue(mockSdkResponse());

      await expect(
        tool.execute(
          "call-3",
          { prompt: "a sunset" },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow("No images generated");
    });
  });

  describe("execute — aspect ratio", () => {
    it("passes aspect_ratio 16:9 to the API", async () => {
      let createParams: any;
      mockCreate.mockImplementation((params: any) => {
        createParams = params;
        return mockSdkResponse([{ image_url: { url: PNG_DATA_URL } }]);
      });

      const result = await tool.execute(
        "call-ar",
        { prompt: "a sunset", aspect_ratio: "16:9" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      // SDK call should contain the aspect ratio
      expect(createParams.image_config).toEqual({ aspect_ratio: "16:9" });
      // Result details should reflect the passed aspect ratio
      expect(result.details.aspectRatio).toBe("16:9");

      savedFiles.push(result.details.path);
    });

    it("uses IMAGE_MODEL env var override", async () => {
      const origImageModel = process.env.IMAGE_MODEL;
      process.env.IMAGE_MODEL = "custom/image-model";

      let createParams: any;
      mockCreate.mockImplementation((params: any) => {
        createParams = params;
        return mockSdkResponse([{ image_url: { url: PNG_DATA_URL } }]);
      });

      const result = await tool.execute(
        "call-env",
        { prompt: "test" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      expect(createParams.model).toBe("custom/image-model");

      // Clean up env
      process.env.IMAGE_MODEL = origImageModel;

      savedFiles.push(result.details.path);
    });
  });

  describe("execute — inline image", () => {
    it("includes base64 image in the content array for framework rendering", async () => {
      mockCreate.mockResolvedValue(mockSdkResponse([{ image_url: { url: PNG_DATA_URL } }]));

      const result = await tool.execute(
        "call-inline",
        { prompt: "test" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      // Result content has two entries: text + inline image
      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe("text");
      expect(result.content[1].type).toBe("image");
      expect(result.content[1].mimeType).toBe("image/png");
      expect(result.content[1].data).toMatch(/^[A-Za-z0-9+/=]+$/);

      savedFiles.push(result.details.path);
    });
  });

  describe("execute — image editing (image_path)", () => {
    const editTempFiles: string[] = [];

    /**
     * Create a minimal valid PNG buffer with the given dimensions.
     * image-size only reads the IHDR chunk and doesn't validate CRCs,
     * so a minimal valid header suffices.
     */
    function createPngBuffer(width: number, height: number): Buffer {
      const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const ihdrData = Buffer.alloc(13);
      ihdrData.writeUInt32BE(width, 0);
      ihdrData.writeUInt32BE(height, 4);
      ihdrData[8] = 8; // bit depth
      ihdrData[9] = 2; // color type (RGB)
      ihdrData[10] = 0; // compression
      ihdrData[11] = 0; // filter
      ihdrData[12] = 0; // interlace
      const len = Buffer.alloc(4);
      len.writeUInt32BE(13);
      const crc = Buffer.alloc(4); // zero CRC — image-size doesn't validate
      return Buffer.concat([sig, len, Buffer.from("IHDR"), ihdrData, crc]);
    }

    function createTempFile(content: Uint8Array): string {
      const dir = mkdtempSync(join(tmpdir(), "pi-img-edit-test-"));
      const filePath = join(dir, "source-image");
      writeFileSync(filePath, content);
      editTempFiles.push(filePath);
      return filePath;
    }

    afterEach(() => {
      for (const f of editTempFiles) {
        try {
          unlinkSync(f);
          rmdirSync(dirname(f));
        } catch {
          // ignore cleanup errors
        }
      }
      editTempFiles.length = 0;
    });

    it("auto-detects aspect ratio from source image dimensions", async () => {
      const filePath = createTempFile(createPngBuffer(1920, 1080));

      let createParams: any;
      mockCreate.mockImplementation((params: any) => {
        createParams = params;
        return mockSdkResponse([{ image_url: { url: PNG_DATA_URL } }]);
      });

      const result = await tool.execute(
        "call-edit-ar",
        { prompt: "make it wider", image_path: filePath },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      // Aspect ratio should be auto-detected from 1920x1080
      expect(result.details.aspectRatio).toBe("16:9");
      // SDK should receive the auto-detected aspect ratio
      expect(createParams.image_config).toEqual({ aspect_ratio: "16:9" });
      // SDK should receive multimodal content with image data URL
      expect(Array.isArray(createParams.messages[0].content)).toBe(true);
      expect(createParams.messages[0].content[0].type).toBe("image_url");
      expect(createParams.messages[0].content[0].image_url.url).toMatch(/^data:image\/png;base64,/);

      savedFiles.push(result.details.path);
    });

    it("explicit aspect_ratio overrides auto-detection", async () => {
      const filePath = createTempFile(createPngBuffer(1920, 1080));

      let createParams: any;
      mockCreate.mockImplementation((params: any) => {
        createParams = params;
        return mockSdkResponse([{ image_url: { url: PNG_DATA_URL } }]);
      });

      const result = await tool.execute(
        "call-edit-override",
        { prompt: "edit this", image_path: filePath, aspect_ratio: "4:3" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      expect(result.details.aspectRatio).toBe("4:3");
      expect(createParams.image_config).toEqual({ aspect_ratio: "4:3" });

      savedFiles.push(result.details.path);
    });

    it("throws when image_path points to a non-existent file", async () => {
      await expect(
        tool.execute(
          "call-edit-missing",
          { prompt: "edit", image_path: "/nonexistent/path/to/file.png" },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow(/not found|does not exist/i);
    });

    it("throws when the image has an unsupported format", async () => {
      // Create a file with non-image content (image-size won't recognize it)
      const filePath = createTempFile(Buffer.from("This is not an image file"));

      await expect(
        tool.execute(
          "call-edit-unsupported",
          { prompt: "edit", image_path: filePath },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow(/not a valid image|unable to determine/i);
    });

    it("includes sourcePath in details when image_path is provided", async () => {
      const filePath = createTempFile(createPngBuffer(100, 100));
      mockCreate.mockResolvedValue(mockSdkResponse([{ image_url: { url: PNG_DATA_URL } }]));

      const result = await tool.execute(
        "call-edit-source",
        { prompt: "edit", image_path: filePath },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      expect(result.details.sourcePath).toBe(filePath);

      savedFiles.push(result.details.path);
    });

    it("throws when API returns no images during editing (edge case b)", async () => {
      const filePath = createTempFile(createPngBuffer(100, 100));
      // SDK returns response without images array
      mockCreate.mockResolvedValue(mockSdkResponse());

      await expect(
        tool.execute(
          "call-edit-noimg",
          { prompt: "edit this", image_path: filePath },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow("No images generated");

      savedFiles.push(filePath);
    });

    it("propagates API error for corrupted image content during editing (edge case a)", async () => {
      const filePath = createTempFile(createPngBuffer(100, 100));
      // File is valid (image-size succeeds) but the API rejects the content
      mockCreate.mockRejectedValue(new Error("Image content rejected: corrupt data"));

      await expect(
        tool.execute(
          "call-edit-corrupt",
          { prompt: "fix this", image_path: filePath },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow("Image content rejected");

      savedFiles.push(filePath);
    });

    it("round-trips: generate then edit the output (edge case c)", async () => {
      // Use different image data for generate vs edit to ensure different file paths.
      // Both must be valid base64 (saveImageToTemp writes and re-reads the file).
      const EDIT_PNG_BASE64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAASUVORK5CYII=";

      // Step 1: Generate an image
      mockCreate.mockResolvedValue(mockSdkResponse([{ image_url: { url: PNG_DATA_URL } }]));

      const genResult = await tool.execute(
        "call-roundtrip-gen",
        { prompt: "a test image" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      expect(genResult.details.path).toMatch(/\/tmp\/pi-img-[a-f0-9]+\.png/);
      const generatedPath = genResult.details.path;
      savedFiles.push(generatedPath);

      // Step 2: Edit the generated image using its path
      mockCreate.mockResolvedValue(
        mockSdkResponse([{ image_url: { url: `data:image/png;base64,${EDIT_PNG_BASE64}` } }]),
      );

      const editResult = await tool.execute(
        "call-roundtrip-edit",
        { prompt: "make it better", image_path: generatedPath },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      // Edit result should be a different file than generated
      expect(editResult.details.path).not.toBe(generatedPath);
      expect(editResult.details.path).toMatch(/\/tmp\/pi-img-[a-f0-9]+\.png/);
      // Edit result should include sourcePath
      expect(editResult.details.sourcePath).toBe(generatedPath);
      expect(editResult.details.aspectRatio).toBe("1:1"); // from 1x1 PNG

      savedFiles.push(editResult.details.path);
    });
  });

  describe("execute — error handling", () => {
    it("throws on network error", async () => {
      mockCreate.mockRejectedValue(new Error("Network failure"));

      await expect(
        tool.execute(
          "call-4",
          { prompt: "a sunset" },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow();
    });

    it("throws when OPENROUTER_API_KEY is missing", async () => {
      delete process.env.OPENROUTER_API_KEY;

      await expect(
        tool.execute(
          "call-5",
          { prompt: "a sunset" },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow(/OPENROUTER_API_KEY/);
    });

    it("throws on non-OK API response", async () => {
      mockCreate.mockRejectedValue(new Error("401 Unauthorized"));

      await expect(
        tool.execute(
          "call-6",
          { prompt: "a sunset" },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow();
    });

    it("does not return error as content — always throws", async () => {
      mockCreate.mockRejectedValue(new Error("Network failure"));

      let caught = false;
      try {
        await tool.execute(
          "call-7",
          { prompt: "a sunset" },
          new AbortController().signal,
          mock(() => {}),
          {},
        );
      } catch {
        caught = true;
      }

      expect(caught).toBe(true);
    });
  });
});
