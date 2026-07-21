#!/bin/bash
sed -i 's/const ai = getGeminiClient();/const ai = getGeminiClient();\n      addAILog(`Analyze Episode: ${animeTitle} Ep ${epNum}`, "INFO", "Started timestamp analysis", "gemini-3.1-flash-lite");/' server.ts
sed -i 's/let parsed = JSON.parse(text);/let parsed = JSON.parse(text);\n        addAILog(`Analyze Episode: ${animeTitle} Ep ${epNum}`, "SUCCESS", `Analysis complete. Confidence: ${Math.round(parsed.confidence * 100)}%`, "gemini-3.1-flash-lite");/' server.ts
sed -i 's/console.error("\[AI Analyzer\] Primary AI failed:", err);/console.error("\[AI Analyzer\] Primary AI failed:", err);\n      addAILog(`Analyze Episode: ${animeTitle} Ep ${epNum}`, "ERROR", `Primary AI failed: ${err.message}`, "gemini-3.1-flash-lite");/' server.ts
