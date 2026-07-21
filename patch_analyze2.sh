#!/bin/bash
sed -i 's/const result = JSON.parse(text);/const result = JSON.parse(text);\n      addAILog(`Analyze Episode: ${animeTitle} Ep ${epNum}`, "SUCCESS", `Analysis complete. Confidence: ${Math.round(result.confidence * 100)}%`, "gemini-3.1-flash-lite");/' server.ts
sed -i 's/} catch (geminiErr: any) {/} catch (geminiErr: any) {\n      addAILog(`Analyze Episode: ${animeTitle} Ep ${epNum}`, "ERROR", `Primary AI failed: ${geminiErr.message}`, "gemini-3.1-flash-lite");/' server.ts
