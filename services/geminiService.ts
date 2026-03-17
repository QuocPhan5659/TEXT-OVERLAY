import { GoogleGenAI, Type } from "@google/genai";
import { Resolution, AspectRatio } from "../types";

const getAiClient = () => {
  const apiKey = (window as any).process?.env?.API_KEY || 
                 (window as any).API_KEY || 
                 (process.env as any).GEMINI_API_KEY;
                 
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface ArchitecturalAnalysis {
  english: string;
  vietnamese: string;
}

/**
 * Analyzes the provided architectural images to create a detailed description
 * of style, materials, and greenery to ensure consistency.
 */
export const analyzeArchitecturalStyle = async (base64Images: string[]): Promise<ArchitecturalAnalysis> => {
  const ai = getAiClient();
  
  const imageParts = base64Images.map(img => {
    // Handle both raw base64 and data URL formats
    const cleanBase64 = img.includes('base64,') ? img.split('base64,')[1] : img;
    const match = img.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const mimeType = match ? match[1] : 'image/jpeg';
    return { inlineData: { mimeType, data: cleanBase64 } };
  });

  const prompt = `
    Role: Bạn là một chuyên gia AI về hình ảnh kiến trúc và nhiếp ảnh chuyên nghiệp.
    Task: Phân tích chi tiết các hình ảnh được cung cấp để hiểu sâu về: 
    1. Cấu trúc nhà (Structure & Geometry)
    2. Vật liệu chi tiết (Materials - màu sơn, loại đá, gỗ, kính)
    3. Hệ thống cây xanh (Greenery - loại cây cụ thể như hoa giấy, trúc, cỏ)
    4. Phong cách thiết kế (Architectural Style)
    5. Ánh sáng và Bối cảnh (Lighting & Context - ví dụ: đường phố Việt Nam)

    Output Format: Trả về kết quả dưới dạng JSON object với 2 trường:
    - 'english': Phân tích chi tiết bằng tiếng Anh (dùng để làm prompt sinh ảnh).
    - 'vietnamese': Phân tích chi tiết bằng tiếng Việt (dùng để hiển thị cho người dùng đọc).
    
    Nội dung phân tích cần tập trung vào các chi tiết vật lý có thể nhìn thấy được để đảm bảo sự đồng bộ nhất quán (Consistency).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: prompt },
          ...imageParts
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            english: { type: Type.STRING },
            vietnamese: { type: Type.STRING }
          },
          required: ['english', 'vietnamese']
        }
      }
    });
    
    const text = response.text;
    if (!text) {
      return { english: "Analysis failed.", vietnamese: "Phân tích thất bại." };
    }
    return JSON.parse(text);
  } catch (error) {
    console.error("Analysis failed", error);
    throw new Error("Failed to analyze architectural style.");
  }
};

export const generateArchitecturalView = async (
  base64Images: string[],
  prompt: string,
  resolution: Resolution = '1K',
  aspectRatio: AspectRatio = '1:1',
  analysisContext?: string,
  customPrompt?: string
): Promise<string> => {
  const ai = getAiClient();
  
  // Construct image parts for the API
  const imageParts = base64Images.map(img => {
    const cleanBase64 = img.includes('base64,') ? img.split('base64,')[1] : img;
    const match = img.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const mimeType = match ? match[1] : 'image/jpeg';

    return {
      inlineData: {
        mimeType: mimeType,
        data: cleanBase64,
      },
    };
  });

  // Determine model and config based on resolution
  const isHighRes = resolution === '2K' || resolution === '4K';
  const model = isHighRes ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  const config = {
    imageConfig: {
      ...(isHighRes ? { imageSize: resolution } : {}),
      aspectRatio: aspectRatio
    }
  };

  // Enhance the prompt with the analysis context if available
  let finalPrompt = prompt;
  
  // Append custom user prompt instructions if provided
  if (customPrompt && customPrompt.trim().length > 0) {
    finalPrompt += `\n\nADDITIONAL INSTRUCTIONS: ${customPrompt}`;
  }

  if (analysisContext) {
    finalPrompt = `
      ARCHITECTURAL DNA ANALYSIS:
      ${analysisContext}
      
      BASED ON THE ARCHITECTURAL ANALYSIS ABOVE AND THE REFERENCE IMAGES:
      ${finalPrompt}
      
      CRITICAL INSTRUCTION: Ensure the generated image is perfectly consistent with the analyzed materials, plants, and architectural style described above.
    `;
  }

  let attempt = 0;
  const maxRetries = 3;
  let lastError: any;

  while (attempt <= maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { text: finalPrompt },
            ...imageParts
          ],
        },
        config: config
      });

      const candidates = response.candidates;
      if (candidates && candidates.length > 0) {
        const parts = candidates[0].content.parts;
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
      }
      
      const textOutput = response.text;
      if (textOutput) {
         console.warn("Model returned text instead of image:", textOutput);
         // If it's a safety refusal, retrying might not help, but we follow the loop logic.
         // Usually we break here if it's a refusal, but for simplicity we treat it as no-image error.
      }

      throw new Error("No image data received from Gemini API.");
    } catch (error: any) {
      lastError = error;
      
      const errorCode = error.status || error.code || (error.error && error.error.code);
      const errorMessage = error.message || JSON.stringify(error);
      const isRateLimit = errorCode === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED');
      const isServerOverload = errorCode === 503 || errorMessage.includes('503');

      if ((isRateLimit || isServerOverload) && attempt < maxRetries) {
        attempt++;
        const delay = 2000 * Math.pow(2, attempt - 1); // Exponential backoff
        console.warn(`Gemini API Error (${errorCode}). Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
        await wait(delay);
        continue;
      }
      break;
    }
  }

  console.error("Gemini API Error after retries:", lastError);
  throw lastError;
};