import { GoogleGenAI, Type } from "@google/genai";
import { Message, Region } from "../types";

// --- HELPERS ---

// Retry wrapper to handle 429 Resource Exhausted gracefully with exponential backoff
const callGeminiWithRetry = async (aiInstance: GoogleGenAI, config: any, retries = 3): Promise<any> => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await aiInstance.models.generateContent(config);
    } catch (error: any) {
      const msg = error?.message || '';
      // We look for 429, Resource Exhausted, or Quota strings
      if (msg.includes('429') || msg.includes('Quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        attempt++;
        if (attempt >= retries) throw new Error(`Rate limit exceeded after ${retries} attempts. Please slow down and try again.`);
        // Exponential backoff: 3s, 6s...
        const delayMs = attempt * 3000;
        console.warn(`Hit rate limit (429). Retrying in ${delayMs / 1000}s... (Attempt ${attempt}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

/**
 * Universally processes images for AI consumption.
 * Resizes large images to manageable dimensions (default 1024px) and converts to JPEG.
 * This is CRITICAL to prevent "RPC failed" / "Payload Too Large" / "XHR Error" issues.
 */
const processImageForAI = (base64Str: string, maxDim: number = 1024, quality: number = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    // Handle both raw base64 and data URL
    img.src = base64Str.startsWith('data:') ? base64Str : `data:image/png;base64,${base64Str}`;
    
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      
      // Downscale if too large
      if (w > maxDim || h > maxDim) {
          if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
          } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
          }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
          reject(new Error("Failed to create canvas context"));
          return;
      }
      
      // Fill white background to handle transparent PNGs converting to JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      
      ctx.drawImage(img, 0, 0, w, h);
      
      // Always export as JPEG for AI payload efficiency
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = (err) => {
        console.error("Image processing failed", err);
        // Fallback: try to return original if valid base64, else fail
        resolve(base64Str.replace(/^data:image\/\w+;base64,/, ''));
    };
  });
};

// --- MASKING LOGIC ---

/**
 * Computes a hard alpha mask based on pixel differences.
 * If pixel difference > threshold, Alpha = 255, else 0.
 */
const computeDifferenceImageData = (
    originalCtx: CanvasRenderingContext2D,
    newCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    threshold: number = 45 // Tuned for separating subject from background noise
): ImageData => {
    const img1 = originalCtx.getImageData(0, 0, width, height);
    const img2 = newCtx.getImageData(0, 0, width, height);
    const output = new ImageData(width, height);

    const data1 = img1.data;
    const data2 = img2.data;
    const outData = output.data;

    for (let i = 0; i < data1.length; i += 4) {
        const r1 = data1[i], g1 = data1[i+1], b1 = data1[i+2];
        const r2 = data2[i], g2 = data2[i+1], b2 = data2[i+2];
        
        // Euclidean distance in RGB
        const dist = Math.sqrt(
            (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2
        );

        const isDifferent = dist > threshold;
        
        outData[i] = 255;   // R
        outData[i+1] = 255; // G
        outData[i+2] = 255; // B
        outData[i+3] = isDifferent ? 255 : 0; // Alpha
    }

    return output;
};

/**
 * Dilates the alpha channel of an ImageData object.
 * Expands white regions by `radius` pixels to ensure edges are captured.
 */
const dilateImageData = (imageData: ImageData, width: number, height: number, radius: number = 2): ImageData => {
    const src = imageData.data;
    const dest = new Uint8ClampedArray(src);
    
    // Simple box dilation
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            
            // If this pixel is transparent, check neighbors
            if (src[idx + 3] === 0) {
                let hit = false;
                
                // Check kernel [y-radius .. y+radius]
                kernelLoop:
                for (let ky = Math.max(0, y - radius); ky <= Math.min(height - 1, y + radius); ky++) {
                    for (let kx = Math.max(0, x - radius); kx <= Math.min(width - 1, x + radius); kx++) {
                        const kIdx = (ky * width + kx) * 4;
                        if (src[kIdx + 3] > 0) {
                            hit = true;
                            break kernelLoop;
                        }
                    }
                }
                
                if (hit) {
                    dest[idx + 3] = 255;
                    dest[idx] = 255; dest[idx+1] = 255; dest[idx+2] = 255;
                }
            }
        }
    }
    
    return new ImageData(dest, width, height);
};

// --- MAIN PIPELINE ---

/**
 * Edits an image based on a text prompt using Gemini 2.5 Flash Image.
 * Implements "Pixel-Difference Blending" pipeline.
 */
export const editImageWithGemini = async (
  imageBase64: string, 
  prompt: string, 
  region?: Region | null,
  mimeType: string = 'image/png'
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

    // --- CASE A: REGION EDITING ---
    if (region) {
      const originalImg = await loadImage(`data:${mimeType};base64,${cleanBase64}`);
      
      // 1. Coordinates
      const userX = region.x * originalImg.width;
      const userY = region.y * originalImg.height;
      const userW = region.width * originalImg.width;
      const userH = region.height * originalImg.height;

      // 2. Context-Aware Expansion (Input)
      const PADDING_FACTOR = 0.3; 
      let expandW = userW * (1 + PADDING_FACTOR * 2);
      let expandH = userH * (1 + PADDING_FACTOR * 2);

      // Aspect Ratio Logic
      const currentRatio = expandW / expandH;
      const supportedRatios = [
          { str: "1:1", val: 1.0 },
          { str: "3:4", val: 0.75 },
          { str: "4:3", val: 1.33 },
          { str: "9:16", val: 0.56 },
          { str: "16:9", val: 1.77 }
      ];
      
      const targetRatioObj = supportedRatios.reduce((prev, curr) => 
        Math.abs(curr.val - currentRatio) < Math.abs(prev.val - currentRatio) ? curr : prev
      );
      const targetRatio = targetRatioObj.val;
      const aspectRatio = targetRatioObj.str;

      if (currentRatio > targetRatio) expandH = expandW / targetRatio;
      else expandW = expandH * targetRatio;

      const centerX = userX + userW / 2;
      const centerY = userY + userH / 2;
      let contextX = centerX - expandW / 2;
      let contextY = centerY - expandH / 2;

      contextX = clamp(contextX, 0, originalImg.width);
      contextY = clamp(contextY, 0, originalImg.height);
      
      // Fix: Ensure we don't go out of bounds on the right/bottom
      if (contextX + expandW > originalImg.width) contextX = originalImg.width - expandW;
      if (contextY + expandH > originalImg.height) contextY = originalImg.height - expandH;
      contextX = Math.max(0, contextX); // Double check negative
      contextY = Math.max(0, contextY);

      const finalContextW = Math.min(expandW, originalImg.width - contextX);
      const finalContextH = Math.min(expandH, originalImg.height - contextY);

      if (finalContextW < 16 || finalContextH < 16) {
           throw new Error("Selection too small for AI processing.");
      }

      // 3. Extract Context Crop
      const contextCanvas = document.createElement('canvas');
      contextCanvas.width = finalContextW;
      contextCanvas.height = finalContextH;
      const contextCtx = contextCanvas.getContext('2d');
      if (!contextCtx) throw new Error("Canvas init failed");
      
      contextCtx.drawImage(
          originalImg, 
          contextX, contextY, finalContextW, finalContextH, 
          0, 0, finalContextW, finalContextH
      );
      
      // OPTIMIZATION: Resize context for API payload if too large
      // This prevents "RPC failed due to xhr error" on huge selections
      let aiPayloadBase64: string;
      const MAX_CONTEXT_DIM = 1024;
      const JPEG_QUALITY = 0.7;

      if (finalContextW > MAX_CONTEXT_DIM || finalContextH > MAX_CONTEXT_DIM) {
          const scale = Math.min(MAX_CONTEXT_DIM / finalContextW, MAX_CONTEXT_DIM / finalContextH);
          const scaledW = Math.round(finalContextW * scale);
          const scaledH = Math.round(finalContextH * scale);
          
          const scaledCanvas = document.createElement('canvas');
          scaledCanvas.width = scaledW;
          scaledCanvas.height = scaledH;
          const scaledCtx = scaledCanvas.getContext('2d');
          if (!scaledCtx) throw new Error("Scaled Canvas init failed");
          
          // Fill white for transparency safety
          scaledCtx.fillStyle = '#FFFFFF';
          scaledCtx.fillRect(0, 0, scaledW, scaledH);
          scaledCtx.drawImage(contextCanvas, 0, 0, scaledW, scaledH);
          
          aiPayloadBase64 = scaledCanvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];
      } else {
          // If within limits, just convert to JPEG for compression
          // Create a temp canvas to ensure white background if transparent
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = finalContextW;
          tempCanvas.height = finalContextH;
          const tempCtx = tempCanvas.getContext('2d')!;
          tempCtx.fillStyle = '#FFFFFF';
          tempCtx.fillRect(0, 0, finalContextW, finalContextH);
          tempCtx.drawImage(contextCanvas, 0, 0);
          
          aiPayloadBase64 = tempCanvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1];
      }
      
      // 4. AI Generation
      // FIX: Append instruction to prevent cutoff
      const refinedPrompt = `${prompt}. Ensure the subject is complete, fully visible, and fits inside the area.`;

      const response = await callGeminiWithRetry(ai, {
        model: 'gemini-2.5-flash-image', 
        contents: {
          parts: [
            { text: refinedPrompt },
            { inlineData: { data: aiPayloadBase64, mimeType: 'image/jpeg' } }
          ]
        },
        config: {
          imageConfig: { aspectRatio }
        }
      });
      
      let generatedBase64 = null;
      const parts = response.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            generatedBase64 = part.inlineData.data;
            break;
          }
        }
      }

      if (!generatedBase64) throw new Error("AI generation failed.");
      const generatedImg = await loadImage(`data:${mimeType};base64,${generatedBase64}`);

      // 5. Pixel-Difference Blending (The Fix)
      
      // A. Prepare Original Patch (Target Size)
      const patchW = userW;
      const patchH = userH;

      const originalPatchCanvas = document.createElement('canvas');
      originalPatchCanvas.width = patchW;
      originalPatchCanvas.height = patchH;
      const opCtx = originalPatchCanvas.getContext('2d');
      if (!opCtx) throw new Error("OpCtx failed");
      
      opCtx.drawImage(originalImg, userX, userY, patchW, patchH, 0, 0, patchW, patchH);

      // B. Prepare Generated Patch (Target Size)
      const generatedPatchCanvas = document.createElement('canvas');
      generatedPatchCanvas.width = patchW;
      generatedPatchCanvas.height = patchH;
      const gpCtx = generatedPatchCanvas.getContext('2d');
      if (!gpCtx) throw new Error("GpCtx failed");

      // Map User Region relative to Context Region
      const relX = userX - contextX;
      const relY = userY - contextY;
      
      // Scale AI result to context dimensions (in case of slight AI res changes)
      // Note: If we scaled down input, generatedImg corresponds to the full context view, 
      // so we map based on finalContextW (the original size FOV).
      const scaleX = generatedImg.width / finalContextW;
      const scaleY = generatedImg.height / finalContextH;

      gpCtx.drawImage(
          generatedImg,
          relX * scaleX, relY * scaleY, userW * scaleX, userH * scaleY, // Source (AI)
          0, 0, patchW, patchH // Dest (Patch)
      );

      // C. Compute Difference Mask
      // 50 threshold allows filtering out JPEG compression noise and minor lighting shifts
      let maskData = computeDifferenceImageData(opCtx, gpCtx, patchW, patchH, 50);

      // D. Refine Mask (Dilate)
      // Expands the mask by 2px to ensure we capture the full edge of the new object
      maskData = dilateImageData(maskData, patchW, patchH, 2);

      // E. Mask Canvas & Blur
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = patchW;
      maskCanvas.height = patchH;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) throw new Error("MaskCtx failed");
      
      maskCtx.putImageData(maskData, 0, 0);

      // Apply Gaussian Blur to the mask for soft edges (Feathering)
      const blurCanvas = document.createElement('canvas');
      blurCanvas.width = patchW;
      blurCanvas.height = patchH;
      const blurCtx = blurCanvas.getContext('2d');
      if (!blurCtx) throw new Error("BlurCtx failed");
      
      blurCtx.filter = 'blur(4px)'; // Soften the keyed edges
      blurCtx.drawImage(maskCanvas, 0, 0);

      // F. Final Composition
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = originalImg.width;
      finalCanvas.height = originalImg.height;
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) throw new Error("FinalCtx failed");

      // Draw Base
      finalCtx.drawImage(originalImg, 0, 0);

      // Prepare Masked Patch
      const compositePatchCanvas = document.createElement('canvas');
      compositePatchCanvas.width = patchW;
      compositePatchCanvas.height = patchH;
      const cpCtx = compositePatchCanvas.getContext('2d');
      if (!cpCtx) throw new Error("CpCtx failed");

      // Draw New Object
      cpCtx.drawImage(generatedPatchCanvas, 0, 0);
      
      // Mask it using the Computed Blur Mask
      cpCtx.globalCompositeOperation = 'destination-in';
      cpCtx.drawImage(blurCanvas, 0, 0);
      cpCtx.globalCompositeOperation = 'source-over';

      // Paste Result
      finalCtx.drawImage(compositePatchCanvas, userX, userY);

      return finalCanvas.toDataURL(mimeType).split(',')[1];
    }

    // --- CASE B: FULL IMAGE EDIT ---
    const finalPrompt = `${prompt}. Output a high-quality image.`;
    
    // 1. Get original image to know its dimensions
    const originalImg = await loadImage(`data:${mimeType};base64,${cleanBase64}`);
    const originalW = originalImg.width;
    const originalH = originalImg.height;
    
    const currentRatio = originalW / originalH;
    const supportedRatios = [
        { str: "1:1", val: 1.0 },
        { str: "3:4", val: 0.75 },
        { str: "4:3", val: 1.33 },
        { str: "9:16", val: 0.56 },
        { str: "16:9", val: 1.77 }
    ];
    
    // Find the closest aspect ratio for the AI generation
    const targetRatioObj = supportedRatios.reduce((prev, curr) => 
      Math.abs(curr.val - currentRatio) < Math.abs(prev.val - currentRatio) ? curr : prev
    );
    const targetRatioStr = targetRatioObj.str;

    // CRITICAL OPTIMIZATION:
    // Process full image before sending. Max 1024px, JPEG 0.7.
    // This handles 4K uploads by shrinking them to ~200KB payloads instead of 10MB+.
    const optimizedBase64 = await processImageForAI(cleanBase64, 1024, 0.7);

    const response = await callGeminiWithRetry(ai, {
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: finalPrompt },
          { inlineData: { data: optimizedBase64, mimeType: 'image/jpeg' } },
        ],
      },
      config: {
        imageConfig: { aspectRatio: targetRatioStr }
      }
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error("No content generated");

    let generatedBase64 = null;
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        generatedBase64 = part.inlineData.data;
        break;
      }
    }

    if (!generatedBase64) throw new Error("No image data found in response");

    // Resize generated image back to EXACT original dimensions and ratio for standard edits
    const generatedImg = await loadImage(`data:${mimeType};base64,${generatedBase64}`);
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = originalW;
    finalCanvas.height = originalH;
    const finalCtx = finalCanvas.getContext('2d');
    if (!finalCtx) throw new Error("Failed to create final canvas");
    
    // Draw and scale the generated image into original dimensions
    finalCtx.drawImage(generatedImg, 0, 0, originalW, originalH);
    
    return finalCanvas.toDataURL(mimeType).split(',')[1];

  } catch (error) {
    console.error("Error editing image:", error);
    throw error;
  }
};

/**
 * Analyzes an image to provide a critique and edit suggestions.
 */
export const analyzeImage = async (imageBase64: string, styleContext?: string): Promise<{ critique: string; suggestions: string[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    // Optimization: Resize image to prevent 500/XHR errors on large payloads
    // Analysis is fine with 1024px, 0.7 quality
    const optimizedBase64 = await processImageForAI(imageBase64, 1024, 0.7);
    
    let systemInstruction = `You are an expert YouTube Data Analyst. Analyze this thumbnail to maximize CTR.`;
    if (styleContext) systemInstruction += `\nContext: Style "${styleContext}".`;

    const promptText = `
    Provide a critique and 3 specific editing suggestions.
    Return JSON:
    {
      "critique": "string",
      "suggestions": ["string", "string", "string"]
    }`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { text: systemInstruction + promptText },
          // Use 'image/jpeg' since processImageForAI outputs JPEG
          { inlineData: { data: optimizedBase64, mimeType: 'image/jpeg' } }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            critique: { type: Type.STRING },
            suggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No analysis generated");
    return JSON.parse(text);
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw error;
  }
};

/**
 * Chats with Gemini 2.5 Flash for general assistance (text-only).
 */
export const chatWithGemini = async (history: Message[], prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const contents = history
      .filter(m => m.role === 'user' || m.role === 'model')
      .map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: contents,
      config: {
        systemInstruction: "You are Thumbio AI, a helpful creative assistant for YouTube creators."
      }
    });

    return response.text || "I couldn't generate a response.";
  } catch (error) {
    console.error("Chat error:", error);
    throw error;
  }
};