import { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { resolveRequestActor } from './auth';

let aiInstance: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

export async function postAiAssistant(req: Request, res: Response) {
  const actor = await resolveRequestActor(req.headers.authorization);
  if (!actor.id && !actor.email && !actor.name) {
    return res.status(401).json({ error: 'Sign in is required.', code: 'UNAUTHORIZED' });
  }
  try {
    const { prompt, context } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getGenAI();
    const systemInstruction = `
You are the AI Engineering & Quotation Assistant for Energya Connect Platform (Energya Cables / Elsewedy Helal).
You are a senior cable manufacturing engineer and pricing specialist.
You assist B2B customers and internal teams with:
- Cable configuration & selection (MV 11kV-33kV, LV 1kV, HV 66kV-220kV, Control Cables)
- Automatic Cable Code generation according to IEC 60502 standards (e.g., MV-33KV-CU-3C-240-XLPE-PVC-SWA-PVC)
- Drum size optimization and waste minimization advice
- Metal commodity price impact (Copper LME $9,250/MT, Aluminum LME $2,480/MT)
- Technical data sheet (TDS) recommendations for soil, duct, or tray installations
- Direct B2B quotation budgetary suggestions

Keep your responses structured, concise, professional, and formatted in clear markdown. Provide exact cable code recommendations where relevant.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `Context: ${JSON.stringify(context || {})}\n\nUser Question: ${prompt}`,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    const reply = response.text || 'No response generated from AI engine.';
    return res.json({ reply });
  } catch (error: any) {
    console.error('Gemini AI Assistant Error:', error);
    return res.status(500).json({
      error: 'Failed to generate response from AI Assistant',
      details: error.message,
    });
  }
}
