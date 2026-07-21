#!/bin/bash
sed -i '464i \
  app.get("/api/gemini/logs", (req, res) => {\
    res.json(aiLogs);\
  });\
\
  app.get("/api/gemini/status", async (req, res) => {\
    try {\
      const key = process.env.GEMINI_API_KEY;\
      if (!key) {\
        return res.json({ status: "OFFLINE", message: "GEMINI_API_KEY is not set in environment variables." });\
      }\
      const ai = getGeminiClient();\
      await ai.models.generateContent({\
        model: "gemini-2.5-flash",\
        contents: "ping",\
        config: { maxOutputTokens: 1 }\
      });\
      return res.json({ status: "ONLINE", message: "Gemini API is online and reachable." });\
    } catch (err: any) {\
      return res.json({ status: "ERROR", message: `Gemini API reachable check failed: ${err.message}` });\
    }\
  });\
' server.ts
